import type { ActionIntent, KnowledgeView, SuggestedOrder } from './contracts';
import { latestObservations } from '../llm/context';

export function conversationOrders(view: KnowledgeView): (SuggestedOrder & { intent: ActionIntent })[] {
  const rows: { actorId: string; action: Exclude<ActionIntent['action'], 'move_crew'>; targetId: string; label: string; args?: { ceiling: number } }[] = [
    { actorId: 'alex', action: 'inspect', targetId: 'controller', label: 'Check cooling controls' },
    { actorId: 'alex', action: 'repair_cooling', targetId: 'controller', label: 'Repair the controls' },
    { actorId: 'jules', action: 'inspect', targetId: 'distribution', label: 'Check the power board' },
    { actorId: 'sam', action: 'pause_batch', targetId: 'site', label: 'Pause background jobs' },
    { actorId: 'sam', action: 'set_batch_ceiling', targetId: 'site', label: 'Resume background jobs', args: { ceiling: 30 } },
    { actorId: 'sam', action: 'verify_recovery', targetId: 'site', label: 'Check recovery' },
  ];
  const observations = latestObservations(view.observations);
  const paused = observations.some(observation => observation.field === 'batch_ceiling' && observation.value === 0);
  const diagnosis = observations.some(observation => observation.assetId === 'controller' && observation.field === 'prerequisite_ready' && observation.value === false);
  return rows.map(row => {
    const offered = view.affordances.find(affordance => affordance.action === row.action && affordance.targetId === row.targetId);
    const qualified = offered && (!offered.technicianIds.length || offered.technicianIds.includes(row.actorId));
    return { id: `${row.actorId}:${row.action}:${row.targetId}`, actorId: row.actorId, label: row.label, enabled: !!offered?.enabled && !!qualified && ['active', 'practice'].includes(view.mission.status), reason: offered?.reason ? offered.reason.toLowerCase().replaceAll('_', ' ') : undefined, intent: { action: row.action, targetId: row.targetId, atSimTime: view.simTime, args: { ...row.args, ...(offered?.technicianIds.length ? { technicianId: row.actorId } : {}) } } };
  }).sort((left, right) => {
    const priority = (order: SuggestedOrder) => order.actorId === 'alex' && diagnosis && order.id.includes('repair_cooling') || order.actorId === 'sam' && paused && order.id.includes('set_batch_ceiling') || order.actorId === 'sam' && order.enabled && order.id.includes('verify_recovery') ? 0 : 1;
    return priority(left) - priority(right);
  });
}
