import { alarmFixture } from '../shared/fixtures';
import { WorkerRequestSchema, type WorkerReply } from './protocol';

// G0 fixture adapter; replace with the real engine at integration. Never claim mission proof here.
let runId: string | null = null;
self.onmessage = (event: MessageEvent<unknown>) => {
  const parsed = WorkerRequestSchema.safeParse(event.data);
  if (!parsed.success) return;
  const request = parsed.data;
  const identity = { correlationId: request.correlationId, runId: request.runId };
  let reply: WorkerReply;
  if (request.kind === 'initialize') {
    runId = request.runId;
    reply = { kind: 'initialized', ...identity, view: { ...alarmFixture, runId, knownTopology: request.spec.topology, crew: request.spec.crew } };
  } else if (request.runId !== runId) {
    reply = { kind: 'error', ...identity, code: 'stale_run', message: 'This run is no longer active.' };
  } else if (request.kind === 'observe') {
    reply = { kind: 'view', ...identity, view: { ...alarmFixture, runId, actorId: request.actorId } };
  } else {
    reply = { kind: 'error', ...identity, code: 'not_implemented', message: 'Development fixture shell. The engine is not integrated.' };
  }
  self.postMessage(reply);
};
