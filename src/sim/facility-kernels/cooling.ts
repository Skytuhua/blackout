import type { ScenarioSpec } from '../../shared/contracts';
import type { PhysicalState } from '../state';

function validateNumber(value: number, name: string, positive = false): void {
  if (!Number.isFinite(value) || value < 0 || (positive && value === 0)) {
    throw new RangeError(`${name} must be finite and ${positive ? 'positive' : 'nonnegative'}.`);
  }
}

function validateIds(ids: readonly string[], name: string): Set<string> {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.trim().length === 0 || seen.has(id)) {
      throw new Error(`${name} must contain nonblank, unique IDs.`);
    }
    seen.add(id);
  }
  return seen;
}

// The caller supplies eligible IDs from all halls once, then maps their rack connections.
export function allocateCoolingCapacity(
  readyUnitIds: readonly string[],
  electricalBudgetKw: number,
  profile: Pick<ScenarioSpec['profile'], 'coolingAuxiliaryKw' | 'coolingTrainKw' | 'coolingCop'>,
): {
  standbyKw: number;
  allocations: { unitId: string; capacityKw: number }[];
} {
  validateNumber(electricalBudgetKw, 'Electrical budget');
  validateNumber(profile.coolingAuxiliaryKw, 'Cooling auxiliary demand');
  validateNumber(profile.coolingTrainKw, 'Cooling train capacity', true);
  validateNumber(profile.coolingCop, 'Cooling COP', true);
  validateIds(readyUnitIds, 'Ready unit IDs');
  const count = readyUnitIds.length;
  if (count === 0) return { standbyKw: 0, allocations: [] };
  const standbyKw = Math.min(electricalBudgetKw, count * profile.coolingAuxiliaryKw);
  const thermalCapacityKw = Math.min(
    count * profile.coolingTrainKw,
    profile.coolingCop * Math.max(0, electricalBudgetKw - standbyKw),
  );
  let capacityKw = Math.min(profile.coolingTrainKw, thermalCapacityKw / count);
  const fitsBudget = (share: number): boolean => {
    let totalKw = 0;
    for (let i = 0; i < count; i++) totalKw += share;
    return Number.isFinite(totalKw) && totalKw <= thermalCapacityKw
      && totalKw / profile.coolingCop + standbyKw <= electricalBudgetKw;
  };
  if (!fitsBudget(capacityKw)) {
    // Search positive float representations: bounded iterations, no epsilon,
    // and the same summed capacity that downstream consumers actually use.
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, capacityKw);
    let low = 0n;
    let high = bits.getBigUint64(0);
    while (low < high) {
      const middle = (low + high + 1n) / 2n;
      bits.setBigUint64(0, middle);
      if (fitsBudget(bits.getFloat64(0))) low = middle;
      else high = middle - 1n;
    }
    bits.setBigUint64(0, low);
    capacityKw = bits.getFloat64(0);
  }
  return {
    standbyKw,
    allocations: [...readyUnitIds].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
      .map(unitId => ({ unitId, capacityKw })),
  };
}

// Scheduling only: even a zero delay remains not ready until the engine boundary.
export function restartCoolingUnits(
  units: readonly PhysicalState['cooling'][number][],
  targetUnitIds: readonly string[],
  restartSeconds: number,
): PhysicalState['cooling'] {
  validateNumber(restartSeconds, 'Restart duration');
  const sourceIds = validateIds(units.map(unit => unit.id), 'Source unit IDs');
  const targets = validateIds(targetUnitIds, 'Target unit IDs');
  for (const id of targets) {
    if (!sourceIds.has(id)) throw new Error(`Unknown cooling unit: ${id}`);
  }
  return units.map(unit => targets.has(unit.id)
    ? { ...unit, ready: false, restartRemainingSeconds: restartSeconds }
    : { ...unit });
}
