import { expect, test } from '@playwright/test';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { HostArchive } from '../../src/persistence/host-archive';
import { request } from '../sim/mission-policy';

test('a real native saved replay opens the original delivered diagnosis and exact readings', async ({ page }) => {
  const engine = initialize(hotRestart, 'report-browser-source'); engine.step(10);
  expect(engine.applyCommand(request(engine, 'repair_cooling', 'controller', { technicianId: 'alex' })).status).toBe('rejected');
  const receipt = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
  engine.step(receipt.eta! + 2 - 10);
  const source = new HostArchive('report-browser-source').build(engine.exportRecord());
  const report = source.dialogue.find(message => message.id === `report-${receipt.taskId}`)!;
  let calls = 0; await page.route('**/api/llm/turn', route => { calls++; return route.abort(); });
  await page.goto('/');
  await page.evaluate(async ({ runId, serializedRecord }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('blackout-local-runs', 1); request.onupgradeneeded = () => { for (const store of ['runs', 'checkpoints']) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('runs', 'readwrite'); tx.objectStore('runs').put(serializedRecord, runId); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  }, { runId: source.runId, serializedRecord: JSON.stringify(source) });
  await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Saved games', exact: true }).click();
  await page.getByRole('combobox', { name: 'Saved game', exact: true }).selectOption(source.runId);
  await page.getByRole('button', { name: 'Replay save', exact: true }).click();
  await page.getByRole('button', { name: 'Replay and results', exact: true }).click();
  await page.getByLabel('Recorded cursor', { exact: true }).focus(); await page.keyboard.press('End');
  await expect(page.getByLabel('Recorded cursor', { exact: true })).toHaveValue(String(source.finalCheckpoint.simTime));
  await page.getByRole('button', { name: 'Close menu', exact: true }).click();
  const original = page.locator(`.conv-history-window > article[data-entry-id="${report.id}"]`);
  await original.getByRole('button', { name: 'Read report', exact: true }).click();
  await expect(page.getByLabel('Message text', { exact: true })).toContainText('Cooling start condition: not met');
  await expect(page.getByLabel('Message text', { exact: true })).not.toContainText('Timestamped field report delivered');
  await page.getByRole('combobox', { name: 'Section', exact: true }).selectOption({ label: 'Evidence' });
  await expect(page.getByLabel('Message text', { exact: true })).toContainText('prerequisite ready: false');
  for (const id of report.evidenceIds) await expect(page.getByLabel('Message text', { exact: true })).toContainText(id);
  expect(calls).toBe(0);
});

test('a newly delivered live report opens its findings directly without a model request', async ({ page }) => {
  let calls = 0; await page.route('**/api/llm/turn', route => { calls++; return route.abort(); });
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('button', { name: 'Game options', exact: true }).click();
  await page.getByRole('button', { name: '4\u00d7', exact: true }).click(); await page.getByRole('button', { name: 'Close menu', exact: true }).click();
  await page.locator('.conv-header').getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Check cooling controls', exact: true }).click();
  const report = page.locator('.conv-history-window > article.conv-entry-report').last();
  await report.getByRole('button', { name: 'Read report', exact: true }).click({ timeout: 20000 });
  await expect(page.getByLabel('Message text', { exact: true })).toContainText('Check: finished');
  await expect(page.getByLabel('Message text', { exact: true })).toContainText('Cooling start condition: not met');
  await expect(page.locator('.conv-assignment')).not.toContainText('Report delivered');
  expect(calls).toBe(0);
});
