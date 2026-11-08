import { afterEach, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { procedures } from '../../src/content/procedures';
import type { GatewayStart, ToolIntent } from '../../src/shared/contracts';
import { startInteraction, continueInteraction } from '../../src/llm/client';
import { executeToolIntent } from '../../src/llm/tools';
import { scopeKnowledge } from '../../src/llm/context';
import { appendFreshView, initialHistory, parameters } from '../../server/llm/adapter';
import { Gateway } from '../../server/llm/gateway';
import { Budget } from '../../server/llm/budget';
import { createDemoServer } from '../../server/index';
import { request as actionRequest } from '../sim/mission-policy';
import { validateResponse } from '../../src/llm/validation';

afterEach(() => vi.unstubAllGlobals());
function missionStart(): GatewayStart {
  const engine = initialize(hotRestart, 'context-run'); engine.step(75);
  return { kind: 'start', runId: 'context-run', requestId: crypto.randomUUID(), actorId: 'alex', role: 'facilities', message: 'Inspect cooling-1', view: engine.observe('alex'), procedures, promptVersion: '1' };
}

it('sends a real mission knowledge history within the existing HTTP limit', async () => {
  const input = missionStart(); let bytes = Infinity;
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    bytes = Buffer.byteLength(String(init.body));
    return new Response(JSON.stringify({ kind: 'fallback', runId: input.runId, requestId: input.requestId, actorId: input.actorId, mode: 'scripted', reason: 'scripted', message: 'Offline', facts: [] }));
  });
  await startInteraction(input);
  expect(bytes).toBeLessThanOrEqual(65536);
  expect(input.view.observations.length).toBeGreaterThan(600);
});

it('plans real initial context within 6000 tokens without raising the budget', () => {
  const input = missionStart();
  input.view = scopeKnowledge(input.view, ['cooling-1']);
  expect(Math.ceil(Buffer.byteLength(JSON.stringify(parameters(input, initialHistory(input), 1))) / 2)).toBeLessThanOrEqual(6000);
});

it('replaces the old provider snapshot while retaining the original player request', () => {
  const input = missionStart();
  const next = { ...input, view: { ...input.view, simTime: 76, viewHash: 'fresh' } };
  const history = appendFreshView(initialHistory(input), next);
  expect(JSON.parse((history[0] as { content: string }).content).message).toBe(input.message);
  expect(history.filter(item => 'content' in item && typeof item.content === 'string' && JSON.parse(item.content).view)).toHaveLength(1);
});

it('read observations returns latest permitted target evidence instead of all sensor history', async () => {
  const input = missionStart();
  const intent: ToolIntent = { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'context', callId: 'read', tool: 'read_observations', targetId: 'rack-1', action: null };
  const result = await executeToolIntent(intent, { start: input });
  expect(result.status).toBe('completed');
  expect(result.observations).toHaveLength(4);
  expect(result.observations.every(o => o.observedAt === 75)).toBe(true);
});

it('scope preserves source freshness and selected evidence without mutating engine history', () => {
  const input = missionStart(); const original = structuredClone(input.view);
  const sample = input.view.observations.find(o => o.assetId === 'rack-1')!;
  input.view.observations.push({ ...sample, id: 'independent', source: 'probe', observedAt: 70, receivedAt: 74, quality: 'independent' });
  const scoped = scopeKnowledge(input.view, ['rack-1']);
  expect(scoped.observations.find(o => o.id === 'independent')).toMatchObject({ observedAt: 70, receivedAt: 74, quality: 'independent' });
  expect(scoped.observations.some(o => o.assetId === 'rack-2')).toBe(false);
  expect(scopeKnowledge(input.view, ['rack-1']).viewHash).toBe(scoped.viewHash);
  expect(scopeKnowledge(input.view, ['cooling-1']).viewHash).not.toBe(scoped.viewHash);
  const omitted = { runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId, mode: 'live' as const, facts: [{ observationId: original.observations.find(o => o.assetId === 'rack-2')!.id, field: 'value' as const }], inference: '', uncertainty: '', proposals: [] };
  expect(validateResponse(omitted, { ...input, view: scoped })).toBe(false);
  scoped.crew[0].x = -100;
  expect(input.view.crew).toEqual(original.crew);
  expect(input.view.observations.slice(0, -1)).toEqual(original.observations);
  expect(scopeKnowledge(input.view, ['cooling-1'], [sample.id]).observations).toContainEqual(sample);
});

