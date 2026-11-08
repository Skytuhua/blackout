import { afterEach, expect, it, vi } from 'vitest';
import type { ActionIntent, GatewayInput, GatewayResponse, GatewayStart, ToolIntent } from '../../src/shared/contracts';
import { executeToolIntent } from '../../src/llm/tools';
import { runCoworker } from '../../src/llm/interaction';
import { start } from './fixtures';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const advisory = (): GatewayStart => ({ ...structuredClone(start), requestId: crypto.randomUUID(), actorId: 'alex', role: 'facilities', interactionMode: 'advisory', view: { ...structuredClone(start.view), actorId: 'alex' } });
const action = (wire: GatewayInput, name: 'inspect' | 'repair_cooling' = 'inspect') => ({ action: name, targetId: 'cooling-1', atSimTime: wire.view.simTime, args: { technicianId: 'alex' } } satisfies ActionIntent);
const intent = (wire: GatewayInput, tool: ToolIntent['tool'], callId = 'call'): ToolIntent => ({ runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, interactionId: 'interaction', callId, tool, targetId: 'cooling-1', action: tool === 'read_observations' ? null : action(wire) });
const toolReply = (wire: GatewayInput, tool: ToolIntent['tool'], callId = 'call'): GatewayResponse => ({ kind: 'tool_request', runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, interactionId: 'interaction', intent: intent(wire, tool, callId) });
const finalReply = (wire: GatewayInput, proposals: ActionIntent[] = []): GatewayResponse => ({ kind: 'final', runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, response: { runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, speaker: wire.actorId, mode: 'live', facts: [], inference: 'Please confirm the proposed work.', uncertainty: 'The cause remains unverified.', proposals } });
const requestFor = (input: GatewayStart) => ({ simulation: { observe: async () => input.view, command: vi.fn() }, runId: input.runId, actorId: input.actorId, targetId: 'cooling-1', message: 'Check cooling.', signal: new AbortController().signal, interactionMode: 'advisory' as const });

it.each(['inspect', 'repair_cooling'] as const)('rejects injected advisory inspect_asset %s without dispatch, including duplicates', async name => {
  const input = advisory(); const command = vi.fn();
  const context = { start: input, simulation: { observe: async () => input.view, command } };
  const request = { ...intent(input, 'inspect_asset'), action: action(input, name) };
  const first = await executeToolIntent(request, context);
  expect(first).toMatchObject({ status: 'rejected', reason: 'advisory_execution_forbidden', receipt: null, observations: [] });
  expect(await executeToolIntent(request, context)).toEqual(first);
  expect(command).not.toHaveBeenCalled();
});

it('sends advisory mode on the exact start wire and never dispatches an injected legacy inspection', async () => {
  const input = advisory(); const command = vi.fn(); const wire: GatewayInput[] = [];
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    if (path.endsWith('/cancel')) return new Response('{}');
    const request = JSON.parse(String(init.body)) as GatewayInput; wire.push(request);
    return new Response(JSON.stringify(request.kind === 'start' ? toolReply(request, 'inspect_asset') : finalReply(request)));
  });
  const result = await runCoworker({ simulation: { observe: async () => input.view, command }, runId: input.runId, actorId: input.actorId, targetId: 'cooling-1', message: 'Check cooling.', signal: new AbortController().signal, interactionMode: 'advisory' });
  expect(wire[0]).toMatchObject({ interactionMode: 'advisory' });
  expect(result.tools[0]).toMatchObject({ status: 'rejected', reason: 'advisory_execution_forbidden', receipt: null });
  expect(command).not.toHaveBeenCalled();
  expect(result.recording?.turns.map(turn => turn.input)).toEqual(wire);
});

it('binds final proposals to the final post-projection wire after a sensor refresh', async () => {
  const input = advisory(); const request = requestFor(input); const wire: GatewayInput[] = [];
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    const sent = JSON.parse(String(init.body)) as GatewayInput; wire.push(sent);
    return new Response(JSON.stringify(sent.kind === 'start' ? toolReply(sent, 'read_observations') : finalReply(sent, [action(sent), action(sent)])));
  });
  const result = await runCoworker({ ...request, onTool: async () => {
    input.view = { ...input.view, simTime: 76, observedEntityVersions: { 'cooling-1': 2, 'rack-1': 9 } };
  } });
  expect(result.authorizations).toEqual([{ id: expect.any(String), runId: input.runId, actorId: 'alex', requestId: wire[1].requestId, intent: action(wire[1]), expectedEntityVersions: { 'cooling-1': 2, 'rack-1': 9 } }]);
  expect(result.authorizations[0].expectedEntityVersions).toEqual(wire[1].view.observedEntityVersions);
  expect(result.recording?.turns.map(turn => turn.input)).toEqual(wire);
  expect(JSON.stringify(wire)).not.toContain('authorizations');
  expect(request.simulation.command).not.toHaveBeenCalled();
});

