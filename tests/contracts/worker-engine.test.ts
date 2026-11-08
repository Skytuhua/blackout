import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { hotRestart, practiceScenario } from '../../src/content/scenarios/hot-restart';
import type { KnowledgeView } from '../../src/shared/contracts';
import type { WorkerReply, WorkerRequest } from '../../src/workers/protocol';

let last: WorkerReply;
const scope = { onmessage: null as ((event: MessageEvent) => void) | null, postMessage(reply: WorkerReply) { last = reply; } };
beforeAll(async () => { vi.stubGlobal('self', scope); await import('../../src/workers/simulation.worker'); });
afterAll(() => vi.unstubAllGlobals());
let sequence = 0;
function send(input: Omit<WorkerRequest, 'correlationId'>): WorkerReply {
  scope.onmessage!({ data: { ...input, correlationId: `worker-${sequence++}` } } as MessageEvent);
  return last;
}
function start(runId = 'worker-run') {
  const reply = send({ kind: 'initialize', runId, spec: hotRestart } as WorkerRequest);
  if (reply.kind !== 'initialized') throw new Error('Initialization failed.');
  return reply.view;
}
function view(runId = 'worker-run'): KnowledgeView {
  const reply = send({ kind: 'observe', runId, actorId: 'player' } as WorkerRequest);
  if (reply.kind !== 'view') throw new Error('Observation failed.');
  return reply.view;
}

it('runs the real engine and publishes a command reservation without advancing paused time', () => {
  expect(start().simTime).toBe(0);
  send({ kind: 'advance', runId: 'worker-run', ticks: 10 } as WorkerRequest);
  const current = view();
  const reply = send({ kind: 'command', runId: current.runId, request: { schemaVersion: 1, runId: current.runId, requestId: 'inspect', actorId: 'player', idempotencyKey: 'inspect', expectedEntityVersions: current.observedEntityVersions, intent: { action: 'inspect', targetId: 'cooling-1', atSimTime: current.simTime, args: { technicianId: 'alex' } } } } as WorkerRequest);
  expect(reply.kind === 'receipt' && reply.receipt.status).toBe('accepted');
  expect(view()).toMatchObject({ simTime: 10, tasks: [expect.objectContaining({ action: 'inspect', status: 'traveling' })] });
  expect(send({ kind: 'record', runId: 'worker-run' } as WorkerRequest)).toMatchObject({ kind: 'record', record: { engineVersion: 'sim-desktop-v2' } });
});

it('advances practice beyond the incident deadline and starts a fresh run that rejects old callbacks', () => {
  expect(send({ kind: 'initialize', runId: 'worker-practice', spec: practiceScenario } as WorkerRequest)).toMatchObject({ kind: 'initialized', view: { simTime: 0, mission: { status: 'practice' } } });
  const current = view('worker-practice');
  expect(send({ kind: 'command', runId: current.runId, request: { schemaVersion: 1, runId: current.runId, requestId: 'move-practice', actorId: 'player', idempotencyKey: 'move-practice', expectedEntityVersions: current.observedEntityVersions, intent: { action: 'move_crew', targetId: 'alex', atSimTime: 0, args: { destination: { x: 6, y: 5 } } } } } as WorkerRequest)).toMatchObject({ kind: 'receipt', receipt: { status: 'accepted', eta: 3 } });
  send({ kind: 'advance', runId: 'worker-practice', ticks: 600 } as WorkerRequest);
  expect(send({ kind: 'advance', runId: 'worker-practice', ticks: 10 } as WorkerRequest)).toMatchObject({ kind: 'advanced', view: { simTime: 610, mission: { status: 'practice' }, tasks: [expect.objectContaining({ status: 'completed' })] } });
  expect(start('fresh-incident')).toMatchObject({ simTime: 0, tasks: [], crew: hotRestart.crew, mission: { status: 'active' } });
  expect(send({ kind: 'advance', runId: 'worker-practice', ticks: 1 } as WorkerRequest)).toMatchObject({ kind: 'error', code: 'stale_run' });
  expect(view('fresh-incident').simTime).toBe(0);
});

it('stops interactive advancement at the first terminal tick and keeps recorder state available', () => {
  start();
  const terminal = send({ kind: 'advance', runId: 'worker-run', ticks: 600 } as WorkerRequest);
  expect(terminal).toMatchObject({ kind: 'advanced', view: { simTime: 505, mission: { status: 'failure' } } });
  expect(send({ kind: 'advance', runId: 'worker-run', ticks: 4 } as WorkerRequest)).toMatchObject({ kind: 'advanced', view: { simTime: 505 } });
  expect(send({ kind: 'snapshot', runId: 'worker-run' } as WorkerRequest)).toMatchObject({ kind: 'checkpoint', checkpoint: { simTime: 505 } });
});

it('restores atomically into a new run envelope and rejects old callbacks', () => {
  start('original');
  send({ kind: 'advance', runId: 'original', ticks: 10 } as WorkerRequest);
  const saved = send({ kind: 'snapshot', runId: 'original' } as WorkerRequest);
  if (saved.kind !== 'checkpoint') throw new Error('Checkpoint required.');
  expect(send({ kind: 'restore', runId: 'original', newRunId: 'invalid', checkpoint: { ...saved.checkpoint, state: {} } } as WorkerRequest)).toMatchObject({ kind: 'error', runId: 'original', code: 'engine_error' });
  expect(view('original').simTime).toBe(10);
  expect(send({ kind: 'restore', runId: 'original', newRunId: 'restored', checkpoint: saved.checkpoint } as WorkerRequest)).toMatchObject({ kind: 'restored', runId: 'restored', view: { runId: 'restored', simTime: 10 } });
  expect(send({ kind: 'observe', runId: 'original', actorId: 'player' } as WorkerRequest)).toMatchObject({ kind: 'error', code: 'stale_run' });
});

it('does not project an unknown actor or accept a mismatched nested command envelope', () => {
  const current = start();
  expect(send({ kind: 'observe', runId: current.runId, actorId: 'unknown' } as WorkerRequest)).toMatchObject({ kind: 'error', code: 'engine_error' });
  expect(send({ kind: 'command', runId: current.runId, request: { schemaVersion: 1, runId: 'old', requestId: 'old', actorId: 'player', idempotencyKey: 'old', expectedEntityVersions: current.observedEntityVersions, intent: { action: 'pause_batch', targetId: 'site', atSimTime: 0, args: {} } } } as WorkerRequest)).toMatchObject({ kind: 'error', code: 'stale_run' });
  expect(view().tasks).toHaveLength(0);
});
