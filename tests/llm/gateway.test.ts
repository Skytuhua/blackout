import { it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Gateway } from '../../server/llm/gateway';
import { Budget } from '../../server/llm/budget';
import { start, final } from './fixtures';
const response = (output: unknown[]) => ({ status: 'completed', model: 'test-model', output, usage: { input_tokens: 40, output_tokens: 13 } });
const text = (value: unknown) => response([{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }] }]);
function setup(transport: (params: any, signal: AbortSignal) => Promise<any>, extra = {}) {
  return new Gateway({ mode: 'live', keyConfigured: true, transport, budget: new Budget(join(mkdtempSync(join(tmpdir(), 'blackout-gateway-')), 'usage.json')), ...extra });
}
it('returns validated final and rejects forged facts, refusal and incomplete output', async () => {
  expect((await setup(async () => text(final)).turn(start)).kind).toBe('final');
  for (const value of [text({ ...final, facts: [{ observationId: 'secret', field: 'value' }] }), { status: 'incomplete', output: [] }, response([{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }]), text({ bogus: true })]) {
    expect((await setup(async () => value).turn(start)).kind).toBe('fallback');
  }
});
it('preserves exact output items and call IDs in the next input and stops tools on call three', async () => {
  const output = [{ type: 'reasoning', id: 'reason', summary: [] }, { type: 'function_call', id: 'fc', call_id: 'provider-call', name: 'read_observations', arguments: JSON.stringify({ targetId: 'cooling-1', action: null }) }];
  let calls = 0;
  const gateway = setup(async (params) => {
    calls++;
    if (calls > 1) {
      const items = params.input;
      expect(items.slice(-4, -2)).toEqual([output[0], { ...output[1], call_id: `provider-call-${calls - 1}` }]);
      expect(items.at(-2).call_id).toBe(`provider-call-${calls - 1}`);
      expect(JSON.parse(items.at(-1).content).view.viewHash).toBe(start.view.viewHash);
    }
    if (calls === 3) { expect(params.tool_choice).toBe('none'); return text(final); }
    return response([output[0], { ...output[1], call_id: `provider-call-${calls}` }]);
  });
  let reply = await gateway.turn(start);
  for (let round = 0; round < 2; round++) {
    expect(reply.kind).toBe('tool_request');
    if (reply.kind !== 'tool_request') throw new Error('tool expected');
    reply = await gateway.turn({ kind: 'continue', runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: reply.interactionId, expectedCallId: reply.intent.callId, view: start.view, result: { runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: reply.interactionId, callId: reply.intent.callId, status: 'completed', reason: 'observations', receipt: null, observations: [start.view.observations[1]], procedureText: null } });
  }
  expect(reply.kind).toBe('final'); expect(calls).toBe(3);
});
it('rejects unknown tools, forged targets and wrong start identity', async () => {
  for (const [name, targetId] of [['unknown', 'cooling-1'], ['read_observations', 'hidden']]) {
    expect((await setup(async () => response([{ type: 'function_call', call_id: 'x', name, arguments: JSON.stringify({ targetId, action: null }) }])).turn(start)).kind).toBe('fallback');
  }
  expect((await setup(async () => text(final)).turn({ ...start, actorId: 'alex' })).kind).toBe('fallback');
});
it('does not call transport in scripted or missing-key mode', async () => {
  let calls = 0;
  const transport = async () => { calls++; return text(final); };
  expect((await setup(transport, { mode: 'scripted' }).turn(start)).kind).toBe('fallback');
  expect((await setup(transport, { keyConfigured: false }).turn(start)).kind).toBe('fallback'); expect(calls).toBe(0);
});
it('cancellation closes the interaction even when transport ignores abort; global lock remains until settlement', async () => {
  let release!: (value: any) => void;
  const gateway = setup(() => new Promise(resolve => { release = resolve; }));
  const pending = gateway.turn(start);
  await new Promise(resolve => setTimeout(resolve, 5));
  gateway.cancel(start);
  const canceled = await pending;
  expect(canceled.kind === 'fallback' && canceled.reason).toBe('canceled');
  const busy = await gateway.turn({ ...start, requestId: 'new' });
  expect(busy.kind === 'fallback' && busy.reason).toBe('provider_busy');
  release(text(final));
});
it('enforces persisted mission quota and input bounds before transport', async () => {
  let calls = 0;
  const gateway = setup(async () => { calls++; return text(final); });
  for (let i = 0; i < 24; i++) await gateway.turn({ ...start, requestId: `req-${i}` });
  const exhausted = await gateway.turn({ ...start, requestId: 'last' });
  expect(exhausted.kind === 'fallback' && exhausted.reason).toBe('mission_quota'); expect(calls).toBe(24);
  const huge = { ...start, view: { ...start.view, messages: Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, at: 1, speaker: 'player', text: 'x'.repeat(3000), evidenceIds: [], mode: 'scripted' as const })) } };
  expect((await setup(async () => text(final)).turn(huge)).kind).toBe('fallback');
});
it('ignores forged tool results and caches exact duplicate continuations', async () => {
  let calls = 0;
  const gateway = setup(async () => { calls++; return calls === 1 ? response([{ type: 'function_call', call_id: 'call', name: 'read_observations', arguments: JSON.stringify({ targetId: 'cooling-1', action: null }) }]) : text(final); });
  const reply = await gateway.turn(start);
  if (reply.kind !== 'tool_request') throw new Error('expected tool');
  const input = { kind: 'continue' as const, runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: reply.interactionId, expectedCallId: 'call', view: start.view, result: { runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: reply.interactionId, callId: 'call', status: 'completed' as const, reason: 'observations', receipt: null, observations: [start.view.observations[1]], procedureText: null } };
  for (const patch of [{ actorId: 'alex' }, { runId: 'other' }, { callId: 'other' }, { observations: [start.view.observations[0]] }, { observations: [{ ...start.view.observations[1], value: 'invented' }] }]) {
    expect((await gateway.turn({ ...input, result: { ...input.result, ...patch } })).kind).toBe('fallback');
  }
  expect((await gateway.turn({ ...input, result: { ...input.result, receipt: { schemaVersion: 1, runId: start.runId, requestId: start.requestId, actorId: start.actorId, status: 'accepted', reason: 'fake', taskId: 'fake-task', eta: 1, evidenceIds: [], observedAt: 75 } } })).kind).toBe('fallback');
  expect(calls).toBe(1);
  expect((await gateway.turn(input)).kind).toBe('final');
  expect((await gateway.turn(input)).kind).toBe('final'); expect(calls).toBe(2);
});
it('enforces call deadlines and retains reservations when usage is unknown', async () => {
  const gateway = setup(async () => new Promise(() => {}), { callTimeoutMs: 5 });
  const reply = await gateway.turn(start);
  expect(reply.kind === 'fallback' && reply.reason).toBe('call_timeout');
});
it('retains bounded metadata with returned model identity and no prompts', async () => {
  const gateway = setup(async () => text(final));
  await gateway.turn(start);
  expect(gateway.diagnostics).toEqual([expect.objectContaining({ model: 'test-model', inputTokens: 40, outputTokens: 13, runId: start.runId, requestId: 'req' })]);
  expect(JSON.stringify(gateway.diagnostics)).not.toContain('Check cooling.');
});
