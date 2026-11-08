import { expect, test, type Page } from '@playwright/test';
import { begin } from './desktop-helpers';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { initialize } from '../../src/sim/engine';
import { createFacilityDemoProjector } from '../../src/game/facility-demo-projection';

async function openMap(page: Page, width = 1280, height = 720) {
  await page.setViewportSize({ width, height });
  await begin(page);
  if (width === 640) await page.getByRole('button', { name: 'World', exact: true }).click();
  const map = page.getByRole('region', { name: 'Public facility map' });
  await expect(map).toHaveAttribute('data-art', 'ready');
  return map;
}

for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [640, 360]]) {
  test(`one map exposes bounded zoom controls at ${width}x${height}`, async ({ page }) => {
    const map = await openMap(page, width, height);
    await expect(map.getByRole('button', { name: 'Overview', exact: true })).toHaveCount(0);
    await expect(map.getByRole('button', { name: 'Current simulated facility', exact: true })).toHaveCount(0);
    for (const name of ['Zoom in', 'Zoom out', 'Reset view']) {
      const control = map.getByRole('button', { name, exact: true });
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height).toBeTruthy();
    }
    await expect(map.getByText('Drag or use arrow keys to pan · Scroll to zoom')).toBeVisible();
    await expect.poll(() => page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([width, height]);
  });
}

test('zoom, wheel, drag and keyboard pan preserve selection of real equipment', async ({ page }) => {
  const map = await openMap(page);
  const surface = map.getByLabel('Facility map', { exact: true });
  const canvas = map.locator('canvas');
  const initial = await canvas.boundingBox();
  if (!initial) throw new Error('Map canvas unavailable');

  await map.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoomed = await canvas.boundingBox();
  expect(zoomed!.width).toBeGreaterThan(initial.width);
  const viewport = await surface.boundingBox();
  if (!viewport) throw new Error('Map interaction surface unavailable');
  const cx = viewport.x + viewport.width / 2, cy = viewport.y + viewport.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -250);
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(zoomed!.width);

  let before = await canvas.boundingBox();
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 45, cy + 25, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => (await canvas.boundingBox())!.x).not.toBe(before!.x);
  before = await canvas.boundingBox();
  await surface.focus();
  await expect(surface).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await canvas.boundingBox())!.x).not.toBe(before!.x);

  await map.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(initial.width, 0);
  await map.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const projection = createFacilityDemoProjector()(initialize(hotRestart, 'map-e2e').observe('player'));
  if (projection.status !== 'available') throw new Error(projection.reason);
  const controller = projection.view.knownTopology.assets.find(asset => asset.id === 'controller')!;
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Map canvas unavailable after zoom');
  const x = box.x + (controller.x + controller.width / 2) / projection.view.knownTopology.width * box.width;
  const y = box.y + (controller.y + controller.height / 2) / projection.view.knownTopology.height * box.height;
  expect(x).toBeGreaterThan(viewport.x); expect(x).toBeLessThan(viewport.x + viewport.width);
  expect(y).toBeGreaterThan(viewport.y); expect(y).toBeLessThan(viewport.y + viewport.height);
  await page.mouse.click(x, y);
  await expect(page.getByRole('combobox', { name: 'Equipment context', exact: true })).toHaveValue('controller');
  await expect.poll(() => page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([1280, 720]);
});
