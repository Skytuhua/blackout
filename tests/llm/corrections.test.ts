import { it, expect, vi, afterEach } from 'vitest';
import { request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Gateway } from '../../server/llm/gateway';
import { Budget } from '../../server/llm/budget';
import { createDemoServer } from '../../server/index';
import { startInteraction, continueInteraction, executeToolIntent } from '../../src/llm/client';
import { renderFacts, validStart, validateResponse } from '../../src/llm/validation';
import { ledgerFixture, comparisonFixture } from '../../src/shared/fixtures';
import { start, final } from './fixtures';
import type { GatewayStart, ComparisonResult } from '../../src/shared/contracts';
const output = (items: unknown[]) => ({ status: 'completed', model: 'synthetic', output: items, usage: { input_tokens: 40, output_tokens: 10 } });
const text = (value: unknown) => output([{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }] }]);
const call = (name = 'read_procedure', action: unknown = null) => [{ type: 'reasoning', id: 'reason', summary: [] }, { type: 'function_call', id: 'fc', call_id: 'exact-call', name, arguments: JSON.stringify({ targetId: name === 'read_procedure' ? 'procedure' : 'cooling-1', action }) }];
const setup = (transport: (params: any, signal: AbortSignal) => Promise<any>, extra = {}) => new Gateway({ mode: 'live', keyConfigured: true, transport, budget: new Budget(join(mkdtempSync(join(tmpdir(), 'blackout-correction-')), 'usage.json')), ...extra });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([false, true])('retained start cancellation aborts pending continuation HTTP (new signal: %s)', async withNewSignal => {
  const input = { ...start, requestId: `retained-abort-${withNewSignal}` };
  const original = new AbortController(); const current = new AbortController();
  const intent = { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'retained-abort', callId: 'one', tool: 'read_observations', targetId: 'cooling-1', action: null };
  const response = { kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: intent.interactionId, intent };
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(response)));
  const first = await startInteraction(input, original.signal);
  if (first.kind !== 'tool_request') throw new Error('Expected initial tool request.');
  const result = await executeToolIntent(first.intent, { start: input });
  let observedSignal: AbortSignal | undefined; let release!: () => void; let cancellations = 0;
  vi.stubGlobal('fetch', (path: string, init?: RequestInit) => {
    if (path.endsWith('/cancel')) { cancellations++; return Promise.resolve(new Response('{}')); }
    observedSignal = init?.signal ?? undefined;
    return new Promise<Response>((resolve, reject) => {
      release = () => resolve(new Response(JSON.stringify({ ...response, intent: { ...intent, callId: 'late' } })));
      observedSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  });
  let settled = false;
  const pending = continueInteraction({ kind: 'continue', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: intent.interactionId, expectedCallId: intent.callId, view: input.view, result }, withNewSignal ? current.signal : undefined).then(reply => { settled = true; return reply; });
  original.abort();
  await new Promise(resolve => setImmediate(resolve));
  const promptlySettled = settled;
  release();
  const reply = await pending;
  expect(observedSignal?.aborted).toBe(true);
  expect(cancellations).toBe(1);
  expect(promptlySettled).toBe(true);
  expect(reply.kind === 'fallback' && reply.reason).toBe('canceled');
  expect(current.signal.aborted).toBe(false);
});

it.each(['observation', 'hashing'])('HTTP/client/tools share expiry across asynchronous %s without a caller signal', async stage => {
  const input = { ...start, requestId: `http-expiry-${stage}` };
  const gateway = setup(async () => output(call('inspect_asset', { action: 'inspect', targetId: 'cooling-1', atSimTime: 75, args: { technicianId: 'alex', ceiling: null, taskId: null } })), { interactionTimeoutMs: 500 });
  const server = createDemoServer(gateway);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'POST', headers: { ...Object.fromEntries(new Headers(init.headers)), Host: '127.0.0.1:4173' } }, res => {
      let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve(new Response(body, { status: res.statusCode, headers: res.headers as Record<string, string> })));
    });
    req.on('error', reject); req.end(init.body as string);
  }));
  try {
    const reply = await startInteraction(input);
    expect(reply.kind).toBe('tool_request');
    if (reply.kind !== 'tool_request') throw new Error('tool expected');
    if (stage === 'hashing') {
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
        await new Promise(resolve => setTimeout(resolve, 750)); return digest(...args);
      });
    }
    let commands = 0;
    const result = await executeToolIntent(reply.intent, { start: input, simulation: {
      observe: async () => { if (stage === 'observation') await new Promise(resolve => setTimeout(resolve, 750)); return input.view; },
      command: async () => { commands++; return { schemaVersion: 1, runId: input.runId, requestId: input.requestId, actorId: input.actorId, status: 'accepted', reason: 'queued', taskId: 'task', eta: 109, evidenceIds: [], observedAt: 75 }; },
    } });
    expect(commands).toBe(0);
    expect(result.status).toBe('rejected');
    const continued = await continueInteraction({ kind: 'continue', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: reply.interactionId, expectedCallId: reply.intent.callId, view: input.view, result });
    expect(continued.kind === 'fallback' && continued.reason).toBe('canceled_or_expired');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

