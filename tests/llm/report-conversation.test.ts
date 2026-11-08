import { afterEach, expect, it, vi } from 'vitest';
import type { AgentResponse, GatewayInput, GatewayStart } from '../../src/shared/contracts';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { procedures } from '../../src/content/procedures';
import { initialize } from '../../src/sim/engine';
import { request, successfulPolicy } from '../sim/mission-policy';
import { scopeKnowledge } from '../../src/llm/context';
import { conciseCoworkerResponse, projectCoworkerContext } from '../../src/llm/conversation-policy';
import { runCoworker } from '../../src/llm/interaction';
import { naturalReplyText } from '../../src/llm/natural-conversation';
import { initialHistory, parameters } from '../../server/llm/adapter';

afterEach(() => vi.unstubAllGlobals());
let run = 0;

function inspection(delivered = true) {
  const engine = initialize(hotRestart, `report-conversation-${++run}`);
  engine.step(14);
  const receipt = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
  expect(receipt.status).toBe('accepted');
  engine.step((delivered ? 67 : receipt.eta! + 1) - 14);
  return { engine, receipt };
}

function start(view: GatewayStart['view'], version = 'coworker-v4'): GatewayStart {
  const actor = view.crew.find(crew => crew.id === view.actorId)!;
  return projectCoworkerContext({ kind: 'start', runId: view.runId, requestId: 'report-question', actorId: view.actorId, role: actor.role, message: 'what do you see?', view, procedures, promptVersion: version, interactionMode: 'conversation' });
}

function reply(input: Pick<GatewayInput, 'runId' | 'requestId' | 'actorId'>, inference = 'The inspection is complete. A cooling start condition is not met.'): AgentResponse {
  return { runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId, mode: 'live', requestKind: 'question', facts: [], inference, uncertainty: '', proposals: [] };
}

it('allows report prose grounded in supplied delivered findings without redundant selectors', () => {
  const { engine, receipt } = inspection();
  const input = start(scopeKnowledge(engine.observe('alex'), ['controller'], [], true));
  expect(input.view.messages.some(message => message.id === `report-${receipt.taskId}`)).toBe(true);
  expect(input.view.observations).toEqual(expect.arrayContaining([
    expect.objectContaining({ assetId: 'controller', field: 'inspection_complete', value: true, source: 'report:alex' }),
    expect.objectContaining({ assetId: 'controller', field: 'prerequisite_ready', value: false, source: 'report:alex' }),
  ]));
  expect(conciseCoworkerResponse(input, reply(input))).toEqual(reply(input));
});

it('still rejects a not-yet-delivered report, an unseen cause, and unsupported recovery', () => {
  const pending = start(scopeKnowledge(inspection(false).engine.observe('alex'), ['controller'], [], true));
  expect(pending.view.observations.some(observation => observation.source === 'report:alex')).toBe(false);
  expect(conciseCoworkerResponse(pending, reply(pending))).toBeNull();
  const current = start(scopeKnowledge(inspection().engine.observe('alex'), ['controller'], [], true));
  expect(conciseCoworkerResponse(current, reply(current, 'The controller is broken.'))).toBeNull();
  expect(conciseCoworkerResponse(current, reply(current, 'Cooling is running.'))).toBeNull();
  expect(conciseCoworkerResponse(current, reply(current, 'The UPS inspection is complete.'))).toBeNull();
  expect(conciseCoworkerResponse(current, reply(current, 'The UPS inspection is complete according to my controller report.'))).toBeNull();
  expect(conciseCoworkerResponse(current, reply(current, 'The generator inspection is complete.'))).toBeNull();
  const contradictory = structuredClone(current);
  contradictory.view.observations.push({ ...contradictory.view.observations.find(observation => observation.field === 'prerequisite_ready')!, id: 'new-contradiction', observedAt: 67, receivedAt: 67, value: true });
  expect(conciseCoworkerResponse(contradictory, reply(contradictory))).toBeNull();
});

