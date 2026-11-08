import { describe, expect, it } from 'vitest';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { advanceThermal } from '../../src/sim/systems/thermal';

const zones = (temperatureC = 24, powerKw = 8) => Array.from({ length: 8 }, (_, i) => ({ id: `rack-${i + 1}`, temperatureC, powerKw }));
const trains = (capacityKw = 160) => [{ capacityKw, rackIds: zones().map(z => z.id) }];

describe('lumped thermal references', () => {
  it('holds the balanced 24C baseline and gives a 0.04C/s loss slope', () => {
    const equilibrium = advanceThermal(zones(), trains(), hotRestart.profile, 1);
    expect(equilibrium.temperaturesC).toEqual(Array(8).fill(24));
    expect(equilibrium.removedKw).toBe(64);
    let state = zones();
    for (let t = 0; t < 75; t++) {
      const next = advanceThermal(state, [], hotRestart.profile, 1);
      state = state.map((z, i) => ({ ...z, temperatureC: next.temperaturesC[i] }));
    }
    expect(state[0].temperatureC).toBeCloseTo(27, 10);
  });

  it('recovers stored heat with a 100s time constant rather than resetting temperature', () => {
    let state = zones(30);
    for (let t = 0; t < 100; t++) {
      const next = advanceThermal(state, trains(), hotRestart.profile, 1);
      state = state.map((z, i) => ({ ...z, temperatureC: next.temperaturesC[i] }));
    }
    expect(state[0].temperatureC).toBeCloseTo(24 + 6 * 0.99 ** 100, 10);
    expect(Math.abs(state[0].temperatureC - (24 + 6 / Math.E))).toBeLessThan(0.012);
  });

  it('shares one finite cooling pool and respects declared train connections', () => {
    const peak = advanceThermal(zones(26, 12), trains(80), hotRestart.profile, 1);
    expect(peak.removedKw).toBe(80);
    expect(peak.temperaturesC[0]).toBeCloseTo(26.01, 10);
    const local = advanceThermal(zones(), [{ capacityKw: 80, rackIds: ['rack-1'] }], hotRestart.profile, 1);
    expect(local.removedKw).toBe(8);
    expect(local.temperaturesC[0]).toBe(24);
    expect(local.temperaturesC[1]).toBeCloseTo(24.04, 10);
  });

  it('never cools an empty request or overshoots the cooling reference', () => {
    expect(advanceThermal(zones(19, 0), trains(), hotRestart.profile, 1).removedKw).toBe(0);
    const stiff = advanceThermal(zones(21, 0), trains(), { ...hotRestart.profile, conductanceKwK: 1000, heatCapacityKjK: 1 }, 1);
    expect(stiff.temperaturesC.every(t => t >= 20)).toBe(true);
    expect(stiff.removedKw).toBe(8);
  });

  it('stays within 0.1C of an independent half-second Euler trace for 600s', () => {
    let full = zones(30);
    let half = 30;
    let maxDifference = 0;
    for (let t = 0; t < 600; t++) {
      const next = advanceThermal(full, trains(), hotRestart.profile, 1);
      full = full.map((z, i) => ({ ...z, temperatureC: next.temperaturesC[i] }));
      for (let s = 0; s < 2; s++) half += (8 - Math.min(20, 2 * Math.max(0, half - 20))) * 0.5 / 200;
      maxDifference = Math.max(maxDifference, Math.abs(full[0].temperatureC - half));
    }
    expect(maxDifference).toBeLessThan(0.1);
    expect(maxDifference).toBeGreaterThan(0);
  });
});
