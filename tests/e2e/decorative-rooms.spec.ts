import { expect, test } from '@playwright/test';
import { begin } from './desktop-helpers';

for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [640, 360]]) test(`extra rooms are visual-only at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await begin(page);
  if (width === 640) await page.getByRole('button', { name: 'World', exact: true }).click();
  const map = page.getByRole('region', { name: 'Public facility map' });
  await expect(map).toHaveAttribute('data-art', 'ready');
  await map.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(map.locator('[data-demo-room]')).toHaveCount(6);
  await expect(page.getByText(/Only the current facility is simulated/)).toBeVisible();
  const canvas = map.locator('canvas'), box = await canvas.boundingBox();
  if (!box) throw new Error('Map canvas is not visible');
  await canvas.click({ position: { x: box.width / 12, y: box.height / 4 } });
  await expect(map).toHaveAttribute('data-room', 'overview');
  await expect(map.locator('.fm-rooms button').filter({ hasText: 'Current simulated facility' })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([width, height]);
});
