import { expect, test, type Page } from '@playwright/test';
import type { ActionIntent, GatewayInput, GatewayResponse } from '../../src/shared/contracts';
import { advanceTo, begin, closeMenu, equipment, latestEntry, latestReceipt, menu, radio, readPages, readReport, replySection, selectActor, suggested } from './desktop-helpers';

// Request mode, never player prose, selects the documented wire/authorization semantics.
// A continuation inherits the originating start mode; v2 remains proposal-only.
function fixtures() {
  const modes = new Map<string, string>();
  const conversation = (input: GatewayInput) => {
    if (input.kind === 'start') modes.set(input.requestId, (input as { interactionMode?: string }).interactionMode ?? '');
    return modes.get(input.requestId) === 'conversation';
  };
  const final = (input: GatewayInput, action?: ActionIntent, field: 'value' | 'observedAt' = 'value'): GatewayResponse => {
    const current = conversation(input);
    const observation = input.view.observations.find(o => o.assetId === 'cooling-1' && o.field === 'running') ?? input.view.observations.find(o => o.quality !== 'unknown');
    if (!observation) throw new Error('Real scoped observation required');
    return { kind: 'final', runId: input.runId, requestId: input.requestId, actorId: input.actorId, response: {
      runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId, mode: 'live',
      ...(current ? { requestKind: action ? 'order' : 'question' } : {}),
      facts: [{ observationId: observation.id, field }],
      inference: action ? current ? 'I can handle that.' : 'Please confirm the proposed work.' : 'Please check the latest readings.',
      uncertainty: '', proposals: action ? [action] : [],
    } };
  };
  return { final, conversation };
}
const inspect = (input: GatewayInput): ActionIntent => ({ action: 'inspect', targetId: 'controller', atSimTime: input.view.simTime, args: { technicianId: 'alex' } });
const confirmedOrder = (page: Page, label: string) => page.getByRole('button', { name: label + ' · Alex', exact: true });

