import { expect, test } from '@playwright/test';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { HostArchive } from '../../src/persistence/host-archive';
import { request } from '../sim/mission-policy';
import type { GatewayStart } from '../../src/shared/contracts';

test('an actual delivered inspection gets the complete natural reply, with raw evidence preserved', async ({ page }) => {
  const engine = initialize(hotRestart, 'natural-report-browser'); engine.step(10);
  const receipt = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
  engine.step(receipt.eta! + 2 - 10);
  const source = new HostArchive('natural-report-browser').build(engine.exportRecord());
  const prose = "That check is finished. Cooling didn't meet a required start condition.", doubt = "The report doesn't tell us which part caused it.";
  let calls = 0;
  await page.route('**/api/llm/turn', async route => {
    calls++; const wire = route.request().postDataJSON() as GatewayStart;
    expect(wire.interactionMode).toBe('conversation'); expect(wire.promptVersion).toBe('coworker-v3');
    const evidence = wire.view.observations.filter(o => o.assetId === 'controller' && ['inspection_complete', 'prerequisite_ready'].includes(o.field));
    expect(evidence).toHaveLength(2);
    await route.fulfill({ json: { kind: 'final', runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, response: { runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, speaker: wire.actorId, mode: 'live', requestKind: 'question', facts: evidence.flatMap(o => [{ observationId: o.id, field: 'value' }, { observationId: o.id, field: 'assetId' }]), inference: prose, uncertainty: doubt, proposals: [] } } });
  });
  await page.goto('/');
  await page.evaluate(async serialized => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('blackout-local-runs', 1); r.onupgradeneeded = () => { for (const name of ['runs', 'checkpoints']) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('runs', 'readwrite'); tx.objectStore('runs').put(serialized, 'natural-report-browser'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  }, JSON.stringify(source));
  await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('button', { name: 'Saved games', exact: true }).click();
  await page.getByRole('combobox', { name: 'Saved game', exact: true }).selectOption(source.runId);
  await page.getByRole('button', { name: 'Resume save', exact: true }).click();
  await page.locator('.conv-history-window > article.conv-entry-report').last().getByRole('button', { name: 'Read report', exact: true }).click();
  await expect(page.getByLabel('Message text', { exact: true })).toContainText('Cooling start condition: not met');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Alex', exact: true }).fill('What does this report mean?');
  await page.getByRole('button', { name: 'Send to Alex', exact: true }).click();
  const entry = page.locator('.conv-history-window > article.conv-entry-live').last();
  await expect(entry).toContainText(prose); await expect(entry).toContainText(doubt);
  expect(await entry.innerText()).not.toMatch(/prerequisite ready|inspection complete:|asset:|true|false/);
  await expect(page.getByRole('button', { name: 'Read full message', exact: true })).toHaveCount(0);
  expect(calls).toBe(1);
  await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Mission saved locally');
});

test('a freeform off-objective order starts accepted travel once, while a question starts no work', async ({ page }) => {
  let count = 0;
  await page.route('**/api/llm/turn', async route => {
    const wire = route.request().postDataJSON() as GatewayStart; count++;
    await route.fulfill({ json: { kind: 'final', runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, response: { runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, speaker: wire.actorId, mode: 'live', requestKind: count === 1 ? 'question' : 'order', facts: [], inference: count === 1 ? "I'm ready to check the equipment you choose." : "I'll check Rack C2 and bring back a report.", uncertainty: '', proposals: count === 1 ? [] : [{ action: 'inspect', targetId: 'rack-8', atSimTime: wire.view.simTime, args: { technicianId: 'alex' } }] } } });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.locator('.conv-header').getByRole('button', { name: 'Pause', exact: true }).click();
  const draft = page.getByRole('textbox', { name: 'Message Alex', exact: true });
  await draft.fill('How are things?'); await draft.press('Enter');
  await expect(page.locator('.conv-history-window > article.conv-entry-live').last()).toContainText("I'm ready"); await expect(page.locator('.conv-assignment')).toContainText('Ready');
  await draft.fill('Could you take a look at Rack C2 for me?'); await draft.press('Enter');
  await expect(page.locator('.conv-assignment')).toContainText('Walking to Rack C2');
  await expect(page.getByRole('button', { name: 'Check equipment · Alex', exact: true })).toBeDisabled();
  await expect(page.locator('.conv-history-window > article.conv-entry-order')).toHaveCount(1); expect(count).toBe(2);
});

test('authorized natural order arriving during a different command still starts after that command', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    (window as any).__heldOrder = null;
    window.Worker = class extends NativeWorker {
      postMessage(message: any, options?: any) {
        if (message.kind === 'command' && message.request.intent.targetId === 'distribution') {
          (window as any).__heldOrder = () => super.postMessage(message, options);
          return;
        }
        super.postMessage(message, options);
      }
    } as typeof Worker;
  });
  let ready!: () => void; const responseGate = new Promise<void>(resolve => { ready = resolve; });
  let captured: GatewayStart | undefined;
  await page.route('**/api/llm/turn', async route => {
    const wire = route.request().postDataJSON() as GatewayStart; captured = wire; await responseGate;
    await route.fulfill({ json: { kind: 'final', runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, response: { runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, speaker: wire.actorId, mode: 'live', requestKind: 'order', facts: [], inference: "I'll check Rack C2 and report back.", uncertainty: '', proposals: [{ action: 'inspect', targetId: 'rack-8', atSimTime: wire.view.simTime, args: { technicianId: 'alex' } }] } } });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Start guided game', exact: true }).click();
  await page.locator('.conv-header').getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Alex', exact: true }).fill('Please inspect Rack C2.');
  await page.getByRole('button', { name: 'Send to Alex', exact: true }).click();
  await expect.poll(() => captured?.actorId).toBe('alex');
  await page.getByRole('tab', { name: /Jules/ }).click();
  await page.getByRole('button', { name: 'Check the power board', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__heldOrder))).toBe(true);
  ready();
  await page.getByRole('tab', { name: /Alex/ }).click();
  await expect(page.locator('.conv-history-window > article.conv-entry-live').last()).toContainText("I'll check Rack C2");
  await page.evaluate(() => (window as any).__heldOrder());
  await expect(page.getByRole('button', { name: /Check equipment.*Alex/ })).toBeDisabled();
  await expect(page.locator('.conv-assignment')).toContainText('Walking to Rack C2');
});