it('retains each tool proposal original versions and deduplicates a later repeated final proposal', async () => {
  const input = advisory(); const request = requestFor(input); const wire: GatewayInput[] = [];
  input.view.affordances.push({ ...input.view.affordances[0], action: 'repair_cooling' });
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    const sent = JSON.parse(String(init.body)) as GatewayInput; wire.push(sent);
    return new Response(JSON.stringify(wire.length === 1 ? toolReply(sent, 'propose_action', 'propose') : wire.length === 2 ? toolReply(sent, 'read_observations', 'read') : finalReply(sent, [action(sent), action(sent, 'repair_cooling')])));
  });
  const result = await runCoworker({ ...request, onTool: async () => {
    input.view = { ...input.view, simTime: input.view.simTime + 1, observedEntityVersions: { 'cooling-1': wire.length + 1, 'rack-1': 9 } };
  } });
  expect(result.tools[0]).toMatchObject({ status: 'completed', reason: 'player_confirmation_required', receipt: null, observations: [] });
  expect(result.authorizations).toEqual([
    { id: expect.any(String), runId: input.runId, actorId: 'alex', requestId: wire[0].requestId, intent: action(wire[0]), expectedEntityVersions: { 'cooling-1': 1, 'rack-1': 1 } },
    { id: expect.any(String), runId: input.runId, actorId: 'alex', requestId: wire[2].requestId, intent: action(wire[2], 'repair_cooling'), expectedEntityVersions: { 'cooling-1': 3, 'rack-1': 9 } },
  ]);
  expect(new Set(result.authorizations.map(value => value.id)).size).toBe(2);
  expect(request.simulation.command).not.toHaveBeenCalled();
  expect(result.recording?.turns.map(turn => turn.input)).toEqual(wire);
  result.start.view.observedEntityVersions['cooling-1'] = 99;
  result.reply.kind === 'final' && (result.reply.response.proposals[0].args.technicianId = 'jules');
  expect(result.authorizations[0]).toMatchObject({ actorId: 'alex', intent: { args: { technicianId: 'alex' } }, expectedEntityVersions: { 'cooling-1': 1 } });
  expect(result.authorizations[1].expectedEntityVersions['cooling-1']).toBe(3);
});

it.each(['canceled', 'reset'] as const)('returns no execution tokens when %s wins after a valid tool proposal', async reason => {
  const input = advisory(); const request = requestFor(input); const controller = new AbortController(); let turns = 0;
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    if (path.endsWith('/cancel')) return new Response('{}');
    turns++; return new Response(JSON.stringify(toolReply(JSON.parse(String(init.body)), 'propose_action')));
  });
  const result = await runCoworker({ ...request, signal: controller.signal, onTool: async () => {
    if (reason === 'canceled') controller.abort();
    else input.view = { ...input.view, runId: 'reset-run' };
  } });
  expect(result.reply).toMatchObject({ kind: 'fallback', reason: reason === 'reset' ? 'stale_run' : 'canceled' });
  expect(result.tools[0]).toMatchObject({ reason: 'player_confirmation_required', status: 'completed' });
  expect(result.authorizations).toEqual([]);
  expect(turns).toBe(1);
  expect(request.simulation.command).not.toHaveBeenCalled();
});

it('rejects stale tool proposals without replacing their original versions', async () => {
  const input = advisory(); const request = requestFor(input); let observations = 0;
  request.simulation.observe = async () => {
    if (++observations === 2) input.view = { ...input.view, observedEntityVersions: { 'cooling-1': 2 } };
    return input.view;
  };
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    const sent = JSON.parse(String(init.body)) as GatewayInput;
    return new Response(JSON.stringify(sent.kind === 'start' ? toolReply(sent, 'propose_action') : finalReply(sent)));
  });
  const result = await runCoworker(request);
  expect(result.tools[0]).toMatchObject({ status: 'rejected', reason: 'stale_action' });
  expect(result.authorizations).toEqual([]);
  expect(request.simulation.command).not.toHaveBeenCalled();
});

