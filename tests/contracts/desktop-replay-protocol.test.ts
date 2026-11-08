import { expect, it } from 'vitest';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { WorkerRequestSchema } from '../../src/workers/protocol';

it('keeps replay and comparison in the internal worker protocol with bounded integer cursors', () => {
  const record = initialize(hotRestart, 'source-record').exportRecord();
  const identity = { runId: 'replay-worker', correlationId: 'replay-correlation' };
  expect(WorkerRequestSchema.safeParse({ ...identity, kind: 'replay_to', record, at: 0 }).success).toBe(true);
  for (const at of [-1, .5, 601, Infinity]) expect(WorkerRequestSchema.safeParse({ ...identity, kind: 'replay_to', record, at }).success).toBe(false);
  expect(WorkerRequestSchema.safeParse({ ...identity, kind: 'compare', record, change: { commandSequence: 0, earlierAt: 0, branchRunId: 'alternative' } }).success).toBe(true);
});