it('keeps a valid reply with many citations and renders its complete prose without appending evidence metadata', () => {
  const input = start(scopeKnowledge(inspection().engine.observe('alex'), ['controller'], [], true));
  const response = { ...reply(input, 'My controller inspection reported the prerequisite was not ready. The latest site dashboard reports full critical and interactive service, no batch backlog, and no active overload.'), uncertainty: 'The controller report is from time 51; the site dashboard readings are from time 65.', facts: input.view.observations.slice(0, 9).map(o => ({ observationId: o.id, field: 'value' as const })) };
  expect(naturalReplyText(response, input.view).length).toBeGreaterThan(260);
  expect(conciseCoworkerResponse(input, response)).toEqual(response);
  expect(naturalReplyText(response, input.view, true)).toBe(`${response.inference}\n${response.uncertainty}`);
});

it('retains Sam’s report evidence without expanding every rack’s latest sensor context past the input budget', () => {
  const engine = initialize(hotRestart, 'report-budget'); successfulPolicy(engine, 200);
  const view = scopeKnowledge(engine.observe('sam'), ['controller', 'cooling-1', 'cooling-2', 'rack-1'], [], true, true);
  const input = start(view);
  const report = engine.observe('sam').messages.filter(m => m.speaker === 'sam' && m.mode === 'system').at(-1)!;
  expect(view.observations.filter(o => report.evidenceIds.includes(o.id)).length).toBeGreaterThan(0);
  expect(Math.ceil(Buffer.byteLength(JSON.stringify(parameters(input, initialHistory(input), 1)), 'utf8') / 2)).toBeLessThanOrEqual(6000);
});

async function askAfterReport(targetId: string | null, actorId = 'alex', version = 'coworker-v4', delivered = true) {
  const { engine, receipt } = inspection(delivered);
  const original = structuredClone(engine.observe(actorId));
  const wire: GatewayInput[] = [];
  const command = vi.fn();
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/cancel')) return new Response('{}');
    const input = JSON.parse(String(init.body)) as GatewayInput;
    wire.push(input);
    return new Response(JSON.stringify({ kind: 'final', runId: input.runId, requestId: input.requestId, actorId: input.actorId, response: reply(input, 'I can explain the observations available to me.') }));
  });
  const result = await runCoworker({ simulation: { observe: async actor => engine.observe(actor ?? 'player'), command }, runId: original.runId, requestId: `report-${actorId}`, actorId, targetId, message: 'what do you see?', signal: new AbortController().signal, interactionMode: 'conversation', promptVersion: version });
  expect(command).not.toHaveBeenCalled();
  expect(engine.observe(actorId)).toEqual(original);
  expect(result.recording?.turns.map(turn => turn.input)).toEqual(wire);
  expect(wire).toHaveLength(1);
  return { original, input: wire[0], result, receipt };
}

it.each(['rack-2', null])('keeps Alex’s exact delivered report when equipment focus is %s', async targetId => {
  const { original, input, result, receipt } = await askAfterReport(targetId);
  const report = original.messages.find(message => message.id === `report-${receipt.taskId}`)!;
  const findings = original.observations.filter(observation => report.evidenceIds.includes(observation.id));
  expect(findings).toHaveLength(2);
  expect(input.view.observations).toEqual(expect.arrayContaining(findings));
  expect(input.view.messages).toContainEqual(report);
  expect(result.reply.kind).toBe('final');
  expect(result.targetId).toBe(targetId);
});

it('does not disclose Alex’s report to Jules or disclose a pending report', async () => {
  const jules = await askAfterReport('rack-2', 'jules');
  expect(jules.original.observations.some(observation => observation.source === 'report:alex')).toBe(false);
  expect(jules.input.view.observations.some(observation => observation.source === 'report:alex')).toBe(false);
  const pending = await askAfterReport('rack-2', 'alex', 'coworker-v4', false);
  expect(pending.input.view.observations.some(observation => observation.source === 'report:alex')).toBe(false);
  expect(pending.input.view.messages.some(message => message.id === `report-${pending.receipt.taskId}`)).toBe(false);
});

it('preserves the existing v3 selected-target projection for retained wire semantics', async () => {
  const { input } = await askAfterReport('rack-2', 'alex', 'coworker-v3');
  if (input.kind !== 'start') throw new Error('Expected original start wire.');
  expect(input.promptVersion).toBe('coworker-v3');
  expect(input.view.observations.some(observation => observation.assetId === 'controller')).toBe(false);
});
