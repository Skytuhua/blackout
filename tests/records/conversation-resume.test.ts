import { expect, it } from 'vitest';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { HostArchive } from '../../src/persistence/host-archive';
import { deserializeRun, serializeRun } from '../../src/persistence/runs';
import { appendConversationEntry, createConversations, hydrateConversationReport } from '../../src/shared/conversations';

it('hydrates exact saved report evidence after resume without changing its read state', () => {
  const engine = initialize(hotRestart, 'report-resume'); engine.step(10);
  const receipt = engine.applyCommand({ schemaVersion: 1, runId: 'report-resume', requestId: 'inspect', actorId: 'player', idempotencyKey: 'inspect', expectedEntityVersions: engine.observe('player').observedEntityVersions, intent: { action: 'inspect', targetId: 'controller', atSimTime: 10, args: { technicianId: 'alex' } } });
  expect(receipt.status).toBe('accepted'); engine.step(receipt.eta! + 2 - 10);
  const view = engine.observe('player'), report = view.messages.find(message => message.id === `report-${receipt.taskId}`)!;
  const saved = deserializeRun(serializeRun(new HostArchive('report-resume').build(engine.exportRecord())));
  const original = saved.dialogue.find(message => message.id === report.id)!;
  let threads = appendConversationEntry(createConversations(), { id: original.id, actorId: 'alex', at: original.at, kind: 'report', text: original.text, unread: false, reportId: original.id });
  const readings = view.observations.filter(observation => report.evidenceIds.includes(observation.id));
  threads = hydrateConversationReport(threads, { id: report.id, actorId: 'alex', at: report.at, kind: 'report', text: report.text, unread: true, reportId: report.id, sections: [{ id: 'evidence', label: 'Evidence', text: JSON.stringify(readings) }] });
  const restored = threads.find(thread => thread.actorId === 'alex')!.entries.find(entry => entry.id === report.id)!;
  expect(restored.unread).toBe(false); expect(restored.reportId).toBe(report.id);
  expect(JSON.parse(restored.sections![0].text)).toEqual(readings);
  expect(readings.some(observation => observation.field === 'prerequisite_ready' && observation.value === false)).toBe(true);
  expect(readings.every(observation => observation.observedAt <= observation.receivedAt && observation.receivedAt <= view.simTime)).toBe(true);
});
