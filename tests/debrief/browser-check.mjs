// Isolated component harness: no application route, provider, user profile or storage.
import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, extname, relative } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('.local/ui-03');
const bundle = join(output, 'bundle');
await mkdir(bundle, { recursive: true });
await build({ entryPoints: ['tests/debrief/browser-entry.tsx'], bundle: true, outdir: bundle, format: 'esm', target: 'es2022', loader: { '.woff2': 'file', '.woff': 'file' }, assetNames: 'fonts/[name]-[hash]' });
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>UI-03 isolated development fixture</title><link rel="stylesheet" href="/browser-entry.css"><div id="root"></div><script type="module" src="/browser-entry.js"></script></html>');
    return;
  }
  const file = resolve(bundle, `.${decodeURIComponent(path)}`);
  if (relative(bundle, file).startsWith('..')) { res.writeHead(403); res.end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' })[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'blackout-ui-03-'));
let browser;
const errors = [], consoleErrors = [], externalRequests = [], cases = [], screenshots = [];
try {
  browser = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await browser.route('**/*', route => {
    if (route.request().url().startsWith(origin + '/')) return route.continue();
    externalRequests.push(route.request().url()); return route.abort();
  });
  const page = browser.pages()[0];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  async function open(name, width = 1440) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.goto(`${origin}/?case=${name}`);
    await expect(page.getByRole('article', { name: 'Mission debrief' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(await page.evaluate(() => window.debriefProof.calls), []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: page overflow at ${width}`);
    cases.push(`${name}@${width}`);
  }
  async function calls() { return page.evaluate(() => window.debriefProof.calls); }
  async function screenshot(name) { const path = join(output, `${name}.png`); await page.screenshot({ path, fullPage: true }); screenshots.push(path); }

  await open('complete');
  const comparison = page.getByRole('table', { name: 'Comparison outcomes', exact: true });
  await expect(comparison).toContainText('711,480'); await expect(comparison).toContainText('1,015,680');
  await screenshot('desktop-complete');
  await page.getByRole('button', { name: 'Play replay', exact: true }).focus();
  const focus = await page.getByRole('button', { name: 'Play replay', exact: true }).evaluate(e => ({ style: getComputedStyle(e).outlineStyle, width: getComputedStyle(e).outlineWidth }));
  assert.notEqual(focus.style, 'none'); assert.ok(parseFloat(focus.width) >= 2);
  await page.keyboard.press('Enter'); await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible();
  await page.getByRole('slider', { name: /Replay time/ }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('slider')).toHaveValue('21');
  await page.getByText(/Recorded actions and events \(/).click();
  await page.getByRole('button', { name: 'Seek to 10 seconds: task.reserved', exact: true }).click();
  await expect(page.getByRole('slider')).toHaveValue('10');
  const earlier = page.getByRole('spinbutton', { name: 'Earlier time (whole seconds)' });
  const compareButton = page.getByRole('button', { name: 'Compare earlier cap', exact: true });
  for (const invalid of ['', '-1', '5.5', '20']) { await earlier.fill(invalid); await expect(compareButton).toBeDisabled(); }
  await earlier.fill('5'); await compareButton.click();
  const cap = await page.evaluate(() => window.debriefProof.capOptions[0]);
  assert.deepEqual((await calls()).find(c => c.type === 'compare'), { type: 'compare', value: { sequence: cap.sequence, earlierAt: 5 } });
  await page.getByRole('button', { name: 'Request explanation', exact: true }).click();
  await page.getByRole('button', { name: 'Return to run', exact: true }).click();
  await page.getByRole('button', { name: 'Retry mission', exact: true }).click();
  assert.deepEqual((await calls()).map(c => c.type), ['toggle', 'seek', 'seek', 'compare', 'explain', 'return', 'retry']);
  assert.equal(await page.evaluate(() => window.debriefProof.unchanged()), true);
  const boundaryCalls = await calls();

  await open('unsupported', 390);
  await expect(page.getByRole('heading', { name: /Unsupported continuation/ })).toBeVisible();
  const prefixTable = page.getByRole('table', { name: 'Comparison outcomes', exact: true });
  await expect(prefixTable).toContainText('10 s'); await expect(prefixTable).not.toContainText('100 s');
  await expect(prefixTable).not.toContainText('18,480');
  await expect(page.getByLabel('Grounded explanation')).toContainText('batchBacklog: 0 units');
  for (const title of await page.locator('svg > title').allTextContents()) assert.ok(title.includes('0 to 10 seconds'));
  await expect(page.getByText('Original mode: live', { exact: false })).toBeVisible();
  await screenshot('mobile-unsupported');
  await page.getByText('Accessible telemetry table · exact samples', { exact: true }).click();
  const times = await page.getByRole('region', { name: 'Telemetry samples table' }).locator('tbody tr td:first-of-type').allTextContents();
  assert.ok(times.every(t => Number(t) <= 10)); assert.equal(times.length, 22);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const shortTargets = await page.locator('.debrief button, .debrief input, .debrief select, .debrief summary').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length && n.getBoundingClientRect().height < 44).map(n => n.outerHTML.slice(0, 100)));
  assert.deepEqual(shortTargets, []);
  const motion = await page.locator('.debrief button').first().evaluate(e => ({ animation: getComputedStyle(e).animationName, transition: getComputedStyle(e).transitionDuration }));
  assert.deepEqual(motion, { animation: 'none', transition: '0s' });

  for (const width of [320, 768]) { await open('complete', width); }
  await open('no-cap', 390); await expect(compareButton).toBeDisabled(); await expect(page.getByText(/No accepted batch cap is available/)).toBeVisible();
  await open('zero-cap', 390); await expect(compareButton).toBeDisabled(); await expect(page.getByText(/No earlier whole-second time/)).toBeVisible();
  await open('loading', 390); await expect(page.getByRole('button', { name: /Computing comparison/ })).toBeDisabled(); await expect(page.getByRole('button', { name: /Preparing explanation/ })).toBeDisabled();
  await open('failure', 390); await expect(page.getByRole('alert')).toHaveCount(2); await compareButton.click(); await page.getByRole('button', { name: 'Request explanation', exact: true }).click(); assert.deepEqual((await calls()).map(c => c.type), ['compare', 'explain']);
  await open('empty', 390); await expect(page.getByText(/No recorded telemetry/)).toBeVisible(); await expect(page.getByText('No recorded dialogue.', { exact: true })).toBeVisible(); await expect(page.locator('svg')).toHaveCount(0);
  for (const name of ['invalid', 'invalid-selector']) { await open(name, 390); await expect(page.getByRole('alert')).toContainText('Explanation withheld'); }
  await open('terminal'); await expect(page.getByRole('heading', { level: 1 })).toContainText('Mission failed'); await expect(page.getByLabel('Original run outcome')).toContainText('505 s'); await expect(page.getByLabel('Original run outcome')).toContainText('600 s');
  await open('recovered', 390); await expect(page.getByRole('heading', { level: 1 })).toContainText('Mission recovered');
  const ceiling = await page.evaluate(() => window.debriefProof.capOptions.find(c => c.label.startsWith('set_batch_ceiling')));
  assert.ok(ceiling); await page.getByRole('combobox', { name: 'Accepted cap' }).selectOption(String(ceiling.sequence)); await earlier.fill('1'); await compareButton.click();
  assert.deepEqual((await calls())[0], { type: 'compare', value: { sequence: ceiling.sequence, earlierAt: 1 } });
  assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(externalRequests, []);
  const evidence = { scope: 'Isolated fixture component proof; not application saved-run/replay or G2 acceptance', browser: browser.browser().version(), origin, profile: 'fresh disposable persistent profile', cases, screenshots, boundaryCalls, focus, motion, pageErrors: errors, consoleErrors, externalRequests, providerCalls: 0, inputPropsUnchanged: true };
  await writeFile(join(output, 'browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(ok => server.close(ok));
  const target = resolve(profile), temp = resolve(tmpdir());
  assert.equal(dirname(target), temp); assert.ok(target.startsWith(join(temp, 'blackout-ui-03-')));
  await rm(target, { recursive: true, force: true });
}
