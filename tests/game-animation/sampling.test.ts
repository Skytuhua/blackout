import { describe, expect, it } from 'vitest';
import type { KnowledgeView, Observation, PublicTask } from '../../src/shared/contracts';
import { sampleAmbient, MAX_AMBIENT_PIXELS, MAX_AMBIENT_CREW } from '../../src/game/ambient';
import { fixture, observation, workingView } from './fixtures';

const pixels = (view: KnowledgeView, kind: string) => sampleAmbient(view, 1.3).pixels.filter(p => p.kind === kind);

describe('arrived owned work only', () => {
  it.each(['inspecting', 'working'] as const)('depicts actual %s with a tiny accent', status => {
    expect(pixels(workingView({ status }), 'tool')).toHaveLength(2);
  });
  it.each(['queued', 'traveling', 'blocked', 'completed', 'canceled'] as const)('removes the accent for %s', status => {
    expect(pixels(workingView({ status }), 'tool')).toEqual([]);
  });
  it('uses view.simTime for arrival, never the presentation clock', () => {
    expect(sampleAmbient(workingView({ arrivalAt: 76 }), 1e12).pixels.some(p => p.kind === 'tool')).toBe(false);
    expect(pixels(workingView({ arrivalAt: 75 }), 'tool')).toHaveLength(2);
  });
  it('requires matching actor, task ID, known target, and unfinished work', () => {
    for (const task of [{ actorId: 'jules' }, { targetId: 'hidden' }, { progress: 1 }, { startedAt: 76 }, { completesAt: 75 }] satisfies Partial<PublicTask>[]) {
      expect(pixels(workingView(task), 'tool')).toEqual([]);
    }
    const view = workingView();
    view.crew[0].taskId = 'another-task';
    expect(pixels(view, 'tool')).toEqual([]);
    view.crew[0].taskId = null;
    expect(pixels(view, 'tool')).toEqual([]);
    view.crew[0].taskId = 'owned-task'; view.crew[0].role = 'remote';
    expect(pixels(view, 'tool')).toEqual([]);
  });
});

describe('fresh scoped evidence drives equipment', () => {
  it('samples only the known running cooling unit and busy powered rack', () => {
    expect(pixels(fixture(), 'airflow')).toHaveLength(2);
    expect(pixels(fixture(), 'rack')).toHaveLength(1);
    const view = fixture(); view.observations.push(observation('hidden', 'running', true));
    expect(sampleAmbient(view, 1.3)).toEqual(sampleAmbient(fixture(), 1.3));
  });
  it('accepts the exact freshness boundary, then goes quiet', () => {
    const view = fixture(); view.simTime = 85;
    expect(pixels(view, 'airflow')).toHaveLength(2);
    expect(pixels(view, 'rack')).toHaveLength(1);
    view.simTime = 85.001;
    expect(sampleAmbient(view, 1).pixels).toEqual([]);
  });
  it.each([
    { value: false }, { value: null }, { value: true, quality: 'unknown' },
    { value: true, observedAt: 76 }, { value: true, receivedAt: 76 },
    { value: 'stopped', field: 'state' },
  ] satisfies Partial<Observation>[])('new cooling evidence blocks old running evidence: %j', extra => {
    const view = fixture();
    for (const o of view.observations) { o.observedAt = 74; o.receivedAt = 74; }
    view.observations.push(observation('cooling-1', 'running', true, extra));
    expect(pixels(view, 'airflow')).toEqual([]);
    view.observations.reverse();
    expect(pixels(view, 'airflow')).toEqual([]);
  });
  it.each([
    { field: 'power_state', value: 'off' }, { field: 'power_state', value: 'running', quality: 'unknown' },
    { field: 'batch_processing_rate', value: 0 }, { field: 'batch_processing_rate', value: null },
    { field: 'batch_processing_rate', value: 8, receivedAt: 76 },
    { field: 'power_state', value: 'running', observedAt: 76 },
  ] satisfies Partial<Observation>[])('new rack evidence blocks activity in both input orders: %j', extra => {
    const view = fixture();
    for (const o of view.observations) { o.observedAt = 74; o.receivedAt = 74; }
    view.observations.push(observation('rack-1', extra.field!, extra.value!, extra));
    expect(pixels(view, 'rack')).toEqual([]);
    view.observations.reverse();
    expect(pixels(view, 'rack')).toEqual([]);
  });
  it('never substitutes a batch ceiling, summary, another rack or stale workload', () => {
    const view = fixture();
    view.observations = view.observations.filter(o => o.field !== 'batch_processing_rate');
    view.observations.push(observation('rack-1', 'batch_ceiling', 50), observation('rack-2', 'batch_processing_rate', 12));
    expect(pixels(view, 'rack')).toEqual([]);
    view.observations.push(observation('rack-1', 'batch_processing_rate', 12, { observedAt: 64 }));
    expect(pixels(view, 'rack')).toEqual([]);
  });
  it('uses observation time before delivery order and resolves simultaneous conflicts quietly', () => {
    const view = fixture();
    view.observations.push(observation('cooling-1', 'running', false, { observedAt: 73, receivedAt: 75 }));
    expect(pixels(view, 'airflow')).toHaveLength(2);
    view.observations.push(observation('cooling-1', 'running', null));
    expect(pixels(view, 'airflow')).toEqual([]);
    view.observations.reverse();
    expect(pixels(view, 'airflow')).toEqual([]);
  });
});

