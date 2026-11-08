import { expect, test } from '@playwright/test';

test('sidebar resizes by keyboard and pointer without losing a character draft', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/');
  await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  const draft = page.getByRole('textbox', { name: 'Message Alex', exact: true }); await draft.fill('Keep my cooling question');
  const divider = page.getByRole('separator', { name: 'Resize conversation sidebar', exact: true });
  await expect(divider).toBeVisible(); await divider.focus(); await divider.press('ArrowLeft');
  expect(Number(await divider.getAttribute('aria-valuenow'))).toBeGreaterThan(360);
  const box = (await divider.boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + 80); await page.mouse.down(); await page.mouse.move(800, box.y + 80); await page.mouse.up();
  await expect(draft).toHaveValue('Keep my cooling question');
  const width = await page.getByLabel('Team conversation', { exact: true }).evaluate(element => element.clientWidth);
  expect(width).toBeGreaterThan(450); expect(width).toBeLessThan(640);
  await expect(page.getByRole('button', { name: 'Expand draft', exact: true })).toHaveCount(0);
  for (const actor of ['alex', 'jules', 'sam']) expect(await page.locator(`.conv-map-crew [data-actor=${actor}]`).evaluate(element => parseFloat(getComputedStyle(element).borderTopWidth))).toBeGreaterThan(0);
});

test('Enter sends once, Shift+Enter adds a line, and IME and pending Enter never send', async ({ page }) => {
  let requests = 0, release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/llm/turn', async route => { requests++; await gate; const input = route.request().postDataJSON(); await route.fulfill({ json: { kind: 'fallback', runId: input.runId, requestId: input.requestId, actorId: input.actorId, mode: 'scripted', reason: 'call_timeout', message: 'Timeout.', facts: [] } }); });
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  const draft = page.getByRole('textbox', { name: 'Message Alex', exact: true }); await draft.fill('First line'); await draft.press('Shift+Enter'); await draft.pressSequentially('Second line');
  await expect(draft).toHaveValue('First line\nSecond line'); expect(requests).toBe(0);
  await draft.dispatchEvent('compositionstart'); await draft.press('Enter'); expect(requests).toBe(0); await draft.dispatchEvent('compositionend');
  await draft.press('Enter'); await expect.poll(() => requests).toBe(1); await draft.press('Enter'); expect(requests).toBe(1); release();
  await expect(page.getByLabel('Alex conversation history', { exact: true })).toContainText('took too long');
  await expect(page.getByRole('button', { name: 'Read full message', exact: true })).toHaveCount(0);
});

test('an unexpectedly tall reply keeps its complete History text and stays unread until opened', async ({ page }) => {
  const original = 'Line.\n'.repeat(40); await page.setViewportSize({ width: 1280, height: 720 });
  await page.route('**/api/llm/turn', async route => { const input = route.request().postDataJSON(); await route.fulfill({ json: { kind: 'final', runId: input.runId, requestId: input.requestId, actorId: input.actorId, response: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId, mode: 'live', facts: [], inference: original, uncertainty: '', proposals: [] } } }); });
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Alex', exact: true }).fill('A question'); await page.getByRole('button', { name: 'Send to Alex', exact: true }).click();
  await expect(page.locator('.conv-history-window > article.conv-entry-live > p')).toContainText('A detailed reply is saved');
  await expect(page.getByRole('tab', { name: /Alex.*1 unread/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read full message', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Read full message', exact: true }).click();
  const parts: string[] = [];
  const menu = page.getByRole('dialog');
  for (;;) { parts.push(await menu.getByLabel('Message text', { exact: true }).textContent() ?? ''); const next = menu.getByRole('button', { name: 'Next message text page', exact: true }); if (!await next.count() || !await next.isEnabled()) break; await next.click(); }
  expect(parts.join('')).toBe(original);
  await page.getByRole('button', { name: 'Close menu', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Alex.*unread/ })).toHaveCount(0);
});
