import { expect, it } from 'vitest';
import { initialize } from '../../../src/sim/engine';
import { hotRestart } from '../../../src/content/scenarios/hot-restart';
import { request } from '../../sim/mission-policy';
import { nearbyEquipment, publicTaskProgress } from '../../../src/game/public-task-ui';

it('distinguishes real travel, work, delayed report and delivery; cancellation clears progress', () => {
  const engine = initialize(hotRestart, 'task-ui');
  const receipt = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
  engine.step(1); expect(publicTaskProgress(engine.observe('player'), 'alex')).toMatchObject({ phase: 'Walking' });
  expect(publicTaskProgress(engine.observe('player'), 'alex')!.percent).toBeGreaterThan(0);
  const task = engine.observe('player').tasks[0]; engine.step(task.arrivalAt - 1);
  expect(publicTaskProgress(engine.observe('player'), 'alex')).toMatchObject({ phase: 'Checking', percent: 0 });
  engine.step(task.completesAt - task.arrivalAt);
  expect(publicTaskProgress(engine.observe('player'), 'alex')).toMatchObject({ phase: 'Report on the way', percent: 100 });
  engine.step(2); expect(publicTaskProgress(engine.observe('player'), 'alex')!.phase).toBe('Report delivered');
  const next = engine.applyCommand(request(engine, 'inspect', 'rack-1', { technicianId: 'alex' }));
  engine.applyCommand(request(engine, 'cancel_task', 'rack-1', { taskId: next.taskId! }));
  expect(publicTaskProgress(engine.observe('player'), 'alex')).toBeNull();
  expect(receipt.status).toBe('accepted');
});

it('selects actual nearby field crew, retains a small movement margin and resets by run identity', () => {
  const view = initialize(hotRestart, 'nearby').observe('player');
  view.crew = view.crew.filter(crew => crew.id === 'alex'); view.crew[0].x = 5; view.crew[0].y = 9;
  const near = nearbyEquipment(view, 'alex', 'controller'); expect(near?.assetId).toBe('controller');
  view.crew[0].x = 4.5; expect(nearbyEquipment(view, 'alex', null, near)?.assetId).toBe('controller');
  view.crew[0].x = 6; view.crew[0].y = 6; expect(nearbyEquipment(view, 'alex', null, near)).toBeNull();
  view.runId = 'new-run'; expect(nearbyEquipment(view, 'alex', null, near)).toBeNull();
  view.crew = []; expect(nearbyEquipment(view, 'sam', null)).toBeNull();
});

it('appears on actual arrival and disappears along an accepted route away from equipment', () => {
  const engine = initialize(hotRestart, 'real-nearby');
  const first = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' })); engine.step(first.eta! + 2);
  const choice = nearbyEquipment(engine.observe('player'), 'alex', 'controller'); expect(choice?.assetId).toBe('controller');
  const next = engine.applyCommand(request(engine, 'inspect', 'rack-8', { technicianId: 'alex' })); expect(next.status).toBe('accepted');
  let previous = choice, left = false;
  for (let second = 0; second < 30; second++) { engine.step(1); const view = engine.observe('player'); previous = nearbyEquipment(view, 'alex', null, previous); if (previous === null && view.tasks.at(-1)?.status === 'traveling') { left = true; break; } }
  expect(left).toBe(true);
  engine.applyCommand(request(engine, 'cancel_task', 'rack-8', { taskId: next.taskId! }));
  expect(nearbyEquipment(engine.observe('player'), 'alex', null)).toBeNull();
});

it('labels a real independent reading as checking rather than repair work', () => {
  const engine = initialize(hotRestart, 'independent-ui');
  const receipt = engine.applyCommand(request(engine, 'independent_reading', 'rack-1', { technicianId: 'alex' })); expect(receipt.status).toBe('accepted');
  engine.step(engine.observe('player').tasks[0].arrivalAt);
  expect(publicTaskProgress(engine.observe('player'), 'alex')?.phase).toBe('Checking');
});
