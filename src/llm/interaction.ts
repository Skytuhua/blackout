import type { GatewayInput, GatewayResponse, GatewayStart, KnowledgeView, ProposalAuthorization, PublicToolResult, RecordedInteraction, ToolIntent } from '../shared/contracts';
import type { SimulationClient } from '../workers/SimulationClient';
import { procedures } from '../content/procedures';
import { scopeKnowledge } from './context';
import { cancelInteraction, continueInteraction, startInteraction, providerCallFor, type GatewayWireObserver } from './client';
import { executeToolIntent, type ScopedContext } from './tools';
import type { ProviderCall } from './diagnostics';

export type CoworkerResult = { start: GatewayStart; targetId: string | null; view: KnowledgeView; reply: Exclude<GatewayResponse, { kind: 'tool_request' }>; tools: PublicToolResult[]; intents: ToolIntent[]; calls: ProviderCall[]; durationMs: number; recording: RecordedInteraction | null; authorizations: ProposalAuthorization[] };
export type CoworkerRequest = { simulation: Pick<SimulationClient, 'observe' | 'command'>; runId: string; actorId: string; targetId: string | null; message: string; signal: AbortSignal; interactionMode?: 'advisory'; getSimTime?: () => number; onTool?: (intent: ToolIntent, result: PublicToolResult) => Promise<void> };

export async function runCoworker(input: CoworkerRequest): Promise<CoworkerResult> {
  const began = performance.now();
  let view = await input.simulation.observe(input.actorId);
  const role = view.crew.find(c => c.id === input.actorId)?.role;
  if (!role || view.runId !== input.runId || view.actorId !== input.actorId) throw new Error('stale_or_invalid_actor');
  const start: GatewayStart = { kind: 'start', runId: input.runId, requestId: crypto.randomUUID(), actorId: input.actorId, role, message: input.message, view: scopeKnowledge(view, input.targetId ? [input.targetId] : []), procedures: procedures.filter(p => view.allowedProcedureIds.includes(p.id)), promptVersion: 'coworker-v1' };
  const context: ScopedContext = { start, simulation: input.simulation, signal: input.signal };
  const tools: PublicToolResult[] = [], intents: ToolIntent[] = [];
  const calls: ProviderCall[] = [];
  const turns: RecordedInteraction['turns'] = [];
  const targets = new Set(input.targetId ? [input.targetId] : []);
  const evidenceIds = new Set<string>();
  const fallback = (reason: string): CoworkerResult['reply'] => ({ kind: 'fallback', runId: start.runId, requestId: start.requestId, actorId: start.actorId, mode: 'scripted', reason, message: 'Use permitted observations and procedures.', facts: [] });
  const finish = (reply: CoworkerResult['reply']): CoworkerResult => {
    const durationMs = Math.round(performance.now() - began);
    const atSimTime = Math.max(view.simTime, input.getSimTime?.() ?? 0, ...turns.map(t => t.atSimTime), ...tools.map(t => t.receipt?.observedAt ?? 0));
    const recording: RecordedInteraction | null = turns.length ? structuredClone({ turns, end: { atSimTime, reason: input.signal.aborted ? 'canceled' : reply.kind === 'final' ? 'final' : 'fallback', reply, durationMs } }) : null;
    return { start: context.start, targetId: input.targetId, view, reply, tools, intents, calls, durationMs, recording, authorizations: [] };
  };
  const receive = async (send: (onWire: GatewayWireObserver) => Promise<GatewayResponse>) => {
    const capture: { turn?: RecordedInteraction['turns'][number] } = {};
    const reply = await send(wire => {
      capture.turn = { atSimTime: wire.view.simTime, input: structuredClone(wire), reply: null, call: null, toolResult: null };
      turns.push(capture.turn);
    });
    if (capture.turn) { capture.turn.reply = structuredClone(reply); capture.turn.call = providerCallFor(reply) ?? null; }
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
      if (reply.kind !== 'tool_request') { complete = true; return finish(reply); }
      if (round === 2) return finish(fallback('interaction_quota'));
      const intent = reply.intent;
      intents.push(intent);
      const result = await executeToolIntent(intent, context); tools.push(result);
      turns.at(-1)!.toolResult = structuredClone(result);
      if (input.signal.aborted) return finish(fallback('canceled'));
      await input.onTool?.(intent, result);
      if (input.signal.aborted) return finish(fallback('canceled'));
      for (const id of [...result.observations.map(o => o.id), ...result.receipt?.evidenceIds ?? []]) evidenceIds.add(id);
      if (view.knownTopology.assets.some(a => a.id === intent.targetId)) targets.add(intent.targetId);
      view = await input.simulation.observe(input.actorId);
      if (input.signal.aborted) return finish(fallback('canceled'));
      if (view.runId !== input.runId || view.actorId !== input.actorId) return finish(fallback('stale_run'));
      context.start = { ...start, view: scopeKnowledge(view, [...targets], [...evidenceIds]) };
      const continuation: GatewayInput = { kind: 'continue', runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: intent.interactionId, expectedCallId: intent.callId, result, view: context.start.view };
      reply = await receive(onWire => continueInteraction(continuation, input.signal, onWire));
    }
    return finish(fallback('interaction_quota'));
  } catch { return finish(fallback(input.signal.aborted ? 'canceled' : 'worker_unavailable')); }
  finally { input.signal.removeEventListener('abort', cancel); if (!complete) cancel(); }
}
