import { describe, expect, it } from 'vitest';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { scheduleWork } from '../../src/sim/systems/workload';

describe('work conservation and useful service', () => {
  it('serves critical, interactive, then batch, with power from executed work', () => {
    const work = scheduleWork(hotRestart.profile, hotRestart.workload, 100, 0, 50, 1);
    expect(work).toEqual({ critical: 20, interactive: 10, batch: 30, backlog: 0, powerKw: 8 });
    const throttled = scheduleWork(hotRestart.profile, hotRestart.workload, 50, 0, 50, 1);
    expect(throttled).toEqual({ critical: 20, interactive: 10, batch: 20, backlog: 10, powerKw: 7 });
  });

  it('retains offered arrivals while paused, then drains backlog using real spare capacity', () => {
    const paused = scheduleWork(hotRestart.profile, hotRestart.workload, 100, 0, 0, 10);
    expect(paused).toEqual({ critical: 20, interactive: 10, batch: 0, backlog: 300, powerKw: 5 });
    const resumed = scheduleWork(hotRestart.profile, hotRestart.workload, 100, paused.backlog, 50, 10);
    expect(resumed).toEqual({ critical: 20, interactive: 10, batch: 50, backlog: 100, powerKw: 10 });
    const drained = scheduleWork(hotRestart.profile, hotRestart.workload, 100, resumed.backlog, 50, 10);
    expect(drained.batch).toBe(40);
    expect(drained.backlog).toBe(0);
    expect(300 + 600 - (50 + 40) * 10).toBe(0);
  });

  it('keeps critical shortfall distinct from admission and bounds utilization', () => {
    const work = scheduleWork(hotRestart.profile, { critical: 80, interactive: 80, batch: 30 }, 100, 0, 0, 1);
    expect(work.critical).toBe(80);
    expect(work.interactive).toBe(20);
    expect(work.batch).toBe(0);
    expect(work.backlog).toBe(30);
    expect(work.powerKw).toBe(12);
    const off = scheduleWork(hotRestart.profile, hotRestart.workload, 0, 20, 50, 0.25);
    expect(off).toEqual({ critical: 0, interactive: 0, batch: 0, backlog: 27.5, powerKw: 0 });
  });
});