it('comparison facts use both equal-horizon prefix ledgers and ordinary facts keep their ledger', () => {
  const prefix = { ...ledgerFixture, horizon: 50, criticalDelivered: 123, peakTemperatureC: 28 };
  const comparison: ComparisonResult = { baseRunId: comparisonFixture.baseRunId, branchRunId: comparisonFixture.branchRunId, continuationPolicy: comparisonFixture.continuationPolicy, externalScheduleIdentity: comparisonFixture.externalScheduleIdentity, explanation: comparisonFixture.explanation, status: 'unsupported', baseline: ledgerFixture, supportedHorizon: 50, firstInvalidAction: { sequence: 1, at: 50, actorId: 'player', intent: { action: 'inspect', targetId: 'cooling-1', atSimTime: 50, args: {} }, receipt: { schemaVersion: 1, runId: start.runId, requestId: 'invalid', actorId: 'player', status: 'rejected', reason: 'invalid', taskId: null, eta: null, evidenceIds: [], observedAt: 50 } }, reason: 'unsupported', validPrefix: { baseline: prefix, alternative: { ...prefix, runId: 'fixture-branch', criticalDelivered: 456, peakTemperatureC: 27 } } };
  const input: GatewayStart = { ...start, role: 'debrief', debriefContext: { ledger: ledgerFixture, comparison } };
  expect(validStart(input)).toBe(true);
  const answer = { ...final, facts: [start.runId, 'fixture-branch'].flatMap(ledgerRunId => [{ ledgerRunId, field: 'horizon' as const }, { ledgerRunId, field: 'criticalDelivered' as const }, { ledgerRunId, field: 'peakTemperatureC' as const }]) };
  expect(validateResponse(answer, input)).toBe(true);
  expect(renderFacts(answer, input).map(f => f.value)).toEqual([50, 123, 28, 50, 456, 27]);
  const complete = { ...input, debriefContext: { ledger: ledgerFixture, comparison: { ...comparisonFixture, supportedHorizon: 50, baseline: prefix, alternative: comparison.validPrefix.alternative } } };
  expect(renderFacts(answer, complete).map(f => f.value)).toEqual([50, 123, 28, 50, 456, 27]);
  const ordinary = { ...input, debriefContext: { ledger: ledgerFixture, comparison: null } };
  expect(renderFacts({ ...final, facts: [{ ledgerRunId: start.runId, field: 'horizon' }] }, ordinary)[0].value).toBe(400);
});

it.each(['expiry', 'abort'])('continuation retains the original deadline and new cancellation signal: %s', async reason => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const input = { ...start, requestId: `fixed-deadline-${reason}` };
  const intent = { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'fixed-interaction', callId: 'first', tool: 'read_observations' as const, targetId: 'cooling-1', action: null };
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: intent.interactionId, intent }), { headers: { 'X-Blackout-Deadline-Ms': '100' } }));
  expect((await startInteraction(input)).kind).toBe('tool_request');
  now = 60;
  const result = await executeToolIntent(intent, { start: input });
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: intent.interactionId, intent: { ...intent, callId: 'second' } }), { headers: { 'X-Blackout-Deadline-Ms': '20000' } }));
  const controller = new AbortController();
  const next = await continueInteraction({ kind: 'continue', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: intent.interactionId, expectedCallId: intent.callId, view: input.view, result }, controller.signal);
  expect(next.kind).toBe('tool_request');
  if (next.kind !== 'tool_request') throw new Error('tool expected');
  if (reason === 'expiry') now = 101; else controller.abort();
  expect((await executeToolIntent(next.intent, { start: input })).reason).toBe('canceled_or_expired');
});

