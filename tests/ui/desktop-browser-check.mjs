import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const origin = process.env.DESKTOP_FIXTURE_ORIGIN ?? 'http://127.0.0.1:5176';
const out = '.local/desktop-ui'; mkdirSync(out, { recursive: true });
const results = [], browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [[1280,720], [1366,768], [1920,1080]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/src/ui/desktop-fixture.html`);
    await page.locator('.blackout-canvas canvas').waitFor();
    await page.waitForFunction(() => document.querySelector('.blackout-canvas')?.dataset.art !== 'loading');
    const bounds = await page.locator('.blackout-canvas').boundingBox();
    assert.ok(bounds.width % 320 === 0 && bounds.height % 192 === 0);
    assert.ok(bounds.x >= 0 && bounds.y >= 48 && bounds.y + bounds.height <= height - 80);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth), true);
    const world = page.getByRole('application'); await world.focus();
    await page.keyboard.down('d'); await page.waitForTimeout(300); await page.keyboard.up('d');
    assert.ok(Number(await world.getAttribute('data-commander-x')) > 10);
    await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
    const stopped = await world.getAttribute('data-commander-x');
    await world.focus(); await page.keyboard.down('d'); await page.waitForTimeout(150); await page.keyboard.up('d');
    assert.equal(await world.getAttribute('data-commander-x'), stopped);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${out}/milestone-${width}x${height}.png` });
    results.push({ viewport: `${width}x${height}`, integerWorld: bounds, noDocumentOverflow: true, keyboardMovement: true, pauseFreeze: true, pageErrors: errors });
    await page.close();
  }
  writeFileSync(`${out}/browser-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
