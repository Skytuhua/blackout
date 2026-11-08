import { describe, expect, it } from 'vitest';
import { createFacilityMapFixture } from '../../../src/shared/facility-map-fixture';
import { assetEvidence, fitMap, roomViewport, PresentationClock } from '../../../src/game/facility-map/model';

describe('map presentation boundaries', () => {
  it('uses available map space while preserving aspect ratio and avoiding overflow', () => {
    const fitted = fitMap(1000, 600, { width: 768, height: 448 });
    expect(fitted.width).toBeCloseTo(1000);
    expect(fitted.height).toBeLessThanOrEqual(600);
    expect(fitted.scale).toBeCloseTo(1000 / 768);
    expect(fitMap(1600, 1000, { width: 768, height: 448 }).scale).toBeCloseTo(1600 / 768);
    const tiny = fitMap(400, 100, { width: 768, height: 448 });
    expect(tiny.width).toBeLessThanOrEqual(400);
    expect(tiny.height).toBeLessThanOrEqual(100);
    expect(tiny.scale).toBeLessThan(1);
  });
  it('uses known bounds, with a one-tile context margin and an honest missing-room fallback', () => {
    const topology = createFacilityMapFixture().knownTopology;
    expect(roomViewport(topology, 'hall-a')).toEqual({ x: 0, y: 9, width: 22, height: 12 });
    expect(roomViewport(topology, 'missing')).toEqual({ x: 0, y: 0, width: 48, height: 28 });
  });
  it('never promotes unknown, stale, undelivered or future readings to an active fault', () => {
    const view = createFacilityMapFixture();
    const observation = { id: 'state', assetId: 'ups-a', source: 'test', field: 'state', value: 'offline', units: '', quality: 'reported' as const, observedAt: 20, receivedAt: 20 };
    expect(assetEvidence([], 20).state).toBe('unknown');
    expect(assetEvidence([observation], 20).state).toBe('attention');
    expect(assetEvidence([{ ...observation, observedAt: 1 }], 20).label).toBe('Stale');
    for (const patch of [{ observedAt: 21 }, { receivedAt: 21 }, { quality: 'unknown' as const }, { value: null }]) {
      const result = assetEvidence([{ ...observation, ...patch }], view.simTime);
      expect(result.state).toBe('unknown');
      expect(result.label).toBe('Unknown');
      expect(result.readings).not.toContain('offline');
    }
  });
  it('preserves motion across selection, caps extrapolation, and freezes or resets cleanly', () => {
    const clock = new PresentationClock();
    clock.receive('A', 20);
    expect(clock.advance(.1, 4, true)).toBeCloseTo(20.4);
    clock.receive('A', 20);
    expect(clock.advance(.1, 2, true)).toBeCloseTo(20.6);
    expect(clock.advance(10, 4, true)).toBe(21);
    expect(clock.advance(10, 4, false)).toBe(21);
    clock.receive('A', 22);
    expect(clock.time).toBe(22);
    clock.receive('A', 0);
    expect(clock.time).toBe(0);
    clock.receive('B', 20);
    expect(clock.time).toBe(20);
  });
});
