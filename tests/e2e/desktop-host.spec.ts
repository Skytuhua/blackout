import { expect, test } from '@playwright/test';
import { action, advanceTo, begin, elapsed, equipment, runAction } from './desktop-helpers';

test('first-time desktop entry offers real safe practice with no page scrolling', async ({ page }) => {
  test.setTimeout(20000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: /Start (safe )?practice/i }).click({ timeout: 6000 });
  await expect(page.getByText(/^Practice$/)).toBeVisible();
  await expect(page.getByRole('application')).toBeVisible();
  await expect(page.getByLabel('Practice guidance', { exact: true })).toContainText('Walk the floor');
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight }));
  expect(layout.scrollWidth).toBe(layout.width); expect(layout.scrollHeight).toBe(layout.height);
});

test('guided practice teaches real travel and a delivered inspection before starting a clean incident', async ({ page }) => {
  test.setTimeout(60000);
  let providerCalls = 0; await page.route('**/api/llm/turn', route => { providerCalls++; return route.abort(); });
  await begin(page, true); await page.getByRole('button', { name: 'Resume simulation', exact: true }).click();
  await page.getByRole('button', { name: 'Move commander east', exact: true }).click();
  await page.getByRole('button', { name: 'Move commander north', exact: true }).click();
  await page.getByRole('button', { name: 'Move commander north', exact: true }).click();
  await expect(page.getByLabel('Practice guidance', { exact: true })).toContainText('Look at equipment');
  await page.getByRole('button', { name: 'View nearby equipment', exact: true }).click();
  await expect(page.getByLabel('Practice guidance', { exact: true })).toContainText('Meet your technicians');
  await page.getByRole('button', { name: /^Facilities / }).click();
  await expect(page.getByLabel('Practice guidance', { exact: true })).toContainText('Give a movement order');
  await page.getByRole('button', { name: 'Command', exact: true }).click();
  await page.getByRole('combobox', { name: 'Command section', exact: true }).selectOption('Movement');
  await page.getByRole('button', { name: 'Move selected technician', exact: true }).click();
  await expect(page.locator('.blackout-crew')).toContainText('traveling');
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await advanceTo(page, 20);
  await expect(page.getByLabel('Practice guidance', { exact: true })).toContainText('Check the timestamp');
  await equipment(page, 8, 8); await page.getByRole('button', { name: 'Read timestamps', exact: true }).click();
  await expect(page.getByLabel('Practice guidance', { exact: true })).toContainText('Request a technical inspection');
  await action(page, 'inspect', [8, 8]); await expect(page.getByLabel('Practice guidance', { exact: true })).toContainText('Wait for the report');
  await advanceTo(page, 90); await expect(page.getByLabel('Practice guidance', { exact: true })).toContainText('Ready for Hot Restart');
  await page.locator('.blackout-coach').getByRole('button', { name: 'Start timed incident', exact: true }).click();
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  expect(await elapsed(page)).toBe(0); await expect(page.locator('.blackout-coach')).toHaveCount(0);
  await expect(page.locator('.blackout-crew')).not.toContainText('traveling');
  await page.getByRole('button', { name: 'Command', exact: true }).click();
  await page.getByRole('combobox', { name: 'Command section', exact: true }).selectOption('Tasks');
  await expect(page.getByLabel('Public tasks', { exact: true })).toContainText('No public tasks');
  expect(providerCalls).toBe(0);
});

test('native local saves resume paused; scoped replay and comparison stay inside the desktop panel', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1280, height: 720 });
  let providerCalls = 0; await page.route('**/api/llm/turn', route => { providerCalls++; return route.abort(); });
  await begin(page); await advanceTo(page, 10); await action(page, 'pause batch'); await advanceTo(page, 20);
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await runAction(page, 'Save current mission');
  await expect(page.getByLabel('Saved run metadata', { exact: true })).toContainText('LOCAL SAVED RUN');
  const download = page.waitForEvent('download'); await runAction(page, 'Export original');
  expect((await download).suggestedFilename()).toMatch(/^blackout-.*\.json$/);
  await runAction(page, 'Resume save');
  await expect(page.getByRole('button', { name: 'Resume simulation', exact: true })).toBeEnabled(); expect(await elapsed(page)).toBe(20);
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await runAction(page, 'Replay save');
  await expect(page.locator('.blackout-top time')).toHaveText('T+00:00');
  await page.getByRole('combobox', { name: 'After action section', exact: true }).selectOption('playback');
  await expect(page.getByRole('button', { name: 'Play replay', exact: true })).toBeEnabled(); expect(await elapsed(page)).toBe(0);
  await page.getByRole('slider', { name: 'Recorded cursor', exact: true }).focus(); await page.keyboard.press('End');
  await expect(page.locator('.blackout-top time')).toHaveText('T+00:20');
  await page.getByRole('combobox', { name: 'After action section', exact: true }).selectOption('outcome');
  await expect(page.getByLabel('Outcome metrics', { exact: true })).toContainText('ORIGINAL RUN');
  for (const [width, height] of [[1280,720], [1366,768], [1920,1080]]) {
    await page.setViewportSize({ width, height }); await page.clock.runFor(20);
    const bounds = await page.locator('.blackout-panel-content').evaluate(e => ({ height: e.clientHeight, content: e.scrollHeight }));
    expect(bounds.content).toBeLessThanOrEqual(bounds.height + 1);
    const world = await page.evaluate(() => ({ height: innerHeight, width: innerWidth, scrollHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth }));
    expect(world.scrollHeight).toBe(world.height); expect(world.scrollWidth).toBe(world.width);
  }
  await page.getByRole('combobox', { name: 'After action section', exact: true }).selectOption('compare'); await page.getByRole('spinbutton', { name: 'Earlier simulation second', exact: true }).fill('0');
  await page.getByRole('button', { name: 'Run comparison', exact: true }).click();
  await expect(page.getByLabel('Comparison metrics', { exact: true })).toContainText('Equal horizon: T+0:20');
  await page.getByRole('combobox', { name: 'After action section', exact: true }).selectOption('runs'); await runAction(page, 'Return to mission');
  expect(await elapsed(page)).toBe(20); await expect(page.getByRole('button', { name: 'Resume simulation', exact: true })).toBeEnabled(); expect(providerCalls).toBe(0);
});
