import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = 'C:/Users/user/Documents/Blackout/.local/conv-01-independent/MENU-01';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [], failures = [], errors = [], requests = [];
const settle = page => page.evaluate(async () => { await document.fonts.ready; for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
const patch = async (page, data) => { await page.evaluate(data => window.menuFixture.patch(data), data); await settle(page); };
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function open(width = 1280, height = 720) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(4000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) requests.push(r.url()); });
  await page.goto('http://127.0.0.1:5192/tests/ui/conversation-menu/fixture.html');
  await button(page, 'Open menu fixture').click(); await settle(page); return page;
}
async function check(name, run) {
  try { const detail = await run(); results.push({ name, status: 'passed', detail }); console.log(`PASS ${name}`); }
  catch (e) { failures.push({ name, error: e.stack }); console.error(`FAIL ${name}: ${e.message}`); }
}
async function calls(page, name) { return page.evaluate(name => window.menuFixture.events.filter(e => e.name === name), name); }
async function readAll(page, label) {
  const next = button(page, `Next ${label.toLowerCase()} page`), text = page.getByLabel(label, { exact: true });
  if (!(await next.count())) return text.textContent();
  const chunks = [];
  for (let i = 0; i < 150; i++) { await settle(page); chunks.push(await text.textContent()); if (!(await next.isEnabled())) return chunks.join(''); await next.click(); }
  throw new Error('Reader did not terminate');
}
try {
  if (process.argv.includes('--behavior') || !process.argv.includes('--visual')) {
    await check('history retains >20 entries, exact report/proposal, only selected reads, stable late updates', async () => {
      const page = await open(); await button(page, 'History').click();
      await settle(page);
      assert.deepEqual(await calls(page, 'read'), [{ name: 'read', args: ['alex', ['alex-24']] }]);
      assert.equal(await page.locator('.cm-direct-text').filter({ hasText: 'alex whole entry 24.' }).isVisible(), true);
      for (let i = 0; i < 24; i++) await button(page, 'Previous entry').click();
      assert.equal((await calls(page, 'read')).some(e => e.args[1].includes('alex-0')), false, 'summary alone must not mark the report read');
      await button(page, 'Read report').click();
      assert.deepEqual(await calls(page, 'open'), [{ name: 'open', args: ['alex', 'alex-0'] }]);
      assert.equal(await readAll(page, 'Message text'), await page.evaluate(() => window.menuFixture.longText));
      await page.getByLabel('Reader section').selectOption('section:original-evidence');
      assert.equal(await page.getByLabel('Message text', { exact: true }).textContent(), 'Original section, complete.');
      await button(page, 'Back to entry').click();
      await button(page, 'Check controls · Jules').click();
      assert.deepEqual(await calls(page, 'proposal'), [{ name: 'proposal', args: ['opaque-original-proposal-id'] }]);
      await page.evaluate(() => { const threads = structuredClone(window.menuFixtureProps.conversations); threads[0].entries.push({ id: 'alex-late', actorId: 'alex', at: 30, kind: 'live', text: 'Late response', unread: true }); window.menuFixture.patch({ conversations: threads }); });
      await settle(page);
      assert.equal(await button(page, 'Read report').isVisible(), true);
      assert.equal(await page.getByText('Late response', { exact: true }).count(), 0);
      await page.getByLabel('History character').selectOption('jules');
      assert.equal(await page.locator('.cm-direct-text').filter({ hasText: 'jules whole entry 24.' }).isVisible(), true);
      await page.getByLabel('History character').selectOption('alex');
      assert.equal(await button(page, 'Read report').isVisible(), true);
      const reads = await calls(page, 'read');
      assert.equal(reads.some(e => e.args[0] === 'alex' && e.args[1].includes('alex-late')), false);
      assert.equal(reads.some(e => e.args[0] === 'alex' && e.args[1].includes('jules-24')), false);
      assert.equal(reads.some(e => e.args[0] === 'alex' && e.args[1].includes('alex-0')), true);
      await patch(page, { reader: { actorId: 'sam', entryId: 'alex-0' } });
      assert.equal(await page.getByText('This entry is no longer available.', { exact: true }).isVisible(), true);
      await patch(page, { reader: null, conversations: [] });
      assert.equal(await page.getByText('This entry is no longer available.', { exact: true }).isVisible(), true);
      await page.close(); return { readEvents: reads.length };
    });
    await check('save callbacks preserve IDs, unavailable/raw export, busy and removed selection', async () => {
      const page = await open(); await button(page, 'Saved games').click();
      for (const name of ['Resume save', 'Replay save', 'Export original']) await button(page, name).click();
      await page.getByLabel('Saved game', { exact: true }).selectOption('unavailable-original-B');
      assert.equal(await button(page, 'Resume save').isEnabled(), false); assert.equal(await button(page, 'Replay save').isEnabled(), false);
      assert.equal(await page.locator('.cm-direct-text').filter({ hasText: 'VERSION_MISMATCH' }).isVisible(), true);
      await button(page, 'Export original').click();
      await patch(page, { busy: true });
      for (const name of ['Save game', 'Refresh saves', 'Resume save', 'Replay save', 'Export original']) assert.equal(await button(page, name).isEnabled(), false);
      await patch(page, { busy: false, savedRuns: [{ runId: 'save-original-A', scenarioId: 'Hot Restart', simTime: 80 }] });
      assert.equal(await page.getByText('This saved game is no longer listed. Choose a saved game or refresh.', { exact: true }).isVisible(), true);
      assert.equal(await button(page, 'Resume save').isEnabled(), false); assert.equal(await button(page, 'Export original').isEnabled(), false);
      await patch(page, { savedRuns: [] });
      assert.equal(await page.getByText('No saved games listed. Save the current game or refresh the list.', { exact: true }).isVisible(), true);
      assert.deepEqual(await calls(page, 'resume'), [{ name: 'resume', args: ['save-original-A'] }]);
      assert.deepEqual(await calls(page, 'replay'), [{ name: 'replay', args: ['save-original-A'] }]);
      assert.deepEqual(await calls(page, 'export'), [{ name: 'export', args: ['save-original-A'] }, { name: 'export', args: ['unavailable-original-B'] }]);
      await page.close();
    });
    await check('guidance, speed, restart/practice and authoritative proposal guards', async () => {
      const page = await open(); await page.getByRole('checkbox', { name: 'Guidance' }).click();
      await button(page, 'Game options').click();
      for (const name of ['2×', '4×', '1×', 'Restart mission', 'Start practice']) await button(page, name).click();
      await patch(page, { busy: true });
      for (const name of ['2×', 'Restart mission', 'Start practice']) assert.equal(await button(page, name).isEnabled(), false);
      await patch(page, { busy: false }); await button(page, 'Back').click(); await button(page, 'History').click();
      for (let i = 0; i < 24; i++) await button(page, 'Previous entry').click();
      for (const status of ['accepted', 'sending', 'rejected', 'ready']) {
        await page.evaluate(status => { const threads = structuredClone(window.menuFixtureProps.conversations); threads[0].entries[0].proposals[0].status = status; window.menuFixture.patch({ conversations: threads }); }, status); await settle(page);
        assert.equal(await button(page, 'Check controls · Jules').isEnabled(), status === 'ready');
      }
      await patch(page, { busy: true }); assert.equal(await button(page, 'Check controls · Jules').isEnabled(), false);
      assert.deepEqual(await calls(page, 'guidance'), [{ name: 'guidance', args: [false] }]);
      assert.deepEqual(await calls(page, 'speed'), [2, 4, 1].map(speed => ({ name: 'speed', args: [speed] })));
      assert.equal((await calls(page, 'restart')).length, 1); assert.equal((await calls(page, 'practice')).length, 1);
      await page.close();
    });
    await check('modal focus containment, prop updates, IME Escape, dismissal and actual opener return', async () => {
      const page = await open();
      assert.equal(await button(page, 'Close menu').evaluate(e => e === document.activeElement), true);
      await page.keyboard.press('Shift+Tab'); assert.equal(await page.getByRole('checkbox', { name: 'Guidance' }).evaluate(e => e === document.activeElement), true);
      await page.keyboard.press('Tab'); assert.equal(await button(page, 'Close menu').evaluate(e => e === document.activeElement), true);
      await button(page, 'Replay and results').click(); await page.getByLabel('Earlier second').focus();
      await patch(page, { notice: 'Host message arrived.' }); assert.equal(await page.getByLabel('Earlier second').evaluate(e => e === document.activeElement), true);
      await page.getByLabel('Earlier second').evaluate(e => e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true })));
      assert.equal(await page.getByRole('dialog').count(), 1);
      await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await button(page, 'Open menu fixture').evaluate(e => e === document.activeElement), true);
      await page.keyboard.press('Escape'); assert.equal((await calls(page, 'close')).length, 1);
      await button(page, 'Open menu fixture').click(); await button(page, 'How to play').click(); await button(page, 'Back').click();
      assert.equal(await button(page, 'How to play').evaluate(e => e === document.activeElement), true);
      await page.close();
    });
  }
  if (process.argv.includes('--visual')) {
    await check('batched geometry, complete short states, long readers and advanced slot', async () => {
      const measured = [];
      for (const [width, height, font] of [[1280, 720, 16], [1366, 768, 16], [1920, 1080, 16], [640, 360, 16], [1280, 720, 32]]) {
        const page = await open(width, height); await page.evaluate(font => { document.documentElement.style.fontSize = `${font}px`; }, font); await settle(page);
        const inspect = async state => {
          await settle(page);
          const data = await page.evaluate(() => {
            const panel = document.querySelector('[role=dialog]'), box = panel.getBoundingClientRect(), problems = [];
            for (const e of panel.querySelectorAll('*')) {
              const s = getComputedStyle(e), r = e.getBoundingClientRect();
              if (s.visibility === 'hidden' || s.display === 'none' || !r.width || !r.height || e.closest('[aria-hidden=true]') || ['OPTION', 'path', 'svg'].includes(e.tagName)) continue;
              if (e.tagName !== 'SELECT' && e.tagName !== 'INPUT' && ((e.clientWidth && e.scrollWidth > e.clientWidth + 2) || (e.clientHeight && e.scrollHeight > e.clientHeight + 2))) problems.push(`overflow ${e.tagName}.${e.className} ${e.scrollWidth}x${e.scrollHeight}/${e.clientWidth}x${e.clientHeight}`);
              if (r.left < box.left || r.top < box.top || r.right > box.right + 1 || r.bottom > box.bottom + 1 || r.right > innerWidth || r.bottom > innerHeight) problems.push(`bounds ${e.tagName} ${e.textContent.slice(0, 60)}`);
              if (['BUTTON', 'SELECT', 'INPUT'].includes(e.tagName) && parseFloat(s.fontSize) < 16) problems.push('small text');
            }
            for (const e of panel.querySelectorAll('.blackout-font-probe')) if (getComputedStyle(e).visibility !== 'hidden') problems.push('visible M probe');
            return { width: box.width, height: box.height, problems, text: panel.innerText };
          });
          assert.deepEqual(data.problems, [], `${width}x${height}/${font} ${state}`);
          measured.push({ width, height, font, state, panel: [data.width, data.height] });
          if (state === 'home' && font === 16 && width > 640) { assert.ok(data.width <= 560); assert.ok(data.height < 500); }
          await page.screenshot({ path: `${out}/${width}x${height}-${font}-${state}.png` });
        };
        await inspect('home');
        await patch(page, { savedRuns: [], notice: 'Save requested; waiting for storage.', error: 'Storage blocked. Refresh to retry.' });
        await inspect('messages');
        await button(page, 'Saved games').click(); await inspect('empty-saves');
        assert.equal(await page.locator('.blackout-font-probe').count(), 0); assert.equal(await page.getByText('1 / 1', { exact: true }).count(), 0);
        await patch(page, { notice: '', error: '', savedRuns: [{ runId: 'long-original-save-id-'.repeat(10), scenarioId: 'Hot Restart', simTime: 80, unavailableReason: 'VERSION_MISMATCH: original bytes can be exported.' }] });
        await page.getByLabel('Saved game', { exact: true }).selectOption({ index: 1 }); await inspect('populated-saves');
        await button(page, 'Back').click(); await button(page, 'History').click(); await inspect('history');
        for (let i = 0; i < 24; i++) await button(page, 'Previous entry').click();
        await button(page, 'Read report').click(); await inspect('long-reader');
        assert.equal(await readAll(page, 'Message text'), await page.evaluate(() => window.menuFixture.longText));
        await button(page, 'Back to entry').click(); await button(page, 'Back').click();
        if (!(await button(page, 'Replay and results').count())) await button(page, 'More menu actions').click();
        await button(page, 'Replay and results').click(); await inspect('advanced');
        await page.close();
      }
      return measured;
    });
  }
  assert.deepEqual(errors, [], 'runtime errors'); assert.deepEqual(requests, [], 'no provider/engine requests');
} finally {
  writeFileSync(`${out}/${process.env.MENU_RECEIPT ?? (process.argv.includes('--visual') ? 'visual' : 'behavior')}.json`, JSON.stringify({ results, failures, errors, requests }, null, 2));
  await browser.close();
}
if (failures.length) process.exitCode = 1;
