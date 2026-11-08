import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const origin = process.env.FACILITY_FIXTURE_ORIGIN ?? 'http://127.0.0.1:5194';
const out = process.env.FACILITY_FIXTURE_OUTPUT ?? '.local/facility-map-01'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [], failures = [];
const check = async (name, run) => {
  try { const detail = await run(); results.push({ name, status: 'passed', detail }); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
};
async function settle(page) { await page.evaluate(async () => { await document.fonts.ready; for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); }); }
async function open(width = 1280, height = 720, reducedMotion = 'no-preference') {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
  page.errors = []; page.calls = [];
  page.on('pageerror', error => page.errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) page.calls.push(request.url()); });
  await page.addInitScript(() => {
    const nativeRequest = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window), pending = new Set();
    window.requestAnimationFrame = callback => { const id = nativeRequest(time => { pending.delete(id); callback(time); }); pending.add(id); return id; };
    window.cancelAnimationFrame = id => { pending.delete(id); nativeCancel(id); };
    const NativeObserver = window.ResizeObserver, observers = new Set();
    window.ResizeObserver = class extends NativeObserver { observe(...args) { observers.add(this); return super.observe(...args); } disconnect() { observers.delete(this); return super.disconnect(); } };
    const nativeMatch = window.matchMedia.bind(window), mediaListeners = new Set();
    window.matchMedia = query => {
      const media = nativeMatch(query), add = media.addEventListener.bind(media), remove = media.removeEventListener.bind(media);
      media.addEventListener = (type, listener, options) => { mediaListeners.add(listener); add(type, listener, options); };
      media.removeEventListener = (type, listener, options) => { mediaListeners.delete(listener); remove(type, listener, options); };
      return media;
    };
    window.mapResources = () => ({ frames: pending.size, observers: observers.size, mediaListeners: mediaListeners.size });
  });
  await page.goto(`${origin}/tests/ui/facility-map/fixture.html`);
  await page.locator('.facility-map[data-art=ready]').waitFor(); await settle(page);
  return page;
}
async function patch(page, value) { await page.evaluate(value => window.facilityFixture.patch(value), value); await settle(page); }
async function diagnostics(page) { return page.locator('canvas').evaluate(canvas => ({ ...canvas.dataset, crew: JSON.parse(canvas.dataset.crew), time: Number(canvas.dataset.presentationTime) })); }
async function layout(page) {
  await settle(page);
  const result = await page.evaluate(() => {
    const root = document.querySelector('.facility-map'), world = document.querySelector('.fm-world'), stage = document.querySelector('.fm-stage');
    const r = root.getBoundingClientRect(), w = world.getBoundingClientRect(), s = stage.getBoundingClientRect(), canvas = document.querySelector('canvas');
    const problems = [];
    if (document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth) problems.push('document overflow');
    for (const element of root.querySelectorAll('button,select,.fm-toolbar,.fm-equipment,.fm-footer')) {
      const b = element.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (b.left < r.left - 1 || b.top < r.top - 1 || b.right > r.right + 1 || b.bottom > r.bottom + 1) problems.push(`outside stage: ${element.textContent}`);
      if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) problems.push(`clipped: ${element.className || element.textContent}`);
      if (element.tagName === 'BUTTON' && b.height < 44) problems.push('small target');
    }
    if (w.width <= 0 || w.height <= 0 || w.left < s.left - 1 || w.top < s.top - 1 || w.right > s.right + 1 || w.bottom > s.bottom + 1) problems.push('canvas fit');
    const scale = w.width / canvas.width;
    if (Math.abs(w.width / canvas.width - w.height / canvas.height) > .01) problems.push('map aspect ratio');
    return { problems, stage: [r.width, r.height], world: [w.width, w.height], scale, fontSize: getComputedStyle(root.querySelector('button')).fontSize };
  });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(page.errors, []); assert.deepEqual(page.calls, []);
  return result;
}
try {
  await check('canonical atlas bytes and 111 frames', async () => {
    const page = await open(), hashes = {};
    for (const file of ['facility-v2.png', 'facility-v2.json']) {
      const response = await page.request.get(`${origin}/assets/${file}`), bytes = await response.body();
      assert.deepEqual(bytes, readFileSync(`public/assets/${file}`));
      hashes[file] = createHash('sha256').update(bytes).digest('hex');
      if (file.endsWith('.json')) assert.equal(Object.keys(JSON.parse(bytes).frames).length, 111);
    }
    await page.close(); return hashes;
  });
  await check('controlled room and asset callbacks, keyboard and known room membership', async () => {
    const page = await open();
    await page.evaluate(() => window.facilityFixture.control(false)); await settle(page);
    await page.getByRole('button', { name: 'Hall A', exact: true }).click();
    assert.equal(await page.locator('.facility-map').getAttribute('data-room'), 'overview');
    assert.deepEqual(await page.evaluate(() => window.facilityFixture.events.at(-1)), { name: 'room', value: 'hall-a' });
    await patch(page, { selectedRoomId: 'hall-a' });
    assert.equal(await page.locator('.fm-equipment-items button').count(), 8);
    assert.equal(await page.locator('.fm-equipment').getByText('1. Rack A1', { exact: true }).count(), 1);
    assert.equal(await page.locator('.fm-equipment').getByText('Rack B1').count(), 0);
    const rack = page.getByRole('button', { name: '1. Rack A1 Reading received' });
    await rack.focus(); await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.facilityFixture.events.at(-1)), { name: 'asset', value: 'rack-a-1' });
    assert.equal(await rack.getAttribute('aria-pressed'), 'false');
    await patch(page, { selectedAssetId: 'rack-a-1' }); assert.equal(await rack.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Next equipment page', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '8. Rack A8 Reading received' }).count(), 1);
    await page.getByRole('button', { name: 'Previous equipment page', exact: true }).click();
    assert.equal(await rack.isVisible(), true);
    await page.getByRole('button', { name: 'Overview', exact: true }).focus(); await page.keyboard.press('Space');
    assert.deepEqual(await page.evaluate(() => window.facilityFixture.events.at(-1)), { name: 'room', value: null });
    await page.close();
  });
  await check('known footprints select assets; bare floor and movement keys issue no actions', async () => {
    const page = await open(); await patch(page, { selectedRoomId: 'hall-a' });
    const box = await page.locator('canvas').boundingBox();
    await page.locator('canvas').click({ position: { x: (3.5 / 22) * box.width, y: (4 / 12) * box.height } });
    assert.deepEqual(await page.evaluate(() => window.facilityFixture.events.at(-1)), { name: 'asset', value: 'rack-a-1' });
    const before = await page.evaluate(() => window.facilityFixture.events.length);
    await page.locator('canvas').click({ position: { x: 8 / 22 * box.width, y: 8 / 12 * box.height } });
    for (const key of ['w', 'a', 's', 'd', 'e', 'ArrowUp']) await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => window.facilityFixture.events.length), before);
    assert.deepEqual(page.calls, []); await page.close();
  });
  await check('hall-specific connections and explicit shared upstream', async () => {
    const page = await open(); await patch(page, { selectedRoomId: 'hall-a' });
    const a = JSON.parse((await diagnostics(page)).connections);
    assert.equal(a.length, 8); assert(a.every(id => id.includes('ups-a:rack-a-')));
    await patch(page, { selectedRoomId: 'hall-b' }); const b = JSON.parse((await diagnostics(page)).connections);
    assert.equal(b.length, 8); assert(b.every(id => id.includes('ups-b:rack-b-')));
    await patch(page, { selectedRoomId: 'power-a' });
    assert(JSON.parse((await diagnostics(page)).connections).includes('power:shared-upstream:distribution-a'));
    await page.getByLabel('Connections', { exact: true }).selectOption('cooling_supply');
    await patch(page, { selectedRoomId: 'hall-a' });
    assert(JSON.parse((await diagnostics(page)).connections).every(id => id.includes('cooling-a-1:rack-a-')));
    assert.match(await page.locator('.fm-upstream').innerText(), /Shared upstream utility \/ generator transfer/);
    await page.close();
  });
  await check('accepted travel persists through controlled selections, pause, speed, and reset', async () => {
    const page = await open();
    await page.evaluate(() => window.facilityFixture.travel()); await settle(page);
    const initial = await diagnostics(page); await page.waitForTimeout(120);
    const traveling = await diagnostics(page); assert(traveling.crew.alex.x > initial.crew.alex.x);
    await patch(page, { selectedRoomId: 'hall-b', selectedActorId: 'jules', selectedAssetId: 'rack-b-1' });
    const switched = await diagnostics(page); assert.equal(switched.rendererId, initial.rendererId); assert(switched.time >= traveling.time);
    assert.match(await page.locator('.fm-crew').innerText(), /Alex · traveling · Rack A7/);
    await page.waitForFunction(() => document.querySelector('canvas').dataset.animationRequests === '0');
    assert.equal((await diagnostics(page)).time, 21, 'a stalled public view permits only one visual tick');
    await patch(page, { paused: true }); const paused = await diagnostics(page); await page.waitForTimeout(180);
    assert.deepEqual((await diagnostics(page)).crew, paused.crew); assert.equal((await diagnostics(page)).animationRequests, '0');
    for (const speed of [1, 2, 4]) {
      await page.evaluate(speed => { const f = window.facilityFixture; f.patch({ view: { ...f.props.view, simTime: f.props.view.simTime + 1 }, paused: false, speed }); }, speed);
      await settle(page); const start = await diagnostics(page); await page.waitForTimeout(100); const end = await diagnostics(page);
      assert(end.time > start.time); assert(end.time <= await page.evaluate(() => window.facilityFixture.props.view.simTime + 1));
    }
    await page.evaluate(() => { const f = window.facilityFixture; f.patch({ view: { ...f.props.view, runId: 'new-view', simTime: 0, tasks: [], crew: f.props.view.crew.map(c => ({ ...c, x: c.id === 'alex' ? 6 : c.x, taskId: null })) } }); });
    await settle(page); const reset = await diagnostics(page); assert.equal(reset.time, 0); assert.equal(reset.crew.alex.x, 6); assert.equal(reset.rendererId, initial.rendererId);
    await page.close();
  });
  await check('reduced motion prop and browser preference stop cycles without altering supplied state', async () => {
    const page = await open(); await page.evaluate(() => window.facilityFixture.travel());
    await patch(page, { reducedMotion: true }); const reduced = await diagnostics(page);
    assert.equal(reduced.crew.alex.x, 4); assert.match(reduced.crew.alex.frame, /idle$/); assert.equal(reduced.animationRequests, '0');
    await page.waitForTimeout(100); assert.equal((await diagnostics(page)).time, reduced.time);
    assert.equal(await page.evaluate(() => window.facilityFixture.props.view.tasks[0].status), 'traveling');
    await patch(page, { reducedMotion: false }); await page.emulateMedia({ reducedMotion: 'reduce' }); await settle(page);
    assert.equal((await diagnostics(page)).animationRequests, '0'); assert.equal((await diagnostics(page)).crew.alex.x, 4);
    assert.equal(await page.locator('[data-crew-label="sam"]').count(), 0);
    await page.close();
  });
  await check('no inferred equipment fault from unknown, stale or future public evidence', async () => {
    const page = await open(); await patch(page, { selectedRoomId: 'power-a' });
    for (const [name, patchValue, expected] of [['fresh', {}, 'Observed attention'], ['stale', { observedAt: 1 }, 'Stale'], ['future', { observedAt: 21 }, 'Unknown'], ['undelivered', { receivedAt: 21 }, 'Unknown'], ['unknown', { quality: 'unknown' }, 'Unknown']]) {
      await page.evaluate(patchValue => { const f = window.facilityFixture; f.patch({ view: { ...f.props.view, observations: [{ id: 'public-state', assetId: 'ups-a', source: 'fixture', field: 'state', value: 'offline', units: '', observedAt: 20, receivedAt: 20, quality: 'reported', ...patchValue }] } }); }, patchValue);
      await settle(page);
      assert.equal(await page.locator('.fm-equipment button').first().locator('small').innerText(), expected, name);
      if (expected === 'Unknown') assert.doesNotMatch(await page.locator('.fm-equipment button').first().getAttribute('title'), /offline/);
    }
    await page.close();
  });
  await check('stable canvas/renderer/listeners and complete unmount cleanup', async () => {
    const page = await open(); const first = await diagnostics(page), baseline = await page.evaluate(() => window.mapResources());
    const rooms = await page.evaluate(() => window.facilityFixture.props.view.knownTopology.rooms.map(r => r.id));
    for (let i = 0; i < 32; i++) await patch(page, { selectedRoomId: rooms[i % rooms.length] });
    assert.equal((await diagnostics(page)).rendererId, first.rendererId); assert.equal(await page.locator('canvas').count(), 1);
    assert.deepEqual(await page.evaluate(() => window.mapResources()), baseline);
    await page.evaluate(() => window.facilityFixture.travel()); await settle(page);
    await page.evaluate(() => window.facilityFixture.mount(false)); await settle(page);
    assert.deepEqual(await page.evaluate(() => window.mapResources()), { frames: 0, observers: 0, mediaListeners: 0 });
    await page.evaluate(() => window.facilityFixture.mount(true)); await page.locator('.facility-map[data-art=ready]').waitFor(); await settle(page);
    assert.notEqual((await diagnostics(page)).rendererId, first.rendererId);
    await page.close(); return { selectionChanges: 32, resourcesBefore: baseline, afterUnmount: { frames: 0, observers: 0, mediaListeners: 0 } };
  });
  for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080]]) for (const font of [16, 24, 32]) {
    await check(`all eight views fit ${width}x${height} at ${font}px root text`, async () => {
      const page = await open(width, height); await page.evaluate(font => document.documentElement.style.fontSize = `${font}px`, font);
      const roomIds = [null, ...await page.evaluate(() => window.facilityFixture.props.view.knownTopology.rooms.map(r => r.id))], dimensions = [];
      for (const room of roomIds) {
        await patch(page, { selectedRoomId: room }); dimensions.push({ room: room ?? 'overview', ...await layout(page) });
        if (font === 16 || font === 32) await page.screenshot({ path: `${out}/${width}x${height}-${font}px-${room ?? 'overview'}.png`, fullPage: true });
      }
      await page.close(); return dimensions;
    });
  }
  await check('undersized container stays contained with readable navigation', async () => {
    const page = await open(800, 600); await page.evaluate(() => { const stage = document.querySelector('.fixture-stage'); stage.style.width = '460px'; stage.style.height = '400px'; });
    const result = await layout(page); assert(result.scale < 1); assert.equal(result.fontSize, '16px'); await page.close(); return result;
  });
} finally {
  await browser.close(); writeFileSync(`${out}/browser-results.json`, JSON.stringify({ results, failures }, null, 2));
}
if (failures.length) process.exitCode = 1;
