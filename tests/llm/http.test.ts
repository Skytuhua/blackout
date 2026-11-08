import { it, expect } from 'vitest';
import { createDemoServer } from '../../server/index';
import { request } from 'node:http';
import { start } from './fixtures';
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
