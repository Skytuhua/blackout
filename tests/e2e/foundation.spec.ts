import { expect, test } from '@playwright/test';
import { action, begin, elapsed } from './desktop-helpers';

test('production mission uses real paused dispatch and opens replayable instructions', async ({ page }) => {
  await begin(page);
  await expect(page.getByRole('heading', { name: 'BLACKOUT', exact: true })).toBeVisible();
  await action(page, 'inspect', [6, 9]);
  await expect(page.locator('.blackout-crew')).toContainText('traveling');
  expect(await elapsed(page)).toBe(0);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByLabel('Instructions', { exact: true })).toContainText('YOUR ROLE');
});
