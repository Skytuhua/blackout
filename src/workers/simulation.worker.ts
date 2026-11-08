import type { SimulationEngine } from '../shared/contracts';
import { initialize, restore } from '../sim/engine';
import { WorkerRequestSchema, type WorkerReply } from './protocol';

let engine: SimulationEngine | null = null;
let runId: string | null = null;
self.onmessage = (event: MessageEvent<unknown>) => {
  const parsed = WorkerRequestSchema.safeParse(event.data);
  if (!parsed.success) return;
  const request = parsed.data;
  const identity = { correlationId: request.correlationId, runId: request.runId };
  let reply: WorkerReply;
  try {
    if (request.kind === 'initialize') {
      const next = initialize(request.spec, request.runId);
      engine = next; runId = request.runId;
      reply = { kind: 'initialized', ...identity, view: next.observe('player') };
    } else if (!engine) {
      reply = { kind: 'error', ...identity, code: 'not_initialized', message: 'Start a mission first.' };
    } else if (request.runId !== runId || request.kind === 'command' && request.request.runId !== runId) {
      reply = { kind: 'error', ...identity, code: 'stale_run', message: 'This run is no longer active.' };
    } else if (request.kind === 'observe') {
      reply = { kind: 'view', ...identity, view: engine.observe(request.actorId) };
    } else if (request.kind === 'advance') {
      if (engine.observe('player').mission.status === 'active') {
        for (let tick = 0; tick < request.ticks; tick++) {
          const result = engine.step(1);
          // Recorder/replay can continue physical accounting; interactive time stops exactly here.
          if (result.events.some(e => e.type === 'mission.success' || e.type === 'mission.failure')) break;
        }
      }
      reply = { kind: 'advanced', ...identity, view: engine.observe('player') };
    } else if (request.kind === 'command') {
      reply = { kind: 'receipt', ...identity, receipt: engine.applyCommand(request.request) };
    } else if (request.kind === 'snapshot') {
      reply = { kind: 'checkpoint', ...identity, checkpoint: engine.snapshot() };
    } else if (request.kind === 'restore') {
      const next = restore(request.checkpoint, request.newRunId);
      engine = next; runId = request.newRunId;
      reply = { kind: 'restored', ...identity, runId, view: next.observe('player') };
    } else {
      reply = { kind: 'record', ...identity, record: engine.exportRecord() };
    }
  } catch {
    reply = { kind: 'error', ...identity, code: 'engine_error', message: 'The simulation rejected this request. Retry the mission if it cannot continue.' };
  }
  self.postMessage(reply);
};