test('gateway tools use the real worker; exact evidence, receipts and authorized work reach the UI', async ({ page }) => {
  test.setTimeout(45000); const turns: GatewayInput[] = []; const wire = fixtures();
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput; turns.push(input); wire.conversation(input);
    const action: ActionIntent = turns.length === 4
      ? { action: 'independent_reading', targetId: 'rack-1', atSimTime: input.view.simTime, args: { technicianId: 'alex' } }
      : turns.length === 3 ? { action: 'repair_cooling', targetId: 'controller', atSimTime: input.view.simTime, args: { technicianId: 'alex' } } : inspect(input);
    const reply: GatewayResponse = turns.length === 1
      ? { kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'mock-inspection', intent: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'mock-inspection', callId: 'read-cooling', tool: 'read_observations', targetId: 'cooling-1', action: null } }
      : wire.final(input, action);
    await route.fulfill({ json: reply, headers: { 'X-Blackout-Call': JSON.stringify({ receiptId: 'mock-receipt-' + turns.length, provider: 'openai', responseId: 'mock-response-' + turns.length, runId: input.runId, requestId: input.requestId, actorId: input.actorId, model: 'mock-actual-model', inputTokens: 40, outputTokens: 13, durationMs: 2, status: 'completed' }) } });
  });
  await begin(page); await equipment(page, 'controller'); await advanceTo(page, 10);
  await radio(page, 'Please inspect the cooling controls.'); await expect.poll(() => turns.length).toBe(2);
  await expect(page.locator('.conv-assignment [role=status]')).toHaveCount(0);
  expect(turns[1].kind).toBe('continue');
  if (turns[1].kind !== 'continue') throw new Error('Worker tool continuation expected');
  expect(turns[1].result).toMatchObject({ status: 'completed', reason: 'observations', callId: 'read-cooling', receipt: null });
  expect(turns[1].result.observations.length).toBeGreaterThan(0);
  expect(turns[1].result.observations.every(o => o.receivedAt <= turns[1].view.simTime)).toBe(true);
  if (!wire.conversation(turns[0])) {
    await expect(page.locator('.conv-assignment')).toContainText('Ready');
    const authorize = confirmedOrder(page, 'Check cooling controls'); await expect(authorize).toBeEnabled(); await authorize.click();
    const receipt = await latestReceipt(page, 'alex'); expect(receipt.status).toBe('accepted'); expect(receipt.eta).toBe(47);
  }
  await expect(page.locator('.conv-assignment')).toContainText('Walking');
  // The order adds a newer entry; navigate History to the original reply, never a reconstructed exchange.
  const history = await latestEntry(page, 'alex');
  const previous = history.getByRole('button', { name: 'Previous entry', exact: true });
  while (!(await history.getByRole('button', { name: 'Check cooling controls · Alex', exact: true }).count())) { await expect(previous).toBeEnabled(); await previous.click(); }
  await history.getByRole('button', { name: 'Read full message', exact: true }).click();
  const section = history.getByRole('combobox', { name: 'Reader section', exact: true });
  await section.selectOption({ label: 'Tool receipts' }); const toolText = await readPages(page, 'Message text');
  expect(toolText).toContain('COMPLETED'); expect(toolText).toContain('read-cooling');
  for (const observation of turns[1].result.observations) expect(toolText).toContain(observation.id);
  await section.selectOption({ label: 'Provenance' }); const provenance = await readPages(page, 'Message text');
  expect(provenance).toContain('mock-actual-model'); expect(provenance).toContain('mock-receipt-1'); expect(provenance).toContain('mock-receipt-2');
  await section.selectOption({ label: 'Facts and reply' }); expect(await readPages(page, 'Message text')).toContain('LIVE');
  await closeMenu(page); await advanceTo(page, 49);
  const diagnosis = await page.locator('.conv-history-window > article.conv-entry-report').getAttribute('data-entry-id');
  expect(diagnosis).toMatch(/^report-task-/);
  expect(await readReport(page, 'alex', diagnosis!.slice('report-'.length))).toContain('prerequisite ready: false');
  await suggested(page, 'sam', 'Pause background jobs');
  await radio(page, 'Please repair the cooling controls.'); await expect.poll(() => turns.length).toBe(3);
  await expect(page.locator('.conv-assignment [role=status]')).toHaveCount(0);
  if (!wire.conversation(turns[2])) {
    await expect(page.locator('.conv-assignment')).toContainText('Report delivered');
    const authorize = confirmedOrder(page, 'Repair the controls'); await expect(authorize).toBeEnabled(); await authorize.click();
  }
  await expect(page.locator('.conv-assignment')).toContainText('Working');
  const repair = await latestReceipt(page, 'alex'); expect(repair.status).toBe('accepted'); expect(repair.eta).toBe(169);
  await advanceTo(page, repair.eta! + 2);
  expect(await readReport(page, 'alex', repair.taskId!)).toContain('prerequisite ready: true');
  // Keep the original independent-probe behavior through the current authorized proposal route.
  await equipment(page, 'rack-1'); await radio(page, 'Please take an independent reading at Rack A1.');
  await expect.poll(() => turns.length).toBe(4); await expect(page.locator('.conv-assignment [role=status]')).toHaveCount(0);
  if (!wire.conversation(turns[3])) { const authorize = confirmedOrder(page, 'independent reading'); await expect(authorize).toBeEnabled(); await authorize.click(); }
  const probe = await latestReceipt(page, 'alex'); expect(probe.status).toBe('accepted'); expect(probe.eta).toBeGreaterThan(201);
  await advanceTo(page, probe.eta! + 2);
  const probeEvidence = await readReport(page, 'alex', probe.taskId!);
  expect(probeEvidence).toContain('inlet temperature c:'); expect(probeEvidence).toContain('independent');
  expect(probeEvidence).toContain('Asset: rack-1'); expect(probeEvidence).toContain('Source: report:alex');
  expect(turns).toHaveLength(4);
});

