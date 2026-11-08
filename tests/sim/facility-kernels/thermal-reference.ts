import { hotRestart } from '../../../src/content/scenarios/hot-restart';
import { allocateCoolingCapacity, restartCoolingUnits } from '../../../src/sim/facility-kernels/cooling';
import type { PhysicalState } from '../../../src/sim/state';
import { advanceThermal, type ThermalZone } from '../../../src/sim/systems/thermal';

// Constructed kernel fixtures, not an expanded ScenarioSpec or a second thermal solver.
export const unitIds = ['a-1', 'a-2', 'b-1', 'b-2'];
export const hallARackIds = Array.from({ length: 8 }, (_, i) => `a-rack-${i + 1}`);
export const hallBRackIds = Array.from({ length: 8 }, (_, i) => `b-rack-${i + 1}`);
export const connections: Record<string, string[]> = {
  'a-1': hallARackIds, 'a-2': hallARackIds, 'b-1': hallBRackIds, 'b-2': hallBRackIds,
};

export function createZones(): ThermalZone[] {
  return [...hallARackIds, ...hallBRackIds].map(id => ({ id, temperatureC: 24, powerKw: 8 }));
}

export function evaluateCooling(zones: ThermalZone[], readyIds: readonly string[], budgetKw = 200, seconds = 1) {
  const allocation = allocateCoolingCapacity(readyIds, budgetKw, hotRestart.profile);
  const trains = allocation.allocations.map(({ unitId, capacityKw }) => ({ capacityKw, rackIds: connections[unitId] }));
  const thermal = advanceThermal(zones, trains, hotRestart.profile, seconds);
  const nextZones = zones.map((zone, i) => ({ ...zone, temperatureC: thermal.temperaturesC[i] }));
  return {
    allocation, trains, thermal, nextZones, budgetKw, seconds,
    itKw: zones.reduce((sum, zone) => sum + zone.powerKw, 0),
    coolingElectricKw: allocation.standbyKw + thermal.removedKw / hotRestart.profile.coolingCop,
    storedHeatDeltaKj: zones.reduce((sum, zone, i) => sum
      + (thermal.temperaturesC[i] - zone.temperatureC) * hotRestart.profile.heatCapacityKjK, 0),
  };
}

export function runCoolingTrace() {
  let zones = createZones();
  let elapsedSeconds = 0;
  const steps: (ReturnType<typeof evaluateCooling> & { phase: string; elapsedSeconds: number })[] = [];
  const step = (phase: string, eligibleIds: readonly string[]) => {
    const result = evaluateCooling(zones, eligibleIds);
    zones = result.nextZones;
    steps.push({ ...result, phase, elapsedSeconds: ++elapsedSeconds });
  };

  const units: PhysicalState['cooling'] = unitIds.map(id => ({ id, ready: true, restartRemainingSeconds: 0 }));
  step('balanced', unitIds);
  // The future engine resolves the controller outage; only B IDs are eligible here.
  for (let i = 0; i < 75; i++) step('A controller outage', ['b-1', 'b-2']);
  const temperaturesBeforeRestart = zones.map(zone => zone.temperatureC);
  const scheduledUnits = restartCoolingUnits(units, ['a-1', 'a-2'], hotRestart.mission.recoveryRestartSeconds);
  const temperaturesAfterRestart = zones.map(zone => zone.temperatureC);
  for (let i = 0; i < 30; i++) step('A restart delay', scheduledUnits.filter(unit => unit.ready).map(unit => unit.id));

  // Explicit test boundary after the full delay; the kernel does not advance timers.
  const restoredIds = unitIds;
  for (let i = 0; i < 100; i++) step('A restored', restoredIds);
  return { units, scheduledUnits, temperaturesBeforeRestart, temperaturesAfterRestart, steps };
}