describe('bounded presentation samples', () => {
  it('staggered idle posture is infrequent, at most one native pixel, and never moves a busy or remote crew', () => {
    const view = fixture(), alex: number[] = [], jules: number[] = [];
    for (let i = 0; i < 120; i++) {
      const offsets = sampleAmbient(view, i / 20).idleOffsets;
      alex.push(offsets.find(p => p.actorId === 'alex')?.y ?? 0);
      jules.push(offsets.find(p => p.actorId === 'jules')?.y ?? 0);
      expect(offsets.every(p => p.x === 0 && (p.y === 0 || p.y === -1))).toBe(true);
      expect(offsets.some(p => p.actorId === 'sam')).toBe(false);
    }
    expect(alex).toContain(-1); expect(alex.filter(y => y === -1).length).toBeLessThan(25);
    expect(alex).not.toEqual(jules);
    const busy = workingView(); busy.crew[1].taskId = 'missing-task';
    expect(sampleAmbient(busy, 1).idleOffsets).toEqual([]);
  });
  it('provides static readable reduced-motion activity without any idle motion', () => {
    const view = workingView(), sample = sampleAmbient(view, 1.3, true);
    expect(sample).toEqual(sampleAmbient(view, 9999, true));
    expect(sample.idleOffsets).toEqual([]);
    expect(new Set(sample.pixels.map(p => p.kind))).toEqual(new Set(['tool', 'airflow', 'rack']));
  });
  it('does not mutate the view or depend on engine, summary, random or wall time', () => {
    const view = workingView(), before = structuredClone(view);
    const freeze = (value: object) => { Object.freeze(value); for (const v of Object.values(value)) if (v && typeof v === 'object') freeze(v); };
    freeze(view);
    const first = sampleAmbient(view, 2);
    expect(view).toEqual(before);
    expect(sampleAmbient({ ...before, summary: { ...before.summary, itPowerKw: 0 }, messages: [], observedEntityVersions: {} }, 2)).toEqual(first);
  });
  it('stays finite and within known world/equipment geometry even for huge clocks and repeated topology', () => {
    const view = workingView();
    view.knownTopology.assets = Array.from({ length: 300 }, () => view.knownTopology.assets).flat();
    view.crew = Array.from({ length: 100 }, () => view.crew).flat();
    for (const clock of [0, 1e12, Number.MAX_VALUE, NaN, Infinity, -100]) {
      const sample = sampleAmbient(view, clock);
      expect(sample.pixels.length).toBeGreaterThan(0);
      expect(sample.pixels.length).toBeLessThanOrEqual(MAX_AMBIENT_PIXELS);
      expect(sample.idleOffsets.length).toBeLessThanOrEqual(MAX_AMBIENT_CREW);
      for (const p of sample.pixels) {
        expect([p.x, p.y, p.width, p.height].every(Number.isInteger)).toBe(true);
        expect(p.x >= 0 && p.y >= 0 && p.x + p.width <= 320 && p.y + p.height <= 192).toBe(true);
        if (p.kind !== 'tool') {
          const asset = view.knownTopology.assets.find(a => a.id === p.subjectId)!;
          expect(p.x >= asset.x * 16 && p.y >= asset.y * 16 && p.x + p.width <= (asset.x + asset.width) * 16 && p.y + p.height <= (asset.y + asset.height) * 16).toBe(true);
        }
      }
    }
    view.knownTopology.assets = []; view.crew = [];
    expect(sampleAmbient(view, 2)).toEqual({ pixels: [], idleOffsets: [] });
  });
});
