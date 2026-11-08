import { expect, test, type Page } from '@playwright/test';
import type { GatewayInput, GatewayResponse } from '../../src/shared/contracts';

async function begin(page: Page) {
  const date = new Date('2026-11-07T12:00:00Z');
  await page.clock.install({ time: date }); await page.clock.pauseAt(date);
  await page.goto('/'); await page.getByRole('button', { name: 'Start mission', exact: true }).click();
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await page.getByRole('button', { name: 'Cooling 01 cooling', exact: true }).click();
  await page.getByRole('combobox', { name: 'Recipient', exact: true }).selectOption('alex');
}
async function ask(page: Page, message: string) {
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(message);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}
function final(input: GatewayInput, proposal = false): GatewayResponse {
  const observation = input.view.observations.find(o => o.assetId === 'cooling-1')!;
  return { kind: 'final', runId: input.runId, requestId: input.requestId, actorId: input.actorId, response: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId, mode: 'live', facts: [{ observationId: observation.id, field: 'value' }], inference: proposal ? 'A repair may restore the prerequisite.' : 'Inspection is queued; work is pending.', uncertainty: 'Recovery still needs verification.', proposals: proposal ? [{ action: 'repair_cooling', targetId: 'cooling-1', atSimTime: input.view.simTime, args: { technicianId: 'alex' } }] : [] } };
}

test('gateway inspection uses the real worker; factual records and explicit proposal confirmation reach the UI', async ({ page }) => {
  test.setTimeout(45000); const turns: GatewayInput[] = [];
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput; turns.push(input);
    const reply: GatewayResponse = turns.length === 1 ? { kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'mock-inspection', intent: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'mock-inspection', callId: 'inspect', tool: 'inspect_asset', targetId: 'cooling-1', action: { action: 'inspect', targetId: 'cooling-1', atSimTime: input.view.simTime, args: { technicianId: 'alex' } } } } : final(input, turns.length > 2);
    await route.fulfill({ json: reply, headers: { 'X-Blackout-Call': JSON.stringify({ receiptId: `mock-receipt-${turns.length}`, runId: input.runId, requestId: input.requestId, actorId: input.actorId, model: 'mock-actual-model', inputTokens: 40, outputTokens: 13, durationMs: 2, status: 'completed' }) } });
  });
  await begin(page); await ask(page, 'Inspect the selected equipment.');
  await expect.poll(() => turns.length).toBe(2);
  await expect(page.getByRole('region', { name: 'Coworker response', exact: true })).toContainText('Live coworker');
  await expect(page.locator('.bo-crew')).toContainText('traveling');
  await expect(page.getByRole('region', { name: 'Coworker response', exact: true })).toContainText('observed 0:00');
  await page.getByRole('combobox', { name: 'Simulation speed', exact: true }).selectOption('4');
  await page.getByRole('button', { name: 'Resume simulation', exact: true }).click();
  for (let tick = 1; tick <= 10; tick++) {
    await page.clock.fastForward(1000);
    await expect(page.locator('.bo-header-status')).toContainText(`Simulation 0:${String(tick * 4).padStart(2, '0')}`);
  }
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await ask(page, 'Propose the indicated repair.');
  const confirm = page.getByRole('button', { name: 'Confirm repair cooling for Cooling 01', exact: true });
  await expect(confirm).toBeEnabled();
  await expect(page.locator('.bo-crew')).toContainText('No active assignment');
  await page.getByRole('button', { name: 'Dispatch pause batch', exact: true }).click();
  await expect(page.locator('.mission-controls [role=status]').first()).toContainText('pause batch accepted');
  await expect(page.getByRole('button', { name: 'Step 1 second', exact: true })).toBeEnabled();
  await confirm.click();
  await expect(page.locator('.mission-controls [role=status]').first()).toContainText('repair cooling accepted');
  await expect(page.locator('.bo-crew')).toContainText('repair cooling');
});

