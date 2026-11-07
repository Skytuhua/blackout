import type { ScenarioSpec } from '../../shared/contracts';

export interface UpsState { id: string; energyKwh: number; tripped: boolean; faulted: boolean }
export interface Sources { utilityAvailable: boolean; generatorReady: boolean; transferComplete: boolean }
export interface UpsFlow { id: string; outputKw: number; inputKw: number; dischargeKw: number; inputAvailable: boolean }
export interface PowerResolution { sourceCapacityKw: number | null; remainingSourceKw: number; itInputKw: number; flows: UpsFlow[]; poweredRackIds: string[]; trippedIds: string[] }

export function batteryRuntimeSeconds(energyKwh: number, outputKw: number, efficiency: number) {
  return outputKw > 0 ? 3600 * efficiency * energyKwh / outputKw : null;
}

export function hasUpstream(spec: ScenarioSpec, sources: Sources, assetId: string, visited = new Set<string>()): boolean {
  if (visited.has(assetId)) return false;
  const asset = spec.topology.assets.find(a => a.id === assetId);
  if (!asset) return false;
  if (asset.kind === 'generator') return sources.generatorReady && sources.transferComplete;
  if (asset.kind === 'distribution' && sources.utilityAvailable) return true;
  const next = new Set(visited).add(assetId);
  return asset.dependencies.some(id => hasUpstream(spec, sources, id, next));
}

export function resolvePower(spec: ScenarioSpec, sources: Sources, units: UpsState[], racks: { id: string; powerKw: number }[]): PowerResolution {
  const profile = spec.profile;
  const sourceCapacityKw = sources.utilityAvailable ? null : sources.generatorReady && sources.transferComplete ? profile.generatorKw : 0;
  // Utility is unrated in contract v1; bound its working budget by all possible consumers.
  const budget = sourceCapacityKw ?? racks.reduce((sum, r) => sum + r.powerKw / profile.upsEfficiency, 0)
    + spec.topology.assets.filter(a => a.kind === 'cooling').length * (profile.coolingTrainKw / profile.coolingCop + profile.coolingAuxiliaryKw)
    + units.length * profile.upsRechargeKw;
  const connected = new Set(units.filter(u => hasUpstream(spec, sources, u.id)).map(u => u.id));
  const active = new Set(units.filter(u => !u.tripped && !u.faulted && (connected.has(u.id) || u.energyKwh > 0)).map(u => u.id));
  const trippedIds: string[] = [];
  // Every unsuccessful pass removes at least one UPS; never iterate an unconstrained solver.
  for (let pass = 0; pass <= units.length; pass++) {
    const output = new Map(units.map(u => [u.id, 0]));
    const poweredRackIds: string[] = [];
    for (const rack of racks) {
      const feeds = spec.topology.assets.find(a => a.id === rack.id)!.dependencies.filter(id => active.has(id));
      if (feeds.length === 0) continue;
      poweredRackIds.push(rack.id);
      for (const id of feeds) output.set(id, output.get(id)! + rack.powerKw / feeds.length);
    }
    let removed = false;
    for (const unit of units) {
      if (output.get(unit.id)! > profile.upsOutputLimitKw) {
        unit.tripped = true;
        active.delete(unit.id);
        trippedIds.push(unit.id);
        removed = true;
      }
    }
    if (removed) continue;
    let remainingSourceKw = budget;
    const flows = units.map(unit => {
      const outputKw = output.get(unit.id)!;
      const inputKw = connected.has(unit.id) ? Math.min(remainingSourceKw, outputKw / profile.upsEfficiency) : 0;
      remainingSourceKw -= inputKw;
      const dischargeKw = inputKw >= outputKw / profile.upsEfficiency ? 0 : outputKw - inputKw * profile.upsEfficiency;
      if (dischargeKw > 0 && unit.energyKwh <= 0) {
        active.delete(unit.id);
        removed = true;
      }
      return { id: unit.id, outputKw, inputKw, dischargeKw, inputAvailable: connected.has(unit.id) };
    });
    if (!removed) return { sourceCapacityKw, remainingSourceKw, itInputKw: budget - remainingSourceKw, flows, poweredRackIds, trippedIds };
  }
  throw new Error('Power resolution did not converge within the UPS bound.');
}

export function integrateBatteries(units: UpsState[], flows: UpsFlow[], seconds: number, chargeBudgetKw: number, profile: ScenarioSpec['profile']) {
  let chargedKw = 0;
  for (const unit of units) {
    const flow = flows.find(f => f.id === unit.id)!;
    if (flow.dischargeKw > 0) {
      unit.energyKwh = Math.max(0, unit.energyKwh - flow.dischargeKw * seconds / (3600 * profile.upsEfficiency));
    } else if (!unit.faulted && flow.inputAvailable) {
      const chargeKw = Math.min(profile.upsRechargeKw, chargeBudgetKw - chargedKw, Math.max(0, profile.upsEnergyKwh - unit.energyKwh) * 3600 / (seconds * profile.upsEfficiency));
      chargedKw += chargeKw;
      // Contract v1 has one UPS conversion efficiency, used in each direction separately.
      unit.energyKwh = Math.min(profile.upsEnergyKwh, unit.energyKwh + chargeKw * profile.upsEfficiency * seconds / 3600);
    }
  }
  return chargedKw;
}
