import type { KnowledgeView } from '../shared/contracts';

export function publicTaskProgress(view: KnowledgeView, actorId: string) {
  const active = view.crew.find(crew => crew.id === actorId)?.taskId;
  const task = active ? view.tasks.find(task => task.id === active) : view.tasks.filter(task => task.actorId === actorId && task.action !== 'move_crew').at(-1);
  if (!task || task.status === 'canceled') return null;
  if (task.status === 'queued') return { phase: 'Waiting to start', percent: 0 };
  if (task.status === 'blocked') return { phase: 'Blocked', percent: Math.round(task.progress * 100) };
  if (task.status === 'completed') return { phase: view.messages.some(message => message.id === `report-${task.id}`) ? 'Report delivered' : 'Report on the way', percent: 100 };
  if (task.status === 'traveling') return { phase: 'Walking', percent: Math.round(Math.max(0, Math.min(1, (view.simTime - task.startedAt) / Math.max(1, task.arrivalAt - task.startedAt))) * 100) };
  return { phase: task.status === 'inspecting' ? 'Checking' : 'Working', percent: Math.round(Math.max(0, Math.min(1, task.progress)) * 100) };
}

export type NearbyEquipment = { runId: string; actorId: string; assetId: string; distance: number };
/** Public crew positions and known footprints only. Small exit margin prevents edge flicker. */
export function nearbyEquipment(view: KnowledgeView, selectedActor: string, selectedAsset: string | null, previous?: NearbyEquipment | null): NearbyEquipment | null {
  const candidates = view.crew.filter(crew => crew.role !== 'remote').flatMap(crew => view.knownTopology.assets.map(asset => {
    const dx = Math.max(asset.x - crew.x, 0, crew.x - (asset.x + asset.width - 1));
    const dy = Math.max(asset.y - crew.y, 0, crew.y - (asset.y + asset.height - 1));
    return { runId: view.runId, actorId: crew.id, assetId: asset.id, distance: Math.hypot(dx, dy) };
  }));
  const priority = (candidate: NearbyEquipment) => Number(candidate.actorId === selectedActor) * 2 + Number(candidate.assetId === selectedAsset);
  const closest = candidates.filter(candidate => candidate.distance <= 1.25).sort((a, b) => priority(b) - priority(a) || a.distance - b.distance || a.actorId.localeCompare(b.actorId) || a.assetId.localeCompare(b.assetId))[0];
  const retained = previous?.runId === view.runId ? candidates.find(candidate => candidate.actorId === previous.actorId && candidate.assetId === previous.assetId && candidate.distance <= 1.7) : undefined;
  return retained && (!closest || priority(retained) >= priority(closest)) ? retained : closest ?? null;
}
