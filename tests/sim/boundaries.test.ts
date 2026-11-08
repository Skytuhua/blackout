import { describe, expect, it } from 'vitest';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { initialize, restore } from '../../src/sim/engine';
import type { EngineState, PhysicalState } from '../../src/sim/state';
import { latest, request } from './mission-policy';

describe('mission boundary and recovery invariants', () => {
  it.each(['missing', 'changed'] as const)('rejects a %s restored ceiling argument inconsistent with its accepted command', change => {
    const engine = initialize(hotRestart, 'task-args');
    expect(engine.applyCommand(request(engine, 'set_batch_ceiling', 'site', { ceiling: 30 })).status).toBe('accepted');
    const checkpoint = engine.snapshot();
    const state = checkpoint.state as unknown as EngineState;
    if (change === 'missing') delete state.tasks[0].intent.args.ceiling;
    else state.tasks[0].intent.args.ceiling = 25;
    expect(() => restore(checkpoint, 'invalid')).toThrow();
  });

  it('rejects a restored field task without its required technician argument', () => {
    const engine = initialize(hotRestart, 'task-tech');
    engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
    const checkpoint = engine.snapshot();
    delete (checkpoint.state as unknown as EngineState).tasks[0].intent.args.technicianId;
    expect(() => restore(checkpoint, 'invalid')).toThrow();
  });

  it('rejects a completed task before its declared arrival and completion time', () => {
    const engine = initialize(hotRestart, 'task-time');
    engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
    const checkpoint = engine.snapshot();
    const state = checkpoint.state as unknown as EngineState;
    const task = state.tasks[0]; task.public.status = 'completed'; task.public.progress = 1; task.traveledMeters = task.distanceMeters;
    state.crew.find(c => c.id === task.technicianId)!.taskId = null; state.reservations = {};
    expect(() => restore(checkpoint, 'invalid')).toThrow();
  });

  it('rejects a selected technician that disagrees with the restored task worker', () => {
    const engine = initialize(hotRestart, 'task-worker');
    engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
    const checkpoint = engine.snapshot();
    const state = checkpoint.state as unknown as EngineState;
    state.tasks[0].intent.args.technicianId = 'jules';
    state.commands[0].intent = structuredClone(state.tasks[0].intent);
    state.idempotency[0].intent = JSON.stringify(state.tasks[0].intent);
    expect(() => restore(checkpoint, 'invalid')).toThrow();
  });
  it('retains accepted and rejected idempotency receipts across a new-run restore', () => {
    const engine = initialize(hotRestart, 'original');
    const accepted = request(engine, 'inspect', 'rack-3', { technicianId: 'alex' });
    const receipt = engine.applyCommand(accepted);
    const rejected = request(engine, 'pause_batch', 'site'); rejected.intent.atSimTime = 10;
    expect(engine.applyCommand(rejected).reason).toBe('FUTURE_INTENT');
    engine.step(1);
    const restored = restore(engine.snapshot(), 'resumed');
    expect(restored.applyCommand({ ...accepted, runId: 'resumed', requestId: 'redelivery' })).toEqual({ ...receipt, runId: 'resumed', requestId: 'redelivery' });
    expect(restored.applyCommand({ ...rejected, runId: 'resumed' }).reason).toBe('FUTURE_INTENT');
    expect(restored.exportRecord().commands).toHaveLength(2);
    expect(restored.observe('player').tasks).toHaveLength(1);
  });

  it.each(['duplicate key', 'missing task'] as const)('rejects restored idempotency with a %s', problem => {
    const engine = initialize(hotRestart, 'identity');
    engine.applyCommand(request(engine, 'inspect', 'rack-3', { technicianId: 'alex' }));
    const checkpoint = engine.snapshot();
    const state = checkpoint.state as unknown as EngineState;
    if (problem === 'duplicate key') state.idempotency.push(structuredClone(state.idempotency[0]));
    else state.idempotency[0].receipt.taskId = 'missing-task';
    expect(() => restore(checkpoint, 'invalid')).toThrow();
  });

  it('rejects impossible idle crew locations on restore', () => {
    const engine = initialize(hotRestart, 'validation');
    const inRack = engine.snapshot();
    (inRack.state as unknown as EngineState).crew[0].x = 5;
    (inRack.state as unknown as EngineState).crew[0].y = 3;
    expect(() => restore(inRack, 'invalid')).toThrow();
  });

  it.each(['work timer', 'progress', 'reservation'] as const)('rejects a forged %s on restore', field => {
    const engine = initialize(hotRestart, 'validation');
    engine.applyCommand(request(engine, 'inspect', 'rack-3', { technicianId: 'alex' }));
    engine.step(1);
    const checkpoint = engine.snapshot();
    const state = checkpoint.state as unknown as EngineState;
    if (field === 'work timer') { state.tasks[0].workSeconds = 1; state.tasks[0].public.completesAt = state.tasks[0].public.arrivalAt + 1; }
    if (field === 'progress') state.tasks[0].public.progress = 1;
    if (field === 'reservation') { state.tasks[0].resources = []; state.reservations = {}; }
    expect(() => restore(checkpoint, 'invalid')).toThrow();
  });

  it('projects identical views for identical evidence despite a different unobserved prerequisite', () => {
    const engine = initialize(hotRestart, 'isolation'); engine.step(21);
    const hidden = engine.snapshot();
    (hidden.state.physical as unknown as PhysicalState).controllerFault = false;
    const other = restore(hidden, 'isolation');
    for (const actor of ['player', 'alex', 'jules', 'sam']) expect(other.observe(actor)).toEqual(engine.observe(actor));
    expect(engine.applyCommand({ ...request(engine, 'pause_batch', 'site'), actorId: 'intruder' }).reason).toBe('UNKNOWN_ACTOR');
    expect(engine.applyCommand(request(engine, 'inspect', 'ups-1', { technicianId: 'jules' }, 'alex')).reason).toBe('NOT_AUTHORIZED');
  });

  it('requires relevant versions and rejects stale requests after cancellation without double-booking', () => {
    const engine = initialize(hotRestart, 'versions');
    const missing = request(engine, 'pause_batch', 'site'); missing.expectedEntityVersions = {};
    expect(engine.applyCommand(missing).reason).toBe('MISSING_ENTITY_VERSION');
    const old = request(engine, 'inspect', 'controller', { technicianId: 'alex' });
    const task = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
    engine.applyCommand(request(engine, 'cancel_task', 'controller', { taskId: task.taskId! }));
    expect(engine.applyCommand(old).reason).toBe('STALE_ENTITY_VERSION');
    expect(engine.observe('player').crew.find(c => c.id === 'alex')?.taskId).toBeNull();
  });

  it('completes external events before a same-boundary inspection and paused dispatch', () => {
    const spec = structuredClone(hotRestart);
    spec.externalEvents = [{ id: 'same-boundary', kind: 'cooling_control_fault', at: 31, value: null }];
    const engine = initialize(spec, 'order');
    const task = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
    expect(task.eta).toBe(31);
    engine.step(31);
    expect(engine.applyCommand(request(engine, 'repair_cooling', 'controller', { technicianId: 'alex' })).reason).toBe('INSPECTION_REQUIRED');
    engine.step(2);
    expect(latest(engine.observe('player'), 'controller', 'prerequisite_ready')?.value).toBe(false);
    const events = engine.exportRecord().events;
    expect(events.find(e => e.type === 'external.cooling_control_fault')!.sequence).toBeLessThan(events.find(e => e.type === 'task.applied')!.sequence);
  });

  it('requires a final report taken after the actual hold, and closes pending work at timeout', () => {
    const spec = structuredClone(hotRestart); spec.externalEvents = [];
    const engine = initialize(spec, 'hold');
    const inspect = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
    engine.step(inspect.eta! + 2);
    engine.step(17); // t=50: verification completes at 60, before the hold's final boundary if delayed.
    const checkpoint = engine.snapshot();
    const state = checkpoint.state as unknown as EngineState;
    state.mission.stabilitySeconds = 49;
    const branch = restore(checkpoint, 'hold');
    branch.applyCommand(request(branch, 'verify_recovery', 'site'));
    branch.step(10);
    expect(branch.observe('player').mission.status).toBe('active');
    branch.step(2);
    expect(branch.observe('player').mission.status).toBe('active');
    branch.applyCommand(request(branch, 'verify_recovery', 'site'));
    branch.step(12);
    expect(branch.observe('player').mission.status).toBe('success');

    const timeout = initialize(hotRestart, 'closing'); timeout.step(590);
    const pending = timeout.applyCommand(request(timeout, 'inspect', 'ups-1', { technicianId: 'jules' }));
    expect(pending.status).toBe('rejected'); // The idle mission has already lost critical service.
    const noTrip = structuredClone(hotRestart); noTrip.profile.tripC = 200;
    const live = initialize(noTrip, 'closing-live'); live.step(590);
    expect(live.applyCommand(request(live, 'inspect', 'ups-1', { technicianId: 'jules' })).status).toBe('accepted');
    live.step(10);
    expect(live.observe('player').tasks.at(-1)?.status).toBe('canceled');
    expect(live.observe('player').crew.every(c => c.taskId === null)).toBe(true);
  });

  it('holds critical-loss failure for exactly sixty fully unserved seconds', () => {
    const engine = initialize(hotRestart, 'loss');
    const checkpoint = engine.snapshot();
    const p = checkpoint.state.physical as unknown as PhysicalState;
    p.ups.forEach(u => { u.tripped = true; });
    const branch = restore(checkpoint, 'loss'); branch.step(59);
    expect(branch.observe('player').mission.status).toBe('active');
    branch.step(1);
    expect(branch.observe('player').mission).toMatchObject({ status: 'failure', reason: 'CRITICAL_SERVICE_LOST' });
  });

  it('uses electrical inspections and the twenty-second safe UPS reset without bypassing boot', () => {
    const spec = structuredClone(hotRestart); spec.externalEvents = [];
    const engine = initialize(spec, 'reset'); const checkpoint = engine.snapshot();
    (checkpoint.state.physical as unknown as PhysicalState).ups[0].tripped = true;
    const branch = restore(checkpoint, 'reset');
    expect(branch.applyCommand(request(branch, 'reset_ups', 'ups-1', { technicianId: 'alex' })).reason).toBe('NOT_QUALIFIED');
    const inspection = branch.applyCommand(request(branch, 'inspect', 'ups-1', { technicianId: 'jules' }));
    branch.step(inspection.eta! + 2);
    const reset = branch.applyCommand(request(branch, 'reset_ups', 'ups-1', { technicianId: 'jules' }));
    expect(reset.eta! - branch.observe('player').simTime).toBe(20);
    branch.step(19);
    expect((branch.snapshot().state.physical as unknown as PhysicalState).ups[0].tripped).toBe(true);
    branch.step(1);
    expect((branch.snapshot().state.physical as unknown as PhysicalState).ups[0].tripped).toBe(false);
  });
});
