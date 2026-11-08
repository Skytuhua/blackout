import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(`(() => {
    const Native = window.AudioContext;
    window.__soundProof = { contexts: 0, decoded: 0, starts: 0, nonzero: false, active: 0, peak: 0 };
    if (!Native) return;
    window.AudioContext = class extends Native {
      constructor(options) { super(options); window.__soundProof.contexts++; }
      decodeAudioData(data) { return super.decodeAudioData(data).then(buffer => { window.__soundProof.decoded++; window.__soundProof.nonzero ||= buffer.getChannelData(0).some(value => Math.abs(value) > .001); return buffer; }); }
      createBufferSource() { const source = super.createBufferSource(), start = source.start.bind(source); source.start = (...args) => { const proof = window.__soundProof; proof.starts++; proof.active++; proof.peak = Math.max(proof.peak, proof.active); source.addEventListener('ended', () => proof.active--, { once: true }); return start(...args); }; return source; }
    };
  })();`);
});

for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [640, 360]]) test(`Sound controls stay reachable without scrolling at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await page.goto('/');
  await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const sound = page.getByRole('button', { name: 'Sound', exact: true });
  for (let i = 0; i < 3 && !await sound.isVisible(); i++) await page.getByRole('button', { name: 'More menu actions', exact: true }).click();
  await sound.click();
  for (const control of [page.getByRole('checkbox', { name: 'Enable sound', exact: true }), page.getByRole('slider', { name: 'Sound volume', exact: true }), page.getByRole('button', { name: 'Test sound', exact: true })]) {
    await expect(control).toBeVisible(); const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('real cue PCM unlocks on a gesture and Sound controls persist without affecting play', async ({ page }) => {
  let modelCalls = 0; await page.route('**/api/llm/turn', route => { modelCalls++; return route.abort(); });
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Start guided game', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__soundProof.contexts)).toBe(0);
  await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('button', { name: 'Sound', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Enable sound', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Test sound', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__soundProof.starts)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).__soundProof.nonzero)).toBe(true);
  expect(await page.evaluate(() => (window as any).__soundProof.contexts)).toBe(1);
  const volume = page.getByRole('slider', { name: 'Sound volume', exact: true }); await volume.focus(); await volume.press('End');
  await expect(volume).toHaveValue('100'); await page.getByRole('checkbox', { name: 'Enable sound', exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Test sound', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('blackout.audio.preferences.v1')!))).toEqual({ muted: true, volume: 1 });
  await page.reload(); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('button', { name: 'Sound', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Enable sound', exact: true })).not.toBeChecked(); await expect(page.getByRole('slider', { name: 'Sound volume', exact: true })).toHaveValue('100');
  expect(modelCalls).toBe(0);
});

test('actual crew work, report delivery, pause and successful native save request their own cues', async ({ page }) => {
  const requested = new Set<string>(); page.on('request', r => { const match = new URL(r.url()).pathname.match(/\/audio\/retro-v1\/(.+)\.wav$/); if (match) requested.add(match[1]); });
  await page.route('**/api/llm/turn', route => route.abort());
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.locator('.conv-header').getByRole('combobox', { name: 'Simulation speed', exact: true }).selectOption('4');
  await page.getByRole('button', { name: 'Check cooling controls', exact: true }).click();
  await expect.poll(() => requested.has('order-accepted')).toBe(true);
  await expect.poll(() => requested.has('task-start'), { timeout: 10000 }).toBe(true);
  await expect.poll(() => requested.has('report-arrived'), { timeout: 20000 }).toBe(true);
  expect(requested.has('task-complete')).toBe(true);
  await page.locator('.conv-header').getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(() => requested.has('simulation-pause')).toBe(true);
  await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Mission saved locally'); await expect.poll(() => requested.has('save-complete')).toBe(true);
  expect(await page.evaluate(() => (window as any).__soundProof.peak)).toBeLessThanOrEqual(10);
});
