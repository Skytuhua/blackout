import { expect, test } from '@playwright/test';
import { begin, elapsed, menu, suggested } from './desktop-helpers';

test('production mission accepts a real paused order with automatic travel and opens instructions', async ({ page }) => {
  await page.route('**/api/llm/turn', route => route.abort());
  await begin(page);
  await expect(page.getByRole('heading', { name: 'BLACKOUT', exact: true })).toBeVisible();
  const receipt = await suggested(page, 'alex', 'Check cooling controls');
  expect(receipt.taskId).toMatch(/^task-/); expect(receipt.eta).toBeGreaterThan(30);
  await expect(page.locator('.conv-assignment')).toContainText('Walking');
  await expect(page.getByRole('progressbar', { name: 'Alex task progress', exact: true })).toHaveAttribute('aria-valuenow', '0');
  expect(await elapsed(page)).toBe(0);
  const help = await menu(page, 'How to play');
  await expect(help.getByRole('combobox', { name: 'Help topic', exact: true })).toBeVisible();
  await expect(help).toContainText('Characters travel and work automatically.');
  await help.getByRole('combobox', { name: 'Help topic', exact: true }).selectOption({ label: 'Read the evidence' });
  await expect(help).toContainText('what the team observed and when');
});
