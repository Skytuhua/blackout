import { expect, test } from '@playwright/test';
import type { GatewayStart } from '../../src/shared/contracts';
import { advanceTo, begin, exportCurrent, latestReceipt, radio, selectActor } from './desktop-helpers';

for (const [actor, message] of [['jules', 'go to the A2'], ['alex', 'dont check the controls, walk around to some server rack'], ['sam', 'go to Rack A2']] as const) test(`${actor} can follow a natural request to walk to a rack`, async ({ page }) => {
  let calls = 0;
  await page.route('**/api/llm/turn', async route => {
    const wire = route.request().postDataJSON() as GatewayStart; calls++;
    expect(wire.promptVersion).toBe('coworker-v4'); expect(wire.actorId).toBe(actor);
    const destination = wire.view.knownTopology.assets.find(asset => asset.id === 'rack-2')!.serviceTile;
    await route.fulfill({ json: { kind: 'final', runId: wire.runId, requestId: wire.requestId, actorId: actor, response: { runId: wire.runId, requestId: wire.requestId, actorId: actor, speaker: actor, mode: 'live', requestKind: 'order', facts: [], inference: "I'll head to Rack A2.", uncertainty: '', proposals: [{ action: 'move_crew', targetId: actor, atSimTime: wire.view.simTime, args: { destination } }] } } });
  });
  await begin(page); await radio(page, message, actor);
  await expect(page.locator('.conv-assignment')).toContainText('Walking to Rack A2');
  const receipt = await latestReceipt(page, actor); expect(receipt.status).toBe('accepted');
  await expect(page.locator(`[data-crew-label="${actor}"]`)).toBeVisible();
  await advanceTo(page, receipt.eta! + 2); await selectActor(page, actor);
  await expect(page.locator(`[data-crew-label="${actor}"]`)).toBeVisible();
  await expect(page.locator('.conv-assignment')).not.toContainText('Report on its way');
  const source = await exportCurrent(page);
  expect(source.commands.map(command => command.intent.action)).toEqual(['move_crew']);
  expect(source.dialogue.some(entry => entry.id === `report-${receipt.taskId}`)).toBe(false);
  expect(calls).toBe(1);
});