test('original turn versions reject stale work after cancellation makes the worker available again', async ({ page }) => {
  const wire = fixtures(); let captured: GatewayInput | undefined; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/llm/turn', async route => { captured = route.request().postDataJSON() as GatewayInput; wire.conversation(captured); await gate; await route.fulfill({ json: wire.final(captured, inspect(captured)) }); });
  await begin(page); await equipment(page, 'controller'); await radio(page, 'Please inspect the cooling controls.');
  await expect.poll(() => !!captured).toBe(true);
  const originalVersions = structuredClone(captured!.view.observedEntityVersions);
  await page.getByRole('button', { name: 'Check cooling controls', exact: true }).click();
  await expect(page.locator('.conv-assignment')).toContainText('Walking');
  await page.getByRole('button', { name: 'Stop current task', exact: true }).click();
  await expect(page.locator('.conv-assignment')).toContainText('Ready'); release();
  await expect(page.locator('.conv-assignment [role=status]')).toHaveCount(0);
  if (!wire.conversation(captured!)) { const authorize = confirmedOrder(page, 'Check cooling controls'); await expect(authorize).toBeEnabled(); await authorize.click(); }
  const receipt = await latestReceipt(page, 'alex');
  expect(receipt).toMatchObject({ status: 'rejected', reason: 'STALE_ENTITY_VERSION' });
  expect(captured!.view.observedEntityVersions).toEqual(originalVersions);
  await expect(page.locator('.conv-assignment')).toContainText('Ready');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});

test('restart cancels an old interaction and ignores its late inspection request', async ({ page }) => {
  let release!: () => void; let captured: GatewayInput | undefined; let canceled = false; let finished!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), handled = new Promise<void>(resolve => { finished = resolve; });
  await page.route('**/api/llm/cancel', async route => { canceled = true; await route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput; captured = input; await gate;
    await route.fulfill({ json: { kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'late', intent: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'late', callId: 'late', tool: 'inspect_asset', targetId: 'controller', action: inspect(input) } } }).catch(() => {});
    finished();
  });
  try {
    await begin(page); await equipment(page, 'controller'); await radio(page, 'Please inspect the cooling controls.');
    await expect.poll(() => !!captured).toBe(true);
    const options = await menu(page, 'Game options');
    // Reset must remain usable while the old provider request is outstanding.
    const restart = options.getByRole('button', { name: 'Restart mission', exact: true }); await expect(restart).toBeEnabled(); await restart.click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect.poll(() => canceled).toBe(true);
    release(); await handled;
    await expect(page.locator('.conv-header time')).toHaveText('0:00');
    await expect(page.locator('.conv-header').getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
    await expect(page.locator('.conv-history-window > article.conv-entry-live, .conv-history-window > article.conv-entry-fallback')).toHaveCount(0);
    await expect(page.locator('.conv-assignment')).toContainText('Ready');
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.locator('.conv-history-window > article.conv-entry-order')).toHaveCount(0);
  } finally { release(); if (captured) await handled; }
});

