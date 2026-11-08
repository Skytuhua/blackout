import { expect, test } from '@playwright/test';

for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [640, 360]]) test(`compact Menu is wired and bounded at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await page.goto('/');
  await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  const opener = page.getByRole('button', { name: 'Menu', exact: true }); await opener.click();
  const menu = page.getByRole('dialog'); await expect(menu).toHaveAccessibleName('Menu');
  await expect(page.locator('.conv-menu')).toHaveCount(0);
  await expect(menu.getByRole('checkbox', { name: 'Guidance', exact: true })).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.width * box.height).toBeLessThan(width * height * (width > 1000 ? .35 : .95));
  await expect(menu.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  await menu.getByRole('button', { name: 'Saved games', exact: true }).click();
  await expect(menu).toContainText('No saved games listed.');
  await expect(menu.locator('.blackout-page-controls')).toHaveCount(0);
  const clipped = await menu.locator('button:visible,select:visible,input:visible').evaluateAll(elements => elements.filter(element => { const r = element.getBoundingClientRect(); return r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; }).length);
  expect(clipped).toBe(0);
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(opener).toBeFocused();
  expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([width, height]);
});

test('Menu saves and opens the populated native list, history and actual replay controls', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Mission saved locally');
  await page.getByRole('button', { name: 'Saved games', exact: true }).click();
  await page.getByRole('combobox', { name: 'Saved game', exact: true }).selectOption({ index: 1 });
  await expect(page.getByRole('button', { name: 'Export original', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'History character', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Replay and results', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'After action section', exact: true })).toHaveValue('playback');
  await expect(page.getByRole('combobox', { name: 'Run action', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Replay instructions', { exact: true })).toContainText('Choose');
  await page.getByRole('combobox', { name: 'After action section', exact: true }).selectOption('provenance');
  await expect(page.getByLabel('Original wire transcript', { exact: true })).toBeVisible();
});
