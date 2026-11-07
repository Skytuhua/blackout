import type { ScenarioSpec } from '../../shared/contracts';

export interface ThermalZone { id: string; temperatureC: number; powerKw: number }
export interface CoolingAllocation { capacityKw: number; rackIds: string[] }

export function advanceThermal(zones: ThermalZone[], trains: CoolingAllocation[], profile: ScenarioSpec['profile'], seconds: number) {
  const requests = zones.map(z => Math.min(
    profile.conductanceKwK * Math.max(0, z.temperatureC - profile.supplyReferenceC),
    Math.max(0, z.temperatureC - profile.supplyReferenceC) * profile.heatCapacityKjK / seconds + z.powerKw,
  ));
  const removed = zones.map(() => 0);
  // Sequential proportional allocation is bounded by train count, including disjoint connections.
  for (const train of trains) {
    const unmet = zones.map((z, i) => train.rackIds.includes(z.id) ? requests[i] - removed[i] : 0);
    const sum = unmet.reduce((a, b) => a + b, 0);
    const fraction = sum > 0 ? Math.min(1, train.capacityKw / sum) : 0;
    for (let i = 0; i < zones.length; i++) removed[i] += unmet[i] * fraction;
  }
  return {
    temperaturesC: zones.map((z, i) => z.temperatureC + (z.powerKw - removed[i]) * seconds / profile.heatCapacityKjK),
    removedKw: removed.reduce((a, b) => a + b, 0),
  };
}
