import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const origin = process.env.DESKTOP_FIXTURE_ORIGIN ?? 'http://127.0.0.1:5176';
const out = '.local/desktop-ui'; mkdirSync(out, { recursive: true });
const results = [], failures = [], browser = await chromium.launch({ headless: true });
const check = async (name, run) => { try { const detail = await run(); results.push({ name, status: 'passed', detail }); console.log(`PASS ${name}`); } catch (error) { failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); } };
async function open(width = 1280, height = 720, reducedMotion = 'no-preference', query = '') {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
  page.errors = []; page.on('pageerror', error => page.errors.push(error.message));
  page.apiRequests = []; page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) page.apiRequests.push(request.url()); });
  await page.goto(`${origin}/src/ui/desktop-fixture.html${query}`); await page.locator('.blackout-canvas canvas').waitFor();
  await page.waitForFunction(() => document.querySelector('.blackout-canvas')?.dataset.art !== 'loading');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('700 24px "Pixelify Sans"')), true, 'Pixelify must actually load');
  return page;
}
async function noOverflow(page, context) {
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
  const problems = await page.evaluate(() => {
    const found = [];
    if (document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight) found.push('document');
    for (const element of document.querySelectorAll('.blackout-desktop *')) {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      if (style.visibility === 'hidden' || style.display === 'none' || !rect.width || !rect.height || element.closest('[aria-hidden=true]') || element.tagName === 'OPTION' || element.tagName === 'CANVAS' || element.tagName === 'svg' || element.tagName === 'path') continue;
      if (element.clientWidth && element.scrollWidth > element.clientWidth + 1 || element.clientHeight && element.scrollHeight > element.clientHeight + 1) found.push(`${element.tagName}.${element.className}: ${element.scrollWidth}x${element.scrollHeight} / ${element.clientWidth}x${element.clientHeight}`);
      if (element.tagName === 'BUTTON' && (rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1)) found.push(`offscreen button ${element.textContent}`);
    }
    return found;
  });
  assert.deepEqual(problems, [], context);
  assert.deepEqual(page.errors, [], `${context} page errors`);
  assert.deepEqual(page.apiRequests, [], `${context} must not make engine or provider API calls`);
}
async function allTextPages(page, label) {
  const previous = page.getByRole('button', { name: `Previous ${label.toLowerCase()} page`, exact: true });
  while (await previous.isEnabled()) await previous.click();
  const chunks = [], next = page.getByRole('button', { name: `Next ${label.toLowerCase()} page`, exact: true });
  for (let i = 0; i < 300; i++) {
    chunks.push(await page.locator('.blackout-panel .blackout-page-copy:not(.blackout-measure)').textContent());
    await noOverflow(page, `${label} page ${i + 1}`);
    if (!(await next.isEnabled())) return chunks.join('');
    await next.click();
  }
  throw new Error(`${label} unexpectedly exceeded 300 pages`);
}
async function allDraftPages(page) {
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
  const previous = page.getByRole('button', { name: 'Previous draft page', exact: true });
  while (await previous.isEnabled()) await previous.click();
  const chunks = [], next = page.getByRole('button', { name: 'Next draft page', exact: true });
  for (let i = 0; i < 200; i++) {
    chunks.push(await page.getByLabel('Message', { exact: true }).inputValue());
    await noOverflow(page, `draft page ${i + 1}`);
    if (!(await next.isEnabled())) return chunks.join('');
    await next.click();
  }
  throw new Error('Draft unexpectedly exceeded 200 pages');
}
try {
  await check('atlas source custody', async () => {
    const files = {};
    for (const name of ['facility-v2.json', 'facility-v2.png']) { const response = await fetch(`${origin}/assets/${name}`); if (response.headers.get('content-type')?.includes('html')) return { art: 'explicit legacy fallback; run with DESKTOP_ART_DIRECTORY for full atlas proof' }; const bytes = Buffer.from(await response.arrayBuffer()); files[name] = createHash('sha256').update(bytes).digest('hex'); if (name.endsWith('.json')) assert.equal(Object.keys(JSON.parse(bytes).frames).length, 111); }
    return files;
  });
  for (const [width, height] of [[1280,720], [1366,768], [1920,1080], [640,360]]) {
    await check(`viewport ${width}x${height}: shell, panels, input`, async () => {
      const page = await open(width, height);
      try {
        assert.equal(await page.locator('.blackout-panel').count(), 0, 'No default Your shift panel');
        const world = page.getByRole('application'), bounds = await world.boundingBox();
        assert.ok(bounds.width % 320 === 0 && bounds.height % 192 === 0);
        assert.ok(bounds.x >= 0 && bounds.y >= 48 && bounds.y + bounds.height <= height - 80);
        await noOverflow(page, 'closed world');
        await page.screenshot({ path: `${out}/world-${width}x${height}.png` });
        await world.focus(); await page.keyboard.down('d'); await page.waitForTimeout(220); await page.keyboard.up('d');
        assert.ok(Number(await world.getAttribute('data-commander-x')) > 10);
        await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
        const stopped = await world.getAttribute('data-commander-x');
        await world.focus(); await page.keyboard.down('d'); await page.waitForTimeout(100); await page.keyboard.up('d');
        assert.equal(await world.getAttribute('data-commander-x'), stopped);
        for (const panel of ['equipment', 'command', 'radio', 'objectives', 'help', 'replay']) {
          await page.evaluate(panel => { window.desktopFixture.selectAsset('cooling-1'); window.desktopFixture.setPanel(panel); }, panel);
          await page.locator(`[data-panel="${panel}"]`).waitFor();
          await noOverflow(page, `${panel} panel`);
          if (panel === 'equipment') await page.screenshot({ path: `${out}/equipment-${width}x${height}.png` });
          if (panel === 'equipment') {
            await page.getByLabel('Equipment section').selectOption('Work'); await page.getByRole('button', { name: 'Dispatch controls', exact: true }).click();
            await page.getByLabel('Technician', { exact: true }).selectOption('alex'); await noOverflow(page, 'technical inspection dispatch');
            await page.getByRole('button', { name: 'Dispatch inspect', exact: true }).click();
            assert.equal(await page.evaluate(() => window.desktopFixture.lastAction.args.technicianId), 'alex');
          }
          if (panel === 'command') {
            for (let i = 0; i < 4; i++) {
              await page.getByRole('button', { name: 'Dispatch controls', exact: true }).click();
              await noOverflow(page, `site dispatch ${i}`);
              const ceiling = page.getByLabel('Batch ceiling', { exact: true });
              if (await ceiling.count()) { await ceiling.fill(''); assert.equal(await page.getByRole('button', { name: 'Dispatch set batch ceiling', exact: true }).isDisabled(), true); await ceiling.fill('25'); }
              await page.locator('.blackout-dispatch > button').click();
              assert.equal(await page.evaluate(() => window.desktopFixture.lastAction.targetId), 'site');
              await page.getByRole('button', { name: 'Review details', exact: true }).click();
              if (i < 3) await page.getByRole('button', { name: 'Next action', exact: true }).click();
            }
            await page.getByLabel('Command section').selectOption('Movement'); await noOverflow(page, 'keyboard crew movement controls');
            await page.getByLabel('Command section').selectOption('Crew'); await noOverflow(page, 'crew assignment');
            await page.getByLabel('Command section').selectOption('Tasks'); await noOverflow(page, 'public task records');
          }
          if (panel === 'radio') {
            await page.getByLabel('Radio section').selectOption('Message'); await page.getByLabel('Recipient').selectOption('alex');
            await page.getByLabel('Message', { exact: true }).fill('word '.repeat(100));
            assert.equal((await allDraftPages(page)).length, 500);
          }
        }
        await page.screenshot({ path: `${out}/viewport-${width}x${height}.png` });
        return { bounds, noScroll: true, panels: 6, browserZoomEquivalent: width === 640 ? '200% of 1280x720 CSS viewport; physical DPI not claimed' : null };
      } finally { await page.close(); }
    });
  }
  await check('lossless radio, citations, provenance, receipts and original proposals', async () => {
    const page = await open();
    try {
      await page.evaluate(() => window.desktopFixture.setPanel('radio'));
      for (const [section, formatter] of [['Report','radioReport'], ['Citations','radioCitations'], ['Receipts','radioReceipts'], ['Provenance','radioProvenance']]) {
        await page.getByLabel('Radio section').selectOption(section);
        const expected = await page.evaluate(async formatter => (await import('/src/ui/desktop-copy.ts'))[formatter](window.desktopFixture.exchange), formatter);
        assert.equal(await allTextPages(page, `Radio ${section.toLowerCase()}`), expected);
      }
      await page.getByLabel('Radio section').selectOption('Proposals'); await page.getByRole('button', { name: 'Confirm proposal', exact: true }).click();
      assert.equal(await page.evaluate(() => window.desktopFixture.lastAction === window.desktopFixture.exchange.reply.response.proposals[0]), true);
      assert.equal(await page.evaluate(() => window.desktopFixture.lastAction.atSimTime), 50);
      await page.getByLabel('Radio section').selectOption('Message'); await page.getByLabel('Recipient').selectOption('alex');
      const text = 'X'.repeat(1600); await page.getByLabel('Message', { exact: true }).fill(text);
      assert.equal(await allDraftPages(page), text);
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      assert.equal(await page.evaluate(() => window.desktopFixture.lastMessage), text);
      await page.evaluate(() => window.desktopFixture.setPanel('command')); await page.evaluate(() => window.desktopFixture.setPanel('radio'));
      await page.getByLabel('Radio section').selectOption('Message'); assert.equal(await allDraftPages(page), text);
      await page.getByRole('button', { name: 'Enlarge text panel', exact: true }).click(); assert.equal(await allDraftPages(page), text);
      await page.getByLabel('Recipient').selectOption('jules'); assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), '');
      await page.getByLabel('Recipient').selectOption('alex'); assert.equal(await allDraftPages(page), text);
      const before = await page.getByRole('application').getAttribute('data-commander-x');
      await page.getByLabel('Message', { exact: true }).focus(); await page.keyboard.press('d');
      assert.equal(await page.getByRole('application').getAttribute('data-commander-x'), before);
      return { longDraft: 1600, exactIntentObject: true, originalAtSimTime: 50 };
    } finally { await page.close(); }
  });
  await check('E, timestamps, real movement intent and explicit busy cancellation', async () => {
    const page = await open();
    try {
      await page.getByRole('button', { name: 'Move commander north', exact: true }).click(); await page.getByRole('button', { name: 'Move commander north', exact: true }).click();
      await page.getByRole('application').focus(); await page.keyboard.press('e');
      assert.equal(await page.locator('[data-panel="equipment"]').count(), 1);
      assert.equal(await page.evaluate(() => window.desktopFixture.lastAction), null, 'E creates no engine command');
      await page.getByRole('button', { name: 'Read timestamps', exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.tutorial), 'timestamp_read');
      await page.getByRole('button', { name: 'Return to world', exact: true }).click();
      await page.getByRole('button', { name: 'Facilities Ready', exact: true }).click();
      const bounds = await page.getByRole('application').boundingBox();
      await page.mouse.click(bounds.x + bounds.width / 20 * 10.5, bounds.y + bounds.height / 12 * 6.5);
      assert.equal(await page.evaluate(() => window.desktopFixture.lastAction.action), 'move_crew');
      await page.evaluate(() => { const fixture = window.desktopFixture; fixture.setView({ ...fixture.view, crew: fixture.view.crew.map(c => c.id === 'alex' ? { ...c, taskId: 'busy' } : c) }); });
      await page.waitForFunction(() => window.desktopFixture.view.crew.find(c => c.id === 'alex').taskId === 'busy');
      await page.mouse.click(bounds.x + bounds.width / 20 * 11.5, bounds.y + bounds.height / 12 * 6.5);
      assert.deepEqual(await page.evaluate(() => window.desktopFixture.lastAction.args.destination), { x: 10, y: 6 });
      await page.evaluate(() => { const fixture = window.desktopFixture; fixture.selectAsset('cooling-1'); fixture.setPanel('equipment'); fixture.setView({ ...fixture.view, tasks: [{ id: 'busy', actorId: 'alex', targetId: 'cooling-1', action: 'inspect', status: 'working', startedAt: 70, arrivalAt: 74, completesAt: 104, progress: .1, path: [], reason: null }], affordances: [{ action: 'cancel_task', targetId: 'cooling-1', enabled: true, reason: null, technicianIds: [], travelSeconds: 0, workSeconds: 0 }] }); });
      await page.getByLabel('Equipment section').selectOption('Work'); await page.getByRole('button', { name: 'Dispatch controls', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Dispatch cancel task', exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: 'Choose task', exact: true }).click(); await page.getByRole('button', { name: 'Dispatch cancel task', exact: true }).click();
      assert.equal(await page.evaluate(() => window.desktopFixture.lastAction.args.taskId), 'busy');
      await page.evaluate(() => { const fixture = window.desktopFixture; fixture.setView({ ...fixture.view, tasks: fixture.view.tasks.map(t => ({ ...t, id: 'replacement' })) }); });
      await page.waitForFunction(() => window.desktopFixture.view.tasks[0].id === 'replacement');
      assert.equal(await page.getByRole('button', { name: 'Dispatch cancel task', exact: true }).isDisabled(), true, 'A stale selection cannot cancel its replacement');
      return { infoHasNoAction: true, timestampEvent: true, busyReplacementBlocked: true, obsoleteCancelBlocked: true };
    } finally { await page.close(); }
  });
  await check('100 updates preserve scene objects and input; pause/terminal/reduced motion', async () => {
    const page = await open(1366, 768, 'reduce');
    try {
      const counts = await page.evaluate(async () => {
        const { desktopSceneFor } = await import('/src/game/DesktopMap.tsx'), scene = desktopSceneFor(document.querySelector('.blackout-canvas'));
        const first = scene.children.getChildren()[0], before = scene.diagnostics();
        for (let i = 0; i < 100; i++) scene.setView({ view: window.desktopFixture.view, selectedAssetId: i % 2 ? 'cooling-1' : null, selectedCrewId: null, paused: true, speed: 4, session: 'mission', reducedMotion: true });
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        const target = document.querySelector('.blackout-canvas canvas'), pixels = target.getContext('2d').getImageData(0, 0, 320, 192).data;
        const paintedActors = scene.children.getChildren().filter(c => c.depth > 10).map(actor => {
          const source = document.createElement('canvas'); source.width = actor.frame.cutWidth; source.height = actor.frame.cutHeight;
          const context = source.getContext('2d'); context.drawImage(actor.frame.source.image, actor.frame.cutX, actor.frame.cutY, source.width, source.height, 0, 0, source.width, source.height);
          const reference = context.getImageData(0, 0, source.width, source.height).data; let opaque = 0, mismatches = 0;
          for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) { const i = (y * source.width + x) * 4; if (reference[i + 3] !== 255) continue; opaque++; const at = ((Math.round(actor.y) + y) * 320 + Math.round(actor.x) + x) * 4; if ([0, 1, 2].some(channel => reference[i + channel] !== pixels[at + channel])) mismatches++; }
          return { frame: actor.frame.name, opaque, mismatches, displayOriginX: actor.displayOriginX, displayOriginY: actor.displayOriginY };
        });
        return { before, after: scene.diagnostics(), retained: scene.children.getChildren().includes(first), paintedActors, baseFrames: scene.children.getChildren().filter(c => c.texture?.key === 'facility-v2' && c.frame.name === '__BASE').length };
      });
      assert.equal(counts.retained, true); assert.equal(counts.before.objects, counts.after.objects); assert.equal(counts.after.pointerListeners, 1); assert.equal(counts.baseFrames, 0);
      for (const actor of counts.paintedActors) { assert.ok(actor.opaque > 20); assert.equal(actor.mismatches, 0, `${actor.frame} must actually paint at its scene position`); }
      assert.deepEqual(counts.after.fanFrames, ['fan_0', 'fan_0']);
      await page.evaluate(() => { const f = window.desktopFixture; f.setView({ ...f.view, mission: { ...f.view.mission, status: 'failure', reason: 'Offline terminal test' } }); f.setPanel('radio'); });
      await page.getByLabel('Radio section').selectOption('Message'); await page.getByLabel('Recipient').selectOption('alex'); await page.getByLabel('Message', { exact: true }).fill('Check evidence');
      assert.equal(await page.getByRole('button', { name: 'Send message', exact: true }).isDisabled(), true);
      await noOverflow(page, 'terminal');
      return counts;
    } finally { await page.close(); }
  });
  await check('welcome focus and exact practice labels', async () => {
    const page = await open(640, 360, 'reduce', '?welcome');
    try {
      assert.equal(await page.getByRole('button', { name: 'Start practice', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Skip practice', exact: true }).count(), 1);
      await noOverflow(page, 'welcome zoom');
      await page.getByRole('button', { name: 'Start practice', exact: true }).click();
      await page.evaluate(() => window.desktopFixture.setCoach({ step: 7, total: 8, title: 'Ready', text: 'Start a fresh incident when you are ready.', target: null }));
      await page.getByRole('button', { name: 'Start timed incident', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Start timed incident', exact: true }).count(), 1);
      return { labels: ['Start practice', 'Skip practice', 'Start timed incident'] };
    } finally { await page.close(); }
  });
} finally {
  writeFileSync(`${out}/browser-results.json`, JSON.stringify({ results, failures }, null, 2));
  await browser.close();
}
assert.deepEqual(failures, [], 'desktop browser checks');
