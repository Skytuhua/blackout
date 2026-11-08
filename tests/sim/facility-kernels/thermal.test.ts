import { describe, expect, it } from 'vitest';
import { createZones, evaluateCooling, runCoolingTrace, unitIds } from './thermal-reference';
import { hotRestart } from '../../../src/content/scenarios/hot-restart';
import { allocateCoolingCapacity } from '../../../src/sim/facility-kernels/cooling';
import { advanceThermal } from '../../../src/sim/systems/thermal';

describe('two-hall cooling with the existing thermal solver', () => {
  it('keeps actual solver electricity within a fractional shared budget', () => {
    const profile = { ...hotRestart.profile, coolingAuxiliaryKw: 0 };
    const zones = Array.from({ length: 3 }, (_, i) => ({ id: `rack-${i}`, temperatureC: 30, powerKw: 8 }));
    const allocation = allocateCoolingCapacity(['unit-0', 'unit-1', 'unit-2'], 0.1, profile);
    const thermal = advanceThermal(zones, allocation.allocations.map((unit, i) => ({
      capacityKw: unit.capacityKw, rackIds: [zones[i].id],
    })), profile, 1);
    expect(allocation.standbyKw + thermal.removedKw / profile.coolingCop).toBeLessThanOrEqual(0.1);
    expect(thermal.removedKw).toBeGreaterThan(0);
  });

  it('keeps B balanced while A warms, retains restart heat, then recovers A through its connections', () => {
    const trace = runCoolingTrace();
    const outageEnd = trace.steps[75];
    const delayEnd = trace.steps[105];
    const firstRestored = trace.steps[106];
    const recoveryEnd = trace.steps[205];

    expect(trace.steps[0].thermal.temperaturesC).toEqual(Array(16).fill(24));
    for (const zone of outageEnd.nextZones.slice(0, 8)) expect(zone.temperatureC).toBeCloseTo(27, 10);
    for (const step of trace.steps) expect(step.thermal.temperaturesC.slice(8)).toEqual(Array(8).fill(24));
    expect(trace.temperaturesAfterRestart).toEqual(trace.temperaturesBeforeRestart);
    expect(trace.scheduledUnits).toEqual([
      { id: 'a-1', ready: false, restartRemainingSeconds: 30 },
      { id: 'a-2', ready: false, restartRemainingSeconds: 30 },
      { id: 'b-1', ready: true, restartRemainingSeconds: 0 },
      { id: 'b-2', ready: true, restartRemainingSeconds: 0 },
    ]);
    expect(trace.units).toEqual(unitIds.map(id => ({ id, ready: true, restartRemainingSeconds: 0 })));
    for (const zone of delayEnd.nextZones.slice(0, 8)) expect(zone.temperatureC).toBeCloseTo(28.2, 10);
    for (const zone of firstRestored.nextZones.slice(0, 8)) expect(zone.temperatureC).toBeCloseTo(28.158, 10);
    for (const zone of recoveryEnd.nextZones.slice(0, 8)) {
      expect(zone.temperatureC).toBeCloseTo(24 + 4.2 * 0.99 ** 100, 10);
      expect(zone.temperatureC).toBeGreaterThan(24);
    }
    for (const step of trace.steps.filter(step => step.phase !== 'balanced' && step.phase !== 'A restored')) {
      expect(step.trains).toHaveLength(2);
      expect(step.trains.flatMap(train => train.rackIds).every(id => id.startsWith('b-rack-'))).toBe(true);
      expect(step.thermal.removedKw).toBe(64);
    }
    for (const step of trace.steps) {
      expect(step.storedHeatDeltaKj).toBeCloseTo((128 - step.thermal.removedKw) * step.seconds, 8);
      expect(step.coolingElectricKw).toBeLessThanOrEqual(step.budgetKw);
    }
  });

  it('uses actual removed heat for electricity and balances stored energy during a shared shortage', () => {
    const baseline = evaluateCooling(createZones(), unitIds);
    expect(baseline.thermal.removedKw).toBe(128);
    expect(baseline.coolingElectricKw).toBeCloseTo(50.666666666666664, 12);
    expect(baseline.coolingElectricKw).toBeLessThan(114); // Allocated capacity would consume over 114 kW.
    expect(baseline.storedHeatDeltaKj).toBe(0);

    const shortage = evaluateCooling(createZones(), unitIds, 48, 0.25);
    expect(shortage.thermal.removedKw).toBe(120);
    expect(shortage.coolingElectricKw).toBe(48);
    expect(shortage.storedHeatDeltaKj).toBeCloseTo(2, 9); // (128 - 120) kW * 0.25 s.
    for (const zone of shortage.nextZones) expect(zone.temperatureC).toBeCloseTo(24.000625, 10);
  });

  it('does not borrow B capacity when only one A unit has actually been restored', () => {
    const zones = createZones().map(zone => zone.id.startsWith('a-') ? { ...zone, temperatureC: 28.2 } : zone);
    const before = structuredClone(zones);
    const result = evaluateCooling(zones, ['a-1', 'b-1', 'b-2']);
    expect(result.thermal.removedKw).toBe(144); // A capped at 80 kW, B removes its actual 64 kW.
    expect(result.coolingElectricKw).toBe(54); // 6 standby + 144/3.
    expect(result.storedHeatDeltaKj).toBeCloseTo(-16, 9);
    for (const zone of result.nextZones.slice(0, 8)) expect(zone.temperatureC).toBeCloseTo(28.19, 10);
    expect(result.thermal.temperaturesC.slice(8)).toEqual(Array(8).fill(24));
    expect(zones).toEqual(before);
  });
});
