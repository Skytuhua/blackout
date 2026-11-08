import type { ActionIntent, KnowledgeView, Observation } from '../shared/contracts';

export function parseCeiling(value: string): number | undefined {
  return value.trim() ? Number(value) : undefined;
}

// Ten seconds is the mission's verification window, not a claim about sensor accuracy.
export function readingStatus(observation: Observation | null, simTime: number): 'unknown' | 'stale' | 'fresh' {
  if (!observation || observation.value === null || observation.quality === 'unknown' || observation.observedAt > simTime) return 'unknown';
  return simTime - observation.observedAt > 10 ? 'stale' : 'fresh';
}

export function makeAction(affordance: KnowledgeView['affordances'][number], simTime: number, technicianId: string, extra: { ceiling?: number; taskId?: string } = {}): ActionIntent | null {
  if (!affordance.enabled || (affordance.technicianIds.length > 0 && !affordance.technicianIds.includes(technicianId))) return null;
  if (affordance.action === 'set_batch_ceiling' && (extra.ceiling === undefined || !Number.isFinite(extra.ceiling) || extra.ceiling < 0 || extra.ceiling > 100)) return null;
  if (affordance.action === 'cancel_task' && !extra.taskId) return null;
  return { action: affordance.action, targetId: affordance.targetId, atSimTime: simTime, args: { ...(affordance.technicianIds.length ? { technicianId } : {}), ...extra } };
}

export function indicatorState(observations: Observation[], simTime: number): 'unknown' | 'active' | 'attention' {
  const state = observations.filter(o => o.field === 'state' || o.field === 'power').sort((a, b) => b.observedAt - a.observedAt)[0];
  if (!state || readingStatus(state, simTime) !== 'fresh') return 'unknown';
  if (state.value === true || state.value === 'running' || state.value === 'online' || state.value === 'ready') return 'active';
  if (state.value === false || state.value === 'not_ready' || state.value === 'offline' || state.value === 'stopped') return 'attention';
  return 'unknown';
}
