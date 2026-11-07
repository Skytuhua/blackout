import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const port = Number(process.env.PORT ?? 4173);
if (port !== 4173) throw new Error('The demo uses the stable loopback origin 127.0.0.1:4173.');
const root = resolve('dist');
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && !['http://127.0.0.1:4173', 'http://127.0.0.1:5173'].includes(req.headers.origin))) { res.writeHead(403).end('Local origin required.'); return; }
  let pathname: string;
  try { pathname = decodeURIComponent(new URL(req.url ?? '/', `http://127.0.0.1:${port}`).pathname); } catch { res.writeHead(400).end('Invalid URL.'); return; }
  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ mode: 'scripted', model: process.env.OPENAI_MODEL ?? 'gpt-5.6-luna', keyConfigured: Boolean(process.env.OPENAI_API_KEY), stage: 'foundation' })); return;
  }
  if (pathname.startsWith('/api/')) { res.writeHead(501, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Gateway not integrated.' })); return; }
  if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405).end(); return; }
  const filename = resolve(root, '.' + (pathname === '/' || !extname(pathname) ? '/index.html' : pathname));
  if (!filename.startsWith(root + sep) || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(filename);
    res.writeHead(200, { 'Content-Type': mime[extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404).end('Not found.'); }
});
server.on('error', error => { console.error(`Cannot start local demo: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Blackout: http://127.0.0.1:${port} (foundation; scripted mode)`));