it('retention pressure preserves active tool flows', async () => {
  let calls = 0;
  const actor = { ...start, actorId: 'alex', role: 'facilities' as const, requestId: 'pending', view: { ...start.view, actorId: 'alex' } };
  const gateway = setup(async params => {
    calls++;
    const input = JSON.parse(params.input[0].content);
    if (input.actorId === 'alex' && params.input.length === 1) return output(call('read_observations'));
    return text({ ...final, runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId });
  });
  const pending = await gateway.turn(actor);
  if (pending.kind !== 'tool_request') throw new Error('tool expected');
  for (let i = 0; i < 129; i++) {
    const input = { ...start, runId: `pressure-${i}`, view: { ...start.view, runId: `pressure-${i}` } };
    expect((await gateway.turn(input)).kind).toBe('final');
  }
  expect((await gateway.turn(actor))).toEqual(pending);
  const result = { runId: actor.runId, requestId: actor.requestId, actorId: actor.actorId, interactionId: pending.interactionId, callId: pending.intent.callId, status: 'completed' as const, reason: 'observations', receipt: null, observations: [actor.view.observations[1]], procedureText: null };
  expect((await gateway.turn({ kind: 'continue', runId: actor.runId, requestId: actor.requestId, actorId: actor.actorId, interactionId: pending.interactionId, expectedCallId: pending.intent.callId, view: actor.view, result })).kind).toBe('final');
  expect(calls).toBe(131);
});

it('failed continuation closes previously delivered tool intentions', async () => {
  const input = { ...start, requestId: 'failed-continuation' };
  const intent = { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'failed-interaction', callId: 'call', tool: 'read_observations' as const, targetId: 'cooling-1', action: null };
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: intent.interactionId, intent })));
  const reply = await startInteraction(input);
  if (reply.kind !== 'tool_request') throw new Error('tool expected');
  const result = await executeToolIntent(reply.intent, { start: input });
  vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
  expect((await continueInteraction({ kind: 'continue', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: intent.interactionId, expectedCallId: intent.callId, view: input.view, result })).kind).toBe('fallback');
  expect((await executeToolIntent(reply.intent, { start: input })).status).toBe('rejected');
});

it('every continuation supplies fresh scoped context after exact output and matching call result', async () => {
  const input = { ...start, procedures: [{ id: 'procedure', text: 'Permitted procedure.' }], view: { ...start.view, allowedProcedureIds: ['procedure'] } };
  let calls = 0;
  let resumed: any;
  const items = call();
  const view = { ...input.view, simTime: 76, viewHash: 'new-view-hash', observedEntityVersions: { 'cooling-1': 2 }, affordances: [] };
  const gateway = setup(async params => {
    if (++calls === 1) return output(items);
    resumed = params;
    return text(final);
  });
  const reply = await gateway.turn(input);
  if (reply.kind !== 'tool_request') throw new Error('tool expected');
  const result = { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: reply.interactionId, callId: reply.intent.callId, status: 'completed' as const, reason: 'procedure', receipt: null, observations: [], procedureText: 'Permitted procedure.' };
  expect((await gateway.turn({ kind: 'continue', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: result.interactionId, expectedCallId: result.callId, view, result })).kind).toBe('final');
  expect(resumed.input.slice(1, 3)).toEqual(items);
  expect(resumed.input[3]).toMatchObject({ type: 'function_call_output', call_id: 'exact-call' });
  const fresh = JSON.parse(resumed.input.at(-1).content).view;
  expect(fresh).toMatchObject({ simTime: 76, viewHash: 'new-view-hash', observedEntityVersions: { 'cooling-1': 2 }, affordances: [] });
  expect(calls).toBe(2);
});

it('terminal retention permits 129 completed interactions and preserves recent duplicate receipts', async () => {
  let calls = 0;
  const gateway = setup(async params => { calls++; const input = JSON.parse(params.input[0].content); return text({ ...final, runId: input.runId }); });
  for (let i = 0; i < 129; i++) {
    const input = { ...start, runId: `retention-${i}`, view: { ...start.view, runId: `retention-${i}` } };
    expect((await gateway.turn(input)).kind).toBe('final');
    expect((await gateway.turn(input)).kind).toBe('final');
  }
  expect(calls).toBe(129);
});
