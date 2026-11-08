import { describe, expect, it } from 'vitest';
import { hotRestart, practiceScenario } from '../../src/content/scenarios/hot-restart';
import type { Point, SimulationEngine } from '../../src/shared/contracts';
import { CheckpointSchema, KnowledgeViewSchema, RunRecordSchema } from '../../src/shared/schemas';
import { initialize, restore } from '../../src/sim/engine';
import { route } from '../../src/sim/navigation';
import { validateRunRecord, verifyReplay } from '../../src/sim/replay';
import type { EngineState } from '../../src/sim/state';
import { latest, request } from './mission-policy';

const state = (engine: SimulationEngine) => engine.snapshot().state as unknown as EngineState;
const alex = (engine: SimulationEngine) => engine.observe('player').crew.find(c => c.id === 'alex')!;
// An ordinary floor cell, deliberately distinct from every equipment service endpoint.
const destination = hotRestart.topology.walkable.find(p => p.x >= hotRestart.topology.width - 2 && p.y >= hotRestart.topology.height - 2
  && !hotRestart.topology.assets.some(a => a.serviceTile.x === p.x && a.serviceTile.y === p.y))!;
const move = (engine: SimulationEngine, point: Point = destination, actor = 'player', target = 'alex') =>
  engine.applyCommand(request(engine, 'move_crew', target, { destination: { x: point.x, y: point.y } }, actor));

