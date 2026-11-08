import { expect, test } from '@playwright/test';

for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [640, 360]]) test(`conversation controls fit ${width}x${height} with a larger composer and no default footer`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await page.goto('/');
  await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const composer = page.getByRole('textbox', { name: 'Message Alex', exact: true });
  const lines = await composer.evaluate(element => { const style = getComputedStyle(element); return (element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / parseFloat(style.lineHeight); });
  expect(lines).toBeGreaterThanOrEqual(width > 1000 ? 3 : 2);
  await expect(page.getByRole('button', { name: 'Older messages', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Newer messages', exact: true })).toHaveCount(0);
  await expect(page.locator('.conv-history-controls')).toHaveCount(0); await expect(page.locator('.conv-guidance')).toHaveCount(0);
  if (width > 1000) {
    await expect(page.getByLabel('Team assignments', { exact: true }).locator('.blackout-portrait')).toHaveCount(3);
    for (const actor of ['alex', 'jules', 'sam']) await expect(page.locator(`.conv-map-crew [data-actor=${actor}] .blackout-portrait`)).toHaveCSS('background-image', /facility-v2\.png/);
  }
  const bounds = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight }));
  expect(bounds.scrollWidth).toBe(bounds.width); expect(bounds.scrollHeight).toBe(bounds.height);
  await expect(page.getByRole('button', { name: 'Send to Alex', exact: true })).toBeVisible();
  await expect(page.locator('.conv-suggested')).toBeVisible();
});

test('Sam portrait idles, freezes on pause and respects reduced motion without hiding names', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  const portrait = page.locator('.conv-map-crew [data-actor=sam] .blackout-portrait');
  const transforms = await portrait.evaluate(async element => {
    const animation = element.getAnimations()[0]; if (!animation) throw new Error('Sam idle animation is missing');
    await animation.ready;
    animation.currentTime = 0; const first = getComputedStyle(element).transform;
    animation.currentTime = 2000; return [first, getComputedStyle(element).transform];
  }); expect(transforms[0]).not.toBe(transforms[1]);
  await page.locator('.conv-header').getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(portrait).toHaveCSS('animation-play-state', 'paused');
  const frozen = await portrait.evaluate(element => element.getAnimations()[0].currentTime); await page.waitForTimeout(100);
  expect(await portrait.evaluate(element => element.getAnimations()[0].currentTime)).toBe(frozen);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(portrait).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.conv-map-crew [data-actor=sam] strong')).toHaveText('Sam');
});

test('Shift Enter adds a newline and Enter outside composition submits', async ({ page }) => {
  let sends = 0; await page.route('**/api/llm/turn', async route => { sends++; const input = route.request().postDataJSON(); await route.fulfill({ json: { kind: 'fallback', runId: input.runId, requestId: input.requestId, actorId: input.actorId, mode: 'scripted', reason: 'scripted', message: 'Offline.', facts: [] } }); });
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'Message Alex', exact: true }); await composer.fill('Line one'); await composer.press('Shift+Enter'); await composer.pressSequentially('Line two');
  await expect(composer).toHaveValue('Line one\nLine two'); expect(sends).toBe(0);
  await composer.dispatchEvent('compositionstart', { data: 'n' }); await composer.press('Control+Enter'); expect(sends).toBe(0);
  await composer.dispatchEvent('compositionend', { data: 'n' }); await composer.press('Control+Enter'); await expect.poll(() => sends).toBe(1);
});
