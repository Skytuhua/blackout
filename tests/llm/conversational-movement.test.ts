import { afterEach, expect, it, vi } from 'vitest';
import type { ActionIntent, AgentResponse, GatewayStart } from '../../src/shared/contracts';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { procedures } from '../../src/content/procedures';
import { initialize } from '../../src/sim/engine';
import { projectCoworkerContext, conciseCoworkerResponse } from '../../src/llm/conversation-policy';
import { validAction, validStart } from '../../src/llm/validation';
import { directOrderAuthorizationIds } from '../../src/llm/natural-conversation';
import { runCoworker } from '../../src/llm/interaction';
import { authorizationMatchesOrigin, ProposalBook, createConversations, withConversationAssignments } from '../../src/shared/conversations';
import { HostArchive } from '../../src/persistence/host-archive';
import { deserializeRun, serializeRun } from '../../src/persistence/runs';
import { replaySavedRun } from '../../src/persistence/saved-record';
import { fallbackCopy } from '../../src/ui/conversation/fallback-copy';

afterEach(() => vi.unstubAllGlobals());
const rack = hotRestart.topology.assets.find(asset => asset.id === 'rack-2')!;
const message = 'dont check the controls, walk around to some server rack';
function setup(actorId: 'alex' | 'jules' | 'sam' = 'alex') {
  const engine = initialize(hotRestart, `movement-${actorId}`), view = engine.observe(actorId);
  const start: GatewayStart = { kind: 'start', runId: view.runId, requestId: 'move-request', actorId, role: view.crew.find(c => c.id === actorId)!.role, message, interactionMode: 'conversation', promptVersion: 'coworker-v4', view, procedures };
  return { engine, start };
}
const movement = (start: GatewayStart, targetId = start.actorId): ActionIntent => ({ action: 'move_crew', targetId, atSimTime: start.view.simTime, args: { destination: rack.serviceTile } });
const reply = (start: GatewayStart, intent: ActionIntent): AgentResponse => ({ runId: start.runId, requestId: start.requestId, actorId: start.actorId, speaker: start.actorId, mode: 'live', requestKind: 'order', facts: [], inference: "I'll head over there.", uncertainty: '', proposals: [intent] });

it.each(['alex', 'jules', 'sam'] as const)('lets %s walk to a public rack without equipment work', actorId => {
  const { start } = setup(actorId), projected = projectCoworkerContext(start), move = movement(projected);
  expect(validStart(start)).toBe(true);
  expect(projected.view.affordances).toContainEqual(expect.objectContaining({ action: 'move_crew', targetId: actorId, enabled: true }));
  expect(validAction(move, projected)).toBe(true);
  expect(conciseCoworkerResponse(projected, reply(projected, move))).not.toBeNull();
  expect(validAction(movement(projected, actorId === 'alex' ? 'jules' : 'alex'), projected)).toBe(false);
  expect(validAction({ ...move, args: { destination: { x: 999, y: 999 } } }, projected)).toBe(false);
  expect(validAction({ ...move, args: { destination: rack.serviceTile, ceiling: 1 } }, projected)).toBe(false);
});

it('does not change legacy v3 affordances', () => {
  const old = setup().start; old.promptVersion = 'coworker-v3';
  const projected = projectCoworkerContext(old);
  expect(projected.view.affordances.some(a => a.action === 'move_crew')).toBe(false);
  expect(validAction(movement(projected), projected)).toBe(false);
});

it('rejects a model proposal to inspect explicitly excluded controls', () => {
  const projected = projectCoworkerContext(setup().start);
  const inspect: ActionIntent = { action: 'inspect', targetId: 'controller', atSimTime: projected.view.simTime, args: { technicianId: 'alex' } };
  expect(validAction(inspect, projected)).toBe(true);
  expect(conciseCoworkerResponse(projected, reply(projected, inspect))).toBeNull();
  projected.message = 'dont check the controls, inspect Rack A2 instead';
  const rackInspection: ActionIntent = { ...inspect, targetId: 'rack-2' };
  expect(conciseCoworkerResponse(projected, reply(projected, rackInspection))).not.toBeNull();
  projected.message = 'dont check the controls and inspect Rack A2 instead';
  expect(conciseCoworkerResponse(projected, reply(projected, rackInspection))).not.toBeNull();
  projected.message = 'dont check the controls and walk to A2';
  expect(conciseCoworkerResponse(projected, reply(projected, movement(projected)))).not.toBeNull();
});

