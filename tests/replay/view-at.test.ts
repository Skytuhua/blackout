import { expect, it } from 'vitest';
import * as replay from '../../src/sim/replay';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { KnowledgeViewSchema } from '../../src/shared/schemas';
import { request } from '../sim/mission-policy';

function replayViewAt(...args: Parameters<typeof replay.replayViewAt>) {
  expect(replay.replayViewAt, 'The host needs an actor-scoped replay cursor API').toBeTypeOf('function');
  return replay.replayViewAt(...args);
}

it('projects pre/at/post command cursors with real movement and cancellation task mapping, without mutating source', () => {
  const engine = initialize(hotRestart, 'view-source'); engine.step(2);
  const moved = engine.applyCommand(request(engine, 'move_crew', 'alex', { destination: { x: 18, y: 10 } }));
  expect(moved.status).toBe('accepted');
  engine.step(1);
  const traveling = engine.observe('player').crew.find(row => row.id === 'alex')!;
  expect(engine.applyCommand(request(engine, 'cancel_task', 'alex', { taskId: moved.taskId! })).status).toBe('applied');
  engine.step(1);
  expect(engine.applyCommand(request(engine, 'move_crew', 'alex', { destination: { x: 3, y: 5 } })).status).toBe('accepted');
  engine.step(4);
  const source = engine.exportRecord(), bytes = JSON.stringify(source);
  const before = replayViewAt(source, 'view-before', 1);
  expect(before).toMatchObject({ runId: 'view-before', simTime: 1, tasks: [] });
  const at = replayViewAt(source, 'view-at', 2);
  expect(at.tasks).toMatchObject([{ action: 'move_crew', status: 'traveling', startedAt: 2 }]);
  expect(at.crew.find(row => row.id === 'alex')).toMatchObject({ x: 3, y: 5 });
  const canceled = replayViewAt(source, 'view-canceled', 3);
  expect(canceled.tasks).toMatchObject([{ action: 'move_crew', status: 'canceled' }]);
  expect(canceled.crew.find(row => row.id === 'alex')).toMatchObject({ x: traveling.x, y: traveling.y, taskId: null });
  const end = replayViewAt(source, 'view-end', 8, 'alex');
  expect(end).toMatchObject({ runId: 'view-end', actorId: 'alex', simTime: 8 });
  expect(end.crew.find(row => row.id === 'alex')).toMatchObject({ x: 3, y: 5, taskId: null });
  expect(KnowledgeViewSchema.safeParse(end).success).toBe(true);
  expect('state' in end || 'initialCheckpoint' in end || 'finalCheckpoint' in end).toBe(false);
  expect(end.observations).toEqual(engine.observe('alex').observations);
  end.observations.length = 0;
  expect(JSON.stringify(source)).toBe(bytes);
});

it('rejects invalid cursors, reused identity and invalid source records', () => {
  const engine = initialize(hotRestart, 'cursor-source'); engine.step(5); const source = engine.exportRecord();
  for (const at of [-1, 0.5, 6, NaN, Infinity]) expect(() => replayViewAt(source, 'cursor-copy', at)).toThrow(/REPLAY_TIME/);
  expect(() => replayViewAt(source, source.runId, 0)).toThrow(/REPLAY_IDENTITY/);
  expect(() => replayViewAt({ ...source, engineVersion: 'old-engine' }, 'cursor-copy', 0)).toThrow(/VERSION/);
  const start = replayViewAt(source, 'cursor-zero', 0);
  expect(start.simTime).toBe(0); expect(start.tasks).toEqual([]);
});

it('preserves a closed terminal source and permits its recorded domain-clock horizon beyond the ending tick', () => {
  const engine = initialize(hotRestart, 'terminal-source');
  while (!engine.step(1).events.some(event => event.type === 'mission.success' || event.type === 'mission.failure')) { /* Stop at the first actual ending event. */ }
  const ending = engine.observe('player'), closed = engine.exportRecord();
  expect(replayViewAt(closed, 'closed-copy', ending.simTime).mission).toEqual(ending.mission);
  engine.step(5); const extended = engine.exportRecord();
  const later = replayViewAt(extended, 'extended-copy', ending.simTime + 5);
  expect(later.simTime).toBe(ending.simTime + 5);
  expect(later.mission).toEqual(engine.observe('player').mission);
  expect(later.mission.status).toBe('failure');
}, 20000);
