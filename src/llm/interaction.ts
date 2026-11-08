import type { ActionIntent, GatewayInput, GatewayResponse, GatewayStart, KnowledgeView, ProposalAuthorization, PublicToolResult, RecordedInteraction, ToolIntent } from '../shared/contracts';
import type { SimulationClient } from '../workers/SimulationClient';
import { procedures } from '../content/procedures';
import { scopeKnowledge } from './context';
import { cancelInteraction, continueInteraction, startInteraction, providerCallFor, type GatewayWireObserver } from './client';
import { executeToolIntent, type ScopedContext } from './tools';
import type { ProviderCall } from './diagnostics';
import { validAction } from './validation';
import { conciseCoworkerResponse, projectCoworkerContext } from './conversation-policy';
import { CONVERSATION_PROMPT_VERSION, usesConversationPolicy } from './conversation-mode';

export type CoworkerResult = { start: GatewayStart; targetId: string | null; view: KnowledgeView; reply: Exclude<GatewayResponse, { kind: 'tool_request' }>; tools: PublicToolResult[]; intents: ToolIntent[]; calls: ProviderCall[]; durationMs: number; recording: RecordedInteraction | null; authorizations: ProposalAuthorization[] };
export type CoworkerRequest = { simulation: Pick<SimulationClient, 'observe' | 'command'>; runId: string; requestId?: string; actorId: string; targetId: string | null; message: string; signal: AbortSignal; interactionMode?: 'advisory'; promptVersion?: string; getSimTime?: () => number; onTool?: (intent: ToolIntent, result: PublicToolResult) => Promise<void> };

