import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { CommandReceipt, SavedRunRecord } from '../../src/shared/contracts';

export const names = { alex: 'Alex', jules: 'Jules', sam: 'Sam' } as const;
export type Actor = keyof typeof names;

export async function elapsed(page: Page) {
  const match = (await page.locator('.conv-header time').innerText()).match(/^(\d+):(\d+)$/);
  if (!match) throw new Error('Mission clock unavailable.');
  return Number(match[1]) * 60 + Number(match[2]);
}
export async function begin(page: Page, practice = false) {
  const date = new Date('2026-11-07T12:00:00Z');
  // Freeze the empty document before navigation; same-instant install/pause races under parallel load.
  await page.clock.install({ time: new Date(date.getTime() - 60000) }); await page.clock.pauseAt(date);
  await page.goto('/');
  await page.getByRole('button', { name: practice ? 'Practice' : 'Start guided game', exact: true }).click();
  await page.locator('.conv-header').getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('.conv-canvas')).toHaveAttribute('data-art', 'atlas');
  expect(await elapsed(page)).toBe(0);
}
export async function menu(page: Page, section?: string) {
  await page.locator('.conv-header').getByRole('button', { name: 'Menu', exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (section) {
    const button = dialog.getByRole('button', { name: section, exact: true });
    if (!(await button.count())) await dialog.getByRole('button', { name: 'More menu actions', exact: true }).click();
    await button.click();
  }
  return dialog;
}
export async function closeMenu(page: Page) {
  await page.getByRole('button', { name: 'Close menu', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
export async function advanceTo(page: Page, target: number) {
  if (await elapsed(page) >= target) return;
  const options = await menu(page, 'Game options');
  await options.getByRole('button', { name: '4×', exact: true }).click();
  await closeMenu(page);
  await page.locator('.conv-header').getByRole('button', { name: 'Resume', exact: true }).click();
  while (await elapsed(page) < target && !(await page.getByRole('heading', { name: /^Mission (success|failure)$/ }).count())) {
    const before = await elapsed(page);
    // Accelerate scheduling only: the real worker executes one fixed engine step per interval.
    await page.clock.fastForward(250);
    await expect.poll(() => elapsed(page), { intervals: [10] }).toBe(before + 1);
  }
  const pause = page.locator('.conv-header').getByRole('button', { name: 'Pause', exact: true });
  if (await pause.count()) await pause.click();
}
export async function selectActor(page: Page, actor: Actor) {
  await page.getByRole('tab', { name: new RegExp('^' + names[actor] + ' ·') }).click();
}
export async function equipment(page: Page, id: string) {
  await page.getByRole('combobox', { name: 'Equipment context', exact: true }).selectOption(id);
}
export async function suggested(page: Page, actor: Actor, label: string) {
  await selectActor(page, actor);
  const previous = page.getByRole('button', { name: 'Previous suggested order', exact: true });
  while (await previous.count() && await previous.isEnabled()) await previous.click();
  const button = page.getByRole('button', { name: label, exact: true });
  while (!(await button.count())) {
    const next = page.getByRole('button', { name: 'Next suggested order', exact: true });
    await expect(next).toBeEnabled(); await next.click();
  }
  await expect(button).toBeEnabled(); await button.click();
  await expect(page.locator('.conv-history-window > article.conv-entry-order').last()).toContainText('accepted');
  const receipt = await latestReceipt(page, actor);
  expect(receipt.status).toBe('accepted');
  return receipt;
}
export async function latestEntry(page: Page, actor: Actor) {
  const dialog = await menu(page, 'History');
  await dialog.getByRole('combobox', { name: 'History character', exact: true }).selectOption(actor);
  return dialog;
}
export async function latestReceipt(page: Page, actor: Actor): Promise<CommandReceipt> {
  const dialog = await latestEntry(page, actor);
  await dialog.getByRole('button', { name: 'Read full message', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Reader section', exact: true }).selectOption({ label: 'Order receipt' });
  const receipt = JSON.parse(await readPages(page, 'Message text')) as CommandReceipt;
  await closeMenu(page); return receipt;
}
export async function readReport(page: Page, actor: Actor, taskId: string, section = 'Evidence') {
  await selectActor(page, actor);
  const report = page.locator('.conv-history-window > article[data-entry-id="report-' + taskId + '"]');
  await expect(report).toBeVisible();
  await report.getByRole('button', { name: 'Read report', exact: true }).click();
  await page.getByRole('combobox', { name: 'Section', exact: true }).selectOption({ label: section });
  const text = await readPages(page, 'Message text');
  await page.getByLabel(names[actor] + ' message reader', { exact: true }).getByRole('button', { name: 'Back', exact: true }).click();
  return text;
}
export async function radio(page: Page, message: string, actor: Actor = 'alex') {
  await selectActor(page, actor);
  await page.getByRole('textbox', { name: 'Message ' + names[actor], exact: true }).fill(message);
  await page.getByRole('button', { name: 'Send to ' + names[actor], exact: true }).click();
}
export async function replySection(page: Page, section: string, actor: Actor = 'alex') {
  const dialog = await latestEntry(page, actor);
  await dialog.getByRole('button', { name: 'Read full message', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Reader section', exact: true }).selectOption({ label: section });
  const text = await readPages(page, 'Message text');
  await closeMenu(page); return text;
}
export async function exportCurrent(page: Page): Promise<SavedRunRecord> {
  const home = await menu(page);
  await home.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(home).toContainText('Mission saved locally');
  await home.getByRole('button', { name: 'Saved games', exact: true }).click();
  await home.getByRole('combobox', { name: 'Saved game', exact: true }).selectOption({ index: 1 });
  const download = page.waitForEvent('download');
  await home.getByRole('button', { name: 'Export original', exact: true }).click();
  const record = JSON.parse(await readFile((await (await download).path())!, 'utf8')) as SavedRunRecord;
  await closeMenu(page); return record;
}
export async function readPages(page: Page, label: string) {
  let content = '';
  const previous = page.getByRole('button', { name: 'Previous ' + label.toLowerCase() + ' page', exact: true });
  while (await previous.count() && await previous.isEnabled()) await previous.click();
  for (;;) {
    content += await page.getByLabel(label, { exact: true }).innerText();
    const next = page.getByRole('button', { name: 'Next ' + label.toLowerCase() + ' page', exact: true });
    if (!(await next.count()) || !(await next.isEnabled())) return content;
    await next.click();
  }
}
