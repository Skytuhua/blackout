import { expect, it } from 'vitest';
import type { Response } from 'openai/resources/responses/responses';
import type { GatewayStart } from '../../src/shared/contracts';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { procedures } from '../../src/content/procedures';
import { initialize } from '../../src/sim/engine';
import { scopeKnowledge } from '../../src/llm/context';
import { projectCoworkerContext } from '../../src/llm/conversation-policy';
import { appendFreshView, appendOutput, appendToolResult, decode, initialHistory, parameters } from '../../server/llm/adapter';
import { request, successfulPolicy } from '../sim/mission-policy';

function fixture(version = 'coworker-v4', at = 42): GatewayStart {
  const engine = initialize(hotRestart, 'a785f355-e33a-4b76-a44c-7144108ec7d5');
  const inspection = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
  expect(inspection.status).toBe('accepted');
  engine.step(at);
  const view = scopeKnowledge(engine.observe('alex'), ['controller'], [], true);
  return { kind: 'start', runId: view.runId, requestId: 'd0571c9c-86f9-4310-b0db-e96e92fdf855', actorId: 'alex', role: 'facilities', message: 'dont check the controls, walk around to some server rack', view, procedures, promptVersion: version, interactionMode: 'conversation' };
}

it('exposes real accessible destinations for v4 without changing the v3 context', () => {
  const v4 = fixture(), v3 = fixture('coworker-v3');
  const data = JSON.parse((initialHistory(v4)[0] as { content: string }).content).view;
  const old = JSON.parse((initialHistory(v3)[0] as { content: string }).content).view;
  const rack = v4.view.knownTopology.assets.find(asset => asset.kind === 'rack')!;
  expect(data.assets.find((row: unknown[]) => row[0] === rack.id)).toEqual([rack.id, rack.label, rack.kind, [rack.serviceTile.x, rack.serviceTile.y]]);
  const decoded = data.walkableRows.flatMap(([y, runs]: [number, number[][]]) => runs.flatMap(([first, last]) => Array.from({ length: last - first + 1 }, (_, i) => [first + i, y])));
  expect(decoded.sort()).toEqual(v4.view.knownTopology.walkable.map(p => [p.x, p.y]).sort());
  const alex = v4.view.crew.find(c => c.id === 'alex')!;
  expect(data.crew.find((c: { id: string }) => c.id === 'alex').position).toEqual([alex.x, alex.y]);
  expect(old.assets.find((row: unknown[]) => row[0] === rack.id)).toEqual([rack.id, rack.label, rack.kind]);
  expect(old.walkable).toBeUndefined();
});

it('permits an actual movement destination in v4 while excluding it in v3', () => {
  const v4 = fixture(), v3 = fixture('coworker-v3');
  const format = (start: GatewayStart) => JSON.stringify(parameters(start, initialHistory(start), 1).text!.format);
  expect(format(v4)).toContain('move_crew');
  expect(format(v4)).toContain('destination');
  expect(format(v3)).not.toContain('move_crew');
  expect(format(v3)).not.toContain('destination');
  expect(parameters(v4, initialHistory(v4), 1).instructions).toContain('Walking is not inspection');
  expect(parameters(v4, initialHistory(v4), 1).instructions).toContain('even equipment outside their work specialty');
  expect(parameters(v4, initialHistory(v4), 1).instructions).toContain('even outside the current objective');
  const responseSchema = parameters(v4, initialHistory(v4), 1).text!.format as unknown as { schema: { properties: { proposals: { items: { properties: { args: { required: string[] } } } } } } };
  expect(responseSchema.schema.properties.proposals.items.properties.args.required).toEqual(expect.arrayContaining(['technicianId', 'ceiling', 'taskId', 'destination']));
});

it('decodes a v4 walk proposal without transforming it into equipment work', () => {
  const start = fixture(), rack = start.view.knownTopology.assets.find(asset => asset.kind === 'rack')!;
  const message = { runId: start.runId, requestId: start.requestId, actorId: 'alex', speaker: 'alex', mode: 'live', requestKind: 'order', facts: [], inference: 'I’ll walk over to a rack.', uncertainty: '', proposals: [{ action: 'move_crew', targetId: 'alex', atSimTime: start.view.simTime, args: { technicianId: 'alex', destination: rack.serviceTile, ceiling: null, taskId: null } }] };
  const response = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(message) }] }] } as Response;
  expect(decode(response, start, 'turn')).toMatchObject({ proposals: [{ action: 'move_crew', targetId: 'alex', args: { technicianId: 'alex', destination: rack.serviceTile } }] });
});

