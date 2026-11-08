import { it, expect, vi, afterEach } from 'vitest';
import { startInteraction, continueInteraction } from '../../src/llm/client';
import { start, final } from './fixtures';
afterEach(() => vi.unstubAllGlobals());
it('validates gateway identity and facts and labels network failure', async () => {
  for (const response of [{ kind: 'final', runId: start.runId, requestId: 'req', actorId: 'player', response: final }, { kind: 'final', runId: 'old', requestId: 'req', actorId: 'player', response: final }]) {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(response)));
    const reply = await startInteraction(start);
    expect(reply.kind).toBe(response.runId === start.runId ? 'final' : 'fallback');
  }
  vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
  const reply = await startInteraction(start);
  expect(reply.kind === 'fallback' && reply.reason).toBe('gateway_unavailable');
});
