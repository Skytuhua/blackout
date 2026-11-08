import { expect, it } from 'vitest';
import { alarmFixture } from '../../src/shared/fixtures';
import { beginTraining, trainingInput, trainingReceipt, trainingView } from '../../src/shared/training';
import type { ActionIntent, CommandReceipt, KnowledgeView } from '../../src/shared/contracts';

const receipt: CommandReceipt = { schemaVersion: 1, runId: 'practice', requestId: 'r', actorId: 'player', status: 'accepted', reason: 'TASK_RESERVED', taskId: 'move-1', eta: 4, evidenceIds: [], observedAt: 0 };
it('teaches controls in order and waits for the exact accepted crew arrival', () => {
  let state = beginTraining('practice');
  expect(trainingInput(state, 'timestamp_read')).toEqual(state);
  for (const event of ['commander_moved', 'equipment_opened', 'crew_selected'] as const) state = trainingInput(state, event);
  const intent: ActionIntent = { action: 'move_crew', targetId: 'alex', atSimTime: 0, args: { destination: { x: 4, y: 5 } } };
  expect(trainingReceipt(state, intent, { ...receipt, status: 'rejected' }).moveTaskId).toBeNull();
  state = trainingReceipt(state, intent, receipt);
  const view: KnowledgeView = { ...alarmFixture, runId: 'practice', mission: { ...alarmFixture.mission, status: 'practice' }, tasks: [] };
  expect(trainingView(state, view).step).toBe(3);
  expect(trainingView(state, { ...view, tasks: [{ id: 'another', action: 'move_crew', targetId: 'jules', actorId: 'player', status: 'completed', startedAt: 0, arrivalAt: 4, completesAt: 4, progress: 1, path: [], reason: null }] }).step).toBe(3);
  expect(trainingView(state, { ...view, tasks: [{ id: 'move-1', action: 'move_crew', targetId: 'alex', actorId: 'player', status: 'completed', startedAt: 0, arrivalAt: 4, completesAt: 4, progress: 1, path: [], reason: null }] }).step).toBe(4);
  expect(trainingView(state, { ...view, runId: 'new-run' })).toEqual(state);
});
it('distinguishes completed inspection work from its delivered timestamped report', () => {
  const intent: ActionIntent = { action: 'inspect', targetId: 'controller', atSimTime: 0, args: { technicianId: 'alex' } };
  const state = trainingReceipt({ ...beginTraining('practice'), step: 5 }, intent, { ...receipt, taskId: 'inspection-1' });
  const task = { id: 'inspection-1', action: 'inspect' as const, targetId: 'controller', actorId: 'player', status: 'completed' as const, startedAt: 0, arrivalAt: 4, completesAt: 34, progress: 1, path: [], reason: null };
  const view: KnowledgeView = { ...alarmFixture, runId: 'practice', mission: { ...alarmFixture.mission, status: 'practice' }, tasks: [task], messages: [] };
  expect(trainingView(state, view).step).toBe(6);
  const observation = { id: 'inspection-evidence', assetId: 'controller', source: 'report:alex', field: 'inspection_complete', value: true, units: '', observedAt: 34, receivedAt: 36, quality: 'reported' as const };
  expect(trainingView(state, { ...view, observations: [observation], messages: [{ id: 'report-inspection-1', at: 36, speaker: 'alex', mode: 'system', text: 'Inspection complete.', evidenceIds: [observation.id] }] }).step).toBe(7);
});
