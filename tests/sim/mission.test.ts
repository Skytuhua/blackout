import { describe, expect, it } from 'vitest';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import type { SimulationEngine } from '../../src/shared/contracts';
import { KnowledgeViewSchema, RunRecordSchema } from '../../src/shared/schemas';
import { initialize, restore } from '../../src/sim/engine';
import type { PhysicalState } from '../../src/sim/state';
import { latest, request, successfulPolicy } from './mission-policy';

const truth = (engine: SimulationEngine) => engine.snapshot().state.physical as unknown as PhysicalState;
const fresh = () => initialize(hotRestart, 'mission');
const inspect = (engine: SimulationEngine, target = 'controller', technicianId = 'alex') => engine.applyCommand(request(engine, 'inspect', target, { technicianId }));

describe('headless Hot Restart mission', () => {
  it('completes a public-evidence policy with actual hold, fresh final report, conserved work, and no thermal shutdown', () => {
    const engine = fresh();
    const trace = successfulPolicy(engine);
    expect(engine.observe('player').mission.status).toBe('success');
    expect(trace.every(r => r.status === 'accepted')).toBe(true);
    const record = RunRecordSchema.parse(engine.exportRecord());
    expect(record.events.filter(e => e.type === 'thermal_trip')).toEqual([]);
    const held = record.events.find(e => e.type === 'mission.stability_held')!;
    const won = record.events.find(e => e.type === 'mission.success')!;
    expect(won.simTime).toBeGreaterThanOrEqual(held.simTime);
    expect(won.payload.stabilitySeconds).toBeGreaterThanOrEqual(60);
    const report = record.observations.filter(o => o.field === 'recovery_verified' && o.value === true).at(-1)!;
    expect(won.simTime - report.observedAt).toBeLessThanOrEqual(10);
    expect(record.observations.some(o => o.quality === 'independent')).toBe(true);
    const p = truth(engine);
    expect(p.controllerFault).toBe(false);
    expect(p.racks.every(r => r.temperatureC < 27 && r.batch >= 30)).toBe(true);
    expect(p.totals.criticalDelivered).toBe(p.totals.criticalDemand);
    expect(p.totals.batchArrivals - p.totals.batchCompleted).toBeCloseTo(p.racks.reduce((sum, r) => sum + r.backlog, 0), 7);
  }, 15000);

  it('fails the idle policy and continues recorder-only physics after the terminal result', () => {
    const engine = fresh(); engine.step(600);
    expect(engine.observe('player').mission.status).toBe('failure');
    expect(engine.observe('player').mission.reason).toBe('CRITICAL_SERVICE_LOST');
    const before = truth(engine);
    expect(engine.applyCommand(request(engine, 'pause_batch', 'site')).reason).toBe('MISSION_ENDED');
    engine.step(20);
    expect(truth(engine).totals.batchArrivals).toBe(before.totals.batchArrivals + 4800);
    expect(truth(engine).racks[0].backlog).toBe(before.racks[0].backlog + 600);
  });

  it('times out at 600 seconds even if critical service never fully disappears', () => {
    const spec = structuredClone(hotRestart); spec.profile.tripC = 200;
    const engine = initialize(spec, 'timeout'); engine.step(600);
    expect(engine.observe('player').mission).toMatchObject({ status: 'failure', reason: 'MISSION_TIMEOUT' });
    expect(truth(engine).totals.criticalDelivered).toBe(truth(engine).totals.criticalDemand);
    const temperature = truth(engine).racks[0].temperatureC;
    engine.step(20);
    expect(truth(engine).racks[0].temperatureC).toBeGreaterThan(temperature);
  });

  it('reserves immediately while paused, enforces qualifications, versions and one task per worker', () => {
    const engine = fresh();
    expect(inspect(engine, 'controller', 'jules').reason).toBe('NOT_QUALIFIED');
    expect(inspect(engine).status).toBe('accepted');
    expect(engine.observe('player').simTime).toBe(0);
    expect(inspect(engine, 'cooling-1').reason).toBe('WORKER_BUSY');
    const stale = request(engine, 'inspect', 'ups-1', { technicianId: 'jules' });
    stale.expectedEntityVersions['ups-1'] = 99;
    expect(engine.applyCommand(stale).reason).toBe('STALE_ENTITY_VERSION');
    expect(engine.observe('player').tasks.filter(t => !['canceled', 'completed'].includes(t.status))).toHaveLength(1);
  });

  it('requires delivered inspection before repair or restart, without revealing the latent fault', () => {
    const engine = fresh(); engine.step(20);
    for (const action of ['repair_cooling', 'restart_cooling'] as const) {
      expect(engine.applyCommand(request(engine, action, 'controller', { technicianId: 'alex' })).reason).toBe('INSPECTION_REQUIRED');
    }
    const receipt = inspect(engine);
    engine.step(receipt.eta! - 20);
    expect(engine.applyCommand(request(engine, 'repair_cooling', 'controller', { technicianId: 'alex' })).reason).toBe('INSPECTION_REQUIRED');
    engine.step(2);
    expect(engine.applyCommand(request(engine, 'repair_cooling', 'controller', { technicianId: 'alex' })).status).toBe('accepted');
  });

  it('arrives along walkable tiles before starting the full repair and cancellation has no partial effect', () => {
    const engine = fresh(); engine.step(20);
    const first = inspect(engine); engine.step(first.eta! - 20 + 2);
    const repair = engine.applyCommand(request(engine, 'repair_cooling', 'controller', { technicianId: 'alex' }));
    engine.step(60);
    const task = engine.observe('player').tasks.find(t => t.id === repair.taskId)!;
    expect(task.progress).toBeCloseTo(0.5);
    const cancel = engine.applyCommand(request(engine, 'cancel_task', 'controller', { taskId: task.id }));
    expect(cancel.status).toBe('applied');
    expect(truth(engine).controllerFault).toBe(true);
    const retry = engine.applyCommand(request(engine, 'repair_cooling', 'controller', { technicianId: 'alex' }));
    expect(retry.eta! - engine.observe('player').simTime).toBe(120);
    engine.step(119); expect(truth(engine).controllerFault).toBe(true);
    engine.step(1); expect(truth(engine).controllerFault).toBe(false);
  });

  it('keeps fractional crew positions on travel cancellation and estimates the next real path', () => {
    const engine = fresh();
    const receipt = inspect(engine, 'rack-3');
    const original = engine.observe('player').tasks[0];
    expect(original.arrivalAt).toBeGreaterThan(1);
    expect(original.path.every(p => hotRestart.topology.walkable.some(tile => tile.x === p.x && tile.y === p.y))).toBe(true);
    engine.step(1);
    const position = engine.observe('player').crew.find(c => c.id === 'alex')!;
    const initial = hotRestart.crew.find(c => c.id === 'alex')!;
    expect(Math.abs(position.x - initial.x) + Math.abs(position.y - initial.y)).toBeCloseTo(initial.speed);
    engine.applyCommand(request(engine, 'cancel_task', 'rack-3', { taskId: receipt.taskId! }));
    expect(engine.observe('player').crew.find(c => c.id === 'alex')).toMatchObject({ x: position.x, y: position.y, taskId: null });
    const next = inspect(engine, 'controller');
    const travel = engine.observe('player').tasks.find(t => t.id === next.taskId)!;
    expect(travel.path[0]).toEqual({ x: position.x, y: position.y });
    engine.step(travel.arrivalAt - 1);
    expect(engine.observe('player').crew.find(c => c.id === 'alex')).toMatchObject(hotRestart.topology.assets.find(a => a.id === 'controller')!.serviceTile);
    expect(engine.observe('player').tasks.find(t => t.id === next.taskId)?.progress).toBe(0);
  });

  it('applies the remote control after three seconds and reduces heat on the cohosted racks', () => {
    const engine = fresh(); const idle = fresh(); engine.step(20); idle.step(20);
    const receipt = engine.applyCommand(request(engine, 'pause_batch', 'site'));
    expect(receipt).toMatchObject({ status: 'accepted', eta: 23 });
    expect(truth(engine).racks[0].batchCeiling).toBe(50);
    engine.step(2); expect(truth(engine).racks[0].batchCeiling).toBe(50);
    engine.step(1); expect(truth(engine).racks.every(r => r.batchCeiling === 0)).toBe(true);
    engine.step(70); idle.step(73);
    expect(truth(engine).racks.every((r, i) => r.temperatureC < truth(idle).racks[i].temperatureC)).toBe(true);
    const p = truth(engine);
    expect(p.totals.batchArrivals - p.totals.batchCompleted).toBeCloseTo(p.racks.reduce((sum, r) => sum + r.backlog, 0), 8);
  });

  it('delivers scoped field reports later, samples deterministic bounded noise every five seconds, and denies unknown actors', () => {
    const engine = fresh(); engine.step(20);
    const a = engine.observe('player');
    const reading = latest(a, 'rack-1', 'inlet_temperature_c')!;
    expect(reading.observedAt).toBe(20);
    expect(Math.abs(Number(reading.value) - truth(engine).racks[0].temperatureC)).toBeLessThanOrEqual(0.2);
    engine.step(1); expect(latest(engine.observe('player'), 'rack-1', 'inlet_temperature_c')).toEqual(reading);
    const receipt = inspect(engine);
    engine.step(receipt.eta! - 21);
    expect(latest(engine.observe('player'), 'controller', 'prerequisite_ready')).toBeUndefined();
    engine.step(2);
    expect(latest(engine.observe('player'), 'controller', 'prerequisite_ready')?.value).toBe(false);
    expect(latest(engine.observe('alex'), 'controller', 'prerequisite_ready')?.value).toBe(false);
    expect(latest(engine.observe('jules'), 'controller', 'prerequisite_ready')).toBeUndefined();
    expect(() => engine.observe('intruder')).toThrow();
    expect(JSON.stringify(KnowledgeViewSchema.parse(engine.observe('player')))).not.toMatch(/controllerFault|energyKwh|externalEvents|checkpoint|causalParents|initialPhysical/);
    const replay = fresh(); replay.step(20);
    expect(latest(replay.observe('player'), 'rack-1', 'inlet_temperature_c')).toEqual(reading);
  });

  it('records actual paused boundary order and idempotency without replaying effects', () => {
    const engine = fresh(); engine.step(10);
    const input = request(engine, 'pause_batch', 'site', {}, 'player', 'unique');
    const accepted = engine.applyCommand(input);
    expect(accepted.status).toBe('accepted');
    expect(engine.applyCommand({ ...input, requestId: 'duplicate' })).toEqual({ ...accepted, requestId: 'duplicate' });
    expect(engine.applyCommand({ ...input, intent: { ...input.intent, action: 'resume_batch' } }).reason).toBe('IDEMPOTENCY_CONFLICT');
    expect(engine.exportRecord().commands.filter(c => c.receipt.status === 'accepted')).toHaveLength(1);
    const record = engine.exportRecord();
    const command = record.commands.find(c => c.receipt.status === 'accepted')!;
    expect(command.at).toBe(10);
    expect(command.sequence).toBeGreaterThan(record.events.find(e => e.type === 'external.cooling_control_fault')!.sequence);
    expect(engine.observe('player').simTime).toBe(10);
    engine.step(3); expect(truth(engine).racks.every(r => r.batchCeiling === 0)).toBe(true);
  });

  it('revalidates late requests against relevant versions and explicitly rejects future intents', () => {
    const engine = fresh();
    const late = request(engine, 'inspect', 'ups-1', { technicianId: 'jules' });
    inspect(engine); engine.step(5);
    expect(engine.applyCommand(late).status).toBe('accepted');
    const future = request(engine, 'pause_batch', 'site'); future.intent.atSimTime += 1;
    expect(engine.applyCommand(future).reason).toBe('FUTURE_INTENT');
  });

  it('restores movement, reservations, idempotency, delayed reports and consumed event boundaries exactly', () => {
    const engine = fresh(); inspect(engine, 'rack-3'); engine.step(11);
    const copy = restore(JSON.parse(JSON.stringify(engine.snapshot())), 'mission');
    engine.step(70); copy.step(70);
    expect(copy.snapshot()).toEqual(engine.snapshot());
    const reportEngine = fresh(); const receipt = inspect(reportEngine); reportEngine.step(receipt.eta!);
    const pending = restore(reportEngine.snapshot(), 'mission');
    reportEngine.step(2); pending.step(2);
    expect(pending.snapshot()).toEqual(reportEngine.snapshot());
    const newRun = restore(reportEngine.snapshot(), 'new-run');
    expect(newRun.applyCommand({ ...request(newRun, 'pause_batch', 'site'), runId: 'mission' }).reason).toBe('STALE_RUN');
    const invalid = reportEngine.snapshot(); invalid.state.eventCursor = 0;
    expect(() => restore(invalid, 'bad')).toThrow();
  });

  it('waits for fresh authorized verification instead of publishing hidden success or a truth countdown', () => {
    const engine = fresh(); engine.step(20);
    expect(engine.observe('player').mission.stabilitySeconds).toBeNull();
    expect(engine.observe('player').objectives.find(o => o.id === 'prerequisite')?.state).toBe('awaiting_verification');
    const receipt = engine.applyCommand(request(engine, 'verify_recovery', 'site'));
    expect(receipt.status).toBe('accepted'); engine.step(12);
    expect(latest(engine.observe('player'), 'site', 'recovery_verified')?.value).toBe(false);
    expect(engine.observe('player').mission.status).toBe('active');
  });
});