it('does not carry out an explicitly forbidden walk or workload change', () => {
  const projected = projectCoworkerContext(setup().start), move = movement(projected);
  projected.message = "don't walk to Rack A2; check the controls instead";
  expect(conciseCoworkerResponse(projected, reply(projected, move))).toBeNull();
  const sam = projectCoworkerContext(setup('sam').start);
  sam.message = "don't change the background job limit";
  const change: ActionIntent = { action: 'set_batch_ceiling', targetId: 'site', atSimTime: sam.view.simTime, args: { ceiling: 20 } };
  expect(validAction(change, sam)).toBe(true);
  expect(conciseCoworkerResponse(sam, reply(sam, change))).toBeNull();
  sam.message = "don't pause background jobs";
  expect(conciseCoworkerResponse(sam, reply(sam, { ...change, args: { ceiling: 0 } }))).toBeNull();
  sam.message = "don't pause Rack A2, leave it running";
  const pause: ActionIntent = { action: 'pause_batch', targetId: 'site', atSimTime: sam.view.simTime, args: {} };
  expect(conciseCoworkerResponse(sam, reply(sam, pause))).toBeNull();
  sam.message = "don't do anything to Rack A2, just say hi";
  expect(conciseCoworkerResponse(sam, reply(sam, pause))).toBeNull();
  sam.message = "don't pause Rack A2, pause Rack A1 instead";
  expect(conciseCoworkerResponse(sam, reply(sam, { ...pause, targetId: 'rack-1' }))).not.toBeNull();
});

it.each(['alex', 'jules', 'sam'] as const)('retains every currently eligible engine action for %s', actorId => {
  const { start } = setup(actorId), projected = projectCoworkerContext(start);
  const own = start.view.affordances.filter(a => a.enabled && a.action !== 'cancel_task' && (start.role === 'remote' ? a.technicianIds.length === 0 : a.technicianIds.includes(actorId)) && Object.hasOwn(start.view.observedEntityVersions, a.targetId));
  for (const action of own) expect(projected.view.affordances).toContainEqual(expect.objectContaining({ action: action.action, targetId: action.targetId, enabled: true }));
});

it('does not cancel busy work merely because the player asked to walk', () => {
  const { engine, start } = setup();
  const receipt = engine.applyCommand({ schemaVersion: 1, runId: start.runId, requestId: 'inspect', actorId: 'player', idempotencyKey: 'inspect', expectedEntityVersions: start.view.observedEntityVersions, intent: { action: 'inspect', targetId: 'controller', atSimTime: 0, args: { technicianId: 'alex' } } });
  start.view = engine.observe('alex'); const projected = projectCoworkerContext(start);
  expect(projected.view.affordances.some(a => a.action === 'move_crew')).toBe(false);
  const stop: ActionIntent = { action: 'cancel_task', targetId: 'controller', atSimTime: projected.view.simTime, args: { taskId: receipt.taskId! } };
  expect(conciseCoworkerResponse(projected, reply(projected, stop))).toBeNull();
  projected.message = 'Stop talking and walk around.';
  expect(conciseCoworkerResponse(projected, reply(projected, stop))).toBeNull();
  projected.message = 'Please stop your current task.';
  expect(conciseCoworkerResponse(projected, reply(projected, stop))).not.toBeNull();
  projected.message = 'Please stop what you are doing.';
  expect(conciseCoworkerResponse(projected, reply(projected, stop))).not.toBeNull();
  projected.message = 'Stop working.';
  expect(conciseCoworkerResponse(projected, reply(projected, stop))).not.toBeNull();
});

it('does not turn a greeting into a game action', () => {
  const sam = projectCoworkerContext(setup('sam').start); sam.message = 'hi';
  const pause: ActionIntent = { action: 'pause_batch', targetId: 'site', atSimTime: sam.view.simTime, args: {} };
  expect(validAction(pause, sam)).toBe(true);
  expect(conciseCoworkerResponse(sam, reply(sam, pause))).toBeNull();
  sam.message = 'Hi, please pause background jobs.';
  expect(conciseCoworkerResponse(sam, reply(sam, pause))).not.toBeNull();
  sam.message = "don't do anything, just say hi";
  expect(conciseCoworkerResponse(sam, reply(sam, pause))).toBeNull();
});

