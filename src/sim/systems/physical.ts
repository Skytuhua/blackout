import type { ScenarioSpec } from '../../shared/contracts';
import type { PhysicalState, RackState } from '../state';
import { batteryRuntimeSeconds, hasUpstream, integrateBatteries, resolvePower } from './power';
import { advanceProtection, prepareRack } from './protection';
import { advanceThermal } from './thermal';
import { scheduleWork } from './workload';

type Emit = (type: string, ids: string[], offset: number) => void;

function demand(spec: ScenarioSpec, physical: PhysicalState) {
  return { ...spec.workload, interactive: spec.workload.interactive + physical.pulse };
}

function planWork(spec: ScenarioSpec, physical: PhysicalState, rack: RackState) {
  const capacity = rack.mode === 'ready' ? spec.profile.computeCapacity : rack.mode === 'throttled' ? spec.profile.computeCapacity / 2 : 0;
  // Preview a constant work rate; actual backlog exhaustion is a segment boundary below.
  const work = scheduleWork(spec.profile, demand(spec, physical), capacity, rack.backlog > 0 ? spec.profile.computeCapacity : 0, rack.batchCeiling, 1);
  return { ...work, powerKw: rack.mode === 'booting' ? spec.profile.bootKw : work.powerKw };
}

function coolingPrerequisites(spec: ScenarioSpec, physical: PhysicalState, id: string, visited = new Set<string>()): boolean {
  const asset = spec.topology.assets.find(a => a.id === id);
  if (!asset || visited.has(id)) return false;
  if (asset.kind === 'distribution' || asset.kind === 'generator') return hasUpstream(spec, physical.sources, id);
  if (asset.kind === 'controller' && physical.controllerFault) return false;
  return asset.dependencies.length > 0 && asset.dependencies.every(dependency => coolingPrerequisites(spec, physical, dependency, new Set(visited).add(id)));
}

function coolingAllocations(spec: ScenarioSpec, physical: PhysicalState, electricalBudgetKw: number) {
  const ready = physical.cooling.filter(c => c.ready && coolingPrerequisites(spec, physical, c.id));
  const standbyKw = Math.min(electricalBudgetKw, ready.length * spec.profile.coolingAuxiliaryKw);
  const thermalCapacityKw = Math.min(ready.length * spec.profile.coolingTrainKw, spec.profile.coolingCop * Math.max(0, electricalBudgetKw - standbyKw));
  return {
    standbyKw,
    trains: ready.map(c => ({ capacityKw: thermalCapacityKw / ready.length, rackIds: spec.topology.assets.filter(a => a.kind === 'rack' && a.dependencies.includes(c.id)).map(a => a.id) })),
  };
}

export function createPhysical(spec: ScenarioSpec): PhysicalState {
  const p = spec.profile;
  const initialWork = scheduleWork(p, spec.workload, p.computeCapacity, 0, spec.workload.catchupCeiling, 1);
  if (p.conductanceKwK === 0 && initialWork.powerKw > 0) throw new Error('Initial state requires finite thermal equilibrium.');
  const physical: PhysicalState = {
    sources: { utilityAvailable: true, generatorReady: false, transferComplete: false }, controllerFault: false, pulse: 0,
    racks: spec.topology.assets.filter(a => a.kind === 'rack').map(a => ({
      id: a.id, temperatureC: p.supplyReferenceC + (p.conductanceKwK > 0 ? initialWork.powerKw / p.conductanceKwK : 0),
      backlog: 0, batchCeiling: spec.workload.catchupCeiling, mode: 'ready', thermalLatched: false, resetRequested: false,
      bootRemainingSeconds: 0, hotSeconds: 0, tripSeconds: 0, coolSeconds: 0,
      powered: true, powerKw: initialWork.powerKw, critical: initialWork.critical, interactive: initialWork.interactive, batch: initialWork.batch,
    })),
    ups: spec.topology.assets.filter(a => a.kind === 'ups').map(a => ({ id: a.id, energyKwh: p.upsEnergyKwh, tripped: false, faulted: false })),
    cooling: spec.topology.assets.filter(a => a.kind === 'cooling').map(a => ({ id: a.id, ready: true, restartRemainingSeconds: 0 })),
    totals: { criticalDemand: 0, criticalDelivered: 0, interactiveDemand: 0, interactiveDelivered: 0, batchArrivals: 0, batchCompleted: 0, batchDelayUnitSeconds: 0, itEnergyKwh: 0, coolingEnergyKwh: 0, sourceEnergyKwh: 0 },
    lastInterval: { itPowerKw: 0, coolingThermalKw: 0, coolingElectricKw: 0, itInputKw: 0, chargeInputKw: 0, sourceUsedKw: 0, sourceCapacityKw: null, criticalServedFraction: 1, interactiveServedFraction: 1 },
  };
  const power = resolvePower(spec, physical.sources, physical.ups, physical.racks);
  const allocation = coolingAllocations(spec, physical, power.remainingSourceKw);
  const thermal = advanceThermal(physical.racks, allocation.trains, p, 1);
  if (power.poweredRackIds.length !== physical.racks.length || power.trippedIds.length > 0 || thermal.temperaturesC.some((t, i) => Math.abs(t - physical.racks[i].temperatureC) > 1e-8)
    || initialWork.critical !== spec.workload.critical || initialWork.interactive !== spec.workload.interactive || initialWork.batch !== spec.workload.batch) {
    throw new Error('Scenario does not provide a balanced initial physical state.');
  }
  const itPowerKw = physical.racks.reduce((sum, r) => sum + r.powerKw, 0);
  const coolingElectricKw = allocation.standbyKw + thermal.removedKw / p.coolingCop;
  physical.lastInterval = { ...physical.lastInterval, itPowerKw, itInputKw: power.itInputKw, coolingThermalKw: thermal.removedKw, coolingElectricKw, sourceUsedKw: power.itInputKw + coolingElectricKw };
  return physical;
}

