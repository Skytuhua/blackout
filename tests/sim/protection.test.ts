import { describe, expect, it } from 'vitest';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { advanceProtection, prepareRack, type RackProtection } from '../../src/sim/systems/protection';

const rack = (): RackProtection => ({ mode: 'ready', thermalLatched: false, resetRequested: false, bootRemainingSeconds: 0, hotSeconds: 0, tripSeconds: 0, coolSeconds: 0 });
const profile = hotRestart.profile;

describe('fictional equipment protection profile', () => {
  it('requires continuous high exposure, then continuous hysteresis release', () => {
    const r = rack();
    advanceProtection(r, 32, 32, 29, profile);
    expect(r.mode).toBe('ready');
    advanceProtection(r, 32, 32, 1, profile);
    expect(r.mode).toBe('throttled');
    advanceProtection(r, 30, 30, 29, profile);
    expect(r.mode).toBe('throttled');
    advanceProtection(r, 30, 30, 1, profile);
    expect(r.mode).toBe('ready');
    advanceProtection(r, 33, 33, 20, profile);
    advanceProtection(r, 31, 31, 1, profile);
    advanceProtection(r, 33, 33, 20, profile);
    expect(r.mode).toBe('ready');
  });

  it('latches a trip without erasing stored heat and requires a qualified reset plus cooling dwell', () => {
    const r = rack();
    advanceProtection(r, 40, 40, 9, profile);
    expect(r.mode).toBe('ready');
    expect(advanceProtection(r, 40, 40, 1, profile)).toContain('thermal_trip');
    expect(r.mode).toBe('off');
    expect(r.thermalLatched).toBe(true);
    advanceProtection(r, 29, 29, 30, profile);
    prepareRack(r, true, profile);
    expect(r.mode).toBe('off');
    r.resetRequested = true; // Future accepted task effect; not a public command bypass.
    prepareRack(r, false, profile);
    expect(r.mode).toBe('off');
    prepareRack(r, true, profile);
    expect(r.mode).toBe('booting');
    advanceProtection(r, 29, 29, 19, profile);
    expect(r.mode).toBe('booting');
    advanceProtection(r, 29, 29, 1, profile);
    expect(r.mode).toBe('ready');
  });

  it('counts the within-interval threshold crossing and interrupts boot on lost power', () => {
    const r = rack();
    advanceProtection(r, 31, 33, 1, profile);
    expect(r.hotSeconds).toBe(0.5);
    prepareRack(r, false, profile);
    expect(r.mode).toBe('off');
    prepareRack(r, true, profile);
    expect(r.mode).toBe('booting');
    expect(r.bootRemainingSeconds).toBe(20);
    advanceProtection(r, 33, 33, 10, profile);
    prepareRack(r, false, profile);
    prepareRack(r, true, profile);
    expect(r.bootRemainingSeconds).toBe(20);
  });
});
