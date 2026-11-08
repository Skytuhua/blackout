import type { KnowledgeView, Observation } from '../shared/contracts';

export function latestObservations(observations: readonly Observation[]): Observation[] {
  const latest = new Map<string, Observation>();
  for (const observation of observations) {
    const key = JSON.stringify([observation.assetId, observation.field, observation.source]);
    const previous = latest.get(key);
    if (!previous || observation.observedAt > previous.observedAt || observation.observedAt === previous.observedAt && observation.receivedAt >= previous.receivedAt) latest.set(key, observation);
  }
  return [...latest.values()];
}

// Gateway projection only: the engine, UI and recorder retain the complete history.
export function scopeKnowledge(view: KnowledgeView, targetIds?: readonly string[], retainIds: readonly string[] = []): KnowledgeView {
  const targets = targetIds && new Set(['site', ...targetIds]);
  const retained = new Set(retainIds);
  const latest = latestObservations(view.observations).filter(o => !targets || targets.has(o.assetId));
  const observations = view.observations.filter(o => latest.includes(o) || retained.has(o.id));
  const active = view.tasks.filter(t => !['completed', 'canceled'].includes(t.status));
  const recent = view.tasks.filter(t => ['completed', 'canceled'].includes(t.status)).slice(-4);
  const result = structuredClone({ ...view, viewHash: 'pending', observations, tasks: [...active, ...recent], messages: view.messages.slice(-4), affordances: view.affordances.filter(a => !targets || targets.has(a.targetId)) });
  let hash = 2166136261;
  for (const c of JSON.stringify(result)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  result.viewHash = `context-${hash.toString(16)}`;
  return result;
}
