import { afterEach, expect, it, vi } from 'vitest';
import type { AgentResponse, GatewayStart, Observation } from '../../src/shared/contracts';
import { alarmFixture } from '../../src/shared/fixtures';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { procedures } from '../../src/content/procedures';
import { conciseCoworkerResponse, projectCoworkerContext } from '../../src/llm/conversation-policy';
import { usesConversationPolicy } from '../../src/llm/conversation-mode';
import { parameters, initialHistory } from '../../server/llm/adapter';
import { formatConversationReply } from '../../src/ui/presentation';
import { runCoworker } from '../../src/llm/interaction';
import { initialize } from '../../src/sim/engine';
import { directOrderAuthorizationIds } from '../../src/llm/natural-conversation';
import { authorizationMatchesOrigin, ProposalBook } from '../../src/shared/conversations';
import { HostArchive } from '../../src/persistence/host-archive';
import { deserializeRun, serializeRun } from '../../src/persistence/runs';
import { replaySavedRun } from '../../src/persistence/saved-record';
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const view = structuredClone(alarmFixture); view.actorId = 'alex';
  view.knownTopology.assets.push(structuredClone(hotRestart.topology.assets.find(asset => asset.id === 'controller')!));
  const checked: Observation = { id: 'checked', assetId: 'controller', source: 'report:alex', field: 'inspection_complete', value: true, units: '', observedAt: 70, receivedAt: 72, quality: 'reported' };
  const ready: Observation = { ...checked, id: 'ready', field: 'prerequisite_ready', value: false };
  view.observations.push(checked, ready);
  view.messages.push({ id: 'report-check', at: 72, speaker: 'alex', mode: 'system', text: 'Inspection complete.', evidenceIds: [checked.id, ready.id] });
  const start: GatewayStart = { kind: 'start', runId: view.runId, requestId: 'natural-request', actorId: 'alex', role: 'facilities', message: 'What does this report mean?', interactionMode: 'conversation', promptVersion: 'coworker-v3', view, procedures };
  const response: AgentResponse = { runId: start.runId, requestId: start.requestId, actorId: start.actorId, speaker: start.actorId, mode: 'live', requestKind: 'question', facts: [checked, ready].flatMap(o => [{ observationId: o.id, field: 'value' as const }, { observationId: o.id, field: 'assetId' as const }]), inference: "The check is finished. A condition needed for cooling wasn't met.", uncertainty: "These readings don't identify the exact cause.", proposals: [] };
  return { start, response, checked, ready };
}

it('requests freeform short model prose rather than an authored phrase enum', () => {
  const { start } = fixture(); expect(usesConversationPolicy(start)).toBe(true);
  const schema = parameters(start, initialHistory(start), 1).text!.format as unknown as { schema: { properties: Record<string, { enum?: string[]; maxLength?: number }> } };
  expect(schema.schema.properties.inference.enum).toBeUndefined();
  expect(schema.schema.properties.uncertainty.enum).toBeUndefined();
  expect(schema.schema.properties.inference.maxLength).toBeLessThanOrEqual(220);
});

it.each([
  "The check is finished. A condition needed for cooling wasn't met.",
  "Alex here. The inspection is complete, but it doesn't confirm the cause.",
  "That report records a missing cooling start condition. It doesn't say which part caused it.",
  "It means the check ended with a cooling condition unmet. We haven't established why.",
])('retains safe model-authored wording unchanged: %s', inference => {
  const { start, response } = fixture(); response.inference = inference;
  const before = JSON.stringify(response);
  expect(conciseCoworkerResponse(start, response)).toBe(response);
  expect(JSON.stringify(response)).toBe(before);
});

it('shows the actual model prose without repeating raw IDs, booleans, or identity selectors', () => {
  const { start, response } = fixture(); const before = JSON.stringify(response);
  expect(formatConversationReply(response, start.view)).toBe(`${response.inference}\n${response.uncertainty}`);
  expect(JSON.stringify(response)).toBe(before);
});

