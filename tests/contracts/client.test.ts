import { expect, it } from 'vitest';
import { SimulationClient } from '../../src/workers/SimulationClient';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { alarmFixture } from '../../src/shared/fixtures';

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
