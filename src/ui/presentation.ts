import type { ActionIntent, KnowledgeView, Observation, FactSelector } from '../shared/contracts';

export function formatObservationFact(observation: Observation, field: Extract<FactSelector, { observationId: string }>['field']): string {
  const metadata = field === 'observedAt' ? 'observed at' : field === 'receivedAt' ? 'received at' : field === 'assetId' ? 'asset' : field;
  const label = field === 'value' ? observation.field.replaceAll('_', ' ') : `${observation.field.replaceAll('_', ' ')} · ${metadata}`;
  const value = field === 'observedAt' || field === 'receivedAt' ? `${Math.floor(observation[field] / 60)}:${String(Math.floor(observation[field] % 60)).padStart(2, '0')}` : String(observation[field] ?? 'unknown');
  return `${observation.assetId} · ${label}: ${value}${field === 'value' && observation.units ? ` ${observation.units}` : ''}`;
}

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
  const state = observations.filter(o => ['state', 'power', 'power_state', 'running', 'output_state'].includes(o.field)).sort((a, b) => b.observedAt - a.observedAt)[0];
  if (!state || readingStatus(state, simTime) !== 'fresh') return 'unknown';
  if (state.value === true || ['running', 'online', 'ready', 'available'].includes(String(state.value))) return 'active';
  if (state.value === false || ['not_ready', 'offline', 'stopped', 'off', 'booting', 'throttled', 'thermal_tripped', 'tripped', 'unavailable'].includes(String(state.value))) return 'attention';
  return 'unknown';
}