it.each(['unknown', 'future', 'missing-selector', 'pending-report', 'wrong-actor'] as const)('rejects a completed-check claim with %s evidence', state => {
  const { start, response, checked } = fixture();
  if (state === 'unknown') checked.quality = 'unknown';
  if (state === 'future') checked.receivedAt = 76;
  if (state === 'missing-selector') response.facts = response.facts.filter(f => !('observationId' in f) || f.observationId !== checked.id);
  if (state === 'pending-report') start.view.messages = [];
  if (state === 'wrong-actor') response.actorId = 'jules';
  expect(conciseCoworkerResponse(start, response)).toBeNull();
});

it.each([
  'The controller has failed.',
  'A broken cooling controller caused the outage.',
  'The pump is broken.',
  'First pause the jobs, then inspect and repair the controller, resume jobs, and verify recovery.',
  'Your repair is complete; cooling is running now.',
  'Completion is scheduled at simulation time 37.',
])('rejects unsupported diagnosis, invented completion, clocks, or a complete recipe: %s', inference => {
  const { start, response } = fixture(); response.inference = inference;
  expect(conciseCoworkerResponse(start, response)).toBeNull();
});

it('keeps generic explanation requests free of work offers and retains proposal-only authority', () => {
  const { start, response } = fixture(); start.message = 'Can you check what this means?';
  expect(projectCoworkerContext(start).view.affordances.some(a => a.action === 'inspect')).toBe(true);
  response.proposals = [{ action: 'inspect', targetId: 'cooling-1', atSimTime: 75, args: { technicianId: 'alex' } }];
  expect(conciseCoworkerResponse(start, response)).toBeNull();
  start.message = 'Please inspect the cooling equipment.'; response.requestKind = 'order';
  response.inference = 'I can check that unit. Confirm the inspection to send me.';
  expect(conciseCoworkerResponse(start, response)).toBe(response);
});

it('keeps numeric readings accurate, old report ages visible, and complete source selectors intact', () => {
  const { start, response } = fixture(); start.view.simTime = 100;
  response.facts.push({ observationId: 'obs-fixture-temp', field: 'value' }, { observationId: 'checked', field: 'observedAt' });
  const text = formatConversationReply(response, start.view);
  expect(text).toContain('Rack A1'); expect(text).toContain('27.1 °C');
  expect(text).toContain('Earlier report'); expect(text).toContain('1:10');
  expect(text).not.toMatch(/asset:|true|false|prerequisite_ready/);
});

it('preserves v2 strict phrases and absent-mode legacy behavior', () => {
  const { start, response } = fixture(); start.promptVersion = 'coworker-v2'; start.interactionMode = 'advisory';
  expect(usesConversationPolicy(start)).toBe(true);
  expect(conciseCoworkerResponse(start, response)).toBeNull();
  response.inference = 'The inspection report is available.'; response.uncertainty = 'The cause is unverified.';
  expect(conciseCoworkerResponse(start, response)).toBe(response);
  delete start.interactionMode; response.inference = 'Original legacy conversation wording.';
  expect(conciseCoworkerResponse(start, response)).toBe(response);
});

