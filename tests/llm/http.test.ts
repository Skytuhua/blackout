import { it, expect } from 'vitest';
import { createDemoServer } from '../../server/index';
import { request } from 'node:http';
import { start } from './fixtures';
import { final } from './fixtures';
import { Gateway } from '../../server/llm/gateway';
import { Budget } from '../../server/llm/budget';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
it('protects exact host/origin, limits JSON, and serves scripted turns without credentials', async () => {
  const server = createDemoServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  async function send(path: string, body?: string, headers = {}) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method: body ? 'POST' : 'GET', headers: { Host: '127.0.0.1:4173', Origin: 'http://127.0.0.1:4173', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers } }, res => { let value = ''; res.on('data', chunk => value += chunk); res.on('end', () => resolve({ status: res.statusCode!, body: value })); });
      req.on('error', reject); req.end(body);
    });
  }
  try {
    expect((await send('/api/health', undefined, { Host: 'evil:4173' })).status).toBe(403);
    expect((await send('/api/health', undefined, { Origin: 'http://127.0.0.1:4173.evil' })).status).toBe(403);
    expect((await send('/api/llm/turn', '{')).status).toBe(400);
    expect((await send('/api/llm/turn', JSON.stringify(start), { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await send('/api/llm/turn', 'x'.repeat(65537))).status).toBe(413);
    const result = await send('/api/llm/turn', JSON.stringify(start));
    expect(result.status).toBe(200); expect(JSON.parse(result.body).reason).toBe('scripted');
    expect((await send('/api/llm/cancel', JSON.stringify({ runId: start.runId, requestId: start.requestId, actorId: start.actorId }))).status).toBe(200);
    expect((await send('/.env.local')).status).toBe(403);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

it('reports actual provider-call metadata with the matching HTTP response', async () => {
  const gateway = new Gateway({ mode: 'live', keyConfigured: true, budget: new Budget(join(mkdtempSync(join(tmpdir(), 'blackout-metadata-')), 'usage.json')), transport: async () => ({ status: 'completed', model: 'actual-provider-model', usage: { input_tokens: 123, output_tokens: 45 }, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(final), annotations: [] }] }] }) as any });
  const server = createDemoServer(gateway);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const headers = await new Promise<import('node:http').IncomingHttpHeaders>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: (server.address() as { port: number }).port, path: '/api/llm/turn', method: 'POST', headers: { Host: '127.0.0.1:4173', 'Content-Type': 'application/json' } }, res => { res.resume(); res.on('end', () => resolve(res.headers)); });
      req.on('error', reject); req.end(JSON.stringify(start));
    });
    expect(headers['x-blackout-call']).toBeDefined();
    expect(JSON.parse(String(headers['x-blackout-call']))).toMatchObject({ runId: start.runId, requestId: start.requestId, actorId: start.actorId, model: 'actual-provider-model', inputTokens: 123, outputTokens: 45 });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

it('does not attach a previous successful receipt to a failed continuation', async () => {
  let calls = 0;
  const gateway = new Gateway({ mode: 'live', keyConfigured: true, budget: new Budget(join(mkdtempSync(join(tmpdir(), 'blackout-failed-metadata-')), 'usage.json')), transport: async () => {
    if (++calls > 1) throw new Error('synthetic provider outage');
    return { status: 'completed', model: 'actual-provider-model', usage: { input_tokens: 123, output_tokens: 45 }, output: [{ type: 'function_call', call_id: 'read', name: 'read_observations', arguments: JSON.stringify({ targetId: 'cooling-1', action: null }) }] } as any;
  } });
  const server = createDemoServer(gateway); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const send = (input: unknown) => new Promise<{ headers: import('node:http').IncomingHttpHeaders; body: any }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: (server.address() as { port: number }).port, path: '/api/llm/turn', method: 'POST', headers: { Host: '127.0.0.1:4173', 'Content-Type': 'application/json' } }, res => { let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve({ headers: res.headers, body: JSON.parse(text) })); });
    req.on('error', reject); req.end(JSON.stringify(input));
  });
  try {
    const first = await send(start); expect(first.body.kind).toBe('tool_request');
    const intent = first.body.intent;
    const second = await send({ kind: 'continue', runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: intent.interactionId, expectedCallId: intent.callId, view: start.view, result: { runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: intent.interactionId, callId: intent.callId, status: 'completed', reason: 'observations', receipt: null, observations: [], procedureText: null } });
    expect(second.body.kind).toBe('fallback'); expect(gateway.diagnostics).toHaveLength(1);
    expect(first.headers['x-blackout-call']).toBeDefined(); expect(second.headers['x-blackout-call']).toBeUndefined();
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
