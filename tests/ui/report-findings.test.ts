import { expect, it } from 'vitest';
import type { KnowledgeView, Observation, PublicMessage } from '../../src/shared/contracts';
import { alarmFixture } from '../../src/shared/fixtures';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { reportSections } from '../../src/ui/conversation/report-findings';

function fixture() {
  const view: KnowledgeView = structuredClone(alarmFixture);
  view.knownTopology.assets.push(hotRestart.topology.assets.find(a => a.id === 'controller')!);
  const checked: Observation = { id: 'check', assetId: 'controller', field: 'inspection_complete', value: true, units: '', source: 'report:alex', quality: 'reported', observedAt: 70, receivedAt: 72 };
  const ready = { ...checked, id: 'ready', field: 'prerequisite_ready', value: false };
  const message: PublicMessage = { id: 'report-task-check', speaker: 'alex', at: 72, mode: 'system', text: 'Inspection complete. Timestamped field report delivered.', evidenceIds: [checked.id, ready.id] };
  view.observations.push(checked, ready); view.messages.push(message);
  return { view, message, checked, ready };
}

it('opens with the actual delivered findings and preserves the exact evidence and delivery notice', () => {
  const { view, message } = fixture(), before = JSON.stringify({ view, message });
  const sections = reportSections(message, view);
  expect(sections[0]).toMatchObject({ id: 'findings', label: 'Findings' });
  expect(sections[0].text).toContain('Cooling control'); expect(sections[0].text).toContain('Check: finished');
  expect(sections[0].text).toContain('Cooling start condition: not met');
  expect(sections[0].text).not.toMatch(/fault|failed|repair|true|false|controller/);
  expect(sections.find(s => s.id === 'evidence')?.text).toContain('prerequisite ready: false');
  expect(JSON.stringify({ view, message })).toBe(before);
});

it.each(['unknown', 'future', 'missing', 'old'] as const)('does not turn %s report data into current findings', state => {
  const { view, message, ready } = fixture();
  if (state === 'unknown') ready.quality = 'unknown';
  if (state === 'future') ready.receivedAt = 76;
  if (state === 'missing') view.observations = view.observations.filter(o => o.id !== ready.id);
  if (state === 'old') view.simTime = 100;
  const text = reportSections(message, view)[0].text;
  if (state === 'old') expect(text).toContain('Earlier report');
  else expect(text).not.toContain('Cooling start condition: not met');
  expect(text).not.toContain('The controller failed');
});

it('never derives findings from an undelivered report or uncited observations', () => {
  const { view, message } = fixture(); message.at = 76;
  expect(reportSections(message, view)[0].text).not.toContain('not met');
  message.at = 72; message.evidenceIds = [];
  expect(reportSections(message, view)[0].text).toContain('No findings');
});
