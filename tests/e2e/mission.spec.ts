import { expect, test, type Page } from '@playwright/test';

async function elapsed(page: Page) {
  const text = await page.locator('.bo-header-status').innerText();
  const match = text.match(/Simulation\s+(\d+):(\d+)/);
  if (!match) throw new Error('Mission clock unavailable.');
  return Number(match[1]) * 60 + Number(match[2]);
}
async function begin(page: Page) {
  const date = new Date('2026-11-07T12:00:00Z');
  await page.clock.install({ time: date }); await page.clock.pauseAt(date);
  await page.goto('/'); await page.getByRole('button', { name: 'Start mission', exact: true }).click();
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
}
async function advanceTo(page: Page, target: number) {
  await page.getByRole('button', { name: 'Resume simulation', exact: true }).click();
  while (await elapsed(page) < target) {
    const before = await elapsed(page);
    await page.getByRole('combobox', { name: 'Simulation speed', exact: true }).selectOption(target - before >= 4 ? '4' : '1');
    await page.clock.fastForward(1000);
    await expect.poll(() => elapsed(page)).toBeGreaterThan(before);
    if (await page.getByText('Mission ended', { exact: true }).isVisible()) return;
  }
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
}
async function dispatch(page: Page, action: string, asset?: string) {
  if (asset) await page.getByRole('button', { name: asset, exact: true }).click();
  const block = page.locator('.bo-action').filter({ has: page.getByRole('button', { name: `Dispatch ${action}`, exact: true }) });
  const technician = block.getByRole('combobox', { name: 'Technician', exact: true });
  if (await technician.count()) await technician.selectOption('alex');
  await block.getByRole('button', { name: `Dispatch ${action}`, exact: true }).click();
  await expect(page.locator('.mission-controls [role=status]').first()).toContainText('accepted');
  await expect(page.getByRole('button', { name: 'Step 1 second', exact: true })).toBeEnabled();
}

test('offline controls complete Hot Restart through inspection, repair, sustainable batch and fresh verification', async ({ page }) => {
  test.setTimeout(90000);
  await begin(page); await advanceTo(page, 10);
  await dispatch(page, 'pause batch'); await dispatch(page, 'inspect', 'Cooling control controller');
  await advanceTo(page, 43); await dispatch(page, 'repair cooling');
  await advanceTo(page, 163); await dispatch(page, 'independent reading', 'Rack A1 rack');
  await advanceTo(page, 255);
  const cap = page.locator('.bo-site-actions .bo-action').filter({ has: page.getByRole('button', { name: 'Dispatch set batch ceiling', exact: true }) });
  await cap.getByRole('spinbutton').fill('30'); await cap.getByRole('button').click();
  await expect(page.locator('.mission-controls [role=status]').first()).toContainText('accepted');
  await expect(page.getByRole('button', { name: 'Step 1 second', exact: true })).toBeEnabled();
  await advanceTo(page, 319); await dispatch(page, 'verify recovery');
  await advanceTo(page, 400);
  await expect(page.getByRole('heading', { name: 'Mission success', exact: true })).toBeVisible();
  expect(await elapsed(page)).toBe(331);
  await expect(page.getByRole('button', { name: 'Resume simulation', exact: true })).toBeDisabled();
});

test('idle mission fails at the exact terminal tick and exposes retry without a provider', async ({ page }) => {
  test.setTimeout(90000);
  await begin(page); await advanceTo(page, 600);
  await expect(page.getByRole('heading', { name: 'Mission failure', exact: true })).toBeVisible();
  expect(await elapsed(page)).toBe(505);
  await page.clock.fastForward(10000); expect(await elapsed(page)).toBe(505);
  await page.getByRole('button', { name: 'Retry mission', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start mission', exact: true })).toBeEnabled();
});
