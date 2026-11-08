import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Gateway } from './llm/gateway';
import { modelConfiguration } from './llm/config';
import { GatewayInputSchema, GatewayStartSchema } from '../src/shared/schemas';
const identitySchema = GatewayStartSchema.pick({ runId: true, requestId: true, actorId: true });
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
export function createDemoServer(gateway = new Gateway()) {
  const root = resolve('dist');
  let windowStart = Date.now(), requests = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store');
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body)); };
    if (req.headers.host !== '127.0.0.1:4173' || (req.headers.origin && !['http://127.0.0.1:4173', 'http://127.0.0.1:5173'].includes(req.headers.origin))) { res.writeHead(403).end('Local origin required.'); return; }
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1:4173').pathname); } catch { res.writeHead(400).end('Invalid URL.'); return; }
    if (pathname === '/api/health' && req.method === 'GET') {
      try { json(200, { mode: process.env.LLM_MODE === 'live' ? 'live' : 'scripted', ...modelConfiguration(), stage: 'gateway' }); }
      catch { json(503, { error: 'Invalid model configuration.' }); }
      return;
    }
    if (pathname.startsWith('/api/')) {
      if (!['/api/llm/turn', '/api/llm/cancel', '/api/llm/reset'].includes(pathname)) { json(404, { error: 'Unknown route.' }); return; }
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') { json(415, { error: 'JSON required.' }); return; }
      if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); requests = 0; }
      if (++requests > 60) { json(429, { error: 'Local rate limit.' }); return; }
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', disconnected);
      const timer = setTimeout(() => { controller.abort(); if (!res.writableEnded) json(408, { error: 'Request timeout.' }); }, 22000);
      try {
        let bytes = 0; const chunks: Buffer[] = [];
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 65536) { json(413, { error: 'Payload too large.' }); return; } chunks.push(Buffer.from(chunk)); }
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json(400, { error: 'Invalid JSON.' }); return; }
        if (pathname !== '/api/llm/turn') {
          const parsed = identitySchema.safeParse(body);
          if (!parsed.success) { json(400, { error: 'Invalid identity.' }); return; }
          gateway.cancel(parsed.data); json(200, { canceled: true }); return;
        }
        const parsed = GatewayInputSchema.safeParse(body);
        if (!parsed.success) { json(400, { error: 'Invalid gateway envelope.' }); return; }
        const reply = await gateway.turn(parsed.data, controller.signal);
        const remaining = gateway.remainingMs(parsed.data);
        if (remaining !== undefined) res.setHeader('X-Blackout-Deadline-Ms', String(remaining));
        const call = gateway.receiptFor(reply);
        if (call) res.setHeader('X-Blackout-Call', JSON.stringify(call));
        if (!res.writableEnded && !res.destroyed) json(200, reply);
      } catch { if (!res.writableEnded && !res.destroyed) json(400, { error: 'Request unavailable.' }); }
      finally { clearTimeout(timer); res.removeListener('close', disconnected); }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405).end(); return; }
    const filename = resolve(root, '.' + (pathname === '/' || !extname(pathname) ? '/index.html' : pathname));
    if (!filename.startsWith(root + sep) || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(403).end(); return; }
    try { const data = await readFile(filename); res.writeHead(200, { 'Content-Type': mime[extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : data); }
    catch { res.writeHead(404).end('Not found.'); }
  });
  server.requestTimeout = 23000; server.headersTimeout = 10000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (Number(process.env.PORT ?? 4173) !== 4173) throw new Error('The demo uses the stable loopback origin 127.0.0.1:4173.');
  const server = createDemoServer();
  server.on('error', error => { console.error(`Cannot start local demo: ${error.message}`); process.exitCode = 1; });
  server.listen(4173, '127.0.0.1', () => console.log('Blackout: http://127.0.0.1:4173'));
}