export function advancePhysical(physical: PhysicalState, spec: ScenarioSpec, emit: Emit) {
  const profile = spec.profile;
  const offered = demand(spec, physical);
  const last = physical.lastInterval;
  last.itPowerKw = last.coolingThermalKw = last.coolingElectricKw = last.itInputKw = last.chargeInputKw = last.sourceUsedKw = 0;
  let deliveredCritical = 0;
  let deliveredInteractive = 0;
  let elapsed = 0;
  // Each split must exhaust a battery, finish boot/restart, or drain a backlog.
  const segmentLimit = physical.ups.length + 2 * physical.racks.length + physical.cooling.length + 1;
  for (let segment = 0; elapsed < 1 && segment < segmentLimit; segment++) {
    for (const cooling of physical.cooling) {
      if (!coolingPrerequisites(spec, physical, cooling.id)) {
        cooling.ready = false;
        cooling.restartRemainingSeconds = spec.mission.recoveryRestartSeconds;
      } else if (!cooling.ready && cooling.restartRemainingSeconds === 0) cooling.ready = true;
    }
    for (const rack of physical.racks) {
      const dependencies = spec.topology.assets.find(a => a.id === rack.id)!.dependencies;
      const candidate = physical.ups.some(u => dependencies.includes(u.id) && !u.tripped && !u.faulted && (u.energyKwh > 0 || hasUpstream(spec, physical.sources, u.id)));
      for (const type of prepareRack(rack, candidate, profile, rack.temperatureC)) emit(type, [rack.id], elapsed);
    }
    const planned = physical.racks.map(r => planWork(spec, physical, r));
    const power = resolvePower(spec, physical.sources, physical.ups, physical.racks.map((r, i) => ({ id: r.id, powerKw: planned[i].powerKw })));
    for (const id of power.trippedIds) emit('ups_overload_trip', [id], elapsed);
    last.sourceCapacityKw = power.sourceCapacityKw;
    let seconds = 1 - elapsed;
    const batteryBoundaries = power.flows.map(flow => batteryRuntimeSeconds(physical.ups.find(u => u.id === flow.id)!.energyKwh, flow.dischargeKw, profile.upsEfficiency));
    for (const boundary of batteryBoundaries) if (boundary !== null) seconds = Math.min(seconds, boundary);
    for (const cooling of physical.cooling) if (!cooling.ready && coolingPrerequisites(spec, physical, cooling.id) && cooling.restartRemainingSeconds > 0) seconds = Math.min(seconds, cooling.restartRemainingSeconds);
    for (let i = 0; i < physical.racks.length; i++) {
      const rack = physical.racks[i];
      rack.powered = power.poweredRackIds.includes(rack.id);
      for (const type of prepareRack(rack, rack.powered, profile, rack.temperatureC)) emit(type, [rack.id], elapsed);
      if (rack.mode === 'booting') seconds = Math.min(seconds, rack.bootRemainingSeconds);
      if (rack.powered && rack.backlog > 0 && planned[i].batch > offered.batch) seconds = Math.min(seconds, rack.backlog / (planned[i].batch - offered.batch));
    }
    if (!(seconds > 0)) throw new Error('Physical segment must advance positive time.');
    const previousBacklogs = physical.racks.map(r => r.backlog);
    for (let i = 0; i < physical.racks.length; i++) {
      const rack = physical.racks[i];
      const capacity = rack.mode === 'ready' ? profile.computeCapacity : rack.mode === 'throttled' ? profile.computeCapacity / 2 : 0;
      const work = scheduleWork(profile, offered, capacity, rack.backlog, rack.batchCeiling, seconds);
      rack.backlog = work.backlog;
      rack.critical = work.critical;
      rack.interactive = work.interactive;
      rack.batch = work.batch;
      rack.powerKw = rack.mode === 'booting' ? profile.bootKw : work.powerKw;
      deliveredCritical += rack.critical * seconds;
      deliveredInteractive += rack.interactive * seconds;
      physical.totals.batchCompleted += rack.batch * seconds;
      physical.totals.batchDelayUnitSeconds += (previousBacklogs[i] + rack.backlog) * seconds / 2;
    }
    const allocation = coolingAllocations(spec, physical, power.remainingSourceKw);
    const thermal = advanceThermal(physical.racks, allocation.trains, profile, seconds);
    const coolingElectricKw = allocation.standbyKw + thermal.removedKw / profile.coolingCop;
    const chargeInputKw = integrateBatteries(physical.ups, power.flows, seconds, Math.max(0, power.remainingSourceKw - coolingElectricKw), profile);
    for (let i = 0; i < physical.ups.length; i++) {
      if (batteryBoundaries[i] !== null && batteryBoundaries[i]! <= seconds) {
        physical.ups[i].energyKwh = 0;
        emit('ups_depleted', [physical.ups[i].id], elapsed + seconds);
      }
    }
    const itPowerKw = physical.racks.reduce((sum, r) => sum + r.powerKw, 0);
    const sourceUsedKw = power.itInputKw + coolingElectricKw + chargeInputKw;
    last.itPowerKw += itPowerKw * seconds;
    last.coolingThermalKw += thermal.removedKw * seconds;
    last.coolingElectricKw += coolingElectricKw * seconds;
    last.itInputKw += power.itInputKw * seconds;
    last.chargeInputKw += chargeInputKw * seconds;
    last.sourceUsedKw += sourceUsedKw * seconds;
    physical.totals.itEnergyKwh += itPowerKw * seconds / 3600;
    physical.totals.coolingEnergyKwh += coolingElectricKw * seconds / 3600;
    physical.totals.sourceEnergyKwh += sourceUsedKw * seconds / 3600;
    for (let i = 0; i < physical.racks.length; i++) {
      const rack = physical.racks[i];
      const fromC = rack.temperatureC;
      rack.temperatureC = thermal.temperaturesC[i];
      for (const type of advanceProtection(rack, fromC, rack.temperatureC, seconds, profile)) emit(type, [rack.id], elapsed + seconds);
    }
    for (const cooling of physical.cooling) {
      if (!cooling.ready && coolingPrerequisites(spec, physical, cooling.id)) {
        cooling.restartRemainingSeconds = Math.max(0, cooling.restartRemainingSeconds - seconds);
        if (cooling.restartRemainingSeconds === 0) {
          cooling.ready = true;
          emit('cooling_ready', [cooling.id], elapsed + seconds);
        }
      }
    }
    elapsed += seconds;
  }
  if (elapsed < 1) throw new Error('Physical resolution exceeded its finite segment bound.');
  const count = physical.racks.length;
  physical.totals.criticalDemand += offered.critical * count;
  physical.totals.interactiveDemand += offered.interactive * count;
  physical.totals.batchArrivals += offered.batch * count;
  physical.totals.criticalDelivered += deliveredCritical;
  physical.totals.interactiveDelivered += deliveredInteractive;
  last.criticalServedFraction = offered.critical * count > 0 ? deliveredCritical / (offered.critical * count) : 1;
  last.interactiveServedFraction = offered.interactive * count > 0 ? deliveredInteractive / (offered.interactive * count) : 1;
  // Endpoint availability reflects trips/depletion; interval accounting above retains work already done.
  const endpoint = resolvePower(spec, physical.sources, physical.ups, physical.racks.map(r => ({ id: r.id, powerKw: planWork(spec, physical, r).powerKw })));
  for (const id of endpoint.trippedIds) emit('ups_overload_trip', [id], 1);
  for (const rack of physical.racks) {
    rack.powered = endpoint.poweredRackIds.includes(rack.id);
    for (const type of prepareRack(rack, rack.powered, profile, rack.temperatureC)) emit(type, [rack.id], 1);
    const work = planWork(spec, physical, rack);
    rack.critical = work.critical;
    rack.interactive = work.interactive;
    rack.batch = work.batch;
    rack.powerKw = work.powerKw;
  }
}
