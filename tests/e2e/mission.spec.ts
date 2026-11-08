import { expect, test } from '@playwright/test';
import { advanceTo, begin, elapsed, equipment, exportCurrent, menu, readReport, selectActor, suggested } from './desktop-helpers';

test('offline controls complete Hot Restart through inspection, repair, sustainable batch and fresh verification', async ({ page }) => {
  test.setTimeout(120000);
  let calls = 0; await page.route('**/api/llm/turn', route => { calls++; return route.abort(); });
  await begin(page); await advanceTo(page, 10);
  const cap = await suggested(page, 'sam', 'Pause background jobs'); expect(cap.eta).toBe(13);
  const inspection = await suggested(page, 'alex', 'Check cooling controls'); expect(inspection.eta).toBe(47);
  await expect(page.locator('.conv-assignment')).toContainText('Walking');
  await advanceTo(page, 15);
  expect(await readReport(page, 'sam', cap.taskId!)).toContain('batch ceiling: 0 units/s');
  expect(await readReport(page, 'sam', cap.taskId!, 'Full message')).toContain('deferred work is retained');
  await selectActor(page, 'alex');
  await advanceTo(page, inspection.eta! - 1);
  await expect(page.getByRole('progressbar', { name: 'Alex task progress', exact: true })).toHaveAttribute('aria-valuetext', /Checking/);
  await advanceTo(page, inspection.eta!);
  await expect(page.locator('.conv-assignment')).toContainText('Report on the way');
  await expect(page.locator('.conv-history-window > article[data-entry-id="report-' + inspection.taskId + '"]')).toHaveCount(0);
  await advanceTo(page, inspection.eta! + 2);
  const diagnosis = await readReport(page, 'alex', inspection.taskId!);
  expect(diagnosis).toContain('controller'); expect(diagnosis).toContain('prerequisite ready: false');
  expect(diagnosis).toContain('Observed T+00:47'); expect(diagnosis).toContain('Received T+00:49');
  const repair = await suggested(page, 'alex', 'Repair the controls'); expect(repair.eta).toBe(169);
  await advanceTo(page, repair.eta! - 1);
  await expect(page.locator('.conv-assignment')).toContainText('Working');
  await advanceTo(page, repair.eta! + 2);
  expect(await readReport(page, 'alex', repair.taskId!, 'Full message')).toContain('restart delay and temperature verification');
  await equipment(page, 'cooling-1');
  await advanceTo(page, 195);
  await expect(page.getByRole('heading', { name: 'Mission success', exact: true })).toHaveCount(0);
  await advanceTo(page, 260);
  const resumed = await suggested(page, 'sam', 'Resume background jobs'); expect(resumed.eta).toBe(263);
  await advanceTo(page, 265);
  const batch = await readReport(page, 'sam', resumed.taskId!);
  expect(batch).toContain('batch ceiling: 30 units/s');
  await advanceTo(page, 322);
  await expect(page.getByRole('heading', { name: 'Mission success', exact: true })).toHaveCount(0);
  await advanceTo(page, 324);
  const verification = await suggested(page, 'sam', 'Check recovery'); expect(verification.eta).toBe(334);
  await advanceTo(page, verification.eta! + 1);
  await expect(page.getByRole('heading', { name: 'Mission success', exact: true })).toHaveCount(0);
  await advanceTo(page, 400);
  await expect(page.getByRole('heading', { name: 'Mission success', exact: true })).toBeVisible();
  expect(await elapsed(page)).toBe(336);
  const verified = await readReport(page, 'sam', verification.taskId!);
  expect(verified).toContain('recovery verified: true'); expect(verified).toContain('verification readings at: 330 s');
  await page.clock.fastForward(10000); expect(await elapsed(page)).toBe(336);
  await selectActor(page, 'alex'); await expect(page.locator('.conv-suggested')).toBeDisabled();
  // Inspect the native exported record only after completion; never inject or alter a checkpoint.
  const source = await exportCurrent(page);
  expect(source.commands.map(command => [command.at, command.intent.action, command.receipt.status])).toEqual([
    [10, 'pause_batch', 'accepted'], [10, 'inspect', 'accepted'], [49, 'repair_cooling', 'accepted'],
    [260, 'set_batch_ceiling', 'accepted'], [324, 'verify_recovery', 'accepted'],
  ]);
  expect(source.events.find(event => event.type === 'mission.stability_held')).toMatchObject({ simTime: 324, payload: { stabilitySeconds: 60 } });
  expect(source.events.find(event => event.type === 'mission.success')?.simTime).toBe(336);
  expect(source.events.some(event => event.type === 'thermal_trip')).toBe(false);
  const cooling = source.observations.filter(observation => observation.assetId === 'cooling-1' && observation.field === 'running');
  expect(cooling.find(observation => observation.observedAt === 195)?.value).toBe(false);
  expect(cooling.find(observation => observation.observedAt === 200)?.value).toBe(true);
  expect(source.telemetry.find(sample => sample.simTime === 171)!.hottestTemperatureC).toBeGreaterThan(source.telemetry.find(sample => sample.simTime === 260)!.hottestTemperatureC);
  const report = source.dialogue.find(message => message.id === 'report-' + verification.taskId)!;
  for (const id of report.evidenceIds) expect(verified).toContain(id);
  const referenced = source.observations.filter(observation => report.evidenceIds.includes(observation.id));
  expect(referenced.find(observation => observation.field === 'prerequisite_ready')).toMatchObject({ value: true, observedAt: 169 });
  const freshFields = ['inlet_temperature_c', 'batch_processing_rate', 'critical_served_fraction', 'active_overload'];
  const readings = referenced.filter(observation => freshFields.includes(observation.field));
  expect(readings).toHaveLength(18);
  expect(readings.every(observation => observation.receivedAt <= 336 && 336 - observation.observedAt >= 0 && 336 - observation.observedAt <= 10)).toBe(true);
  expect(calls).toBe(0);
});

test('idle mission fails at the exact terminal tick and exposes a fresh retry without a provider', async ({ page }) => {
  test.setTimeout(120000);
  let calls = 0; await page.route('**/api/llm/turn', route => { calls++; return route.abort(); });
  await begin(page); await advanceTo(page, 600);
  await expect(page.getByRole('heading', { name: 'Mission failure', exact: true })).toBeVisible();
  expect(await elapsed(page)).toBe(505);
  await page.clock.fastForward(10000); expect(await elapsed(page)).toBe(505);
  await expect(page.locator('.conv-suggested')).toBeDisabled();
  const options = await menu(page, 'Game options'); await options.getByRole('button', { name: 'Restart mission', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.conv-header').getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  expect(await elapsed(page)).toBe(0);
  for (const actor of ['alex', 'jules', 'sam'] as const) { await selectActor(page, actor); await expect(page.locator('.conv-assignment')).toContainText('Ready'); }
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.locator('.conv-history-window > article.conv-entry-report')).toHaveCount(0);
  await suggested(page, 'alex', 'Check cooling controls'); expect(calls).toBe(0);
});