describe('desktop crew destination travel', () => {
  it('travels a real floor route at technician speed with zero work and no evidence or equipment effects', () => {
    const engine = initialize(hotRestart, 'move');
    const idle = initialize(hotRestart, 'idle');
    const start = { x: alex(engine).x, y: alex(engine).y };
    const receipt = move(engine);
    expect(receipt.status).toBe('accepted');
    expect(receipt.evidenceIds).toEqual([]);
    const task = engine.observe('player').tasks[0];
    expect(task).toMatchObject({ action: 'move_crew', actorId: 'alex', targetId: 'alex', status: 'traveling', progress: 0 });
    expect(task.path[0]).toEqual(start);
    expect(task.path.at(-1)).toEqual(destination);
    expect(task.path.slice(1).every((p, i) => Number.isInteger(p.x) && Number.isInteger(p.y)
      && Math.abs(p.x - task.path[i].x) + Math.abs(p.y - task.path[i].y) === 1
      && hotRestart.topology.walkable.some(w => w.x === p.x && w.y === p.y))).toBe(true);
    expect(task.arrivalAt).toBe(Math.ceil((task.path.length - 1) * hotRestart.topology.tileMeters / alex(engine).speed));
    expect(task.completesAt).toBe(task.arrivalAt);
    engine.step(1);
    expect(Math.abs(alex(engine).x - start.x) + Math.abs(alex(engine).y - start.y)).toBeCloseTo(1.25);
    expect(alex(engine)).not.toMatchObject(destination);
    engine.step(task.arrivalAt - 1); idle.step(task.arrivalAt);
    expect(alex(engine)).toMatchObject({ ...destination, taskId: null });
    expect(engine.observe('player').tasks[0]).toMatchObject({ status: 'completed', progress: 1 });
    expect(state(engine).physical).toEqual(state(idle).physical);
    expect(engine.observe('player').observations).toEqual(idle.observe('player').observations);
    expect(engine.observe('player').messages).toEqual(idle.observe('player').messages);
    expect(state(engine).pendingReports).toEqual([]);
    expect(verifyReplay(engine.exportRecord(), 'move-replayed').matches).toBe(true);
    expect(engine.exportRecord().events.some(e => e.type === 'task.applied' && e.payload.action === 'move_crew')).toBe(false);
    expect(engine.applyCommand(request(engine, 'repair_cooling', 'controller', { technicianId: 'alex' })).reason).toBe('INSPECTION_REQUIRED');
  });

  it('requires explicit cancellation, keeps fractional position, and resumes from that position across restore', () => {
    const engine = initialize(hotRestart, 'cancel-move');
    const receipt = move(engine);
    expect(receipt.status).toBe('accepted');
    engine.step(1);
    const position = { x: alex(engine).x, y: alex(engine).y };
    expect(Number.isInteger(position.x) && Number.isInteger(position.y)).toBe(false);
    expect(move(engine, hotRestart.crew[0]).reason).toBe('WORKER_BUSY');
    expect(engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' })).reason).toBe('WORKER_BUSY');
    expect(engine.applyCommand(request(engine, 'cancel_task', 'alex', { taskId: receipt.taskId! })).status).toBe('applied');
    expect(alex(engine)).toMatchObject({ ...position, taskId: null });
    const replacement = move(engine, hotRestart.crew[0]);
    expect(replacement.status).toBe('accepted');
    expect(engine.observe('player').tasks.at(-1)?.path[0]).toEqual(position);
    const copy = restore(JSON.parse(JSON.stringify(engine.snapshot())), 'cancel-move');
    engine.step(replacement.eta! - 1); copy.step(replacement.eta! - 1);
    expect(copy.snapshot()).toEqual(engine.snapshot());
    expect(alex(engine)).toMatchObject({ x: hotRestart.crew[0].x, y: hotRestart.crew[0].y, taskId: null });
    expect(engine.observe('player').tasks.map(t => t.status)).toEqual(['canceled', 'completed']);
    expect(() => restore(engine.snapshot(), 'finished-moves')).not.toThrow();
    expect(verifyReplay(engine.exportRecord(), 'canceled-replayed').matches).toBe(true);
  });

  it('restores an in-flight destination path and rejects equipment-service endpoint substitution', () => {
    const engine = initialize(hotRestart, 'in-flight');
    expect(move(engine).status).toBe('accepted'); engine.step(1);
    const copy = restore(engine.snapshot(), 'in-flight');
    engine.step(20); copy.step(20);
    expect(copy.snapshot()).toEqual(engine.snapshot());
    const invalid = copy.snapshot();
    (invalid.state as unknown as EngineState).tasks[0].public.path = route(hotRestart, hotRestart.crew[0], hotRestart.topology.assets[0].serviceTile)!;
    expect(() => restore(invalid, 'wrong-endpoint')).toThrow();
  });

  it('completes a same-cell move without advancing time or creating a report', () => {
    const engine = initialize(hotRestart, 'same-cell');
    expect(move(engine, hotRestart.crew[0])).toMatchObject({ status: 'accepted', eta: 0 });
    expect(engine.observe('player').simTime).toBe(0);
    expect(engine.observe('player').tasks[0]).toMatchObject({ status: 'completed', arrivalAt: 0, completesAt: 0 });
    expect(alex(engine).taskId).toBeNull();
    expect(() => restore(engine.snapshot(), 'same-cell-restored')).not.toThrow();
    expect(verifyReplay(engine.exportRecord(), 'same-cell-replayed').matches).toBe(true);
  });

  it.each(['alex', 'jules', 'sam'])('denies movement to model actor %s and publishes movement only to the player', actor => {
    const engine = initialize(hotRestart, 'authority');
    expect(move(engine, destination, actor).reason).toBe('NOT_AUTHORIZED');
    expect(engine.observe(actor).affordances.some(a => a.action === 'move_crew')).toBe(false);
    const options = engine.observe('player').affordances.filter(a => a.action === 'move_crew');
    expect(options.map(a => a.targetId).sort()).toEqual(['alex', 'jules']);
    expect(options.every(a => a.enabled && a.workSeconds === 0 && a.technicianIds.includes(a.targetId))).toBe(true);
    expect(engine.observe('player').tasks).toEqual([]);
  });

  it('rejects unknown, mismatched and invalid destinations without reserving work', () => {
    const engine = initialize(hotRestart, 'invalid-moves');
    expect(move(engine, destination, 'player', 'controller').reason).toBe('INVALID_TARGET_ACTION');
    expect(engine.applyCommand(request(engine, 'move_crew', 'alex', { destination, technicianId: 'jules' })).reason).toBe('NOT_QUALIFIED');
    const rack = hotRestart.topology.assets.find(a => a.kind === 'rack')!;
    expect(move(engine, { x: rack.x, y: rack.y }).reason).toBe('INVALID_DESTINATION');
    expect(move(engine, { x: hotRestart.topology.width, y: 1 }).reason).toBe('INVALID_DESTINATION');
    const malformed = request(engine, 'move_crew', 'alex', { destination });
    for (const point of [{ x: -1, y: 1 }, { x: 1.5, y: 1 }]) {
      expect(() => engine.applyCommand({ ...malformed, intent: { ...malformed.intent, args: { destination: point } } })).toThrow();
    }
    expect(engine.observe('player').tasks).toEqual([]);
    const blockedSpec = structuredClone(hotRestart);
    blockedSpec.topology.walkable = blockedSpec.topology.walkable.filter(p => Math.abs(p.x - destination.x) + Math.abs(p.y - destination.y) !== 1);
    const blocked = initialize(blockedSpec, 'unreachable');
    expect(move(blocked).reason).toBe('PATH_BLOCKED');
  });

  it('requires the target worker version and invalidates queued destinations after cancel', () => {
    const engine = initialize(hotRestart, 'versions');
    const missing = request(engine, 'move_crew', 'alex', { destination }); missing.expectedEntityVersions = {};
    expect(engine.applyCommand(missing).reason).toBe('MISSING_ENTITY_VERSION');
    const stale = request(engine, 'move_crew', 'alex', { destination });
    const first = move(engine);
    expect(first.status).toBe('accepted');
    engine.applyCommand(request(engine, 'cancel_task', 'alex', { taskId: first.taskId! }));
    expect(engine.applyCommand(stale).reason).toBe('STALE_ENTITY_VERSION');
    expect(state(engine).reservations).toEqual({});
    expect(move(engine).status).toBe('accepted');
  });

  it('does not create inspection or repair credit when moving onto a service tile', () => {
    const engine = initialize(hotRestart, 'service-move'); engine.step(20);
    const controller = hotRestart.topology.assets.find(a => a.id === 'controller')!;
    const receipt = move(engine, controller.serviceTile);
    expect(receipt.status).toBe('accepted'); engine.step(receipt.eta! - 20 + 2);
    expect(latest(engine.observe('player'), 'controller', 'prerequisite_ready')).toBeUndefined();
    expect(state(engine).physical.controllerFault).toBe(true);
    expect(engine.applyCommand(request(engine, 'repair_cooling', 'controller', { technicianId: 'alex' })).reason).toBe('INSPECTION_REQUIRED');
    const inspection = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
    expect(inspection.eta! - engine.observe('player').simTime).toBe(hotRestart.mission.inspectSeconds);
  });
});

describe('explicit healthy practice', () => {
  it('rejects an incident schedule labeled as practice at initialization and restore', () => {
    const incident = { ...structuredClone(hotRestart), mode: 'practice' as const };
    expect(() => initialize(incident, 'unsafe-practice')).toThrow('Practice cannot schedule external disturbances');
    const checkpoint = initialize(practiceScenario, 'healthy-practice').snapshot();
    (checkpoint.state as unknown as EngineState).scenario.externalEvents = structuredClone(hotRestart.externalEvents);
    expect(() => restore(checkpoint, 'unsafe-practice')).toThrow('Practice cannot schedule external disturbances');
  });

  it('continues real physics, sensors, travel, work and delivered reports beyond 600 seconds without success or deadline', () => {
    const engine = initialize(practiceScenario, 'practice');
    expect(KnowledgeViewSchema.parse(engine.observe('player')).mission.status).toBe('practice');
    const inspection = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
    expect(inspection.status).toBe('accepted');
    engine.step(inspection.eta! + 2);
    expect(latest(engine.observe('player'), 'controller', 'prerequisite_ready')?.value).toBe(true);
    engine.step(70);
    const verification = engine.applyCommand(request(engine, 'verify_recovery', 'site'));
    expect(verification.status).toBe('accepted'); engine.step(12);
    expect(latest(engine.observe('player'), 'site', 'recovery_verified')?.value).toBe(true);
    engine.step(600); engine.step(120);
    const view = engine.observe('player');
    expect(view.simTime).toBeGreaterThan(600);
    expect(view.mission).toMatchObject({ status: 'practice', reason: null, windowSeconds: 0, stabilitySeconds: null });
    expect(view.objectives).toEqual([]);
    expect(view.summary.observedAt).toBe(view.simTime - view.simTime % practiceScenario.profile.sensorIntervalSeconds);
    expect(state(engine).physical.totals.batchCompleted).toBe(view.simTime * 8 * 30);
    expect(state(engine).physical.racks.every(r => r.temperatureC === 24 && r.backlog === 0)).toBe(true);
    expect(engine.exportRecord().events.some(e => /^(external\.|mission\.)/.test(e.type))).toBe(false);
    expect(engine.applyCommand(request(engine, 'repair_cooling', 'controller', { technicianId: 'alex' })).reason).toBe('NO_REPAIR_REQUIRED');
    expect(move(engine).status).toBe('accepted');
    expect(() => restore(engine.snapshot(), 'practice-restored')).not.toThrow();
    expect(() => validateRunRecord(engine.exportRecord())).not.toThrow();
    expect(verifyReplay(engine.exportRecord(), 'practice-replayed').matches).toBe(true);
  });

  it('cannot become a timed incident or publish success/failure from a forged practice mission checkpoint', () => {
    const engine = initialize(practiceScenario, 'practice-checkpoint');
    const damaged = engine.snapshot();
    (damaged.state as unknown as EngineState).physical.ups.forEach(u => { u.tripped = true; });
    const branch = restore(damaged, 'practice-checkpoint'); branch.step(61);
    expect(branch.observe('player').mission.status).toBe('practice');
    const invalid = engine.snapshot();
    (invalid.state as unknown as EngineState).mission.status = 'active';
    expect(() => restore(invalid, 'invalid-mode')).toThrow();
  });

  it('starts a fresh incident at zero with no practice work, workload settings, positions or evidence carried over', () => {
    const practice = initialize(practiceScenario, 'practice-run');
    expect(move(practice).status).toBe('accepted');
    expect(practice.applyCommand(request(practice, 'pause_batch', 'site')).status).toBe('accepted');
    practice.step(100);
    const mission = initialize(hotRestart, 'new-incident');
    expect(mission.observe('player')).toMatchObject({ runId: 'new-incident', simTime: 0, tasks: [], crew: hotRestart.crew, mission: { status: 'active' } });
    expect(state(mission).physical.racks.every(r => r.batchCeiling === hotRestart.workload.catchupCeiling && r.backlog === 0)).toBe(true);
    expect(mission.observe('player').observations.every(o => o.observedAt === 0 && o.source === 'dashboard')).toBe(true);
    expect(mission.applyCommand({ ...request(mission, 'pause_batch', 'site'), runId: 'practice-run' }).reason).toBe('STALE_RUN');
    mission.step(10);
    expect(state(mission).physical.controllerFault).toBe(true);
  });

  it('exports desktop engine identity while retaining engine/checkpoint/record schema 1 and refuses the old engine', () => {
    const engine = initialize(practiceScenario, 'identity');
    const checkpoint = CheckpointSchema.parse(engine.snapshot());
    const record = RunRecordSchema.parse(engine.exportRecord());
    expect(checkpoint).toMatchObject({ schemaVersion: 1, engineVersion: 'sim-desktop-v2', scenarioVersion: 'practice-layout-v2' });
    expect(record).toMatchObject({ schemaVersion: 1, engineVersion: 'sim-desktop-v2' });
    expect(() => restore({ ...checkpoint, engineVersion: 'sim-02-v1' }, 'old')).toThrow('Unsupported engine version');
  });
});


describe('reconciled practice and retained movement validation', () => {
  it('does not offer an incident solution procedure in healthy practice', () => {
    expect(initialize(practiceScenario, 'practice-procedures').observe('alex').allowedProcedureIds).toEqual([]);
  });

  it.each(['reason', 'heldAt', 'stabilitySeconds', 'criticalLossSeconds', 'evidenceHoldSeconds'] as const)('rejects forged practice outcome progress in %s', field => {
    const engine = initialize(practiceScenario, `practice-forged-${field}`); engine.step(10);
    const checkpoint = engine.snapshot();
    const mission = (checkpoint.state as unknown as EngineState).mission;
    if (field === 'reason') mission.reason = 'forged';
    else if (field === 'evidenceHoldSeconds') mission.evidenceHoldSeconds.player = 1;
    else mission[field] = 1;
    expect(() => restore(checkpoint, 'practice-rejected')).toThrow(/Practice/);
  });

  it.each(['traveling', 'completed', 'canceled'] as const)('rejects a forged destination path for a %s retained move', status => {
    const engine = initialize(hotRestart, `endpoint-${status}`);
    const receipt = move(engine);
    if (status === 'completed') engine.step(receipt.eta!);
    if (status === 'canceled') engine.applyCommand(request(engine, 'cancel_task', 'alex', { taskId: receipt.taskId! }));
    const checkpoint = engine.snapshot();
    expect(() => restore(checkpoint, 'endpoint-valid')).not.toThrow();
    (checkpoint.state as unknown as EngineState).tasks[0].public.path.at(-1)!.y--;
    expect(() => restore(checkpoint, 'endpoint-invalid')).toThrow(/path/);
  });
});
