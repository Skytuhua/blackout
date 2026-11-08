import { expect, test } from '@playwright/test';
test('accepted inspection shows public travel progress and stops when explicitly canceled', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.locator('.conv-suggested').click();
  await expect(page.getByRole('progressbar', { name: 'Alex task progress', exact: true })).toBeVisible();
  await expect(page.locator('.conv-task-progress')).toContainText('Walking');
  await page.getByRole('button', { name: 'Stop current task', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Alex task progress', exact: true })).toHaveCount(0);
});
