import { expect, test } from '@playwright/test';
import { action, advanceTo, begin, elapsed } from './desktop-helpers';

test('offline controls complete Hot Restart through inspection, repair, sustainable batch and fresh verification', async ({ page }) => {
  test.setTimeout(120000);
  await begin(page); await advanceTo(page, 10);
  await action(page, 'pause batch'); await action(page, 'inspect', [6, 9]);
  await advanceTo(page, 49); await action(page, 'repair cooling', [6, 9]);
  await advanceTo(page, 169); await action(page, 'independent reading', [2, 2]);
  await advanceTo(page, 260); await action(page, 'set batch ceiling', undefined, { ceiling: '30' });
  await advanceTo(page, 324); await action(page, 'verify recovery');
  await advanceTo(page, 400);
  await expect(page.locator('.blackout-result')).toContainText('Mission success');
  expect(await elapsed(page)).toBe(336);
  await expect(page.getByRole('button', { name: 'Resume simulation', exact: true })).toBeDisabled();
});

test('idle mission fails at the exact terminal tick and exposes a fresh retry without a provider', async ({ page }) => {
  test.setTimeout(120000);
  await begin(page); await advanceTo(page, 600);
  await expect(page.locator('.blackout-result')).toContainText('Mission failure');
  expect(await elapsed(page)).toBe(505);
  await page.clock.fastForward(10000); expect(await elapsed(page)).toBe(505);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume simulation', exact: true })).toBeEnabled();
  expect(await elapsed(page)).toBe(0);
  await expect(page.locator('.blackout-crew')).toContainText('Ready');
});
