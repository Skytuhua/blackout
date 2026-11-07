import { describe, expect, it } from 'vitest';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { batteryRuntimeSeconds, integrateBatteries, resolvePower, type UpsState } from '../../src/sim/systems/power';

const units = (): UpsState[] => ['ups-1', 'ups-2'].map(id => ({ id, energyKwh: 5, tripped: false, faulted: false }));
const loads = (powerKw = 8) => hotRestart.topology.assets.filter(a => a.kind === 'rack').map(a => ({ id: a.id, powerKw }));
const utility = { utilityAvailable: true, generatorReady: false, transferComplete: false };
const outage = { ...utility, utilityAvailable: false };

describe('source, UPS ratings and stored DC energy', () => {
  it('accounts for UPS input conversion, independent cooling supply, then bounded recharge', () => {
    const ups = units();
    ups[0].energyKwh = 4;
    const flow = resolvePower(hotRestart, utility, ups, loads());
    expect(flow.itInputKw).toBeCloseTo(64 / 0.95, 10);
    expect(flow.flows.map(f => f.outputKw)).toEqual([32, 32]);
    expect(flow.flows.every(f => f.dischargeKw === 0)).toBe(true);
    const charge = integrateBatteries(ups, flow.flows, 1, 100, hotRestart.profile);
    expect(charge).toBe(5);
    expect(ups[0].energyKwh).toBeCloseTo(4 + 5 * 0.95 / 3600, 10);
    expect(ups[1].energyKwh).toBe(5);
  });

  it('keeps energy and output rating separate and applies discharge efficiency once', () => {
    const ups = units();
    const flow = resolvePower(hotRestart, outage, ups, loads());
    integrateBatteries(ups, flow.flows, 60, 100, hotRestart.profile);
    expect(ups[0].energyKwh).toBeCloseTo(5 - 32 / 0.95 / 60, 10);
    expect(flow.itInputKw).toBe(0);
    expect(batteryRuntimeSeconds(5, 32, 0.95)).toBeCloseTo(534.375, 10);
    expect(batteryRuntimeSeconds(5, 64, 0.95)).toBeCloseTo(267.1875, 10);
  });

  it('redistributes a failed feed without discharging a utility-fed survivor', () => {
    const ups = units();
    ups[0].faulted = true;
    const flow = resolvePower(hotRestart, utility, ups, loads());
    expect(flow.flows.map(f => f.outputKw)).toEqual([0, 64]);
    expect(flow.flows[1].dischargeKw).toBe(0);
    expect(flow.poweredRackIds).toHaveLength(8);
    expect(ups[1].energyKwh).toBe(5);
  });

  it('trips a surviving output above its hard limit instead of proportionally serving it', () => {
    const ups = units();
    ups[0].faulted = true;
    const flow = resolvePower(hotRestart, utility, ups, loads(12));
    expect(ups[1].tripped).toBe(true);
    expect(flow.trippedIds).toEqual(['ups-2']);
    expect(flow.poweredRackIds).toEqual([]);
    expect(flow.flows.every(f => f.outputKw === 0)).toBe(true);
  });

  it('recharges an energized input even with no output load and never exceeds stored capacity', () => {
    const ups = units();
    ups[0].energyKwh = 4.9999;
    const flow = resolvePower(hotRestart, utility, ups, []);
    const charge = integrateBatteries(ups, flow.flows, 1, 5, hotRestart.profile);
    expect(ups[0].energyKwh).toBe(5);
    expect(charge).toBeCloseTo(0.0001 * 3600 / 0.95, 9);
    expect(ups[1].energyKwh).toBe(5);
  });
});
