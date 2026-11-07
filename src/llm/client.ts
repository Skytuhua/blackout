import type { GatewayStart, GatewayContinue, GatewayInput, GatewayResponse } from '../shared/contracts';
import { GatewayStartSchema, GatewayContinueSchema, GatewayResponseSchema } from '../shared/schemas';
import { validStart, validateResponse } from './validation';
const contexts = new Map<string, GatewayStart>();
const key = (input: GatewayInput) => JSON.stringify([input.runId, input.requestId, input.actorId]);
const fallback = (input: GatewayInput, reason: string): GatewayResponse => ({ kind: 'fallback', runId: input.runId, requestId: input.requestId, actorId: input.actorId, mode: 'scripted', reason, message: 'Scripted fallback: use permitted observations and procedures.', facts: [] });
async function turn(input: GatewayInput, context: GatewayStart, signal?: AbortSignal): Promise<GatewayResponse> {
  const cancel = () => { void fetch('/api/llm/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: input.runId, requestId: input.requestId, actorId: input.actorId }), keepalive: true }).catch(() => {}); };
  if (signal?.aborted) return fallback(input, 'canceled');
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch('/api/llm/turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
    if (!response.ok) return fallback(input, 'gateway_unavailable');
    const reply = GatewayResponseSchema.parse(await response.json());
    if (signal?.aborted) return fallback(input, 'canceled');
    if (reply.runId !== input.runId || reply.requestId !== input.requestId || reply.actorId !== input.actorId) return fallback(input, 'stale_response');
    if (reply.kind === 'final' && !validateResponse(reply.response, context)) return fallback(input, 'invalid_evidence');
    if (reply.kind === 'tool_request' && (reply.intent.runId !== input.runId || reply.intent.actorId !== input.actorId || reply.intent.requestId !== input.requestId || reply.intent.interactionId !== reply.interactionId)) return fallback(input, 'invalid_tool_identity');
    if (reply.kind === 'fallback') return { ...reply, facts: [] };
    return reply;
  } catch { return fallback(input, signal?.aborted ? 'canceled' : 'gateway_unavailable'); }
  finally { signal?.removeEventListener('abort', cancel); }
}
export async function startInteraction(input: GatewayStart, signal?: AbortSignal): Promise<GatewayResponse> {
  if (!GatewayStartSchema.safeParse(input).success || !validStart(input)) return fallback(input, 'invalid_scope');
  if (contexts.size >= 128 && !contexts.has(key(input))) contexts.delete(contexts.keys().next().value!);
  contexts.set(key(input), input); return turn(input, input, signal);
}
export async function continueInteraction(input: GatewayContinue, signal?: AbortSignal): Promise<GatewayResponse> {
  const start = contexts.get(key(input));
  if (!start || !GatewayContinueSchema.safeParse(input).success || input.view.runId !== input.runId || input.view.actorId !== input.actorId) return fallback(input, 'invalid_interaction');
  return turn(input, { ...start, view: input.view }, signal);
}
export { executeToolIntent } from './tools';
export { renderFacts } from './validation';
