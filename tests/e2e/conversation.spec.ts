import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { GatewayInput } from '../../src/shared/contracts';

async function startPaused(page: Page) {
  const date = new Date('2026-11-07T12:00:00Z'); await page.clock.install({ time: date }); await page.clock.pauseAt(date);
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.locator('.conv-header').getByRole('button', { name: 'Pause', exact: true }).click();
}
function reply(input: GatewayInput, inference: string, proposals: unknown[] = []) {
  return { kind: 'final', runId: input.runId, requestId: input.requestId, actorId: input.actorId, response: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId, mode: 'live', facts: [], inference, uncertainty: '', proposals } };
}

test('late replies stay with their originating character and do not switch chats or drafts', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  let release!: () => void; let captured: GatewayInput | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput; captured = input; await gate;
    await route.fulfill({ json: { kind: 'final', runId: input.runId, requestId: input.requestId, actorId: input.actorId, response: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId, mode: 'live', facts: [], inference: 'Please check the latest readings.', uncertainty: 'The cause is still unverified.', proposals: [] } } });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Alex · Cooling/ })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message Alex', exact: true }).fill('What do you know?');
  await page.getByRole('button', { name: 'Send to Alex', exact: true }).click();
  await expect.poll(() => captured?.actorId).toBe('alex');
  expect(captured?.kind === 'start' && captured.interactionMode).toBe('advisory');
  await page.getByRole('tab', { name: /Sam · IT/ }).click();
  await page.getByRole('textbox', { name: 'Message Sam', exact: true }).fill('Keep this IT draft'); release();
  await expect(page.getByRole('tab', { name: /Sam · IT/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: 'Message Sam', exact: true })).toHaveValue('Keep this IT draft');
  await page.getByRole('tab', { name: /Alex · Cooling/ }).click();
  await expect(page.getByLabel('Alex conversation history', { exact: true })).toContainText('Please check the latest readings.');
  await expect(page.getByRole('tab', { name: /Alex · Cooling/ })).toHaveAttribute('aria-label', 'Alex · Cooling');
  await page.getByRole('tab', { name: /Sam · IT/ }).click();
  await expect(page.getByRole('textbox', { name: 'Message Sam', exact: true })).toHaveValue('Keep this IT draft');
});

test('proposal confirmation retains original versions through direct work, cancellation and tab changes', async ({ page }) => {
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput;
    await route.fulfill({ json: reply(input, 'I can inspect that equipment if you confirm.', [{ action: 'inspect', targetId: 'controller', atSimTime: input.view.simTime, args: { technicianId: 'alex' } }]) });
  });
  await startPaused(page);
  await page.getByRole('textbox', { name: 'Message Alex', exact: true }).fill('Please inspect the cooling controls.');
  await page.getByRole('button', { name: 'Send to Alex', exact: true }).click();
  const proposal = page.getByRole('button', { name: 'Check cooling controls · Alex', exact: true }); await expect(proposal).toBeEnabled();
  await expect(page.locator('.conv-assignment')).toContainText('Ready');
  await page.locator('.conv-suggested').click(); await expect(page.locator('.conv-assignment')).toContainText('Walking');
  await page.getByRole('button', { name: 'Stop current task', exact: true }).click(); await expect(page.locator('.conv-assignment')).toContainText('Ready');
  await page.getByRole('tab', { name: /Sam · IT/ }).click(); await page.getByRole('tab', { name: /Alex · Cooling/ }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('button', { name: 'History', exact: true }).click();
  const menu = page.getByRole('dialog'); const historicalProposal = menu.getByRole('button', { name: 'Check cooling controls · Alex', exact: true });
  for (let i = 0; i < 20 && !(await historicalProposal.count()); i++) await menu.getByRole('button', { name: 'Previous entry', exact: true }).click();
  await historicalProposal.click(); await expect(historicalProposal).toBeDisabled(); await expect(menu).toContainText('rejected');
  await menu.getByRole('button', { name: 'Read action result', exact: true }).click(); await menu.getByRole('combobox', { name: 'Reader section', exact: true }).selectOption({ label: 'Alex action result' });
  await expect(menu.getByLabel('Message text', { exact: true })).toContainText('stale entity version');
});

test('more than twenty complete entries remain in Menu History and a native save/export', async ({ page }) => {
  let count = 0;
  await page.route('**/api/llm/turn', async route => { const input = route.request().postDataJSON() as GatewayInput; count++; await route.fulfill({ json: reply(input, 'Please check the latest readings.') }); });
  await startPaused(page);
  for (let i = 1; i <= 10; i++) {
    await page.getByRole('textbox', { name: 'Message Alex', exact: true }).fill(`Question ${i}`);
    await page.getByRole('button', { name: 'Send to Alex', exact: true }).click(); await expect.poll(() => count).toBe(i);
    await expect(page.locator('.conv-assignment [role=status]')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('button', { name: 'History', exact: true }).click();
  const menu = page.getByRole('dialog'); let history = '';
  for (;;) {
    history += await menu.innerText(); const previous = menu.getByRole('button', { name: 'Previous entry', exact: true });
    if (!await previous.isEnabled()) break; await previous.click();
  }
  for (let i = 1; i <= 10; i++) expect(history).toContain(`Question ${i}`);
  await menu.getByRole('button', { name: 'Back', exact: true }).click(); await menu.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(menu).toContainText('Mission saved locally'); await menu.getByRole('button', { name: 'Saved games', exact: true }).click(); await menu.getByRole('combobox', { name: 'Saved game', exact: true }).selectOption({ index: 1 });
  const download = page.waitForEvent('download'); await menu.getByRole('button', { name: 'Export original', exact: true }).click();
  const saved = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(saved.interactions).toHaveLength(10); expect(saved.dialogue.length).toBeGreaterThan(20);
  expect(saved.dialogue.filter((message: any) => message.conversationActorId === 'alex' && message.conversationKind === 'player')).toHaveLength(10);
});
