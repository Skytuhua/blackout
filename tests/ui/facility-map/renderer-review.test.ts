import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import atlas from '../../../public/assets/facility-v2.json';
import { FacilityRenderer } from '../../../src/game/facility-map/renderer';
import { createFacilityMapFixture } from '../../../src/shared/facility-map-fixture';
import type { FacilityMapProps } from '../../../src/shared/facility-map';

let pending: Map<number, FrameRequestCallback>, nextId: number, now: number;
let frames: string[];
let painted: { name: string; x: number; y: number }[];
const frameNames = new Map(Object.entries(atlas.frames).map(([name, { frame }]) => [[frame.x, frame.y, frame.w, frame.h].join(','), name]));
function canvas() {
  const context = new Proxy({ drawImage(image: { atlas?: boolean }, ...args: number[]) {
    if (image.atlas && args.length === 8) { const name = frameNames.get(args.slice(0, 4).join(',')) ?? ''; frames.push(name); painted.push({ name, x: args[4], y: args[5] }); }
  } }, { get: (target, key) => key in target ? Reflect.get(target, key) : () => {} });
  return { width: 0, height: 0, dataset: {} as Record<string, string>, getContext: () => context };
}
function props(): FacilityMapProps {
  return { view: createFacilityMapFixture(), selectedRoomId: null, selectedAssetId: null, selectedActorId: 'alex', paused: false, reducedMotion: false, speed: 1, onSelectRoom: () => {}, onSelectAsset: () => {} };
}
function mount(state: FacilityMapProps) {
  const c = canvas();
  const renderer = new FacilityRenderer(c as unknown as HTMLCanvasElement, { querySelectorAll: () => [] } as unknown as HTMLElement, state);
  renderer.setAtlas({ atlas: true } as unknown as HTMLImageElement);
  return { c, renderer };
}
function advance(count = 9) { for (let i = 0; i < count; i++) { now += 50; const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(now)); } }
function reading(id: string, value: boolean, observedAt: number, receivedAt: number) {
  return { id, assetId: 'cooling-a-1', source: 'test', field: 'running', value, units: '', quality: 'reported' as const, observedAt, receivedAt };
}
beforeEach(() => {
  pending = new Map(); nextId = 0; now = 1000; frames = []; painted = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending.set(++nextId, callback); return nextId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
  vi.stubGlobal('document', { createElement: () => canvas() });
});
afterEach(() => vi.unstubAllGlobals());

describe('renderer review regressions', () => {
  it('draws Sam only when his actual position is on the public floor', () => {
    const state = props(); const sam = state.view.crew.find(c => c.id === 'sam')!;
    sam.x = -1; sam.y = -1;
    const { c, renderer } = mount(state);
    expect(JSON.parse(c.dataset.crew).sam).toBeUndefined();
    Object.assign(sam, state.view.knownTopology.walkable[0]);
    renderer.update(state, 'power');
    expect(JSON.parse(c.dataset.crew).sam).toMatchObject({ x: sam.x, y: sam.y, frame: 'portrait_it' });
    renderer.destroy();
  });
  it('adds static wall details without decorating travel tiles or equipment', () => {
    const state = props(); const { renderer } = mount(state);
    const decorations = painted.filter(p => p.name.startsWith('fixture_') || p.name.startsWith('infra_'));
    expect(decorations.length).toBeGreaterThan(5);
    const topology = state.view.knownTopology;
    for (const p of decorations) {
      const x = p.x / 16, y = p.y / 16;
      expect(topology.walkable.some(tile => tile.x === x && tile.y === y)).toBe(false);
      expect(topology.assets.some(a => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height)).toBe(false);
    }
    renderer.destroy();
  });
  it('keeps a delivered running fan moving when a newer reading has not arrived', () => {
    const state = props(); state.view.observations = [reading('delivered', true, 19, 19), reading('pending', false, 20, 25)];
    const { renderer } = mount(state); advance();
    expect(new Set(frames.filter(f => f.startsWith('fan_'))).size).toBeGreaterThan(1);
    renderer.destroy(); expect(pending.size).toBe(0);
  });
  it('uses the same last-delivered tie for the equipment badge and fan', () => {
    const state = props(); state.view.observations = [reading('first', true, 20, 20), reading('last', false, 20, 20)];
    const { renderer } = mount(state); advance();
    expect(frames).toContain('badge_warning');
    expect(frames.filter(f => f.startsWith('fan_')).every(f => f === 'fan_0')).toBe(true);
    renderer.destroy();
  });
  it('interpolates accepted practice travel using the chosen speed and stops on pause', () => {
    const state = props(); state.speed = 4; state.view.mission.status = 'practice';
    state.view.crew[0].taskId = 'accepted';
    state.view.tasks = [{ id: 'accepted', actorId: 'alex', targetId: 'rack-a-7', action: 'inspect', status: 'traveling', startedAt: 20, arrivalAt: 31, completesAt: 41, progress: 0, path: [{ x: 4, y: 16 }, { x: 15, y: 16 }], reason: null }];
    const { c, renderer } = mount(state); advance(3);
    expect(Number(c.dataset.presentationTime)).toBeCloseTo(20.4);
    expect(JSON.parse(c.dataset.crew).alex.x).toBeCloseTo(4.4);
    renderer.update({ ...state, paused: true }, 'power');
    const time = c.dataset.presentationTime; advance(); expect(c.dataset.presentationTime).toBe(time); expect(pending.size).toBe(0);
    renderer.destroy();
  });
  it('keeps overview connections when an unknown room falls back to overview', () => {
    const state = props(); const { c, renderer } = mount(state);
    const connections = JSON.parse(c.dataset.connections); expect(connections.length).toBeGreaterThan(0);
    renderer.update({ ...state, selectedRoomId: 'missing-room' }, 'power');
    expect(JSON.parse(c.dataset.connections)).toEqual(connections);
    renderer.destroy();
  });
});
