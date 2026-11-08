// Own loopback server, fresh temporary persistent profile, no app/provider/user storage.
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = await build({ entryPoints: [join(here, 'browser-entry.ts')], bundle: true, format: 'esm', write: false, target: 'es2022' });
const server = createServer((request, response) => {
  if (request.url === '/proof.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(bundle.outputFiles[0].contents); }
  else if (request.url === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>REPLAY-01 isolated IndexedDB proof</title><p>Disposable browser persistence check</p><script type="module" src="/proof.js"></script>'); }
  else { response.writeHead(404); response.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'blackout-replay-01-'));
let context;
const errors = [];
async function open() {
  context = await chromium.launchPersistentContext(profile, { headless: false });
  const page = context.pages()[0];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.waitForFunction(() => Boolean(window.replayProof));
  return page;
}
try {
  let page = await open();
  const saved = await page.evaluate(() => window.replayProof.save());
  await page.reload(); await page.waitForFunction(() => Boolean(window.replayProof));
  await context.close(); context = undefined;
  page = await open();
  const resumed = await page.evaluate(expected => window.replayProof.reloadAndResume(expected), saved);
  const boundaries = await page.evaluate(() => window.replayProof.corruptBoundaries());
  assert.deepEqual(errors, []);
  const evidence = { mode: 'headed Chromium, fresh temporary persistent profile', browser: context.browser().version(), origin, saved, resumed, boundaries, pageErrors: errors, providerCalls: 0 };
  await writeFile(join(here, 'browser-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (context) await context.close();
  await new Promise(resolve => server.close(resolve));
  const target = resolve(profile); const temp = resolve(tmpdir());
  assert.equal(dirname(target), temp); assert.ok(target.startsWith(join(temp, 'blackout-replay-01-')));
  await rm(target, { recursive: true, force: true });
}
