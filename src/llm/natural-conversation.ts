import type { AgentResponse, GatewayStart, KnowledgeView, Observation, ProposalAuthorization } from '../shared/contracts';

const clock = (at: number) => `${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')}`;
const words = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
const delivered = (o: Observation, view: KnowledgeView) => o.quality !== 'unknown' && o.observedAt <= o.receivedAt && o.receivedAt <= view.simTime;

/** Model prose stays verbatim. Readings and age labels are separate, scoped evidence. */
export function naturalReplyText(response: AgentResponse, view: KnowledgeView): string {
  const lines = [response.inference, response.uncertainty].filter(Boolean);
  const seen = new Set<string>(), ages = new Set<string>();
  const values = new Set(response.facts.flatMap(f => 'observationId' in f && f.field === 'value' ? [f.observationId] : []));
  for (const fact of response.facts) {
    if (!('observationId' in fact)) continue;
    const o = view.observations.find(o => o.id === fact.observationId);
    if (!o || !delivered(o, view)) continue;
    const label = view.knownTopology.assets.find(a => a.id === o.assetId)?.label ?? 'Equipment';
    const key = `${o.id}:${fact.field}`; if (seen.has(key)) continue; seen.add(key);
    if (fact.field === 'value') {
      if (typeof o.value !== 'boolean') lines.push(`${label}: ${words(o.field)} ${String(o.value ?? 'unknown')}${o.units ? ` ${o.units}` : ''}`);
      if (view.simTime - o.observedAt > 10 || view.observations.some(newer => newer.assetId === o.assetId && newer.field === o.field && newer.receivedAt <= view.simTime && newer.observedAt > o.observedAt)) ages.add(`${label}: Earlier report, ${clock(o.observedAt)}.`);
    } else if (fact.field === 'assetId') { if (!values.has(o.id)) lines.push(`Equipment: ${label}.`); }
    else if (fact.field === 'observedAt') lines.push(`${label}: Checked at ${clock(o.observedAt)}.`);
    else if (fact.field === 'receivedAt') lines.push(`${label}: Report arrived at ${clock(o.receivedAt)}.`);
    else lines.push(`${label}: ${words(fact.field)} ${String(o[fact.field])}`);
  }
  return [...lines, ...ages].join('\n');
}

/** Structural/evidence guards, not a claim of complete semantic spoiler detection. */
export function naturalNarrativeAllowed(start: GatewayStart, response: AgentResponse): boolean {
  if (!response.requestKind || !response.inference.trim() || response.inference.length > 180 || response.uncertainty.length > 100) return false;
  if (response.requestKind !== 'order' && response.proposals.length) return false;
  if (naturalReplyText(response, start.view).length > 260) return false;
  const text = `${response.inference} ${response.uncertainty}`;
  if (/\b(?:simulation time|engine tick|entity version|checkpoint|scheduled (?:completion|at))\b|\b\d+(?:\.\d+)?\s*(?:°C|kW|kWh|seconds?|minutes?)\b/i.test(text)) return false;
  // A full future recipe stays out of ordinary dialogue; single supported orders remain available.
  if (['pause', 'inspect|check', 'repair|fix', 'resume|restore', 'verify'].filter(verb => new RegExp(`\\b(?:${verb})\\b`, 'i').test(text)).length >= 4) return false;
  const selected = start.view.observations.filter(o => response.facts.some(f => 'observationId' in f && f.observationId === o.id && f.field === 'value'));
  const reported = (o: Observation) => delivered(o, start.view) && o.source.startsWith('report:') && start.view.messages.some(m => m.mode === 'system' && m.at <= start.view.simTime && m.evidenceIds.includes(o.id));
  const has = (field: string, value: Observation['value']) => selected.some(o => {
    if (o.field !== field || o.value !== value || !reported(o)) return false;
    return !start.view.observations.some(other => other.assetId === o.assetId && other.field === field && delivered(other, start.view) && other.observedAt >= o.observedAt && other.value !== value);
  });
  const running = (assetId: string) => {
    const rows = start.view.observations.filter(o => o.assetId === assetId && ['running', 'state'].includes(o.field) && o.observedAt <= o.receivedAt && o.receivedAt <= start.view.simTime);
    const latest = Math.max(-1, ...rows.map(o => o.observedAt));
    const current = rows.filter(o => o.observedAt === latest);
    return current.length > 0 && start.view.simTime - latest <= 10 && current.every(o => o.quality !== 'unknown' && (o.field === 'running' ? o.value === true : o.value === 'running')) && selected.some(o => current.some(row => row.id === o.id));
  };
  for (const sentence of text.split(/[;.!?]/)) {
    const qualified = /\b(?:does not|doesn't|cannot|can't|not)\s+(?:\w+\s+){0,3}(?:mean|prove|confirm|establish|known|verified)\b/i.test(sentence);
    const conditional = /\b(?:if|when|once)\b/i.test(sentence);
    if (!qualified && !conditional && /\b(?:check|inspection)\b.{0,35}\b(?:finished|complete|completed|done|ended)\b/i.test(sentence) && !has('inspection_complete', true)) return false;
    if (!qualified && !conditional && /\bcondition\b.{0,35}\b(?:missing|unmet|not met|wasn't met|was not met)\b/i.test(sentence) && !has('prerequisite_ready', false)) return false;
    if (!qualified && /\b(?:broken|faulty|defective|(?:controller|pump|fan|supply|controls?)\s+(?:(?:has|have|is|are|was|were)\s+)?failed|(?:control|controller|pump|fan|electrical)\s+(?:fault|failure))\b/i.test(sentence)) {
      const terms = sentence.match(/broken|faulty|defective|failed|fault|failure/gi) ?? [];
      if (!selected.some(o => reported(o) && typeof o.value === 'string' && terms.every(term => String(o.value).toLowerCase().includes(term.toLowerCase())))) return false;
    }
    if (!qualified && !conditional && /\b(?:repair|fix)\b.{0,25}\b(?:complete|completed|finished|done)\b/i.test(sentence) && !start.view.tasks.some(t => t.actorId === start.actorId && t.action === 'repair_cooling' && t.status === 'completed')) return false;
    if (!qualified && !conditional && /\bcooling(?:\s+(?:unit|train))?(?:\s*\d+)?\s+(?:(?:is|has)\s+)?(?:running|recovered|restarted|working)\b/i.test(sentence)) {
      const units = start.view.knownTopology.assets.filter(a => a.kind === 'cooling');
      const named = units.filter(a => sentence.toLowerCase().includes(a.label.toLowerCase()));
      const claimed = named.length ? named : units;
      if (!claimed.length || !claimed.every(a => running(a.id))) return false;
    }
  }
  return true;
}

/** Only a final, model-classified order can consume its exact originating authorization. */
export function directOrderAuthorizationIds(response: AgentResponse, authorizations: readonly ProposalAuthorization[]): string[] {
  if (response.requestKind !== 'order' || response.proposals.length !== 1) return [];
  const intent = response.proposals[0];
  const args = (value: typeof intent.args) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return authorizations.filter(a => a.runId === response.runId && a.actorId === response.actorId && a.requestId === response.requestId && a.intent.action === intent.action && a.intent.targetId === intent.targetId && a.intent.atSimTime === intent.atSimTime && args(a.intent.args) === args(intent.args)).slice(0, 1).map(a => a.id);
}
