import type { KnowledgeView } from '../../shared/contracts';
import { publicTaskProgress } from '../../game/public-task-ui';

export function TaskProgress({ view, actorId, name }: { view: KnowledgeView; actorId: string; name: string }) {
  const progress = publicTaskProgress(view, actorId);
  if (!progress) return null;
  return <div className="conv-task-progress"><span>{progress.phase}{progress.percent < 100 ? ` · ${progress.percent}%` : ''}</span><div role="progressbar" aria-label={`${name} task progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${progress.phase}, ${progress.percent}%`}><span style={{ width: `${progress.percent}%` }} /></div></div>;
}
