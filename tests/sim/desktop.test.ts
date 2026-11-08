import { describe, expect, it } from 'vitest';
import { hotRestart, practiceScenario } from '../../src/content/scenarios/hot-restart';
import { initialize, restore } from '../../src/sim/engine';
import { validateRunRecord, verifyReplay } from '../../src/sim/replay';
import type { EngineState } from '../../src/sim/state';
import { request } from './mission-policy';

describe('desktop technician movement', () => {
  it('travels at the declared speed with no work, equipment reservation or field evidence', () => {
    const engine = initialize(hotRestart, 'move');
    const reference = initialize(hotRestart, 'reference');
    const before = engine.observe('player');
    const receipt = engine.applyCommand(request(engine, 'move_crew', 'alex', { destination: { x: 6, y: 5 } }));
    expect(receipt).toMatchObject({ status: 'accepted', eta: 3, evidenceIds: [] });
    const reserved = engine.snapshot().state as unknown as EngineState;
    expect(reserved.tasks[0]).toMatchObject({ workSeconds: 0, resources: ['alex'] });
    expect(reserved.tasks[0].public).toMatchObject({ arrivalAt: 3, completesAt: 3, status: 'traveling' });
    expect(reserved.entityVersions.controller).toBe(before.observedEntityVersions.controller);
    engine.step(1);
    expect(engine.observe('player').crew[0]).toMatchObject({ x: 4.25, y: 5 });
    const copy = restore(engine.snapshot(), 'move');
    engine.step(2); copy.step(2); reference.step(3);
    expect(copy.snapshot()).toEqual(engine.snapshot());
    expect(engine.observe('player').crew[0]).toMatchObject({ x: 6, y: 5, taskId: null });
    expect(engine.observe('player').tasks[0]).toMatchObject({ status: 'completed', progress: 1 });
    expect(engine.observe('player').observations).toEqual(reference.observe('player').observations);
    expect(engine.observe('player').messages).toEqual(reference.observe('player').messages);
    expect(engine.snapshot().state.physical).toEqual(reference.snapshot().state.physical);
    expect(engine.snapshot().state.reservations).toEqual({});
    expect(engine.exportRecord().events.some(e => e.type === 'task.applied')).toBe(false);
    expect(verifyReplay(engine.exportRecord(), 'move-replay').matches).toBe(true);
  });

  it('requires explicit cancellation, preserves the fractional location and replays canceled and completed moves', () => {
    const engine = initialize(hotRestart, 'cancel-move');
    const receipt = engine.applyCommand(request(engine, 'move_crew', 'alex', { destination: { x: 6, y: 5 } }));
    expect(receipt.status).toBe('accepted');
    engine.step(1);
    expect(engine.applyCommand(request(engine, 'move_crew', 'alex', { destination: { x: 4, y: 6 } })).reason).toBe('WORKER_BUSY');
    expect(engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' })).reason).toBe('WORKER_BUSY');
    expect(engine.applyCommand(request(engine, 'cancel_task', 'alex', { taskId: receipt.taskId! })).status).toBe('applied');
    const position = engine.observe('player').crew[0];
    expect(position).toMatchObject({ x: 4.25, y: 5, taskId: null });
    const resumed = restore(engine.snapshot(), 'cancel-move');
    const next = resumed.applyCommand(request(resumed, 'move_crew', 'alex', { destination: { x: 4, y: 6 } }));
    expect(next).toMatchObject({ status: 'accepted', eta: 2 });
    expect(resumed.observe('player').tasks[1].path[0]).toEqual({ x: position.x, y: position.y });
    resumed.step(1);
    expect(resumed.observe('player').crew[0]).toMatchObject({ x: 4, y: 6, taskId: null });
    expect(() => restore(resumed.snapshot(), 'completed-move')).not.toThrow();
    expect(verifyReplay(resumed.exportRecord(), 'canceled-move-replay').matches).toBe(true);
  });

  it('completes a same-position move at the paused boundary with a restorable checkpoint', () => {
    const engine = initialize(hotRestart, 'no-travel');
    expect(engine.applyCommand(request(engine, 'move_crew', 'alex', { destination: { x: 3, y: 5 } }))).toMatchObject({ status: 'accepted', eta: 0 });
    expect(engine.observe('player')).toMatchObject({ simTime: 0, tasks: [expect.objectContaining({ status: 'completed' })] });
    expect(() => restore(engine.snapshot(), 'no-travel-restored')).not.toThrow();
    expect(verifyReplay(engine.exportRecord(), 'no-travel-replay').matches).toBe(true);
  });

  it.each(['alex', 'jules', 'sam'])('rejects movement requested by model actor %s', actor => {
    const engine = initialize(hotRestart, 'authority');
    expect(engine.applyCommand(request(engine, 'move_crew', 'alex', { destination: { x: 4, y: 5 } }, actor)).reason).toBe('NOT_AUTHORIZED');
    expect(engine.observe('player').tasks).toHaveLength(0);
  });

  it.each(['sam', 'controller', 'missing'])('rejects a movement target that is not a field technician: %s', target => {
    const engine = initialize(hotRestart, 'target');
    expect(engine.applyCommand(request(engine, 'move_crew', target, { destination: { x: 4, y: 5 } })).status).toBe('rejected');
  });

  it.each([{ x: 2, y: 2 }, { x: 20, y: 12 }])('rejects blocked or out-of-bounds destinations %j', destination => {
    const engine = initialize(hotRestart, 'destination');
    expect(engine.applyCommand(request(engine, 'move_crew', 'alex', { destination })).reason).toBe('PATH_BLOCKED');
    expect(engine.observe('player').crew[0]).toMatchObject({ x: 3, y: 5, taskId: null });
  });

  it('requires the technician version and rejects a stale movement after another task', () => {
    const engine = initialize(hotRestart, 'versions');
    const missing = request(engine, 'move_crew', 'alex', { destination: { x: 4, y: 5 } });
    missing.expectedEntityVersions = {};
    expect(engine.applyCommand(missing).reason).toBe('MISSING_ENTITY_VERSION');
    const stale = request(engine, 'move_crew', 'alex', { destination: { x: 4, y: 5 } });
    engine.applyCommand(request(engine, 'move_crew', 'alex', { destination: { x: 3, y: 5 } }));
    expect(engine.applyCommand(stale).reason).toBe('STALE_ENTITY_VERSION');
  });

  it.each(['traveling', 'completed', 'canceled'] as const)('validates destination endpoints when restoring a %s move', status => {
    const engine = initialize(hotRestart, `endpoint-${status}`);
    const receipt = engine.applyCommand(request(engine, 'move_crew', 'alex', { destination: { x: 6, y: 5 } }));
    expect(receipt.status).toBe('accepted');
    if (status === 'completed') engine.step(3);
    if (status === 'canceled') engine.applyCommand(request(engine, 'cancel_task', 'alex', { taskId: receipt.taskId! }));
    const checkpoint = engine.snapshot();
    expect(() => restore(checkpoint, 'valid-endpoint')).not.toThrow();
    const state = checkpoint.state as unknown as EngineState;
    state.tasks[0].public.path.at(-1)!.y = 6;
    expect(() => restore(checkpoint, 'invalid-endpoint')).toThrow(/path/);
  });
});

describe('safe practice lifecycle', () => {
  it('continues physical accounting, sensors and tasks beyond the incident deadline without an outcome', () => {
    const engine = initialize(practiceScenario, 'practice');
    expect(engine.observe('player').mission).toMatchObject({ status: 'practice', windowSeconds: 0 });
    expect(engine.observe('player').objectives).toEqual([]);
    expect(engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' })).status).toBe('accepted');
    engine.step(600); engine.step(10);
    const view = engine.observe('player');
    expect(view).toMatchObject({ simTime: 610, mission: { status: 'practice', reason: null } });
    expect(view.tasks[0].status).toBe('completed');
    expect(view.observations.some(o => o.field === 'inspection_complete')).toBe(true);
    expect(view.observations.some(o => o.observedAt === 610)).toBe(true);
    expect(engine.exportRecord().events.some(e => e.type.startsWith('external.') || e.type.startsWith('mission.'))).toBe(false);
    expect((engine.snapshot().state as unknown as EngineState).physical.totals.criticalDelivered).toBeGreaterThan(0);
    expect(engine.applyCommand(request(engine, 'move_crew', 'jules', { destination: { x: 16, y: 6 } })).status).toBe('accepted');
    expect(() => restore(engine.snapshot(), 'practice-restored')).not.toThrow();
    expect(() => validateRunRecord(engine.exportRecord())).not.toThrow();
    expect(verifyReplay(engine.exportRecord(), 'practice-replay').matches).toBe(true);
  });

  it('starts a fresh incident without carrying over practice state and rejects old engine saves', () => {
    const practice = initialize(practiceScenario, 'old-practice');
    practice.applyCommand(request(practice, 'pause_batch', 'site'));
    practice.step(10);
    const incident = initialize(hotRestart, 'new-incident');
    expect(incident.observe('player')).toMatchObject({ simTime: 0, tasks: [], mission: { status: 'active' } });
    expect(incident.observe('player').crew).toEqual(hotRestart.crew);
    const checkpoint = incident.snapshot();
    expect(checkpoint.engineVersion).toBe('sim-desktop-v2');
    checkpoint.engineVersion = 'sim-02-v1';
    expect(() => restore(checkpoint, 'old-engine')).toThrow(/version/);
  });
});
