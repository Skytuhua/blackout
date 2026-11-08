import { expect, it, vi } from 'vitest';
import { SimulationClient } from '../../src/workers/SimulationClient';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { alarmFixture } from '../../src/shared/fixtures';
import type { Checkpoint } from '../../src/shared/contracts';

class TestWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  messages: Record<string, unknown>[] = [];
  postMessage(message: Record<string, unknown>) { this.messages.push(message); }
  terminate() {}
  reply(index: number, extra: Record<string, unknown>) {
    const { correlationId, runId } = this.messages[index];
    this.onmessage?.({ data: { correlationId, runId, ...extra } } as MessageEvent<unknown>);
  }
}
it('correlates projected views and rejects outstanding callbacks on a new run', async () => {
  const worker = new TestWorker();
  const client = new SimulationClient(worker as unknown as Worker);
  const first = client.initialize(hotRestart, 'first');
  const rejected = expect(first).rejects.toThrow('stale_run');
  const second = client.initialize(hotRestart, 'second');
  await rejected;
  worker.reply(0, { kind: 'initialized', view: { ...alarmFixture, runId: 'first' } });
  worker.reply(1, { kind: 'initialized', view: { ...alarmFixture, runId: 'second' } });
  expect((await second).runId).toBe('second');
  client.dispose();
});
it('surfaces stale-run errors instead of publishing an old projected view', async () => {
  const worker = new TestWorker(); const client = new SimulationClient(worker as unknown as Worker);
  const promise = client.initialize(hotRestart, 'new');
  worker.reply(0, { kind: 'error', code: 'stale_run', message: 'This run is no longer active.' });
  await expect(promise).rejects.toThrow('stale_run'); client.dispose();
});
it('returns coworker knowledge without publishing it to player subscribers', async () => {
  const worker = new TestWorker(); const client = new SimulationClient(worker as unknown as Worker);
  const seen: string[] = []; client.subscribe(view => seen.push(view.actorId));
  const initialized = client.initialize(hotRestart, 'run');
  worker.reply(0, { kind: 'initialized', view: { ...alarmFixture, runId: 'run' } }); await initialized;
  const observed = client.observe('alex');
  worker.reply(1, { kind: 'view', view: { ...alarmFixture, runId: 'run', actorId: 'alex' } });
  expect((await observed).actorId).toBe('alex'); expect(seen).toEqual(['player']); client.dispose();
});
it('restores from the active envelope into a new run and recovers from a rejected restore', async () => {
  const worker = new TestWorker(); const client = new SimulationClient(worker as unknown as Worker);
  const initialized = client.initialize(hotRestart, 'original');
  worker.reply(0, { kind: 'initialized', view: { ...alarmFixture, runId: 'original' } }); await initialized;
  const checkpoint: Checkpoint = { schemaVersion: 1, engineVersion: '1.0.0', scenarioVersion: 'hot-restart-v1', runId: 'original', simTime: 0, state: {} };
  const outstanding = client.observe('alex'); const invalidated = expect(outstanding).rejects.toThrow('stale_run');
  const rejectedRestore = client.restore(checkpoint, 'rejected-branch'); await invalidated;
  expect(worker.messages[2].runId).toBe('original');
  worker.reply(2, { kind: 'error', code: 'engine_error', message: 'Invalid checkpoint.' });
  await expect(rejectedRestore).rejects.toThrow('engine_error');
  const restored = client.restore(checkpoint, 'branch');
  expect(worker.messages[3].runId).toBe('original');
  worker.reply(3, { kind: 'restored', runId: 'branch', view: { ...alarmFixture, runId: 'branch' } });
  expect((await restored).runId).toBe('branch');
  const view = client.observe(); expect(worker.messages[4].runId).toBe('branch');
  worker.reply(4, { kind: 'view', view: { ...alarmFixture, runId: 'branch' } }); await view; client.dispose();
});

it('stops the playback timer on a terminal view and cannot resume that run', async () => {
  vi.useFakeTimers();
  const worker = new TestWorker(); const client = new SimulationClient(worker as unknown as Worker);
  try {
    const initialized = client.initialize(hotRestart, 'clock');
    worker.reply(0, { kind: 'initialized', view: { ...alarmFixture, runId: 'clock' } }); await initialized;
    client.setSpeed(4); client.resume(); await vi.advanceTimersByTimeAsync(249);
    expect(worker.messages).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.messages[1]).toMatchObject({ kind: 'advance', ticks: 1 });
    worker.reply(1, { kind: 'advanced', view: { ...alarmFixture, runId: 'clock', simTime: 505, mission: { ...alarmFixture.mission, status: 'failure' } } });
    await vi.advanceTimersByTimeAsync(5000); client.resume(); await vi.advanceTimersByTimeAsync(5000);
    expect(worker.messages).toHaveLength(2);
  } finally { client.dispose(); vi.useRealTimers(); }
});