for (const priorSnapshot of ['absent', 'old', 'comparison'] as const) test(`menu refreshes a ${priorSnapshot} snapshot after a pending reply`, async ({ page }) => {
  test.setTimeout(60000);
  const wire = fixtures(); let captured: GatewayInput | undefined; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/llm/turn', async route => {
    captured = route.request().postDataJSON() as GatewayInput;
    await gate;
    await route.fulfill({ json: wire.final(captured) });
  });
  try {
    await begin(page);
    if (priorSnapshot === 'comparison') {
      await advanceTo(page, 2); await suggested(page, 'sam', 'Pause background jobs'); await advanceTo(page, 5);
      const previous = await menu(page, 'Replay and results');
      await previous.getByRole('combobox', { name: 'After action section' }).selectOption('compare');
      await previous.getByRole('spinbutton', { name: 'Earlier simulation second' }).fill('0');
      await previous.getByRole('button', { name: 'Run comparison' }).click();
      await expect(previous.getByLabel('Comparison metrics', { exact: true })).toContainText('COMPUTED ALTERNATIVE');
      await closeMenu(page); await advanceTo(page, 10);
    } else if (priorSnapshot === 'old') await advanceTo(page, 5);
    await equipment(page, 'cooling-1'); await radio(page, 'What is known?');
    await expect.poll(() => !!captured).toBe(true);
    const dialog = await menu(page, 'Replay and results');
    await dialog.getByRole('combobox', { name: 'After action section' }).selectOption('outcome');
    if (priorSnapshot === 'old') await expect(dialog).toContainText('T+0:00');
    else if (priorSnapshot === 'comparison') await expect(dialog).toContainText('T+0:05');
    else await expect(dialog).toContainText('Open a mission record');
    release();
    await expect(dialog).toContainText(priorSnapshot === 'comparison' ? 'T+0:10' : priorSnapshot === 'old' ? 'T+0:05' : 'T+0:00');
    await dialog.getByRole('combobox', { name: 'After action section' }).selectOption('provenance');
    expect(await readPages(page, 'Original wire transcript')).toContain(captured!.requestId);
  } finally { release(); }
});

test('menu refreshes after a pending worker command finishes', async ({ page }) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Worker.prototype, 'onmessage')!;
    Object.defineProperty(Worker.prototype, 'onmessage', {
      configurable: true,
      get: descriptor.get,
      set(handler: (event: MessageEvent) => void) {
        descriptor.set!.call(this, (event: MessageEvent) => {
          if (event.data.kind === 'receipt' && (window as any).__holdReceipt) {
            (window as any).__releaseReceipt = () => handler.call(this, event);
          } else handler.call(this, event);
        });
      },
    });
  });
  await begin(page);
  await page.evaluate(() => { (window as any).__holdReceipt = true; });
  await page.getByRole('tab', { name: /^Sam ?/ }).click();
  const order = page.getByRole('button', { name: 'Pause background jobs', exact: true });
  while (!(await order.count())) await page.getByRole('button', { name: 'Next suggested order', exact: true }).click();
  await order.click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseReceipt)).toBe('function');
  const dialog = await menu(page, 'Replay and results');
  await dialog.getByRole('combobox', { name: 'After action section' }).selectOption('outcome');
  await expect(dialog).toContainText('Open a mission record');
  await page.evaluate(() => (window as any).__releaseReceipt());
  await expect(dialog).toContainText('ORIGINAL RUN');
});

test('comparison waits for a pending reply and uses the refreshed record', async ({ page }) => {
  test.setTimeout(60000);
  const wire = fixtures(); let captured: GatewayInput | undefined; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/llm/turn', async route => {
    captured = route.request().postDataJSON() as GatewayInput; await gate;
    await route.fulfill({ json: wire.final(captured) });
  });
  try {
    await begin(page); await advanceTo(page, 2); await suggested(page, 'sam', 'Pause background jobs'); await advanceTo(page, 5);
    const initial = await menu(page, 'Replay and results');
    await initial.getByRole('combobox', { name: 'After action section' }).selectOption('outcome');
    await expect(initial).toContainText('T+0:05'); await closeMenu(page); await advanceTo(page, 10);
    await equipment(page, 'cooling-1'); await radio(page, 'What is known?'); await expect.poll(() => !!captured).toBe(true);
    const dialog = await menu(page, 'Replay and results');
    await dialog.getByRole('combobox', { name: 'After action section' }).selectOption('compare');
    await dialog.getByRole('spinbutton', { name: 'Earlier simulation second' }).fill('0');
    const compare = dialog.getByRole('button', { name: 'Run comparison' });
    await expect(compare).toBeDisabled();
    await expect(dialog).toContainText('Wait for the reply before reviewing this run.');
    release();
    await dialog.getByRole('combobox', { name: 'After action section' }).selectOption('outcome');
    await expect(dialog).toContainText('T+0:10');
    await dialog.getByRole('combobox', { name: 'After action section' }).selectOption('compare');
    await expect(compare).toBeEnabled(); await compare.click();
    await expect(dialog.getByLabel('Comparison metrics', { exact: true })).toContainText('COMPUTED ALTERNATIVE');
  } finally { release(); }
});

