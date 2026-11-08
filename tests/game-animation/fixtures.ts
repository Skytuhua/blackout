import type { KnowledgeView, Observation, PublicTask } from '../../src/shared/contracts';
import { alarmFixture } from '../../src/shared/fixtures';
import { hotRestart } from '../../src/content/scenarios/hot-restart';

export function observation(assetId: string, field: string, value: Observation['value'], extra: Partial<Observation> = {}): Observation {
  return { id: `${assetId}-${field}`, assetId, field, value, source: 'dashboard', units: '', observedAt: 75, receivedAt: 75, quality: 'reported', ...extra };
}

export function fixture(): KnowledgeView {
  return structuredClone({ ...alarmFixture, knownTopology: hotRestart.topology, crew: hotRestart.crew, observations: [
    observation('cooling-1', 'running', true),
    observation('rack-1', 'power_state', 'running'),
    observation('rack-1', 'batch_processing_rate', 12),
  ] });
}

export function workingView(extra: Partial<PublicTask> = {}): KnowledgeView {
  const view = fixture();
  view.crew[0] = { ...view.crew[0], x: 5, y: 9, taskId: 'owned-task' };
  view.tasks = [{ id: 'owned-task', actorId: 'alex', targetId: 'controller', action: 'inspect', status: 'inspecting', startedAt: 60, arrivalAt: 70, completesAt: 100, progress: .2, path: [{ x: 3, y: 5 }, { x: 5, y: 9 }], reason: null, ...extra }];
  return view;
}
