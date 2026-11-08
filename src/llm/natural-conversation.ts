import type { AgentResponse, GatewayStart, KnowledgeView, Observation, ProposalAuthorization } from '../shared/contracts';
import { usesMovementConversation } from './conversation-mode';

const clock = (at: number) => `${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')}`;
const words = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
const delivered = (o: Observation, view: KnowledgeView) => o.quality !== 'unknown' && o.observedAt <= o.receivedAt && o.receivedAt <= view.simTime;

function contradictsExplicitInstruction(start: GatewayStart, response: AgentResponse): boolean {
  const action = response.proposals[0]; if (!action) return false;
  if (/^\s*(?:hi|hello|hey|hiya|good\s+(?:morning|afternoon|evening))[!.\s]*$/i.test(start.message)) return true;
  const clauses = start.message.toLowerCase().replaceAll('’', "'").split(/[,;.!?]|\bbut\b|\band\s+(?=(?:please\s+)?(?:walk|go|move|travel|head|approach|check|inspect|examine|repair|fix|pause|resume|stop|cancel|verify|set|adjust)\b)/);
  const negative = /\b(?:don't|dont|do\s+not|never|avoid)\b/;
  const stopWork = /\b(?:stop|cancel|abort|halt)\b(?:\s+(?:your|the|current|this|that|my|ongoing|existing|please)){0,3}\s+(?:task|job|work|inspection|repair|check|working)\b|\b(?:stop|cancel|abort|halt)\s+what\s+(?:you(?:'re| are)|you)\s+doing\b|^\s*(?:please\s+)?(?:stop|cancel|abort|halt)(?:\s+(?:it|that))?\s*$/;
  if (action.action === 'cancel_task' && !clauses.some(clause => !negative.test(clause) && stopWork.test(clause))) return true;
  const verbs: Partial<Record<typeof action.action, RegExp>> = {
    inspect: /\b(?:check|inspect|examine|test|look at)\b/, independent_reading: /\b(?:check|inspect|read|measure|test|look at)\b/,
    repair_cooling: /\b(?:repair|fix)\b/, restart_cooling: /\b(?:restart|start)\b/, reset_ups: /\breset\b/,
    pause_batch: /\b(?:pause|stop|set|adjust|change)\b/, resume_batch: /\b(?:resume|restore|start|set|adjust|change)\b/, verify_recovery: /\b(?:verify|check)\b/,
    set_batch_ceiling: action.action === 'set_batch_ceiling' && action.args.ceiling === 0 ? /\b(?:set|adjust|change|increase|decrease|raise|lower|pause|stop)\b/ : /\b(?:set|adjust|change|increase|decrease|raise|lower|resume|restore)\b/,
    move_crew: /\b(?:walk|go|move|travel|head|approach)\b/,
    cancel_task: /\b(?:stop|cancel|abort|halt)\b/,
  };
  const verb = verbs[action.action];
  return clauses.some(clause => {
    const noAction = /\b(?:do|perform|take|start)\s+(?:anything|any\s+(?:action|work|task))\b/.test(clause);
    if (!negative.test(clause) || !noAction && !verb?.test(clause)) return false;
    const named = start.view.knownTopology.assets.filter(asset => {
      const label = asset.label.toLowerCase(), short = label.replace(/^rack\s+/, '');
      return clause.includes(label) || clause.includes(asset.id.toLowerCase()) || short !== label && new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(clause) || asset.kind === 'controller' && /\bcontrols?\b/.test(clause);
    });
    const target = action.action === 'move_crew' ? start.view.knownTopology.assets.find(asset => asset.serviceTile.x === action.args.destination.x && asset.serviceTile.y === action.args.destination.y)?.id : action.targetId;
    const affectsAllRacks = target === 'site' && ['pause_batch', 'resume_batch', 'set_batch_ceiling'].includes(action.action);
    return !named.length || named.some(asset => asset.id === target || affectsAllRacks && asset.kind === 'rack');
  });
}

/** Model prose stays verbatim. Readings and age labels are separate, scoped evidence. */
export function naturalReplyText(response: AgentResponse, view: KnowledgeView, proseOnly = false): string {
  const lines = [response.inference, response.uncertainty].filter(Boolean);
  if (proseOnly) return lines.join('\n');
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
  if (usesMovementConversation(start) && contradictsExplicitInstruction(start, response)) return false;
  if (!usesMovementConversation(start) && naturalReplyText(response, start.view).length > 260) return false;
  const text = `${response.inference} ${response.uncertainty}`;
  if (/\b(?:simulation time|engine tick|entity version|checkpoint|scheduled (?:completion|at))\b|\b\d+(?:\.\d+)?\s*(?:°C|kW|kWh|seconds?|minutes?)\b/i.test(text)) return false;
  // A full future recipe stays out of ordinary dialogue; single supported orders remain available.
  if (['pause', 'inspect|check', 'repair|fix', 'resume|restore', 'verify'].filter(verb => new RegExp(`\\b(?:${verb})\\b`, 'i').test(text)).length >= 4) return false;
  const selected = start.view.observations.filter(o => response.facts.some(f => 'observationId' in f && f.observationId === o.id && f.field === 'value'));
  const supplied = usesMovementConversation(start) ? start.view.observations : selected;
  const reported = (o: Observation) => delivered(o, start.view) && o.source.startsWith('report:') && start.view.messages.some(m => m.mode === 'system' && m.at <= start.view.simTime && m.evidenceIds.includes(o.id));
  const has = (field: string, value: Observation['value'], assets: string[] = []) => (!assets.length ? [null] : assets).every(assetId => supplied.some(o => {
    if (assetId && o.assetId !== assetId) return false;
    if (o.field !== field || o.value !== value || !reported(o)) return false;
    return !start.view.observations.some(other => other.assetId === o.assetId && other.field === field && delivered(other, start.view) && other.observedAt >= o.observedAt && other.value !== value);
  }));
  const running = (assetId: string) => {
    const rows = start.view.observations.filter(o => o.assetId === assetId && ['running', 'state'].includes(o.field) && o.observedAt <= o.receivedAt && o.receivedAt <= start.view.simTime);
    const latest = Math.max(-1, ...rows.map(o => o.observedAt));
    const current = rows.filter(o => o.observedAt === latest);
    return current.length > 0 && start.view.simTime - latest <= 10 && current.every(o => o.quality !== 'unknown' && (o.field === 'running' ? o.value === true : o.value === 'running')) && supplied.some(o => current.some(row => row.id === o.id));
  };
  for (const sentence of text.split(/[;.!?]/)) {
    const named = start.view.knownTopology.assets.filter(asset => sentence.toLowerCase().includes(asset.label.toLowerCase()) || new RegExp(`\\b${asset.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sentence));
    const subjects = start.view.knownTopology.assets.filter(asset => named.includes(asset) || (asset.kind === 'controller' ? /\b(?:controls?|controller)\b/i.test(sentence) : ['ups', 'generator', 'distribution'].includes(asset.kind) && new RegExp(`\\b${asset.kind}\\b`, 'i').test(sentence)));
    const subjectIds = usesMovementConversation(start) ? subjects.map(asset => asset.id) : [];
    const qualified = /\b(?:does not|doesn't|cannot|can't|not)\s+(?:\w+\s+){0,3}(?:mean|prove|confirm|establish|known|verified)\b/i.test(sentence);
    const conditional = /\b(?:if|when|once)\b/i.test(sentence);
    if (!qualified && !conditional && /\b(?:check|inspection)\b.{0,35}\b(?:finished|complete|completed|done|ended)\b/i.test(sentence) && !has('inspection_complete', true, subjectIds)) return false;
    if (!qualified && !conditional && /\bcondition\b.{0,35}\b(?:missing|unmet|not met|wasn't met|was not met)\b/i.test(sentence) && !has('prerequisite_ready', false, subjectIds)) return false;
    if (!qualified && /\b(?:broken|faulty|defective|(?:controller|pump|fan|supply|controls?)\s+(?:(?:has|have|is|are|was|were)\s+)?failed|(?:control|controller|pump|fan|electrical)\s+(?:fault|failure))\b/i.test(sentence)) {
      const terms = sentence.match(/broken|faulty|defective|failed|fault|failure/gi) ?? [];
      if (!supplied.some(o => reported(o) && typeof o.value === 'string' && terms.every(term => String(o.value).toLowerCase().includes(term.toLowerCase())))) return false;
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
