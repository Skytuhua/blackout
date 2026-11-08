import { expect, it } from 'vitest';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { HostArchive } from '../../src/persistence/host-archive';
import { engineRecordOf } from '../../src/persistence/saved-record';
import { replayViewAt } from '../../src/sim/replay';
import { savedConversations } from '../../src/ui/conversation/recorded-history';
import { request } from '../sim/mission-policy';

function fixture(rejectedAttempt = false) {
  const engine = initialize(hotRestart, 'report-source'); engine.step(10);
  if (rejectedAttempt) expect(engine.applyCommand(request(engine, 'repair_cooling', 'controller', { technicianId: 'alex' })).status).toBe('rejected');
  const receipt = engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
  engine.step(receipt.eta! + 2 - 10);
  const source = new HostArchive('report-source').build(engine.exportRecord());
  const report = source.dialogue.find(message => message.id === `report-${receipt.taskId}`)!;
  return { engine, source, report };
}

it.each([false, true])('rebuilds exact delivered report details from the scoped replay view, rejected history=%s', rejected => {
  const { source, report } = fixture(rejected);
  const original = JSON.stringify(source);
  const view = replayViewAt(engineRecordOf(source), 'report-replay', source.finalCheckpoint.simTime);
  const restored = savedConversations(source, view).find(thread => thread.actorId === 'alex')!.entries.find(entry => entry.id === report.id)!;
  expect(restored.reportId).toBe(report.id); expect(restored.unread).toBe(false);
  expect(restored.sections).toHaveLength(2);
  expect(restored.sections![0]).toMatchObject({ id: 'findings', label: 'Findings' });
  expect(restored.sections![0].text).toContain('Cooling start condition: not met');
  const evidence = restored.sections!.find(section => section.id === 'evidence')!.text;
  expect(evidence).toContain('prerequisite ready: false');
  for (const id of report.evidenceIds) expect(evidence).toContain(id);
  expect(evidence).toContain('Observed T+'); expect(evidence).toContain('Received T+');
  expect(JSON.stringify(source)).toBe(original);
});

it('does not reveal a later report or its readings before its real delivery cursor', () => {
  const { source, report } = fixture();
  const before = replayViewAt(engineRecordOf(source), 'before-report', report.at - 1);
  const threads = savedConversations(source, before);
  expect(threads.flatMap(thread => thread.entries).some(entry => entry.id === report.id)).toBe(false);
  expect(JSON.stringify(threads)).not.toContain('prerequisite ready: false');
});
