import { describe, expect, it } from 'vitest';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import type { SimulationEngine } from '../../src/shared/contracts';
import { initialize, restore } from '../../src/sim/engine';
import { isWalkablePosition } from '../../src/sim/navigation';
import { verifyReplay } from '../../src/sim/replay';
import type { EngineState } from '../../src/sim/state';
import { request } from './mission-policy';

const sam = (engine: SimulationEngine) => engine.observe('player').crew.find(c => c.id === 'sam')!;
const destination = hotRestart.topology.walkable.at(-1)!;
const move = (engine: SimulationEngine) => engine.applyCommand(request(engine, 'move_crew', 'sam', { destination }));

describe('remote coworker movement', () => {
  it('enters the existing floor only on an authorized order, travels without a report and replays', () => {
    const engine = initialize(hotRestart, 'sam-walk');
    const idle = initialize(hotRestart, 'sam-idle');
    expect(sam(engine)).toMatchObject({ x: 0, y: 0 });
    expect(move(engine)).toMatchObject({ status: 'accepted' });
    const task = engine.observe('player').tasks.at(-1)!;
    expect(task).toMatchObject({ action: 'move_crew', actorId: 'sam', status: 'traveling' });
    expect(sam(engine)).toMatchObject(task.path[0]);
    expect(task.path[0]).toEqual({ x: 1, y: 1 });
    expect(isWalkablePosition(hotRestart, sam(engine))).toBe(true);
    expect(task.path.at(-1)).toEqual(destination);
    engine.step(task.arrivalAt); idle.step(task.arrivalAt);
    expect(sam(engine)).toMatchObject({ ...destination, taskId: null });
    expect(engine.observe('player').messages).toEqual(idle.observe('player').messages);
    expect((engine.snapshot().state as unknown as EngineState).pendingReports).toEqual([]);
    expect(verifyReplay(engine.exportRecord(), 'sam-walk-replay').matches).toBe(true);
    expect(() => restore(engine.snapshot(), 'sam-restored')).not.toThrow();
  });

  it('restores and cancels real travel; remote workload actions never move him', () => {
    const engine = initialize(hotRestart, 'sam-cancel');
    const first = move(engine); expect(first.status).toBe('accepted');
    engine.step(1);
    const before = { x: sam(engine).x, y: sam(engine).y };
    expect(move(engine).reason).toBe('WORKER_BUSY');
    const clone = restore(engine.snapshot(), 'sam-cancel');
    expect(sam(clone)).toMatchObject(before);
    const forged = engine.snapshot();
    (forged.state as unknown as EngineState).tasks[0].public.path[0] = { ...destination };
    expect(() => restore(forged, 'forged-path')).toThrow();
    expect(engine.applyCommand(request(engine, 'cancel_task', 'sam', { taskId: first.taskId! })).status).toBe('applied');
    expect(sam(engine)).toMatchObject({ ...before, taskId: null });
    expect(() => restore(engine.snapshot(), 'sam-cancel-restored')).not.toThrow();
    const remote = engine.applyCommand(request(engine, 'pause_batch', 'site'));
    expect(remote.status).toBe('accepted');
    expect(engine.observe('player').tasks.at(-1)?.path).toEqual([]);
    engine.step(remote.eta! - engine.observe('player').simTime);
    expect(sam(engine)).toMatchObject(before);
    expect(() => restore(engine.snapshot(), 'sam-remote-restored')).not.toThrow();
    expect(verifyReplay(engine.exportRecord(), 'sam-cored-replay').matches).toBe(true);
  });

  it('preserves old offsite remote jobs and rejects unauthorized, stale and forged movement', () => {
    const engine = initialize(hotRestart, 'sam-legacy');
    const forged = engine.snapshot();
    Object.assign((forged.state as unknown as EngineState).crew.find(c => c.id === 'sam')!, destination);
    expect(() => restore(forged, 'forged')).toThrow();
    const stale = request(engine, 'move_crew', 'sam', { destination });
    const missing = request(engine, 'move_crew', 'sam', { destination });
    missing.expectedEntityVersions = {};
    expect(engine.applyCommand(missing).reason).toBe('MISSING_ENTITY_VERSION');
    expect(engine.applyCommand(request(engine, 'move_crew', 'sam', { destination }, 'sam')).reason).toBe('NOT_AUTHORIZED');
    const remote = engine.applyCommand(request(engine, 'pause_batch', 'site'));
    expect(remote.status).toBe('accepted');
    expect(sam(engine)).toMatchObject({ x: 0, y: 0 });
    expect(move(engine).reason).toBe('WORKER_BUSY');
    expect(() => restore(engine.snapshot(), 'old-remote')).not.toThrow();
    engine.step(remote.eta!);
    expect(sam(engine)).toMatchObject({ x: 0, y: 0 });
    expect(engine.applyCommand(stale).reason).toBe('STALE_ENTITY_VERSION');
    expect(verifyReplay(engine.exportRecord(), 'old-remote-replay').matches).toBe(true);
  });

  it('retains idempotency and rejects a disconnected destination without relocating Sam', () => {
    const engine = initialize(hotRestart, 'sam-idempotency');
    const command = request(engine, 'move_crew', 'sam', { destination });
    const receipt = engine.applyCommand(command);
    expect(receipt.status).toBe('accepted');
    expect(engine.applyCommand(command)).toEqual(receipt);
    expect(engine.observe('player').tasks).toHaveLength(1);
    const spec = structuredClone(hotRestart);
    spec.topology.walkable = spec.topology.walkable.filter(p => Math.abs(p.x - destination.x) + Math.abs(p.y - destination.y) !== 1);
    const blocked = initialize(spec, 'sam-blocked');
    expect(move(blocked).reason).toBe('PATH_BLOCKED');
    expect(sam(blocked)).toMatchObject({ x: 0, y: 0, taskId: null });
  });
});