it('binds an off-objective natural order to one original turn, then starts real travel exactly once', async () => {
  const engine = initialize(hotRestart, 'natural-order'); engine.step(20);
  const before = engine.snapshot(), initialX = engine.observe('player').crew.find(c => c.id === 'alex')!.x; const command = vi.fn();
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    if (path.endsWith('/cancel')) return new Response('{}');
    const wire: GatewayStart = JSON.parse(String(init.body));
    expect(wire.view.affordances.some(a => a.targetId === 'rack-8' && a.action === 'inspect')).toBe(true);
    return new Response(JSON.stringify({ kind: 'final', runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, response: { runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, speaker: wire.actorId, mode: 'live', requestKind: 'order', facts: [], inference: "I'll check Rack C2 and bring back a report.", uncertainty: '', proposals: [{ action: 'inspect', targetId: 'rack-8', atSimTime: wire.view.simTime, args: { technicianId: 'alex' } }] } }));
  });
  const result = await runCoworker({ simulation: { observe: async actor => engine.observe(actor ?? 'player'), command }, runId: 'natural-order', requestId: 'rack-order', actorId: 'alex', targetId: 'controller', message: 'Could you take a look at Rack C2 for me?', signal: new AbortController().signal, interactionMode: 'conversation', promptVersion: 'coworker-v3' });
  expect(result.reply.kind).toBe('final'); expect(command).not.toHaveBeenCalled(); expect(engine.snapshot()).toEqual(before);
  if (result.reply.kind !== 'final') throw new Error('Expected final natural order');
  const ids = directOrderAuthorizationIds(result.reply.response, result.authorizations); expect(ids).toHaveLength(1);
  const book = new ProposalBook('natural-order'); const auth = result.authorizations[0];
  expect(authorizationMatchesOrigin(auth, result.recording)).toBe(true); book.register(auth);
  const accepted = book.take(ids[0])!; expect(book.take(ids[0])).toBeNull();
  const receipt = engine.applyCommand({ schemaVersion: 1, runId: 'natural-order', actorId: 'player', requestId: accepted.requestId, idempotencyKey: accepted.idempotencyKey, intent: accepted.authorization.intent, expectedEntityVersions: accepted.authorization.expectedEntityVersions });
  expect(receipt.status).toBe('accepted'); expect(engine.observe('player').tasks[0].status).toBe('traveling');
  expect(engine.observe('player').crew.find(c => c.id === 'alex')?.x).toBe(initialX);
  const archive = new HostArchive('natural-order'); archive.capture(result.recording);
  const saved = deserializeRun(serializeRun(archive.build(engine.exportRecord())));
  expect(saved.interactions[0]).toEqual(result.recording);
  expect(replaySavedRun(saved, 'natural-replay').matches).toBe(true);
  expect(directOrderAuthorizationIds({ ...result.reply.response, requestKind: 'question' }, result.authorizations)).toEqual([]);
  expect(directOrderAuthorizationIds({ ...result.reply.response, actorId: 'jules' }, result.authorizations)).toEqual([]);
});

it('rejects a running claim based on a retained reading superseded by a current stopped reading', async () => {
  const engine = initialize(hotRestart, 'reviewer-running-conflict'); engine.step(5);
  const initial = engine.observe('alex');
  const running = initial.observations.find(o => o.assetId === 'cooling-1' && o.field === 'running' && o.value === true && o.observedAt === 5)!;
  expect(running).toBeDefined();
  let calls = 0;
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    if (path.endsWith('/cancel')) return new Response('{}');
    const wire = JSON.parse(String(init.body)) as import('../../src/shared/contracts').GatewayInput;
    if (++calls === 1) return new Response(JSON.stringify({ kind: 'tool_request', runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, interactionId: 'read-running', intent: { runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, interactionId: 'read-running', callId: 'read-cooling', tool: 'read_observations', targetId: 'cooling-1', action: null } }));
    expect(wire.view.observations.some(o => o.assetId === 'cooling-1' && o.field === 'running' && o.value === false && o.observedAt === 10)).toBe(true);
    expect(wire.view.observations.some(o => o.id === running.id)).toBe(true);
    return new Response(JSON.stringify({ kind: 'final', runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, response: { runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, speaker: wire.actorId, mode: 'live', requestKind: 'question', inference: 'Cooling is running.', uncertainty: '', facts: [{ observationId: running.id, field: 'value' }], proposals: [] } }));
  });
  const result = await runCoworker({ simulation: { observe: async actorId => engine.observe(actorId ?? 'player'), command: vi.fn() }, runId: initial.runId, actorId: 'alex', targetId: 'cooling-1', message: 'Is cooling running?', signal: new AbortController().signal, interactionMode: 'conversation', promptVersion: 'coworker-v3', onTool: async () => { engine.step(5); } });
  if (result.reply.kind === 'final') expect(formatConversationReply(result.reply.response, result.view)).not.toBe('Cooling is running.');
  expect(result.reply).toMatchObject({ kind: 'fallback', reason: 'unsafe_narrative' });
});
