import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ComparisonResult, SavedRunRecord } from '../../src/shared/contracts';
import { advanceTo, begin, closeMenu, elapsed, equipment, menu, readPages, readReport, selectActor, suggested } from './desktop-helpers';

test('first-time desktop entry offers real safe practice with no page scrolling', async ({ page }) => {
  test.setTimeout(20000);
  let calls = 0; await page.route('**/api/llm/turn', route => { calls++; return route.abort(); });
  await page.setViewportSize({ width: 1280, height: 720 }); await begin(page, true);
  await expect(page.getByRole('heading', { name: 'Practice: choose Alex and request a cooling check.', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Facility world', exact: true })).toBeVisible();
  await expect(page.locator('.conv-header')).toContainText('Critical service 100%');
  await expect(page.getByRole('button', { name: 'Check cooling controls', exact: true })).toBeEnabled();
  await advanceTo(page, 10);
  await expect(page.locator('.conv-header')).toContainText('Critical service 100%');
  await expect(page.getByRole('alert', { name: 'Facility notification', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([1280, 720]);
  expect(calls).toBe(0);
});

test('guided practice teaches automatic travel and a delivered inspection before starting a clean incident', async ({ page }) => {
  test.setTimeout(60000);
  let calls = 0; await page.route('**/api/llm/turn', route => { calls++; return route.abort(); });
  await begin(page, true); await equipment(page, 'controller');
  await expect(page.locator('.conv-assignment')).toContainText('Ready');
  expect(await elapsed(page)).toBe(0);
  const inspection = await suggested(page, 'alex', 'Check cooling controls'); expect(inspection.eta).toBe(37);
  await expect(page.locator('.conv-assignment')).toContainText('Walking');
  await advanceTo(page, 3);
  const progress = page.getByRole('progressbar', { name: 'Alex task progress', exact: true });
  expect(Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  await advanceTo(page, inspection.eta!);
  await expect(page.locator('.conv-assignment')).toContainText('Report on the way');
  await expect(page.locator('.conv-history-window > article[data-entry-id="report-' + inspection.taskId + '"]')).toHaveCount(0);
  await advanceTo(page, inspection.eta! + 2);
  const evidence = await readReport(page, 'alex', inspection.taskId!);
  expect(evidence).toContain('prerequisite ready: true');
  expect(evidence).toContain('Observed T+00:37'); expect(evidence).toContain('Received T+00:39');
  expect(evidence).toMatch(/Evidence: observation-\d+/); expect(evidence).toContain('Source: report:alex');
  // Healthy practice keeps executing real physics beyond the incident's 600-second limit.
  await advanceTo(page, 610);
  await expect(page.getByRole('heading', { name: /^Mission (success|failure)$/ })).toHaveCount(0);
  await expect(page.locator('.conv-header')).toContainText('Critical service 100%');
  const options = await menu(page, 'Game options'); await options.getByRole('button', { name: 'Restart mission', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); expect(await elapsed(page)).toBe(0);
  for (const actor of ['alex', 'jules', 'sam'] as const) { await selectActor(page, actor); await expect(page.locator('.conv-assignment')).toContainText('Ready'); }
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.locator('.conv-history-window > article.conv-entry-report')).toHaveCount(0);
  const history = await menu(page, 'History');
  await expect(history.getByRole('button', { name: 'Previous entry', exact: true })).toBeDisabled();
  expect(calls).toBe(0);
});

test('native local saves resume paused; scoped replay and comparison stay inside the desktop panel', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1280, height: 720 });
  let calls = 0; await page.route('**/api/llm/turn', route => { calls++; return route.abort(); });
  await begin(page); await advanceTo(page, 10);
  const cap = await suggested(page, 'sam', 'Pause background jobs'); await advanceTo(page, 20);
  const home = await menu(page); await home.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(home).toContainText('Mission saved locally');
  await home.getByRole('button', { name: 'Saved games', exact: true }).click();
  const saves = home.getByRole('combobox', { name: 'Saved game', exact: true }); await saves.selectOption({ index: 1 });
  const runId = (await saves.inputValue())!;
  const originalBytes = await page.evaluate(async id => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('blackout-local-runs', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<string>((resolve, reject) => { const request = db.transaction('runs', 'readonly').objectStore('runs').get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); } finally { db.close(); }
  }, runId);
  const download = page.waitForEvent('download'); await home.getByRole('button', { name: 'Export original', exact: true }).click();
  const file = await download; expect(file.suggestedFilename()).toMatch(/^blackout-.*\.json$/);
  expect(await readFile((await file.path())!, 'utf8')).toBe(originalBytes);
  const source = JSON.parse(originalBytes) as SavedRunRecord;
  expect(source.runId).toBe(runId); expect(source.commands).toHaveLength(1);
  expect(source.commands[0]).toMatchObject({ at: 10, intent: { action: 'pause_batch' }, receipt: { taskId: cap.taskId, status: 'accepted' } });
  await home.getByRole('button', { name: 'Resume save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.conv-header').getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await expect.poll(() => elapsed(page)).toBe(20);
  await page.clock.fastForward(5000); expect(await elapsed(page)).toBe(20);
  const list = await menu(page, 'Saved games'); await list.getByRole('combobox', { name: 'Saved game', exact: true }).selectOption(runId);
  await list.getByRole('button', { name: 'Replay save', exact: true }).click();
  await expect.poll(() => elapsed(page)).toBe(0);
  await page.getByRole('button', { name: 'Replay and results', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play replay', exact: true })).toBeEnabled();
  const cursor = page.getByRole('slider', { name: 'Recorded cursor', exact: true }); await cursor.focus(); await cursor.press('End');
  await expect.poll(() => elapsed(page)).toBe(20);
  const section = page.getByRole('combobox', { name: 'After action section', exact: true });
  await section.selectOption('outcome'); expect(await readPages(page, 'Outcome metrics')).toContain('ORIGINAL RUN');
  for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.getByRole('dialog').boundingBox(); expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([width, height]);
  }
  await section.selectOption('compare'); await page.getByRole('spinbutton', { name: 'Earlier simulation second', exact: true }).fill('0');
  await page.getByRole('button', { name: 'Run comparison', exact: true }).click();
  await expect(page.getByLabel('Comparison metrics', { exact: true })).toContainText('COMPUTED ALTERNATIVE');
  expect(await readPages(page, 'Comparison metrics')).toContain('Equal horizon: T+0:20');
  await page.getByRole('combobox', { name: 'Comparison section', exact: true }).selectOption('proof');
  const comparison = JSON.parse(await readPages(page, 'Comparison evidence')) as ComparisonResult;
  expect(comparison.status).toBe('complete'); expect(comparison.supportedHorizon).toBe(20);
  if (comparison.status !== 'complete') throw new Error('Complete comparison expected');
  expect(comparison.baseline.horizon).toBe(comparison.alternative.horizon);
  // Pausing earlier retains more deferred work; it never erases arrivals.
  expect(comparison.alternative.batchBacklog).toBeGreaterThan(comparison.baseline.batchBacklog);
  for (const ledger of [comparison.baseline, comparison.alternative]) expect(ledger.batchCompleted + ledger.batchBacklog).toBeCloseTo(ledger.batchArrivals, 6);
  await section.selectOption('playback'); await page.getByRole('button', { name: 'Return to mission', exact: true }).click();
  if (await page.getByRole('dialog').count()) await closeMenu(page);
  expect(await elapsed(page)).toBe(20); await expect(page.locator('.conv-header').getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  const preserved = await menu(page, 'Saved games'); await preserved.getByRole('combobox', { name: 'Saved game', exact: true }).selectOption(runId);
  const finalDownload = page.waitForEvent('download'); await preserved.getByRole('button', { name: 'Export original', exact: true }).click();
  expect(await readFile((await (await finalDownload).path())!, 'utf8')).toBe(originalBytes); expect(calls).toBe(0);
});