it.each([[75, false], [331, false], [75, true]] as const)('real mission t%s completes bounded calls with newer sensor readings: %s', async (at, advanceSensors) => {
  const engine = initialize(hotRestart, `real-context-${at}`);
  if (at === 331) {
    // Reuse the recorded successful command schedule; policy decisions have separate simulation coverage.
    for (const [time, action, target, args] of [
      [10, 'pause_batch', 'site', {}], [10, 'inspect', 'controller', { technicianId: 'alex' }],
      [43, 'repair_cooling', 'controller', { technicianId: 'alex' }], [163, 'independent_reading', 'rack-1', { technicianId: 'alex' }],
      [255, 'set_batch_ceiling', 'site', { ceiling: 30 }], [319, 'verify_recovery', 'site', {}],
    ] as const) {
      engine.step(time - engine.observe('player').simTime);
      expect(engine.applyCommand(actionRequest(engine, action, target, args)).status).toBe('accepted');
    }
    engine.step(12); expect(engine.observe('player').mission.status).toBe('success');
  } else engine.step(at);
  const input: GatewayStart = { ...missionStart(), runId: `real-context-${at}`, view: scopeKnowledge(engine.observe('alex'), ['cooling-1']) };
  const factId = input.view.observations.find(o => o.assetId === 'cooling-1')!.id;
  const planned: number[] = []; const wireBytes: number[] = []; let calls = 0;
  const gateway = new Gateway({ mode: 'live', keyConfigured: true, budget: new Budget(join(mkdtempSync(join(tmpdir(), 'blackout-context-')), 'usage.json')), transport: async params => {
    planned.push(Math.ceil(Buffer.byteLength(JSON.stringify(params)) / 2)); calls++;
    if (calls < 3) return { status: 'completed', model: 'mock', output: [{ type: 'function_call', id: `item-${calls}`, call_id: `call-${calls}`, name: 'read_observations', arguments: JSON.stringify({ targetId: 'cooling-1', action: null }) }] } as any;
    expect(params.tool_choice).toBe('none');
    if (!Array.isArray(params.input)) throw new Error('Expected structured Responses input.');
    expect(params.input.filter(item => item.type === 'function_call').map(item => 'call_id' in item && item.call_id)).toEqual(['call-1', 'call-2']);
    return { status: 'completed', model: 'mock', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId, mode: 'live', facts: [{ observationId: factId, field: 'value' }], inference: 'Inspection is needed.', uncertainty: 'Cause unverified.', proposals: [] }) }] }] } as any;
  } });
  const server = createDemoServer(gateway);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    wireBytes.push(Buffer.byteLength(String(init.body)));
    return new Promise<Response>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path: url, method: 'POST', headers: { Host: '127.0.0.1:4173', 'Content-Type': 'application/json' } }, res => {
        let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve(new Response(body, { status: res.statusCode, headers: res.headers as Record<string, string> })));
      });
      req.on('error', reject); req.end(init.body as string);
    });
  });
  try {
    let reply = await startInteraction(input);
    const context = { start: input, simulation: { observe: async (actor: string) => engine.observe(actor), command: async (request: Parameters<typeof engine.applyCommand>[0]) => engine.applyCommand(request) } };
    for (let round = 0; round < 2; round++) {
      expect(reply.kind).toBe('tool_request');
      if (reply.kind !== 'tool_request') throw new Error(JSON.stringify(reply));
      const result = await executeToolIntent(reply.intent, context);
      expect(result.status).toBe('completed');
      if (advanceSensors) engine.step(5);
      reply = await continueInteraction({ kind: 'continue', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: reply.interactionId, expectedCallId: reply.intent.callId, view: scopeKnowledge(engine.observe('alex'), ['cooling-1'], result.observations.map(o => o.id)), result });
    }
    expect(reply.kind, JSON.stringify({ reply, planned, wireBytes })).toBe('final'); expect(calls).toBe(3);
    expect(Math.max(...planned)).toBeLessThanOrEqual(6000);
    expect(Math.max(...wireBytes)).toBeLessThanOrEqual(65536);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

it('real worker inspection includes worker versions and awaits travel, work and delayed evidence', async () => {
  const engine = initialize(hotRestart, 'real-inspection'); engine.step(75);
  const input: GatewayStart = { ...missionStart(), runId: 'real-inspection', view: scopeKnowledge(engine.observe('alex'), ['cooling-1']) };
  const intent: ToolIntent = { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'real-inspection', callId: 'inspect', tool: 'inspect_asset', targetId: 'cooling-1', action: { action: 'inspect', targetId: 'cooling-1', atSimTime: 75, args: { technicianId: 'alex' } } };
  const result = await executeToolIntent(intent, { start: input, simulation: { observe: async actor => engine.observe(actor ?? 'player'), command: async request => engine.applyCommand(request) } });
  expect(result.receipt?.reason).toBe('TASK_RESERVED'); expect(result.status).toBe('accepted');
  expect(engine.observe('alex').tasks.at(-1)?.status).toBe('traveling');
  expect(engine.observe('alex').observations.some(o => o.field === 'inspection_complete')).toBe(false);
  engine.step(result.receipt!.eta! - 75);
  expect(engine.observe('alex').tasks.at(-1)?.status).toBe('completed');
  expect(engine.observe('alex').observations.some(o => o.field === 'inspection_complete')).toBe(false);
  engine.step(2);
  expect(engine.observe('alex').observations.some(o => o.field === 'inspection_complete')).toBe(true);
});

it('oversized required context falls back before reserving budget or calling a provider', async () => {
  const input = missionStart();
  input.view = scopeKnowledge(input.view, ['rack-1']);
  input.view.messages = Array.from({ length: 4 }, (_, i) => ({ id: `large-${i}`, at: 75, speaker: 'player', text: 'x'.repeat(3000), evidenceIds: [], mode: 'scripted' }));
  const path = join(mkdtempSync(join(tmpdir(), 'blackout-overflow-')), 'usage.json');
  let calls = 0;
  const gateway = new Gateway({ mode: 'live', keyConfigured: true, budget: new Budget(path), transport: async () => { calls++; throw new Error('must not call'); } });
  const reply = await gateway.turn(input);
  expect(reply.kind === 'fallback' && reply.reason).toBe('input_limit');
  expect(calls).toBe(0); expect(existsSync(path)).toBe(false);
});
