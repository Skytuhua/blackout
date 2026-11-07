import { expect, test } from '@playwright/test';
test('production React/Phaser shell completes a typed worker round trip', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'BLACKOUT', exact: true })).toBeVisible();
  await expect(page.getByText('Development fixture', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('Worker connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check worker round trip' }).click();
  await expect(page.getByText('Projected view received', { exact: true })).toBeVisible();
});
