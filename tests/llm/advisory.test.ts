import { afterEach, expect, it, vi } from 'vitest';
import type { ActionIntent, GatewayInput, GatewayResponse, GatewayStart, ToolIntent } from '../../src/shared/contracts';
import { executeToolIntent } from '../../src/llm/tools';
import { runCoworker } from '../../src/llm/interaction';
import { start } from './fixtures';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const advisory = (): GatewayStart => ({ ...structuredClone(start), requestId: crypto.randomUUID(), actorId: 'alex', role: 'facilities', interactionMode: 'advisory', view: { ...structuredClone(start.view), actorId: 'alex' } });
const action = (wire: GatewayInput, name: 'inspect' | 'repair_cooling' = 'inspect'): ActionIntent => ({ action: name, targetId: 'cooling-1', atSimTime: wire.view.simTime, args: { technicianId: 'alex' } });
const intent = (wire: GatewayInput, tool: ToolIntent['tool'], callId = 'call'): ToolIntent => ({ runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, interactionId: 'interaction', callId, tool, targetId: 'cooling-1', action: tool === 'read_observations' ? null : action(wire) });
const toolReply = (wire: GatewayInput, tool: ToolIntent['tool'], callId = 'call'): GatewayResponse => ({ kind: 'tool_request', runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, interactionId: 'interaction', intent: intent(wire, tool, callId) });
const finalReply = (wire: GatewayInput, proposals: ActionIntent[] = []): GatewayResponse => ({ kind: 'final', runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, response: { runId: wire.runId, requestId: wire.requestId, actorId: wire.actorId, speaker: wire.actorId, mode: 'live', facts: [], inference: 'Please confirm the proposed work.', uncertainty: 'The cause remains unverified.', proposals } });

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
