import type { ToolIntent, PublicToolResult, GatewayStart } from '../shared/contracts';
import { ToolIntentSchema, KnowledgeViewSchema, CommandReceiptSchema } from '../shared/schemas';
import type { SimulationClient } from '../workers/SimulationClient';
import { validAction, validStart } from './validation';
import { lifecycleFor, expired } from './lifecycle';
import { latestObservations } from './context';
export type ScopedContext = { start: GatewayStart; simulation?: Pick<SimulationClient, 'observe' | 'command'>; signal?: AbortSignal };
const completed = new WeakMap<ScopedContext, Map<string, { fingerprint: string; result: Promise<PublicToolResult> }>>();
export async function executeToolIntent(intent: ToolIntent, context: ScopedContext): Promise<PublicToolResult> {
  const identity = { runId: intent.runId, requestId: intent.requestId, actorId: intent.actorId, interactionId: intent.interactionId, callId: intent.callId };
  const reject = (reason: string): PublicToolResult => ({ ...identity, status: 'rejected', reason, receipt: null, observations: [], procedureText: null });
  if (!ToolIntentSchema.safeParse(intent).success || !validStart(context.start) || ['runId', 'requestId', 'actorId'].some(k => identity[k as keyof typeof identity] !== context.start[k as 'runId'])) return reject('invalid_identity_or_tool');
  const lifecycle = lifecycleFor(context.start, intent);
  const closed = () => expired(lifecycle) || context.signal?.aborted;
  if (closed()) return reject('canceled_or_expired');
  let calls = completed.get(context); if (!calls) { calls = new Map(); completed.set(context, calls); }
  const key = `${intent.interactionId}/${intent.callId}`, fingerprint = JSON.stringify(intent), cached = calls.get(key);
  if (cached) return cached.fingerprint === fingerprint ? cached.result : reject('duplicate_call_conflict');
  const result = (async (): Promise<PublicToolResult> => {
    if (closed()) return reject('canceled_or_expired');
    // Defense in depth for injected or legacy-shaped replies in the advisory route.
    if (context.start.interactionMode === 'advisory' && intent.tool === 'inspect_asset') return reject('advisory_execution_forbidden');
    const view = context.simulation ? KnowledgeViewSchema.parse(await context.simulation.observe(intent.actorId)) : context.start.view;
    if (closed()) return reject('canceled_or_expired');
    if (view.runId !== intent.runId || view.actorId !== intent.actorId) return reject('stale_run');
    const current = { ...context.start, view };
    if (intent.tool === 'read_procedure') {
      const procedure = context.start.procedures.find(p => p.id === intent.targetId && view.allowedProcedureIds.includes(p.id));
      return procedure ? { ...reject('procedure'), status: 'completed', procedureText: procedure.text } : reject('procedure_not_permitted');
    }
    if (!(intent.tool === 'propose_action' && intent.action && validAction(intent.action, context.start)) && !view.knownTopology.assets.some(a => a.id === intent.targetId)) return reject('unknown_target');
    if (intent.tool === 'read_observations') return { ...reject('observations'), status: 'completed', observations: latestObservations(view.observations.filter(o => o.assetId === intent.targetId)) };
    if (!intent.action || intent.action.targetId !== intent.targetId || !validAction(intent.action, context.start)) return reject('action_not_permitted');
    if (context.start.view.observedEntityVersions[intent.targetId] === undefined || view.observedEntityVersions[intent.targetId] !== context.start.view.observedEntityVersions[intent.targetId]) return reject('stale_action');
    if (!validAction({ ...intent.action, atSimTime: view.simTime }, current)) return reject('action_not_permitted');
    if (intent.tool === 'propose_action') return { ...reject('player_confirmation_required'), status: 'completed' };
    if (intent.action.action !== 'inspect' || !intent.action.args.technicianId || !context.simulation) return reject('inspection_worker_required');
    if (closed()) return reject('canceled_or_expired');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([intent.runId, intent.requestId, intent.actorId, intent.interactionId, intent.callId])));
    const idempotencyKey = 'llm:' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    if (closed()) return reject('canceled_or_expired');
    const receipt = CommandReceiptSchema.parse(await context.simulation.command({ schemaVersion: 1, ...{ runId: intent.runId, requestId: intent.requestId, actorId: intent.actorId }, intent: { ...intent.action, atSimTime: view.simTime }, expectedEntityVersions: context.start.view.observedEntityVersions, idempotencyKey }));
    // Cancellation can stop continuation, but cannot undo an acknowledged engine command.
    if (receipt.runId !== intent.runId || receipt.actorId !== intent.actorId || receipt.requestId !== intent.requestId) return reject('stale_run');
    return { ...reject('inspection_receipt'), status: receipt.status === 'rejected' ? 'rejected' : 'accepted', receipt };
  })().catch(() => reject('worker_unavailable'));
  calls.set(key, { fingerprint, result }); return result;
}