test('timestamp facts are formatted as metadata rather than equipment readings', async ({ page }) => {
  const wire = fixtures(); let observationId = '';
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON() as GatewayInput; const reply = wire.final(input, undefined, 'observedAt');
    if (reply.kind !== 'final' || !('observationId' in reply.response.facts[0])) throw new Error('Observation fact expected');
    observationId = reply.response.facts[0].observationId; await route.fulfill({ json: reply });
  });
  await begin(page); await equipment(page, 'cooling-1'); await radio(page, 'When was the reading observed?');
  await expect(page.locator('.conv-history-window > article.conv-entry-live')).toBeVisible();
  const facts = await replySection(page, 'Facts and reply');
  expect(facts).toContain('running · observed at: 0:00'); expect(facts).not.toContain('running: 0');
  const evidence = await replySection(page, 'Evidence'); expect(evidence).toContain(observationId);
  expect(evidence).toContain('Observed T+00:00'); expect(evidence).toContain('Asset: cooling-1');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});

test('provider outage produces labeled fallback without blocking direct orders', async ({ page }) => {
  await page.route('**/api/llm/turn', route => route.abort());
  await begin(page); await equipment(page, 'cooling-1'); await radio(page, 'What is known?');
  await expect(page.locator('.conv-history-window > article.conv-entry-fallback')).toBeVisible();
  expect(await replySection(page, 'Facts and reply')).toContain('SCRIPTED FALLBACK');
  const receipt = await suggested(page, 'alex', 'Check cooling controls'); expect(receipt.taskId).toMatch(/^task-/);
  await expect(page.locator('.conv-assignment')).toContainText('Walking');
});
test('reopening menu while comparison is pending preserves its result', async ({ page }) => {
  await page.addInitScript(() => {
    const desc = Object.getOwnPropertyDescriptor(Worker.prototype, 'onmessage')!;
    Object.defineProperty(Worker.prototype, 'onmessage', { configurable: true, get: desc.get, set(handler) {
      desc.set!.call(this, (event: MessageEvent) => {
        if (event.data.kind === 'comparison') (window as any).__releaseComparison = () => handler.call(this, event);
        else handler.call(this, event);
      });
    }});
  });
  await begin(page); await advanceTo(page, 2); await suggested(page, 'sam', 'Pause background jobs'); await advanceTo(page, 5);
  let dialog = await menu(page, 'Replay and results');
  await dialog.getByRole('combobox', { name: 'After action section' }).selectOption('compare');
  await dialog.getByRole('button', { name: 'Run comparison' }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseComparison)).toBe('function');
  await closeMenu(page); dialog = await menu(page, 'Replay and results');
  await dialog.getByRole('combobox', { name: 'After action section' }).selectOption('compare');
  await page.evaluate(() => (window as any).__releaseComparison());
  await dialog.getByRole('combobox', { name: 'Comparison section' }).selectOption('result');
  await expect(dialog.getByLabel('Comparison metrics', { exact: true })).toContainText('COMPUTED ALTERNATIVE', { timeout: 3000 });
});

