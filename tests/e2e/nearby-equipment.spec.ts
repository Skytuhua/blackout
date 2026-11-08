import { expect, test } from '@playwright/test';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { HostArchive } from '../../src/persistence/host-archive';
import { request } from '../sim/mission-policy';

for (const target of ['controller', 'rack-1']) for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [640, 360]]) test(`automatic ${target} details stay scoped and bounded at ${width}x${height}`, async ({ page }) => {
  const engine = initialize(hotRestart, `nearby-${width}`); engine.step(10);
  const receipt = engine.applyCommand(request(engine, 'inspect', target, { technicianId: 'alex' })); engine.step(receipt.eta! + 2 - 10);
  const source = new HostArchive(`nearby-${width}`).build(engine.exportRecord());
  await page.setViewportSize({ width, height }); await page.goto('/');
  await page.evaluate(async ({ runId, text }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('blackout-local-runs', 1); r.onupgradeneeded = () => { for (const name of ['runs', 'checkpoints']) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('runs', 'readwrite'); tx.objectStore('runs').put(text, runId); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  }, { runId: source.runId, text: JSON.stringify(source) });
  await page.getByRole('button', { name: 'Start guided game', exact: true }).click(); await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Saved games', exact: true }).click(); await page.getByRole('combobox', { name: 'Saved game', exact: true }).selectOption(source.runId); await page.getByRole('button', { name: 'Resume save', exact: true }).click();
  await expect(page.locator('.conv-header time')).toHaveText(`${Math.floor(source.finalCheckpoint.simTime / 60)}:${String(source.finalCheckpoint.simTime % 60).padStart(2, '0')}`);
  if (width < 1000) await page.getByRole('button', { name: 'World', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Nearby equipment details', exact: true });
  await expect(panel).toBeVisible(); await expect(panel).toContainText(target === 'controller' ? 'Cooling control' : 'Rack A1'); await expect(panel).toContainText('Alex nearby'); if (target === 'controller' && width > 1000) await expect(panel).toContainText('Start conditions met');
  const panelBox = (await panel.boundingBox())!, world = (await page.getByRole('region', { name: 'Facility world', exact: true }).boundingBox())!;
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(world.x + world.width); expect(panelBox.y).toBeGreaterThanOrEqual(world.y); expect(panelBox.y + panelBox.height).toBeLessThan(height);
  const next = panel.getByRole('button', { name: 'Next equipment reading', exact: true });
  while (await next.count() && await next.isEnabled()) { const bounds = (await next.boundingBox())!; expect(bounds.y + bounds.height).toBeLessThan(height); await next.click(); }
  await expect(page.getByRole('alert', { name: 'Facility notification', exact: true })).toBeVisible();
  expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([width, height]);
});
