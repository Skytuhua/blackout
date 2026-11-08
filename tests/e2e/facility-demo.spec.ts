import { expect, test } from '@playwright/test';
import { advanceTo, begin, equipment, suggested } from './desktop-helpers';

test('large demo map shows real equipment and keeps other areas unavailable', async ({ page }) => {
  await begin(page);
  const map = page.getByRole('region', { name: 'Public facility map' });
  await expect(map).toHaveAttribute('data-art', 'ready');
  await expect(page.getByText(/Only the current facility is simulated/)).toBeVisible();
  await expect(map.getByRole('button', { name: 'Overview', exact: true })).toHaveCount(0);
  await expect(map.getByRole('button', { name: 'Current simulated facility', exact: true })).toHaveCount(0);
  await expect(map.locator('[data-demo-unavailable]')).toHaveCount(4);
  await expect(map.locator('canvas')).toHaveAttribute('data-illustrative', 'true');
  await equipment(page, 'controller');
  const inspection = await suggested(page, 'alex', 'Check cooling controls');
  expect(inspection.status).toBe('accepted');
  await advanceTo(page, inspection.eta! + 2);
  await expect(page.locator('.conv-history-window > article[data-entry-id="report-' + inspection.taskId + '"]')).toBeVisible();
});

for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [640, 360]]) test(`large demo map remains bounded at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await begin(page);
  if (width === 640) await page.getByRole('button', { name: 'World', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Public facility map' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Equipment context' })).toBeVisible();
  await expect(page.locator('[data-crew-label="alex"]')).toBeVisible();
  await expect(page.locator('[data-crew-label="jules"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([width, height]);
  if (width === 640) await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send to Alex' })).toBeVisible();
});
