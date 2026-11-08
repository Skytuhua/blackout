import { afterEach, expect, it, vi } from 'vitest';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { runCoworker } from '../../src/llm/interaction';
import type { GatewayInput, GatewayResponse, SimulationEngine } from '../../src/shared/contracts';

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const engine = initialize(hotRestart, crypto.randomUUID()); engine.step(10);
  const actor = engine.observe('alex');
  return { engine, input: { simulation: { observe: async (id = 'player') => engine.observe(id), command: async (request: Parameters<SimulationEngine['applyCommand']>[0]) => engine.applyCommand(request) }, runId: actor.runId, actorId: 'alex', targetId: 'cooling-1', message: 'Inspect the selected cooling equipment.', signal: new AbortController().signal } };
}
const tool = (input: GatewayInput, callId: string, inspect: boolean): GatewayResponse => ({ kind: 'tool_request', runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'interaction', intent: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, interactionId: 'interaction', callId, tool: inspect ? 'inspect_asset' : 'read_observations', targetId: 'cooling-1', action: inspect ? { action: 'inspect', targetId: 'cooling-1', atSimTime: input.view.simTime, args: { technicianId: 'alex' } } : null } });
const final = (input: GatewayInput): GatewayResponse => ({ kind: 'final', runId: input.runId, requestId: input.requestId, actorId: input.actorId, response: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId, mode: 'live', facts: [], inference: 'Inspection was requested; work is pending.', uncertainty: 'The cause remains unverified.', proposals: [] } });

it('completes a real engine inspection through gateway continuation without advancing paused time', async () => {
  const { engine, input } = setup(); const requests: GatewayInput[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body)); requests.push(request);
    return new Response(JSON.stringify(request.kind === 'start' ? tool(request, 'inspect', true) : final(request)));
  });
  const result = await runCoworker(input);
  expect(requests).toHaveLength(2); expect(result.reply.kind).toBe('final');
  expect(requests[1].kind === 'continue' && requests[1].result.receipt?.reason).toBe('TASK_RESERVED');
  expect(result.tools[0].status).toBe('accepted');
  expect(engine.observe('player')).toMatchObject({ simTime: 10, tasks: [expect.objectContaining({ status: 'traveling' })] });
  expect(result.start.view.actorId).toBe('alex'); expect(result.start.view.observations.length).toBeLessThan(20);
});

it('uses fresh scoped context for a second tool while preserving the same interaction', async () => {
  const { engine, input } = setup(); let calls = 0; let observations = 0;
  const observe = input.simulation.observe;
  input.simulation.observe = async actor => { if (++observations === 3) engine.step(1); return observe(actor); };
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body)); calls++;
    return new Response(JSON.stringify(calls < 3 ? tool(request, `tool-${calls}`, calls === 2) : final(request)));
  });
  const result = await runCoworker(input);
  expect(calls).toBe(3); expect(result.reply.kind).toBe('final');
  expect(result.tools.map(t => t.status)).toEqual(['completed', 'accepted']);
  expect(engine.observe('player').tasks[0].startedAt).toBe(11);
});

it('closes a canceled interaction during asynchronous observation before dispatching', async () => {
  const { engine, input } = setup(); const controller = new AbortController(); input.signal = controller.signal;
  let observations = 0, commands = 0; const paths: string[] = [];
  input.simulation.observe = async actor => { if (++observations === 2) controller.abort(); return engine.observe(actor ?? 'player'); };
  input.simulation.command = async request => { commands++; return engine.applyCommand(request); };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { paths.push(url); return new Response(JSON.stringify(url.endsWith('/cancel') ? {} : tool(JSON.parse(String(init.body)), 'late', true))); });
  const result = await runCoworker(input);
  expect(result.reply.kind === 'fallback' && result.reply.reason).toBe('canceled');
  expect(commands).toBe(0); expect(paths.filter(path => path.endsWith('/turn'))).toHaveLength(1);
  expect(paths).toContain('/api/llm/cancel');
});

it('never executes a third tool without a remaining model round', async () => {
  const { engine, input } = setup(); let calls = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { if (url.endsWith('/cancel')) return new Response('{}'); const request = JSON.parse(String(init.body)); return new Response(JSON.stringify(tool(request, `tool-${++calls}`, calls === 3))); });
  const result = await runCoworker(input);
  expect(result.reply.kind === 'fallback' && result.reply.reason).toBe('interaction_quota');
  expect(calls).toBe(3); expect(engine.observe('player').tasks).toHaveLength(0);
});