export async function runCoworker(input: CoworkerRequest): Promise<CoworkerResult> {
  const began = performance.now();
  let view = await input.simulation.observe(input.actorId);
  const role = view.crew.find(c => c.id === input.actorId)?.role;
  if (!role || view.runId !== input.runId || view.actorId !== input.actorId) throw new Error('stale_or_invalid_actor');
  const focusTargets = input.targetId ? [input.targetId] : [];
  if (input.promptVersion === CONVERSATION_PROMPT_VERSION && role === 'remote') {
    focusTargets.push(...view.knownTopology.assets.filter(asset => asset.kind === 'cooling').map(asset => asset.id));
    const hottest = view.observations.filter(observation => observation.field.includes('temperature') && typeof observation.value === 'number').sort((a, b) => Number(b.value) - Number(a.value))[0];
    if (hottest) focusTargets.push(hottest.assetId);
  }
  const original: GatewayStart = { kind: 'start', runId: input.runId, requestId: input.requestId ?? crypto.randomUUID(), actorId: input.actorId, role, message: input.message, view: scopeKnowledge(view, focusTargets), procedures: procedures.filter(p => view.allowedProcedureIds.includes(p.id)), promptVersion: input.promptVersion ?? 'coworker-v1', ...(input.interactionMode ? { interactionMode: input.interactionMode } : {}) };
  const start = usesConversationPolicy(original) ? projectCoworkerContext(original) : original;
  const context: ScopedContext = { start, simulation: input.simulation, signal: input.signal };
  const tools: PublicToolResult[] = [], intents: ToolIntent[] = [];
  const calls: ProviderCall[] = [];
  const turns: RecordedInteraction['turns'] = [];
  const authorizations: ProposalAuthorization[] = [];
  const proposals = new Set<string>();
  let originatingWire: GatewayInput | undefined;
  const retainProposal = (intent: ActionIntent, wire: GatewayInput | undefined) => {
    if (start.interactionMode !== 'advisory' || !wire || !validAction(intent, { ...start, view: wire.view }) || wire.view.observedEntityVersions[intent.targetId] === undefined) return;
    // Repeating an operation in a later turn must not refresh its authority or
    // create another executable token. Distinct task/worker/ceiling args remain distinct.
    const key = JSON.stringify([intent.action, intent.targetId, Object.entries(intent.args).sort(([a], [b]) => a.localeCompare(b))]);
    if (proposals.has(key)) return;
    proposals.add(key);
    authorizations.push(structuredClone({ id: `${start.requestId}:proposal:${authorizations.length + 1}`, runId: wire.runId, actorId: wire.actorId, requestId: wire.requestId, intent, expectedEntityVersions: wire.view.observedEntityVersions }));
  };
  const targets = new Set(focusTargets);
  const evidenceIds = new Set<string>();
  const fallback = (reason: string): CoworkerResult['reply'] => ({ kind: 'fallback', runId: start.runId, requestId: start.requestId, actorId: start.actorId, mode: 'scripted', reason, message: 'Use permitted observations and procedures.', facts: [] });
  const finish = (reply: CoworkerResult['reply']): CoworkerResult => {
    const durationMs = Math.round(performance.now() - began);
    const atSimTime = Math.max(view.simTime, input.getSimTime?.() ?? 0, ...turns.map(t => t.atSimTime), ...tools.map(t => t.receipt?.observedAt ?? 0));
    const recording: RecordedInteraction | null = turns.length ? structuredClone({ turns, end: { atSimTime, reason: input.signal.aborted ? 'canceled' : reply.kind === 'final' ? 'final' : 'fallback', reply, durationMs } }) : null;
    return { start: context.start, targetId: input.targetId, view, reply, tools, intents, calls, durationMs, recording, authorizations: input.signal.aborted || reply.kind === 'fallback' && reply.reason === 'stale_run' ? [] : structuredClone(authorizations) };
  };
  const receive = async (send: (onWire: GatewayWireObserver) => Promise<GatewayResponse>) => {
    const capture: { turn?: RecordedInteraction['turns'][number] } = {};
    const reply = await send(wire => {
      capture.turn = { atSimTime: wire.view.simTime, input: structuredClone(wire), reply: null, call: null, toolResult: null };
      turns.push(capture.turn);
    });
    if (capture.turn) { capture.turn.reply = structuredClone(reply); capture.turn.call = providerCallFor(reply) ?? null; }
    originatingWire = capture.turn?.input;
    return reply;
  };
  const cancel = () => cancelInteraction(start);
  input.signal.addEventListener('abort', cancel, { once: true });
  let complete = false;
  try {
    if (input.signal.aborted) return finish(fallback('canceled'));
    let reply = await receive(onWire => startInteraction(start, input.signal, onWire));
    for (let round = 0; round < 3; round++) {
      const call = providerCallFor(reply); if (call && !calls.some(known => known.receiptId === call.receiptId)) calls.push(call);
      if (input.signal.aborted) return finish(fallback('canceled'));
      if (reply.kind !== 'tool_request') {
        if (reply.kind === 'final' && usesConversationPolicy(start) && (!originatingWire || !conciseCoworkerResponse({ ...context.start, view: originatingWire.view }, reply.response))) { complete = true; return finish(fallback('unsafe_narrative')); }
        if (reply.kind === 'final') for (const proposal of reply.response.proposals) retainProposal(proposal, originatingWire);
        complete = true; return finish(reply);
      }
      if (round === 2) return finish(fallback('interaction_quota'));
      const intent = reply.intent;
      const proposalWire = originatingWire;
      intents.push(intent);
      const result = await executeToolIntent(intent, context); tools.push(result);
      turns.at(-1)!.toolResult = structuredClone(result);
      if (input.signal.aborted) return finish(fallback('canceled'));
      if (intent.tool === 'propose_action' && intent.action && result.status === 'completed' && result.reason === 'player_confirmation_required') retainProposal(intent.action, proposalWire);
      await input.onTool?.(intent, result);
      if (input.signal.aborted) return finish(fallback('canceled'));
      for (const id of [...result.observations.map(o => o.id), ...result.receipt?.evidenceIds ?? []]) evidenceIds.add(id);
      if (view.knownTopology.assets.some(a => a.id === intent.targetId)) targets.add(intent.targetId);
      view = await input.simulation.observe(input.actorId);
      if (input.signal.aborted) return finish(fallback('canceled'));
      if (view.runId !== input.runId || view.actorId !== input.actorId) return finish(fallback('stale_run'));
      const fresh = { ...start, view: scopeKnowledge(view, [...targets], [...evidenceIds]) };
      context.start = usesConversationPolicy(start) ? { ...projectCoworkerContext(fresh), procedures: start.procedures } : fresh;
      const continuation: GatewayInput = { kind: 'continue', runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: intent.interactionId, expectedCallId: intent.callId, result, view: context.start.view };
      reply = await receive(onWire => continueInteraction(continuation, input.signal, onWire));
    }
    return finish(fallback('interaction_quota'));
  } catch { return finish(fallback(input.signal.aborted ? 'canceled' : 'worker_unavailable')); }
  finally { input.signal.removeEventListener('abort', cancel); if (!complete) cancel(); }
}