test('saving while reply pending keeps restart available', async ({ page }) => {
  let got = false; let release!: () => void; const gate = new Promise<void>(r => release = r);
  await page.route('**/api/llm/turn', async route => { got = true; await gate; await route.abort().catch(() => {}); });
  try {
    await begin(page); await radio(page, 'What is known?'); await expect.poll(() => got).toBe(true);
    const dialog = await menu(page);
    await dialog.getByRole('button', { name: 'Save game', exact: true }).click();
    await dialog.getByRole('button', { name: 'Game options', exact: true }).click();
    const restart = dialog.getByRole('button', { name: 'Restart mission', exact: true });
    await expect(restart).toBeEnabled(); await restart.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    release();
    await expect(page.locator('.conv-header time')).toHaveText('0:00');
    const saves = await menu(page, 'Saved games');
    await expect(saves).toContainText('No saved games');
  } finally { release(); }
});




test('saving waits for a pending reply and retains its original transcript', async ({ page }) => {
  const wire = fixtures(); let captured: GatewayInput | undefined; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/llm/turn', async route => {
    captured = route.request().postDataJSON() as GatewayInput;
    await gate; await route.fulfill({ json: wire.final(captured) });
  });
  try {
    await begin(page); await radio(page, 'What is known?'); await expect.poll(() => !!captured).toBe(true);
    const dialog = await menu(page); await dialog.getByRole('button', { name: 'Save game', exact: true }).click();
    await expect(dialog).toContainText('Waiting for the reply before saving.');
    release(); await expect(dialog).toContainText('Mission saved locally');
    await dialog.getByRole('button', { name: 'Replay and results', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'After action section' }).selectOption('provenance');
    expect(await readPages(page, 'Original wire transcript')).toContain(captured!.requestId);
  } finally { release(); }
});

test('pending save keeps live orders and conversations usable', async ({ page }) => {
  const arrived: string[] = []; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/llm/turn', async route => { const input = route.request().postDataJSON() as GatewayInput; arrived.push(input.actorId); await gate; await route.abort().catch(() => {}); });
  try {
    await begin(page); await radio(page, 'What is known?'); await expect.poll(() => arrived).toContain('alex');
    const dialog = await menu(page); await dialog.getByRole('button', { name: 'Save game', exact: true }).click();
    await expect(dialog).toContainText('Waiting for the reply before saving.'); await closeMenu(page);
    await selectActor(page, 'sam');
    const order = page.getByRole('button', { name: 'Check recovery', exact: true });
    while (!(await order.count())) await page.getByRole('button', { name: 'Next suggested order', exact: true }).click();
    await order.click(); await expect(page.locator('.conv-history-window > article.conv-entry-order')).toHaveCount(1);
    await radio(page, 'Is this working?', 'sam'); await expect.poll(() => arrived).toContain('sam');
  } finally { release(); }
});

test('pending save cannot be silently displaced by replaying an older save', async ({ page }) => {
  let arrived = false; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/llm/turn', async route => { arrived = true; await gate; await route.abort().catch(() => {}); });
  try {
    await begin(page); let dialog = await menu(page); await dialog.getByRole('button', { name: 'Save game', exact: true }).click();
    await expect(dialog).toContainText('Mission saved locally'); await closeMenu(page); await advanceTo(page, 3);
    await radio(page, 'What is known?'); await expect.poll(() => arrived).toBe(true);
    dialog = await menu(page); await dialog.getByRole('button', { name: 'Save game', exact: true }).click();
    await dialog.getByRole('button', { name: 'Saved games', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Saved game' }).selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Replay save', exact: true }).click();
    await expect(dialog).toContainText('Wait for the save to finish before opening a saved game.');
    release(); await expect(dialog).toContainText('Mission saved locally');
    const times = await page.evaluate(() => new Promise<number[]>((resolve, reject) => { const open = indexedDB.open('blackout-local-runs'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result; const request = db.transaction('runs').objectStore('runs').getAll(); request.onsuccess = () => { resolve(request.result.map((text: string) => JSON.parse(text).finalCheckpoint.simTime)); db.close(); }; request.onerror = () => reject(request.error); }; }));
    expect(times).toContain(3);
  } finally { release(); }
});
