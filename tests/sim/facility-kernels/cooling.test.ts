import { describe, expect, it } from 'vitest';
import { hotRestart } from '../../../src/content/scenarios/hot-restart';
import { allocateCoolingCapacity, restartCoolingUnits } from '../../../src/sim/facility-kernels/cooling';
import type { PhysicalState } from '../../../src/sim/state';

describe('facility cooling capacity', () => {
  it('shares one upstream budget across four ready units in two halls', () => {
    const readyIds = Object.freeze(['b-2', 'a-2', 'b-1', 'a-1']);

    // 48 kW electrical supplies 8 kW standby and 120 kW thermal: 30 per unit.
    expect(allocateCoolingCapacity(readyIds, 48, hotRestart.profile)).toEqual({
      standbyKw: 8,
      allocations: [
        { unitId: 'a-1', capacityKw: 30 },
        { unitId: 'a-2', capacityKw: 30 },
        { unitId: 'b-1', capacityKw: 30 },
        { unitId: 'b-2', capacityKw: 30 },
      ],
    });
  });

  it.each([
    { budgetKw: 0, standbyKw: 0, eachKw: 0 },
    { budgetKw: Number.MIN_VALUE, standbyKw: Number.MIN_VALUE, eachKw: 0 },
    { budgetKw: 4, standbyKw: 4, eachKw: 0 },
    { budgetKw: 8, standbyKw: 8, eachKw: 0 },
    { budgetKw: 8.125, standbyKw: 8, eachKw: 0.09375 },
    { budgetKw: 48, standbyKw: 8, eachKw: 30 },
    { budgetKw: 200, standbyKw: 8, eachKw: 80 },
  ])('bounds combined capacity at a $budgetKw kW budget', ({ budgetKw, standbyKw, eachKw }) => {
    const result = allocateCoolingCapacity(['a-1', 'a-2', 'b-1', 'b-2'], budgetKw, hotRestart.profile);
    expect(result.standbyKw).toBe(standbyKw);
    expect(result.allocations.map(unit => unit.capacityKw)).toEqual([eachKw, eachKw, eachKw, eachKw]);
    const thermalKw = result.allocations.reduce((sum, unit) => sum + unit.capacityKw, 0);
    expect(thermalKw / hotRestart.profile.coolingCop + result.standbyKw).toBeLessThanOrEqual(budgetKw);
  });

  it('does not round a tiny available thermal budget up or spend standby with no units', () => {
    const result = allocateCoolingCapacity(['a-1', 'a-2', 'b-1', 'b-2'], 1e-12, {
      ...hotRestart.profile, coolingAuxiliaryKw: 0,
    });
    expect(result.standbyKw).toBe(0);
    expect(result.allocations.map(unit => unit.capacityKw)).toEqual(Array(4).fill(7.5e-13));
    expect(result.allocations.reduce((sum, unit) => sum + unit.capacityKw, 0) / 3).toBeLessThanOrEqual(1e-12);
    expect(allocateCoolingCapacity([], 48, hotRestart.profile)).toEqual({ standbyKw: 0, allocations: [] });
  });

  it('leaves unrepresentable subnormal shares unused rather than exceed the thermal or electric budget', () => {
    const result = allocateCoolingCapacity(['a-1', 'a-2', 'b-1', 'b-2'], 1e-323, {
      ...hotRestart.profile, coolingAuxiliaryKw: 0,
    });
    const thermalKw = result.allocations.reduce((sum, unit) => sum + unit.capacityKw, 0);
    expect(thermalKw).toBeLessThanOrEqual(3e-323);
    expect(thermalKw / 3).toBeLessThanOrEqual(1e-323);
    expect(result.allocations.map(unit => unit.capacityKw)).toEqual(Array(4).fill(Number.MIN_VALUE));
  });

  it('uses canonical code-unit order without changing caller IDs or profile', () => {
    const readyIds = Object.freeze(['a-2', 'ä-1', 'Z-1', 'a-10']);
    const profile = Object.freeze({ ...hotRestart.profile });
    const result = allocateCoolingCapacity(readyIds, 48, profile);
    expect(result.allocations.map(unit => unit.unitId)).toEqual(['Z-1', 'a-10', 'a-2', 'ä-1']);
    expect(allocateCoolingCapacity([...readyIds].reverse(), 48, profile)).toEqual(result);
    expect(readyIds).toEqual(['a-2', 'ä-1', 'Z-1', 'a-10']);
    expect(profile).toEqual(hotRestart.profile);
  });

  it('excludes an A controller outage while B retains its capacity under adequate shared power', () => {
    const bOnly = allocateCoolingCapacity(['b-2', 'b-1'], 200, hotRestart.profile);
    expect(bOnly).toEqual({ standbyKw: 4, allocations: [
      { unitId: 'b-1', capacityKw: 80 }, { unitId: 'b-2', capacityKw: 80 },
    ] });
    const limited = allocateCoolingCapacity(['a-1', 'a-2', 'b-1', 'b-2'], 48, hotRestart.profile);
    expect(limited.allocations.reduce((sum, unit) => sum + unit.capacityKw, 0)).toBe(120);
    expect(allocateCoolingCapacity(['b-1', 'b-2'], 48, hotRestart.profile).allocations).toEqual([
      { unitId: 'b-1', capacityKw: 66 }, { unitId: 'b-2', capacityKw: 66 },
    ]);
  });

  it.each([-1, NaN, Infinity, -Infinity])('rejects invalid electrical budget %s, even without ready units', budget => {
    const ids = Object.freeze(['a-1', 'b-1']);
    expect(() => allocateCoolingCapacity(ids, budget, hotRestart.profile)).toThrowError();
    expect(() => allocateCoolingCapacity([], budget, hotRestart.profile)).toThrowError();
    expect(ids).toEqual(['a-1', 'b-1']);
  });

  it.each([
    ...[-1, NaN, Infinity, -Infinity].map(value => ({ field: 'coolingAuxiliaryKw' as const, value })),
    ...[-1, 0, NaN, Infinity, -Infinity].flatMap(value => [
      { field: 'coolingTrainKw' as const, value }, { field: 'coolingCop' as const, value },
    ]),
  ])('rejects invalid $field=$value without changing caller data', ({ field, value }) => {
    const profile = Object.freeze({ ...hotRestart.profile, [field]: value });
    const before = { ...profile };
    const ids = Object.freeze(['a-1', 'b-1']);
    expect(() => allocateCoolingCapacity(ids, 48, profile)).toThrowError();
    expect(() => allocateCoolingCapacity([], 48, profile)).toThrowError();
    expect(profile).toEqual(before);
    expect(ids).toEqual(['a-1', 'b-1']);
  });

  it.each([{ ids: [''] }, { ids: [' \t\n'] }, { ids: ['a-1', 'a-1'] }])('rejects blank or duplicate ready IDs $ids', ({ ids }) => {
    const frozen = Object.freeze(ids);
    const before = [...ids];
    expect(() => allocateCoolingCapacity(frozen, 48, hotRestart.profile)).toThrowError();
    expect(frozen).toEqual(before);
  });
});

