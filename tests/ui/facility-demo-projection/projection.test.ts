import { describe, expect, it } from 'vitest';
import { hotRestart } from '../../../src/content/scenarios/hot-restart';
import { initialize, restore } from '../../../src/sim/engine';
import { routePosition } from '../../../src/game/desktop-world';
import { FacilityTopologySchema } from '../../../src/shared/facility-map';
import { request, successfulPolicy } from '../../sim/mission-policy';
import { verifyReplay } from '../../../src/sim/replay';
import { createFacilityDemoProjector, demoToEnginePoint, selectDemoAsset, selectDemoRoom } from '../../../src/game/facility-demo-projection';

const engineView = (run = 'demo') => initialize(hotRestart, run).observe('player');
const project = (view = engineView()) => {
  const result = createFacilityDemoProjector()(view);
  expect(result.status).toBe('available');
  if (result.status !== 'available') throw new Error(result.reason);
  return result;
};

describe('honest legacy facility projection', () => {
  it('maps only published equipment and floor, with no fabricated readings or connections', () => {
    const original = engineView(); const snapshot = structuredClone(original);
    const result = project(original); const { view, offset, unavailableAreas } = result;
    expect(original).toEqual(snapshot);
    expect(FacilityTopologySchema.safeParse(view.knownTopology).success).toBe(true);
    expect(view.knownTopology).toMatchObject({ width: 48, height: 28, tileMeters: original.knownTopology.tileMeters, connections: [] });
    expect(view.observations).toEqual(original.observations);
    expect(view.knownTopology.assets.map(a => a.id)).toEqual(original.knownTopology.assets.map(a => a.id));
    expect(view.knownTopology.walkable).toEqual(original.knownTopology.walkable.map(p => ({ x: p.x + offset.x, y: p.y + offset.y })));
    expect(view.knownTopology.assets.map(a => [a.id, a.x - offset.x, a.y - offset.y, a.serviceTile.x - offset.x, a.serviceTile.y - offset.y]))
      .toEqual(original.knownTopology.assets.map(a => [a.id, a.x, a.y, a.serviceTile.x, a.serviceTile.y]));
    expect(view.knownTopology.rooms).toHaveLength(1);
    expect(view.knownTopology.sharedUpstream.label).toMatch(/unavailable/i);
    expect(unavailableAreas.length).toBeGreaterThan(0);
    expect(unavailableAreas.every(area => area.label.includes('unavailable'))).toBe(true);
    expect(view.knownTopology.assets.some(a => a.id.startsWith('rack-b-'))).toBe(false);
  });
  it('preserves an actual accepted route, position, task identity and timing under one reversible offset', () => {
    const engine = initialize(hotRestart, 'route-demo');
    const receipt = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
    expect(receipt.status).toBe('accepted');
    const before = engine.observe('player'); const projected = project(before);
    const task = before.tasks.find(t => t.id === receipt.taskId)!;
    const displayTask = projected.view.tasks.find(t => t.id === receipt.taskId)!;
    const crew = before.crew.find(c => c.id === 'alex')!;
    const displayCrew = projected.view.crew.find(c => c.id === 'alex')!;
    expect(displayTask).toMatchObject({ id: task.id, actorId: task.actorId, targetId: task.targetId, startedAt: task.startedAt, arrivalAt: task.arrivalAt, completesAt: task.completesAt, status: task.status });
    expect(displayTask.path).toEqual(task.path.map(p => ({ x: p.x + projected.offset.x, y: p.y + projected.offset.y })));
    const t = (task.startedAt + task.arrivalAt) / 2;
    const sourcePose = routePosition(crew, task, t, before.knownTopology);
    const displayPose = routePosition(displayCrew, displayTask, t, projected.view.knownTopology);
    expect(displayPose.x - projected.offset.x).toBeCloseTo(sourcePose.x);
    expect(displayPose.y - projected.offset.y).toBeCloseTo(sourcePose.y);
    expect(engine.observe('player')).toEqual(before);
  });
  it('passes only current run real asset selections and refuses stale or imaginary targets', () => {
    const current = engineView('current');
    expect(selectDemoAsset(current, 'current', 'controller')).toBe('controller');
    expect(selectDemoAsset(current, 'current', 'rack-b-1')).toBeNull();
    expect(selectDemoAsset(current, 'old-run', 'controller')).toBeNull();
    expect(selectDemoAsset(current, 'current', 'site')).toBeNull();
  });
  it('guards room selection and only reverses points within the live facility', () => {
    const current = engineView('current'); const result = project(current);
    expect(selectDemoRoom(current, 'current', null)).toEqual({ accepted: true, roomId: null });
    expect(selectDemoRoom(current, 'current', result.roomId)).toEqual({ accepted: true, roomId: result.roomId });
    expect(selectDemoRoom(current, 'current', 'decorative-room')).toEqual({ accepted: false });
    expect(selectDemoRoom(current, 'old', result.roomId)).toEqual({ accepted: false });
    expect(demoToEnginePoint({ x: result.offset.x + 3.5, y: result.offset.y + 5 })).toEqual({ x: 3.5, y: 5 });
    expect(demoToEnginePoint({ x: result.offset.x - 1, y: result.offset.y })).toBeNull();
    expect(demoToEnginePoint({ x: result.offset.x + 20, y: result.offset.y })).toBeNull();
  });
  it('reconstructs the same public display from a restored engine without changing the checkpoint', () => {
    const engine = initialize(hotRestart, 'saved-demo'); engine.step(5);
    const checkpoint = engine.snapshot(), before = structuredClone(checkpoint);
    const restored = restore(checkpoint, 'restored-demo');
    const a = project(engine.observe('player')), b = project(restored.observe('player'));
    expect(b.view.knownTopology).toEqual(a.view.knownTopology);
    expect(b.view.observations).toEqual(a.view.observations);
    expect(b.view.crew).toEqual(a.view.crew);
    expect(checkpoint).toEqual(before);
  });
  it('preserves scoped unknown and stale observations without supplying invented answers', () => {
    const original = engineView();
    original.observations = [{ id: 'unknown', assetId: 'controller', source: 'sensor', field: 'state', value: null, units: '', quality: 'unknown', observedAt: 0, receivedAt: 0 }];
    const result = project(original);
    expect(result.view.observations).toEqual(original.observations);
    expect(result.view.observations).toHaveLength(1);
    expect(result.view.knownTopology.connections).toEqual([]);
  });
  it('refuses unsupported topologies or a grid without an evidenced passage', () => {
    const original = engineView(); const projector = createFacilityDemoProjector();
    expect(projector({ ...original, knownTopology: { ...original.knownTopology, width: 21 } }).status).toBe('unsupported');
    expect(projector({ ...original, knownTopology: { ...original.knownTopology, walkable: [] } }).status).toBe('unsupported');
  });
  it('does not alter a completed real offline mission or its replay record', () => {
    const engine = initialize(hotRestart, 'full-demo');
    const projector = createFacilityDemoProjector();
    expect(projector(engine.observe('player')).status).toBe('available');
    successfulPolicy(engine);
    const before = engine.exportRecord();
    expect(engine.observe('player').mission.status).toBe('success');
    expect(projector(engine.observe('player')).status).toBe('available');
    expect(engine.exportRecord()).toEqual(before);
    expect(verifyReplay(before, 'full-demo-replay').matches).toBe(true);
  });
  it('never resolves a missing source dependency to the display placeholder', () => {
    const source = engineView('dependency');
    const malformed = structuredClone(source);
    malformed.knownTopology.assets[0].dependencies = ['demo-unavailable-power-diagram'];
    expect(createFacilityDemoProjector()(malformed).status).toBe('unsupported');
    expect(selectDemoAsset(malformed, malformed.runId, malformed.knownTopology.assets[0].id)).toBeNull();
    expect(selectDemoRoom(malformed, malformed.runId, null)).toEqual({ accepted: false });
    malformed.knownTopology.assets[0].dependencies = ['another-missing-asset'];
    expect(createFacilityDemoProjector()(malformed).status).toBe('unsupported');

    const legitimate = structuredClone(source), marker = 'demo-unavailable-power-diagram';
    const generator = legitimate.knownTopology.assets.find(a => a.id === 'generator')!;
    generator.id = marker;
    for (const asset of legitimate.knownTopology.assets) asset.dependencies = asset.dependencies.map(id => id === 'generator' ? marker : id);
    const projected = project(legitimate);
    expect(projected.view.knownTopology.assets.some(a => a.id === marker)).toBe(true);
    expect(projected.view.knownTopology.sharedUpstream.id).not.toBe(marker);
  });
  it('reuses geometry across snapshots but replaces it if the published topology changes', () => {
    const source = engineView(); const projector = createFacilityDemoProjector();
    const first = projector(source), second = projector({ ...source, simTime: source.simTime + 1 });
    if (first.status !== 'available' || second.status !== 'available') throw new Error('expected supported layout');
    expect(second.view.knownTopology).toBe(first.view.knownTopology);
    expect(second.view.simTime).toBe(source.simTime + 1);
    const changed = structuredClone(source); changed.knownTopology.assets[0].label = 'Renamed rack';
    const third = projector(changed);
    if (third.status !== 'available') throw new Error(third.reason);
    expect(third.view.knownTopology).not.toBe(first.view.knownTopology);
    expect(third.view.knownTopology.assets[0].label).toBe('Renamed rack');
  });
});