test('proposal confirmation rejects changed worker versions even after the worker becomes available again', async ({ page }) => {
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput; const reply = final(input);
    if (reply.kind !== 'final') throw new Error('Final expected.');
    reply.response.proposals = [{ action: 'inspect', targetId: 'cooling-1', atSimTime: input.view.simTime, args: { technicianId: 'alex' } }];
    await route.fulfill({ json: reply });
  });
  await begin(page); await ask(page, 'Propose an inspection for confirmation.');
  const confirm = page.getByRole('button', { name: 'Confirm inspect for Cooling 01', exact: true });
  await expect(confirm).toBeEnabled();
  await page.getByRole('button', { name: 'Cooling control controller', exact: true }).click();
  const inspection = page.locator('.bo-action').filter({ has: page.getByRole('button', { name: 'Dispatch inspect', exact: true }) });
  await inspection.getByRole('combobox', { name: 'Technician', exact: true }).selectOption('alex');
  await inspection.getByRole('button', { name: 'Dispatch inspect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Step 1 second', exact: true })).toBeEnabled();
  const cancellation = page.locator('.bo-action').filter({ has: page.getByRole('button', { name: 'Dispatch cancel task', exact: true }) });
  await cancellation.getByRole('combobox', { name: 'Task', exact: true }).selectOption({ index: 1 });
  await cancellation.getByRole('button', { name: 'Dispatch cancel task', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Step 1 second', exact: true })).toBeEnabled();
  await expect(confirm).toBeEnabled(); await confirm.click();
  await expect(page.locator('.mission-controls [role=status]').first()).toContainText('stale entity version');
  await expect(page.locator('.bo-crew')).toContainText('No active assignment');
});

test('retry cancels an old gateway interaction and ignores its late inspection request', async ({ page }) => {
  let release!: () => void; let captured: GatewayInput | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput; captured = input; await gate;
    await route.fulfill({ json: { kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'late', intent: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'late', callId: 'late', tool: 'inspect_asset', targetId: 'cooling-1', action: { action: 'inspect', targetId: 'cooling-1', atSimTime: input.view.simTime, args: { technicianId: 'alex' } } } } }).catch(() => {});
  });
  await begin(page); await ask(page, 'Inspect selected equipment.');
  await expect.poll(() => !!captured).toBe(true);
  await page.getByRole('button', { name: 'Retry mission', exact: true }).click(); release();
  await page.getByRole('button', { name: 'Start mission', exact: true }).click();
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Coworker response', exact: true })).toHaveCount(0);
  await expect(page.locator('.bo-crew')).toContainText('No active assignment');
});

test('timestamp selectors are labeled and formatted as metadata rather than equipment readings', async ({ page }) => {
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput;
    const reply = final(input); if (reply.kind !== 'final') throw new Error('Final expected');
    reply.response.facts = [{ observationId: input.view.observations.find(o => o.assetId === 'cooling-1')!.id, field: 'observedAt' }];
    await route.fulfill({ json: reply });
  });
  await begin(page); await ask(page, 'When was the reading observed?');
  await expect(page.getByRole('region', { name: 'Coworker response', exact: true }).getByRole('link')).toContainText('running · observed at: 0:00');
});

test('provider outage produces labeled authored evidence without blocking direct dispatch', async ({ page }) => {
  await page.route('**/api/llm/turn', route => route.abort());
  await begin(page); await ask(page, 'What is known?');
  await expect(page.getByRole('region', { name: 'Coworker response', exact: true })).toContainText('Scripted fallback');
  const block = page.locator('.bo-action').filter({ has: page.getByRole('button', { name: 'Dispatch inspect', exact: true }) });
  await block.getByRole('combobox', { name: 'Technician', exact: true }).selectOption('alex');
  await block.getByRole('button', { name: 'Dispatch inspect', exact: true }).click();
  await expect(page.locator('.mission-controls [role=status]').first()).toContainText('Inspection accepted');
});
