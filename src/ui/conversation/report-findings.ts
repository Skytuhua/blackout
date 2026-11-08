import type { ConversationEntry, KnowledgeView, Observation, PublicMessage } from '../../shared/contracts';
import { observationText } from '../desktop-copy';

const time = (at: number) => `${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')}`;
const words = (field: string) => field.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
export const unavailableFindings = { id: 'findings', label: 'Findings', text: 'No findings are available for this report.' };
function finding(o: Observation, view: KnowledgeView) {
  const cooling = view.knownTopology.assets.some(a => a.id === o.assetId && ['controller', 'cooling'].includes(a.kind));
  if (o.quality === 'unknown' || o.value === null) return `${words(o.field)}: unknown.`;
  if (o.field === 'inspection_complete' && typeof o.value === 'boolean') return `Check: ${o.value ? 'finished' : 'not finished'}.`;
  if (o.field === 'prerequisite_ready' && typeof o.value === 'boolean') return `${cooling ? 'Cooling start condition' : 'Start condition'}: ${o.value ? 'met' : 'not met'}.`;
  if (o.field === 'running' && typeof o.value === 'boolean') return `Running at the check: ${o.value ? 'yes' : 'no'}.`;
  return `${o.field === 'temperatureC' ? 'Inlet temperature' : words(o.field)}: ${String(o.value)}${o.units ? ` ${o.units}` : ''}.`;
}
/** Display projection only. Original report, selectors and saved bytes stay unchanged. */
export function reportSections(message: PublicMessage, view: KnowledgeView): NonNullable<ConversationEntry['sections']> {
  const delivered = message.at <= view.simTime && view.messages.some(m => m.mode === 'system' && m.at === message.at && m.speaker === message.speaker && m.evidenceIds.length === message.evidenceIds.length && message.evidenceIds.every(id => m.evidenceIds.includes(id)));
  const readings = delivered ? message.evidenceIds.flatMap(id => {
    const rows = view.observations.filter(o => o.id === id);
    return rows.length === 1 && rows[0].observedAt <= rows[0].receivedAt && rows[0].receivedAt <= view.simTime ? rows : [];
  }) : [];
  const groups = new Map<string, Observation[]>();
  for (const o of readings) { const rows = groups.get(o.assetId) ?? []; rows.push(o); groups.set(o.assetId, rows); }
  const findings = [...groups].map(([assetId, rows]) => {
    const label = view.knownTopology.assets.find(a => a.id === assetId)?.label ?? 'Equipment';
    const oldest = Math.min(...rows.map(o => o.observedAt));
    const old = view.simTime - oldest > 10 || rows.some(o => view.observations.some(newer => newer.assetId === o.assetId && newer.field === o.field && newer.observedAt > o.observedAt && newer.receivedAt <= view.simTime));
    return `${label}\n${rows.map(o => finding(o, view)).join('\n')}\nChecked ${time(oldest)}. Report ${time(message.at)}.${old ? '\nEarlier report. Conditions may have changed.' : ''}`;
  }).join('\n\n');
  const missing = delivered && readings.length < message.evidenceIds.length ? '\nSome cited findings are unavailable.' : '';
  return [
    { id: 'findings', label: 'Findings', text: findings ? `${findings}${missing}` : delivered ? 'No findings were included in the available report.' : 'This report has not arrived yet.' },
    { id: 'evidence', label: 'Evidence', text: readings.map(o => observationText(o, view.simTime)).join('\n\n') || 'No delivered reading supplied.' },
  ];
}
export function reportFirstSections(entry: ConversationEntry) {
  const sections = entry.sections ?? [];
  return entry.kind === 'report' ? [sections.find(s => s.id === 'findings') ?? unavailableFindings, ...sections.filter(s => s.id !== 'findings')] : sections;
}
