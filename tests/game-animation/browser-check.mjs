import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const out = process.env.ANIM_EVIDENCE_DIR ?? 'C:/Users/user/Documents/Blackout/.local/conv-01-independent/ANIM-01';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const evidence = { synthetic: true, results: [], errors: [], apiRequests: [] };
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
try {
  for (const scale of [1, 3]) {
    const page = await browser.newPage({ viewport: { width: 1050, height: 760 }, reducedMotion: 'no-preference' });
    page.on('pageerror', error => evidence.errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) evidence.apiRequests.push(request.url()); });
    await page.goto(`http://127.0.0.1:5191/tests/game-animation/fixture.html?scale=${scale}`);
    await page.waitForFunction(() => !!window.animationFixture);
    const canvas = page.locator('canvas');
    const frame = async name => {
      await page.evaluate(async () => { for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame); });
      return hash(await canvas.screenshot({ path: `${out}/${name}-${scale}x.png` }));
    };
    const baseline = await frame('active');
    const initial = await page.evaluate(() => window.animationFixture.diagnostics());
    assert.equal(initial.graphics, 1);
    assert.deepEqual(new Set(initial.sample.pixels.map(p => p.kind)), new Set(['tool', 'airflow', 'rack']));
    await page.evaluate(() => window.animationFixture.render(99, true));
    assert.equal(await frame('paused'), baseline, 'pause must preserve exact rendered phase');
    await page.evaluate(() => window.animationFixture.render(99, true, true));
    const reduced = await frame('reduced');
    await page.evaluate(() => window.animationFixture.render(1000, true, true));
    assert.equal(await frame('reduced-later'), reduced, 'reduced motion must be static');
    await page.evaluate(() => window.animationFixture.render(1.87));
    assert.notEqual(await frame('later'), baseline, 'supplied presentation clock must animate pixels');
    const repeated = await page.evaluate(() => {
      let maxCommands = 0;
      for (let i = 0; i < 2000; i++) {
        window.animationFixture.render(i / 60);
        maxCommands = Math.max(maxCommands, ...window.animationFixture.diagnostics().commands);
      }
      return { ...window.animationFixture.diagnostics(), maxCommands };
    });
    assert.equal(repeated.objects, initial.objects);
    assert.equal(repeated.graphics, 1);
    assert.deepEqual(repeated.listeners, initial.listeners);
    assert.ok(repeated.maxCommands < 256, 'clear keeps the actual Phaser command buffer bounded');
    await page.evaluate(() => { window.animationFixture.cancel(); window.animationFixture.render(4); });
    assert.equal(await page.evaluate(() => window.animationFixture.diagnostics().sample.pixels.some(p => p.kind === 'tool')), false);
    await page.evaluate(() => { window.animationFixture.reset(); window.animationFixture.render(0, true); });
    assert.deepEqual(await page.evaluate(() => window.animationFixture.diagnostics().sample), { pixels: [], idleOffsets: [] });
    await page.evaluate(() => { window.animationFixture.destroy(); window.animationFixture.destroy(); });
    assert.equal(await page.evaluate(() => window.animationFixture.diagnostics().graphics), 0);
    evidence.results.push({ scale, baseline, reduced, initialObjects: initial.objects, repeatedObjects: repeated.objects, graphics: repeated.graphics, maxCommands: repeated.maxCommands, status: 'passed' });
    await page.close();
  }
  assert.deepEqual(evidence.errors, []);
  assert.deepEqual(evidence.apiRequests, []);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  writeFileSync(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2));
  await browser.close();
}