it.each(['actor', 'worker'] as const)('rejects a late proposal with the wrong %s identity', async mismatch => {
  const input = advisory(); const request = requestFor(input);
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    const sent = JSON.parse(String(init.body)) as GatewayInput;
    const reply = finalReply(sent, [{ ...action(sent), args: { technicianId: mismatch === 'worker' ? 'jules' : 'alex' } }]);
    if (mismatch === 'actor' && reply.kind === 'final') { reply.actorId = 'jules'; reply.response.actorId = 'jules'; reply.response.speaker = 'jules'; }
    return new Response(JSON.stringify(reply));
  });
  const result = await runCoworker(request);
  expect(result.reply).toMatchObject({ kind: 'fallback', actorId: 'alex', reason: mismatch === 'actor' ? 'stale_response' : 'invalid_evidence' });
  expect(result.authorizations).toEqual([]);
  expect(request.simulation.command).not.toHaveBeenCalled();
});

it('deduplicates the same proposal across two tool calls and a final at later wire times', async () => {
  const input = advisory(); const request = requestFor(input); const wire: GatewayInput[] = [];
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    const sent = JSON.parse(String(init.body)) as GatewayInput; wire.push(sent);
    return new Response(JSON.stringify(wire.length < 3 ? toolReply(sent, 'propose_action', `proposal-${wire.length}`) : finalReply(sent, [action(sent)])));
  });
  const result = await runCoworker({ ...request, onTool: async () => { input.view = { ...input.view, simTime: input.view.simTime + 1 }; } });
  expect(result.tools.map(result => result.reason)).toEqual(['player_confirmation_required', 'player_confirmation_required']);
  expect(result.authorizations).toHaveLength(1);
  expect(result.authorizations[0]).toMatchObject({ id: `${wire[0].requestId}:proposal:1`, intent: { atSimTime: 75 }, expectedEntityVersions: { 'cooling-1': 1, 'rack-1': 1 } });
  expect(request.simulation.command).not.toHaveBeenCalled();
});

it.each(['question', 'clarification'] as const)('keeps an advisory %s grounded and free of execution tokens', async kind => {
  const input = advisory(); const request = requestFor(input);
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    const sent = JSON.parse(String(init.body)) as GatewayInput;
    if (kind === 'question' && sent.kind === 'start') return new Response(JSON.stringify(toolReply(sent, 'read_observations')));
    const reply = finalReply(sent);
    if (reply.kind === 'final') {
      reply.response.inference = kind === 'clarification' ? 'Which equipment should I check?' : 'The reported state needs an inspection.';
      reply.response.facts = kind === 'question' ? [{ observationId: 'obs-fixture-cooling', field: 'value' }] : [];
    }
    return new Response(JSON.stringify(reply));
  });
  const result = await runCoworker(request);
  expect(result.reply.kind).toBe('final');
  expect(result.authorizations).toEqual([]);
  if (kind === 'question') expect(result.tools[0]).toMatchObject({ status: 'completed', receipt: null, observations: [expect.objectContaining({ id: 'obs-fixture-cooling' })] });
  expect(request.simulation.command).not.toHaveBeenCalled();
});

it('labels a provider outage and preserves a previously validated tool proposal snapshot', async () => {
  const input = advisory(); const request = requestFor(input); let turns = 0;
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    if (path.endsWith('/cancel')) return new Response('{}');
    if (++turns > 1) throw new Error('offline');
    return new Response(JSON.stringify(toolReply(JSON.parse(String(init.body)), 'propose_action')));
  });
  const result = await runCoworker({ ...request, onTool: async () => { input.view = { ...input.view, simTime: 76, observedEntityVersions: { 'cooling-1': 2 } }; } });
  expect(result.reply).toMatchObject({ kind: 'fallback', mode: 'scripted', reason: 'gateway_unavailable' });
  expect(result.authorizations).toEqual([expect.objectContaining({ actorId: 'alex', intent: { action: 'inspect', targetId: 'cooling-1', atSimTime: 75, args: { technicianId: 'alex' } }, expectedEntityVersions: { 'cooling-1': 1, 'rack-1': 1 } })]);
  expect(request.simulation.command).not.toHaveBeenCalled();
});
