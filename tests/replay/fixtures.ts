import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { request } from '../sim/mission-policy';

export function recordedRun(conflict = false) {
  const engine = initialize(hotRestart, 'original');
  // Rejected transport attempts must remain rejected audit data in replay.
  engine.applyCommand({ ...request(engine, 'pause_batch', 'site'), runId: 'obsolete' });
  const travel = engine.applyCommand(request(engine, 'inspect', 'ups-1', { technicianId: 'jules' }));
  engine.step(1);
  engine.applyCommand(request(engine, 'cancel_task', 'ups-1', { taskId: travel.taskId! }));
  engine.step(9);
  if (conflict) engine.applyCommand(request(engine, 'verify_recovery', 'site'));
  engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
  engine.step(10);
  engine.applyCommand(request(engine, 'pause_batch', 'site'));
  engine.step(23);
  engine.applyCommand(request(engine, 'repair_cooling', 'controller', { technicianId: 'alex' }));
  engine.step(57);
  return engine.exportRecord();
}
