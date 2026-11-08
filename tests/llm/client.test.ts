import { it, expect, vi, afterEach } from 'vitest';
import { startInteraction, continueInteraction, cancelInteraction, providerCallFor } from '../../src/llm/client';
import { start, final } from './fixtures';
afterEach(() => vi.unstubAllGlobals());
it('retains a received provider receipt while rejecting expired response content', async () => {
  const input = { ...start, requestId: 'expired-with-receipt' };
  const call = { receiptId: 'local-expired-call', provider: 'openai', responseId: 'response-expired', runId: input.runId, requestId: input.requestId, actorId: input.actorId, model: 'observed-model', inputTokens: 10, outputTokens: 5, durationMs: 4, status: 'completed' };
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ kind: 'final', runId: input.runId, requestId: input.requestId, actorId: input.actorId, response: { ...final, requestId: input.requestId } }), { headers: { 'X-Blackout-Deadline-Ms': '0', 'X-Blackout-Call': JSON.stringify(call) } }));
  const reply = await startInteraction(input);
  expect(reply.kind === 'fallback' && reply.reason).toBe('canceled_or_expired');
  expect(providerCallFor(reply)).toEqual(call);
});
it('validates gateway identity and facts and labels network failure', async () => {
  for (const valid of [true, false]) {
    const input = { ...start, requestId: `identity-${valid}` };
    const response = { kind: 'final', runId: valid ? start.runId : 'old', requestId: input.requestId, actorId: 'player', response: { ...final, requestId: input.requestId } };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(response)));
    const reply = await startInteraction(input);
    expect(reply.kind).toBe(valid ? 'final' : 'fallback');
  }
  vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
  const reply = await startInteraction({ ...start, requestId: 'offline' });
  expect(reply.kind === 'fallback' && reply.reason).toBe('gateway_unavailable');
});

it('explicit cancellation closes the gap between HTTP calls and sends one idempotent cancel', async () => {
  const input = { ...start, requestId: 'explicit-cancel' }; const paths: string[] = [];
  const intent = { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'closed', callId: 'read', tool: 'read_observations' as const, targetId: 'cooling-1', action: null };
  vi.stubGlobal('fetch', async (url: string) => { paths.push(url); return new Response(JSON.stringify(url.endsWith('/cancel') ? {} : { kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: intent.interactionId, intent })); });
  expect((await startInteraction(input)).kind).toBe('tool_request');
  cancelInteraction(input); cancelInteraction(input);
  const reply = await continueInteraction({ kind: 'continue', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: intent.interactionId, expectedCallId: intent.callId, view: input.view, result: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: intent.interactionId, callId: intent.callId, status: 'completed', reason: 'observations', receipt: null, observations: [], procedureText: null } });
  expect(reply.kind === 'fallback' && reply.reason).toBe('canceled_or_expired');
  expect(paths).toEqual(['/api/llm/turn', '/api/llm/cancel']);
});