const coolingUnits = (): PhysicalState['cooling'] => [
  { id: 'a-1', ready: true, restartRemainingSeconds: 0 },
  { id: 'b-1', ready: false, restartRemainingSeconds: 7.25 },
  { id: 'a-2', ready: false, restartRemainingSeconds: 3 },
  { id: 'b-2', ready: true, restartRemainingSeconds: 0 },
];

describe('scoped cooling restart', () => {
  it('schedules the full A delay while preserving every B value and original object', () => {
    const units = Object.freeze(coolingUnits().map(unit => Object.freeze(unit)));
    const before = structuredClone(units);
    const targets = Object.freeze(['a-2', 'a-1']);
    expect(restartCoolingUnits(units, targets, 30)).toEqual([
      { id: 'a-1', ready: false, restartRemainingSeconds: 30 },
      { id: 'b-1', ready: false, restartRemainingSeconds: 7.25 },
      { id: 'a-2', ready: false, restartRemainingSeconds: 30 },
      { id: 'b-2', ready: true, restartRemainingSeconds: 0 },
    ]);
    expect(units).toEqual(before);
    expect(targets).toEqual(['a-2', 'a-1']);
  });

  it('preserves values for empty targets and leaves zero-duration restarts not ready', () => {
    const units = Object.freeze(coolingUnits().map(unit => Object.freeze(unit)));
    expect(restartCoolingUnits(units, [], 30)).toEqual(units);
    expect(restartCoolingUnits([], [], 0)).toEqual([]);
    const result = restartCoolingUnits(units, ['a-1'], 0);
    expect(result[0]).toEqual({ id: 'a-1', ready: false, restartRemainingSeconds: 0 });
    expect(units[0]).toEqual({ id: 'a-1', ready: true, restartRemainingSeconds: 0 });
    expect(restartCoolingUnits(units, ['a-1'], 0.125)[0].restartRemainingSeconds).toBe(0.125);
  });

  it.each([-1, NaN, Infinity, -Infinity])('rejects restart duration %s without altering source state', duration => {
    const units = Object.freeze(coolingUnits().map(unit => Object.freeze(unit)));
    const before = structuredClone(units);
    expect(() => restartCoolingUnits(units, ['a-1'], duration)).toThrowError();
    expect(() => restartCoolingUnits([], [], duration)).toThrowError();
    expect(units).toEqual(before);
  });

  it.each([
    { ids: ['a-1', 'unknown'] }, { ids: ['a-1', 'a-1'] }, { ids: [''] }, { ids: [' \t\n'] },
  ])('rejects unknown, duplicate or blank targets $ids without partial mutation', ({ ids }) => {
    const units = Object.freeze(coolingUnits().map(unit => Object.freeze(unit)));
    const before = structuredClone(units);
    const targets = Object.freeze(ids);
    expect(() => restartCoolingUnits(units, targets, 30)).toThrowError();
    expect(units).toEqual(before);
    expect(targets).toEqual(ids);
  });

  it.each([{ ids: [''] }, { ids: [' \t\n'] }, { ids: ['a-1', 'a-1'] }])('rejects blank or duplicate source IDs $ids', ({ ids }) => {
    const units = Object.freeze(ids.map(id => Object.freeze({ id, ready: true, restartRemainingSeconds: 0 })));
    const before = structuredClone(units);
    expect(() => restartCoolingUnits(units, [], 30)).toThrowError();
    expect(units).toEqual(before);
  });
});