it('retains historical player-scoped movement validation for old recordings', () => {
  const { engine, start } = setup(); const view = engine.observe('player');
  const legacy: GatewayStart = { ...start, actorId: 'player', role: 'player', view, promptVersion: 'coworker-v1' };
  delete legacy.interactionMode;
  expect(validAction(movement(legacy, 'alex'), legacy)).toBe(true);
});

it('the engine rejects a movement order when the worker became busy after authorization', () => {
  const { engine, start } = setup(); const projected = projectCoworkerContext(start), move = movement(projected);
  expect(validAction(move, projected)).toBe(true);
  const versions = structuredClone(projected.view.observedEntityVersions);
  const inspect = engine.applyCommand({ schemaVersion: 1, runId: start.runId, requestId: 'inspect', actorId: 'player', idempotencyKey: 'inspect', expectedEntityVersions: versions, intent: { action: 'inspect', targetId: 'controller', atSimTime: 0, args: { technicianId: 'alex' } } });
  expect(inspect.status).toBe('accepted');
  const rejected = engine.applyCommand({ schemaVersion: 1, runId: start.runId, requestId: 'move', actorId: 'player', idempotencyKey: 'move', expectedEntityVersions: versions, intent: move });
  expect(rejected.status).toBe('rejected'); expect(engine.observe('player').crew.find(c => c.id === 'alex')!.taskId).toBe(inspect.taskId);
});

it('runs an original-turn walking order once and preserves its archive and replay', async () => {
  const { engine, start } = setup('jules');
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    if (path.endsWith('/cancel')) return new Response('{}');
    const wire = JSON.parse(String(init.body)) as GatewayStart, intent = movement(wire);
    return new Response(JSON.stringify({ kind: 'final', runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, response: reply(wire, intent) }));
  });
  const result = await runCoworker({ simulation: { observe: async actor => engine.observe(actor ?? 'player'), command: vi.fn() }, runId: start.runId, requestId: start.requestId, actorId: 'jules', targetId: null, message: 'go to A2', signal: new AbortController().signal, interactionMode: 'conversation', promptVersion: 'coworker-v4' });
  expect(result.reply.kind).toBe('final'); if (result.reply.kind !== 'final') throw new Error('Expected movement order');
  const ids = directOrderAuthorizationIds(result.reply.response, result.authorizations), auth = result.authorizations[0];
  expect(ids).toHaveLength(1); expect(authorizationMatchesOrigin(auth, result.recording)).toBe(true);
  const book = new ProposalBook(start.runId); (book.register as any)(auth, { allowMovement: true });
  const token = book.take(ids[0])!; expect(book.take(ids[0])).toBeNull();
  const receipt = engine.applyCommand({ schemaVersion: 1, runId: start.runId, actorId: 'player', requestId: token.requestId, idempotencyKey: token.idempotencyKey, intent: token.authorization.intent, expectedEntityVersions: token.authorization.expectedEntityVersions });
  expect(receipt.status).toBe('accepted');
  const task = engine.observe('player').tasks.find(t => t.id === receipt.taskId)!;
  expect(task.action).toBe('move_crew'); expect(task.path.at(-1)).toEqual(rack.serviceTile);
  expect(withConversationAssignments(createConversations(), engine.observe('player')).find(t => t.actorId === 'jules')!.assignment.label).toContain('Rack A2');
  engine.step(receipt.eta!); expect(engine.observe('player').crew.find(c => c.id === 'jules')).toMatchObject({ ...rack.serviceTile, taskId: null });
  expect(engine.observe('player').messages.some(m => m.id === `report-${receipt.taskId}`)).toBe(false);
  const archive = new HostArchive(start.runId); archive.capture(result.recording);
  const saved = deserializeRun(serializeRun(archive.build(engine.exportRecord())));
  expect(replaySavedRun(saved, 'movement-replay').matches).toBe(true);
});

it('explains provider contention and oversized context instead of generic invalid replies', () => {
  expect(fallbackCopy('provider_busy')).toMatch(/another reply/i);
  expect(fallbackCopy('input_limit')).toMatch(/conversation/i);
});
