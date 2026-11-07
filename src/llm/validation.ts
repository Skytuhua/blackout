import type { AgentResponse, GatewayStart, ActionIntent, FactSelector } from '../shared/contracts';
import { AgentResponseSchema, GatewayStartSchema } from '../shared/schemas';
export function validStart(start: GatewayStart): boolean {
  if (!GatewayStartSchema.safeParse(start).success || start.view.runId !== start.runId || start.view.actorId !== start.actorId) return false;
  const role = start.actorId === 'player' ? 'player' : start.view.crew.find(c => c.id === start.actorId)?.role;
  if (start.role !== role && !(start.role === 'debrief' && start.actorId === 'player')) return false;
  return start.procedures.every(p => start.view.allowedProcedureIds.includes(p.id)) && (!start.debriefContext || (start.role === 'debrief' && start.debriefContext.ledger.runId === start.runId));
}
export function validAction(action: ActionIntent, start: GatewayStart): boolean {
  const view = start.view;
  const affordance = view.affordances.find(a => a.action === action.action && a.targetId === action.targetId && a.enabled);
  if (!affordance || action.atSimTime !== view.simTime) return false;
  const technician = action.args.technicianId;
  if (technician && (!affordance.technicianIds.includes(technician) || (start.role !== 'player' && technician !== start.actorId))) return false;
  return start.role !== 'debrief';
}
export function factValue(fact: FactSelector, start: GatewayStart): string | number | boolean | null | undefined {
  if ('observationId' in fact) return start.view.observations.find(o => o.id === fact.observationId)?.[fact.field];
  const context = start.debriefContext;
  if (!context || start.role !== 'debrief') return undefined;
  const comparison = context.comparison;
  const ledgers = [context.ledger, ...(comparison ? comparison.status === 'complete' ? [comparison.baseline, comparison.alternative] : [comparison.validPrefix.baseline, comparison.validPrefix.alternative] : [])];
  return ledgers.find(l => l.runId === fact.ledgerRunId)?.[fact.field];
}
export function validateResponse(response: AgentResponse, start: GatewayStart): boolean {
  return AgentResponseSchema.safeParse(response).success && response.runId === start.runId && response.requestId === start.requestId && response.actorId === start.actorId && response.speaker === start.actorId && response.mode === 'live' && response.facts.every(f => factValue(f, start) !== undefined) && response.proposals.every(a => validAction(a, start));
}
export function renderFacts(response: AgentResponse, start: GatewayStart) {
  return response.facts.map(selector => ({ selector, value: factValue(selector, start) }));
}