it.each([26, 42])('keeps the real v4 prompt within the existing input budget at t=%i', at => {
  const start = projectCoworkerContext(fixture('coworker-v4', at));
  expect(start.view.affordances.some(a => a.action === 'move_crew')).toBe(at === 42);
  const params = parameters(start, initialHistory(start), 1);
  expect(Math.ceil(Buffer.byteLength(JSON.stringify(params), 'utf8') / 2)).toBeLessThanOrEqual(6000);
  const context = JSON.parse((initialHistory(start)[0] as { content: string }).content).view;
  expect(context.observations).toHaveLength(start.view.observations.length);
  expect(context.affordances).toHaveLength(start.view.affordances.filter(a => a.enabled).length);
  expect(context.affordances).toEqual(start.view.affordances.filter(a => a.enabled).map(a => [a.action, a.targetId, a.technicianIds, a.travelSeconds, a.workSeconds, ...(a.reason === null ? [] : [a.reason])]));
});

it('retains older cited evidence in v4 even when a newer reading has the same source and field', () => {
  const start = fixture();
  const original = start.view.observations[0];
  start.view.observations.push({ ...original, id: 'older-cited-reading', observedAt: 0, receivedAt: 0 });
  const context = JSON.parse((initialHistory(start)[0] as { content: string }).content).view;
  expect(context.observations.map((row: unknown[]) => row[0])).toContain('older-cited-reading');
});

it('fits a real mid-mission Sam conversation and its continuation without losing the scoped evidence', () => {
  const engine = initialize(hotRestart, 'a785f355-e33a-4b76-a44c-7144108ec7d5');
  successfulPolicy(engine, 300);
  const view = scopeKnowledge(engine.observe('sam'), ['controller', 'cooling-1', 'cooling-2', 'rack-1'], [], true, true);
  const start = projectCoworkerContext({ kind: 'start', runId: view.runId, requestId: 'd0571c9c-86f9-4310-b0db-e96e92fdf855', actorId: 'sam', role: 'remote', message: 'Can you walk to rack 1?', view, procedures, promptVersion: 'coworker-v4', interactionMode: 'conversation' });
  const initial = initialHistory(start);
  const tokens = (history: typeof initial) => Math.ceil(Buffer.byteLength(JSON.stringify(parameters(start, history, 1)), 'utf8') / 2);
  expect(tokens(initial)).toBeLessThanOrEqual(6000);
  const context = JSON.parse((initial[0] as { content: string }).content).view;
  expect(context.observations.map((row: unknown[]) => row[0])).toEqual(start.view.observations.map(o => o.id));
  let history = initial;
  for (const [index, asset] of ['rack-1', 'rack-2'].entries()) {
    const callId = `call-${index}`;
    const observations = engine.observe('sam').observations.filter(o => o.assetId === asset).slice(-7);
    const result = { runId: start.runId, requestId: start.requestId, actorId: 'sam', interactionId: 'interaction', callId, status: 'completed' as const, reason: 'observations', receipt: null, procedureText: null, observations };
    history = appendOutput(history, { output: [{ type: 'function_call', call_id: callId, name: 'read_observations', arguments: JSON.stringify({ targetId: asset, action: null }) }] } as Response);
    history = appendToolResult(history, callId, result, true);
    const fresh = { ...start, view: scopeKnowledge(engine.observe('sam'), ['controller', 'cooling-1', 'cooling-2', 'rack-1', 'rack-2'], observations.map(o => o.id), true, true) };
    history = appendFreshView(history, fresh);
    expect(tokens(history)).toBeLessThanOrEqual(6000);
    const latest = JSON.parse((history.at(-1) as { content: string }).content).view;
    expect(observations.every(o => latest.observations.some((row: unknown[]) => row[0] === o.id))).toBe(true);
  }
});
