import type { GatewayStart, GatewayContinue, GatewayInput, GatewayResponse, Observation } from '../shared/contracts';
import { GatewayStartSchema, GatewayContinueSchema, GatewayResponseSchema } from '../shared/schemas';
import { validStart, validateResponse } from './validation';
import { bindLifecycle, lifecycleFor, expired, type Lifecycle } from './lifecycle';
import { scopeKnowledge } from './context';
import { ProviderCallSchema, type ProviderCall } from './diagnostics';
const contexts = new Map<string, { start: GatewayStart; lifecycle: Lifecycle }>();
const evidence = new WeakMap<Lifecycle, Map<string, Observation>>();
const providerCalls = new WeakMap<GatewayResponse, ProviderCall>();
export const providerCallFor = (reply: GatewayResponse) => { const call = providerCalls.get(reply); return call && { ...call }; };
type Identity = Pick<GatewayStart, 'runId' | 'requestId' | 'actorId'>;
export type GatewayWireObserver = (input: GatewayInput) => void;
const key = (input: Identity) => JSON.stringify([input.runId, input.requestId, input.actorId]);
const fallback = (input: GatewayInput, reason: string): GatewayResponse => ({ kind: 'fallback', runId: input.runId, requestId: input.requestId, actorId: input.actorId, mode: 'scripted', reason, message: 'Scripted fallback: use permitted observations and procedures.', facts: [] });
export function cancelInteraction(input: Identity) {
  const context = contexts.get(key(input));
  if (!context || context.lifecycle.closed) return;
  context.lifecycle.closed = true;
  void fetch('/api/llm/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: input.runId, requestId: input.requestId, actorId: input.actorId }), keepalive: true }).catch(() => {});
}
async function turn(input: GatewayInput, context: GatewayStart, lifecycle: Lifecycle, signal?: AbortSignal, onWire?: GatewayWireObserver): Promise<GatewayResponse> {
  if (signal && signal !== lifecycle.signal) lifecycle.signal = lifecycle.signal ? AbortSignal.any([lifecycle.signal, signal]) : signal;
  const effectiveSignal = lifecycle.signal;
  const cancel = () => cancelInteraction(input);
  if (effectiveSignal?.aborted) { lifecycle.closed = true; return fallback(input, 'canceled'); }
  if (expired(lifecycle)) return fallback(input, 'canceled_or_expired');
  effectiveSignal?.addEventListener('abort', cancel, { once: true });
  let toolPending = false;
  try {
    const sentAt = performance.now();
    const retainIds = input.kind === 'continue' ? [...input.result.observations.map(o => o.id), ...input.result.receipt?.evidenceIds ?? []] : [];
    const wire = { ...input, view: scopeKnowledge(input.view, undefined, retainIds) };
    let seen = evidence.get(lifecycle);
    if (!seen) { seen = new Map(); evidence.set(lifecycle, seen); }
    for (const observation of wire.view.observations) seen.set(observation.id, observation);
    const body = JSON.stringify(wire);
    onWire?.(JSON.parse(body) as GatewayInput);
    const response = await fetch('/api/llm/turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: effectiveSignal });
    const remaining = response.headers.get('X-Blackout-Deadline-Ms');
    if (remaining !== null) {
      if (!/^\d{1,5}$/.test(remaining) || Number(remaining) > 20000) return fallback(input, 'invalid_deadline');
      // Starting at send time deliberately subtracts the whole HTTP round trip.
      lifecycle.deadline = Math.min(lifecycle.deadline, sentAt + Number(remaining));
    }
    if (!response.ok) return fallback(input, 'gateway_unavailable');
    const reply = GatewayResponseSchema.parse(await response.json());
    if (expired(lifecycle)) return fallback(input, 'canceled_or_expired');
    if (effectiveSignal?.aborted) return fallback(input, 'canceled');
    if (reply.runId !== input.runId || reply.requestId !== input.requestId || reply.actorId !== input.actorId) return fallback(input, 'stale_response');
    if (reply.kind === 'final' && !validateResponse(reply.response, { ...context, view: { ...wire.view, observations: [...seen.values()] } })) return fallback(input, 'invalid_evidence');
    if (reply.kind === 'tool_request' && (reply.intent.runId !== input.runId || reply.intent.actorId !== input.actorId || reply.intent.requestId !== input.requestId || reply.intent.interactionId !== reply.interactionId)) return fallback(input, 'invalid_tool_identity');
    if (reply.kind === 'tool_request') {
      if (lifecycle.closed) return fallback(input, 'canceled_or_expired');
      bindLifecycle(reply.intent, lifecycle); toolPending = true;
    }
    const output = reply.kind === 'fallback' ? { ...reply, facts: [] } : reply;
    const metadata = response.headers.get('X-Blackout-Call');
    if (metadata && metadata.length <= 1200) {
      try {
        const parsed = ProviderCallSchema.safeParse(JSON.parse(metadata));
        if (parsed.success && parsed.data.runId === input.runId && parsed.data.requestId === input.requestId && parsed.data.actorId === input.actorId) providerCalls.set(output, parsed.data);
      } catch { /* Optional transport metadata cannot change the game response. */ }
    }
    return output;
  } catch { return fallback(input, effectiveSignal?.aborted ? 'canceled' : 'gateway_unavailable'); }
  finally { if (!toolPending) lifecycle.closed = true; effectiveSignal?.removeEventListener('abort', cancel); }
}
export async function startInteraction(input: GatewayStart, signal?: AbortSignal, onWire?: GatewayWireObserver): Promise<GatewayResponse> {
  if (!GatewayStartSchema.safeParse(input).success || !validStart(input)) return fallback(input, 'invalid_scope');
  const existing = contexts.get(key(input));
  if (existing) {
    if (JSON.stringify(existing.start) !== JSON.stringify(input)) return fallback(input, 'duplicate_or_busy');
    bindLifecycle(input, existing.lifecycle);
    return turn(input, input, existing.lifecycle, signal, onWire);
  }
  if (contexts.size >= 128) {
    const terminal = [...contexts].find(([, value]) => expired(value.lifecycle));
    if (!terminal) return fallback(input, 'interaction_limit');
    contexts.delete(terminal[0]);
  }
  const lifecycle = lifecycleFor(input); lifecycle.signal = signal;
  contexts.set(key(input), { start: input, lifecycle }); return turn(input, input, lifecycle, signal, onWire);
}
export async function continueInteraction(input: GatewayContinue, signal?: AbortSignal, onWire?: GatewayWireObserver): Promise<GatewayResponse> {
  const entry = contexts.get(key(input));
  if (!entry || !GatewayContinueSchema.safeParse(input).success || input.view.runId !== input.runId || input.view.actorId !== input.actorId) return fallback(input, 'invalid_interaction');
  if (expired(entry.lifecycle)) return fallback(input, 'canceled_or_expired');
  return turn(input, { ...entry.start, view: input.view }, entry.lifecycle, signal, onWire);
}
export { executeToolIntent } from './tools';
export { renderFacts } from './validation';
