import { expect, type Page } from '@playwright/test';

export async function elapsed(page: Page) {
  const match = (await page.locator('.blackout-top time').innerText()).match(/T\+(\d+):(\d+)/);
  if (!match) throw new Error('Mission clock unavailable.');
  return Number(match[1]) * 60 + Number(match[2]);
}
export async function begin(page: Page, practice = false) {
  const date = new Date('2026-11-07T12:00:00Z');
  await page.clock.install({ time: date }); await page.clock.pauseAt(date);
  await page.goto('/'); await page.getByRole('button', { name: practice ? 'Start practice' : 'Skip practice', exact: true }).click();
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await expect(page.locator('.blackout-canvas')).toHaveAttribute('data-art', 'atlas');
}
export async function advanceTo(page: Page, target: number) {
  if (await elapsed(page) >= target) return;
  await page.getByRole('button', { name: '4x', exact: true }).click();
  await page.getByRole('button', { name: 'Resume simulation', exact: true }).click();
  while (await elapsed(page) < target && !(await page.locator('.blackout-result').count())) {
    const before = await elapsed(page); await page.clock.fastForward(250);
    await expect.poll(() => elapsed(page)).toBeGreaterThan(before);
  }
  if (!(await page.locator('.blackout-result').count())) await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
}
export async function equipment(page: Page, x: number, y: number) {
  // Let Phaser refresh its CSS-to-native input bounds after a context panel resize.
  await page.clock.runFor(20);
  const world = page.locator('.blackout-canvas'); const box = await world.boundingBox();
  if (!box) throw new Error('World unavailable');
  await world.click({ position: { x: (x + .5) * box.width / 20, y: (y + .5) * box.height / 12 } });
  await expect(page.getByRole('combobox', { name: 'Equipment section', exact: true })).toBeVisible();
}
export async function action(page: Page, name: string, destination?: [number, number], options: { ceiling?: string; cancel?: boolean } = {}) {
  if (destination) {
    await equipment(page, ...destination);
    await page.getByRole('combobox', { name: 'Equipment section', exact: true }).selectOption('Work');
  } else {
    await page.getByRole('button', { name: 'Command', exact: true }).click();
    await page.getByRole('combobox', { name: 'Command section', exact: true }).selectOption('Site');
  }
  if (await page.getByRole('button', { name: 'Dispatch controls', exact: true }).count()) await page.getByRole('button', { name: 'Dispatch controls', exact: true }).click();
  const button = page.getByRole('button', { name: `Dispatch ${name}`, exact: true });
  for (let i = 0; i < 16 && !(await button.count()); i++) await page.getByRole('button', { name: 'Next action', exact: true }).click();
  const tech = page.getByRole('combobox', { name: 'Technician', exact: true });
  if (await tech.count()) await tech.selectOption('alex');
  if (options.ceiling) await page.getByRole('spinbutton', { name: 'Batch ceiling', exact: true }).fill(options.ceiling);
  if (options.cancel) await page.getByRole('button', { name: 'Choose task', exact: true }).click();
  await button.click(); await feedback(page, `${name} accepted`);
}
export async function feedback(page: Page, text: string | RegExp) {
  await page.getByRole('button', { name: 'Read command feedback', exact: true }).click();
  await expect(page.getByLabel('Mission information', { exact: true })).toContainText(text);
}
export async function radio(page: Page, message: string) {
  await page.getByRole('button', { name: 'Radio', exact: true }).click();
  await page.getByRole('combobox', { name: 'Radio section', exact: true }).selectOption('Message');
  await page.getByRole('combobox', { name: 'Recipient', exact: true }).selectOption('alex');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(message);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}
export async function radioSection(page: Page, section: string) {
  await page.getByRole('button', { name: 'Radio', exact: true }).click();
  await page.getByRole('combobox', { name: 'Radio section', exact: true }).selectOption(section);
}
export async function runAction(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Run action', exact: true }).selectOption({ label });
  await page.getByRole('button', { name: 'Go', exact: true }).click();
}
export async function readPages(page: Page, label: string) {
  let content = '';
  const previous = page.getByRole('button', { name: `Previous ${label.toLowerCase()} page`, exact: true });
  while (await previous.isEnabled()) await previous.click();
  for (;;) {
    content += await page.getByLabel(label, { exact: true }).innerText();
    const next = page.getByRole('button', { name: `Next ${label.toLowerCase()} page`, exact: true });
    if (!(await next.isEnabled())) return content;
    await next.click();
  }
}
