import { expect, test } from '@playwright/test';
import type { GatewayInput, GatewayResponse } from '../../src/shared/contracts';
import { action, advanceTo, begin, equipment, feedback, radio, radioSection, readPages } from './desktop-helpers';

function final(input: GatewayInput, proposal = false): GatewayResponse {
  const observation = input.view.observations.find(o => o.assetId === 'cooling-1')!;
  return { kind: 'final', runId: input.runId, requestId: input.requestId, actorId: input.actorId, response: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId, mode: 'live', facts: [{ observationId: observation.id, field: 'value' }], inference: proposal ? 'A repair may restore the prerequisite.' : 'Inspection is queued; work is pending.', uncertainty: 'Recovery still needs verification.', proposals: proposal ? [{ action: 'repair_cooling', targetId: 'cooling-1', atSimTime: input.view.simTime, args: { technicianId: 'alex' } }] : [] } };
}
test('gateway inspection uses the real worker; paged evidence, receipts and explicit proposal confirmation reach the UI', async ({ page }) => {
  test.setTimeout(45000); const turns: GatewayInput[] = [];
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput; turns.push(input);
    const reply: GatewayResponse = turns.length === 1 ? { kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'mock-inspection', intent: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'mock-inspection', callId: 'inspect', tool: 'inspect_asset', targetId: 'cooling-1', action: { action: 'inspect', targetId: 'cooling-1', atSimTime: input.view.simTime, args: { technicianId: 'alex' } } } } : final(input, turns.length > 2);
    await route.fulfill({ json: reply, headers: { 'X-Blackout-Call': JSON.stringify({ receiptId: `mock-receipt-${turns.length}`, provider: 'openai', responseId: `mock-response-${turns.length}`, runId: input.runId, requestId: input.requestId, actorId: input.actorId, model: 'mock-actual-model', inputTokens: 40, outputTokens: 13, durationMs: 2, status: 'completed' }) } });
  });
  await begin(page); await equipment(page, 8, 8); await radio(page, 'Inspect the selected equipment.');
  await expect.poll(() => turns.length).toBe(2);
  await radioSection(page, 'Report'); expect(await readPages(page, 'Radio report')).toContain('LIVE');
  await expect(page.locator('.blackout-crew')).toContainText('traveling');
  await radioSection(page, 'Receipts'); expect(await readPages(page, 'Radio receipts')).toContain('ACCEPTED');
  await radioSection(page, 'Provenance'); const provenance = await readPages(page, 'Radio provenance');
  expect(provenance).toContain('mock-actual-model'); expect(provenance).toContain('mock-receipt-2');
  await advanceTo(page, 50); await radio(page, 'Propose the indicated repair.');
  await expect.poll(() => turns.length).toBe(3);
  await radioSection(page, 'Proposals'); await expect(page.getByRole('button', { name: 'Confirm proposal', exact: true })).toBeEnabled();
  await expect(page.locator('.blackout-crew')).toContainText('Ready');
  await action(page, 'pause batch');
  await radioSection(page, 'Proposals'); await page.getByRole('button', { name: 'Confirm proposal', exact: true }).click();
  await feedback(page, 'repair cooling accepted'); await expect(page.locator('.blackout-crew')).toContainText('working');
});
test('proposal confirmation rejects stale worker versions after cancellation makes the worker available again', async ({ page }) => {
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput; const reply = final(input);
    if (reply.kind !== 'final') throw new Error('Final expected');
    reply.response.proposals = [{ action: 'inspect', targetId: 'cooling-1', atSimTime: input.view.simTime, args: { technicianId: 'alex' } }]; await route.fulfill({ json: reply });
  });
  await begin(page); await equipment(page, 8, 8); await radio(page, 'Propose an inspection.');
  await radioSection(page, 'Proposals'); await expect(page.getByRole('button', { name: 'Confirm proposal', exact: true })).toBeEnabled();
  await action(page, 'inspect', [6, 9]); await action(page, 'cancel task', [6, 9], { cancel: true });
  await radioSection(page, 'Proposals'); await page.getByRole('button', { name: 'Confirm proposal', exact: true }).click();
  await feedback(page, 'stale entity version'); await expect(page.locator('.blackout-crew')).toContainText('Ready');
});
test('restart cancels an old interaction and ignores its late inspection request', async ({ page }) => {
  let release!: () => void; let captured: GatewayInput | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput; captured = input; await gate;
    await route.fulfill({ json: { kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'late', intent: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'late', callId: 'late', tool: 'inspect_asset', targetId: 'cooling-1', action: { action: 'inspect', targetId: 'cooling-1', atSimTime: input.view.simTime, args: { technicianId: 'alex' } } } } }).catch(() => {});
  });
  await begin(page); await equipment(page, 8, 8); await radio(page, 'Inspect selected equipment.'); await expect.poll(() => !!captured).toBe(true);
  await page.getByRole('button', { name: 'More', exact: true }).click(); await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('button', { name: 'Restart mission', exact: true }).click(); release();
  await expect(page.locator('.blackout-top time')).toHaveText('T+00:00');
  await expect(page.getByRole('button', { name: 'Resume simulation', exact: true })).toBeEnabled();
  await radioSection(page, 'Report'); expect(await readPages(page, 'Radio report')).toContain('No coworker reply yet');
  await expect(page.locator('.blackout-crew')).not.toContainText('traveling');
});
test('timestamp facts are formatted as metadata rather than equipment readings', async ({ page }) => {
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput; const reply = final(input);
    if (reply.kind !== 'final') throw new Error('Final expected');
    reply.response.facts = [{ observationId: input.view.observations.find(o => o.assetId === 'cooling-1')!.id, field: 'observedAt' }]; await route.fulfill({ json: reply });
  });
  await begin(page); await equipment(page, 8, 8); await radio(page, 'When was the reading observed?');
  await radioSection(page, 'Report'); await expect(page.getByLabel('Radio report', { exact: true })).toContainText('observed at: 0:00');
});
test('provider outage produces labeled fallback without blocking direct dispatch', async ({ page }) => {
  await page.route('**/api/llm/turn', route => route.abort());
  await begin(page); await equipment(page, 8, 8); await radio(page, 'What is known?');
  await radioSection(page, 'Report'); await expect(page.getByLabel('Radio report', { exact: true })).toContainText('SCRIPTED FALLBACK');
  await action(page, 'inspect', [8, 8]); await expect(page.locator('.blackout-crew')).toContainText('traveling');
});
