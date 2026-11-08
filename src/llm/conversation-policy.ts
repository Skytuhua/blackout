import type { ActionIntent, AgentResponse, GatewayStart, Observation } from '../shared/contracts';
import { factValue, validStart, validateResponse } from './validation';

const active = (status: string) => !['completed', 'canceled'].includes(status);
const delivered = (o: Observation, start: GatewayStart) => o.observedAt <= o.receivedAt && o.receivedAt <= start.view.simTime;
const usable = (o: Observation, start: GatewayStart) => delivered(o, start) && o.quality !== 'unknown';

function currentField(start: GatewayStart, targetId: string, field: string): Observation | undefined {
  const candidates = start.view.observations.filter(o => o.assetId === targetId && o.field === field && delivered(o, start));
  const time = candidates.reduce((latest, o) => Math.max(latest, o.observedAt), -1);
  const latest = candidates.filter(o => o.observedAt === time);
  return latest.length && latest.every(o => usable(o, start) && o.value === latest[0].value) ? latest[0] : undefined;
}

function reported(start: GatewayStart, o: Observation | undefined): o is Observation {
  return !!o && usable(o, start) && o.source.startsWith('report:') && start.view.messages.some(m => m.at <= start.view.simTime && m.mode === 'system' && m.evidenceIds.includes(o.id));
}

function ownAffordances(start: GatewayStart): GatewayStart['view']['affordances'] {
  const { view, actorId, role } = start;
  const worker = view.crew.find(c => c.id === actorId);
  const busy = worker?.taskId !== null || view.tasks.some(t => t.actorId === actorId && active(t.status));
  if (!worker || worker.role !== role || !['active', 'practice'].includes(view.mission.status)) return [];
  const running = view.knownTopology.assets.filter(a => a.kind === 'cooling');
  const coolingRunning = running.length > 0 && running.every(a => currentField(start, a.id, 'running')?.value === true);
  const ceilings = view.knownTopology.assets.filter(a => a.kind === 'rack').map(a => currentField(start, a.id, 'batch_ceiling'));
  const paused = ceilings.length > 0 && ceilings.every(o => o?.value === 0);
  const admitted = ceilings.length > 0 && ceilings.every(o => typeof o?.value === 'number' && o.value > 0);
  const diagnosis = (target: string) => {
    const o = currentField(start, target, 'prerequisite_ready');
    return reported(start, o) && o.value === false;
  };
  const available = view.affordances.filter(a => a.enabled && Object.hasOwn(view.observedEntityVersions, a.targetId) && (!a.technicianIds.length || a.technicianIds.includes(actorId)));
  return available.filter(a => {
    if (a.action === 'cancel_task') return view.tasks.some(t => t.actorId === actorId && t.targetId === a.targetId && active(t.status));
    if (busy) return false;
    const kind = view.knownTopology.assets.find(asset => asset.id === a.targetId)?.kind;
    if (role === 'remote') {
      if (a.targetId !== 'site' && kind !== 'rack') return false;
      if (a.action === 'verify_recovery') return a.targetId === 'site' && coolingRunning && admitted;
      if (a.action === 'resume_batch' || a.action === 'set_batch_ceiling') return coolingRunning && paused;
      return a.action === 'pause_batch' && !paused && !coolingRunning;
    }
    if (!a.technicianIds.includes(actorId)) return false;
    if (role === 'electrical') {
      if (!kind || !['ups', 'distribution', 'generator'].includes(kind)) return false;
      const inspection = currentField(start, a.targetId, 'inspection_complete');
      const reset = kind === 'ups' && reported(start, inspection) && inspection.value === true && available.some(other => other.targetId === a.targetId && other.action === 'reset_ups');
      return reset ? a.action === 'reset_ups' : a.action === 'inspect';
    }
    if (role !== 'facilities' || !kind || !['cooling', 'controller', 'rack'].includes(kind)) return false;
    const repair = diagnosis(a.targetId) && available.some(other => other.targetId === a.targetId && other.action === 'repair_cooling');
    return repair ? a.action === 'repair_cooling' : a.action === 'inspect' || a.action === 'independent_reading' && kind === 'rack';
  }).map(a => ({ ...a, technicianIds: a.technicianIds.length ? [actorId] : [] }));
}

function procedureText(start: GatewayStart): string {
  const actions = start.view.affordances.map(a => a.action);
  if (actions.includes('cancel_task')) return 'Keep the current assignment unless the player explicitly confirms stopping it.';
  if (start.role === 'facilities') return actions.includes('repair_cooling')
    ? 'Cooling: a delivered inspection supports proposing a repair of the inspected equipment. Work requires player confirmation.'
    : 'Cooling: request a check of known cooling equipment or a current reading. The cause stays unverified until a report arrives. Work requires player confirmation.';
  if (start.role === 'electrical') return actions.includes('reset_ups')
    ? 'Power: the delivered inspection supports proposing an allowed reset of the inspected power unit. Work requires player confirmation.'
    : 'Power: request a check of known power equipment or a current reading. Do not name a cause without a delivered report. Work requires player confirmation.';
  if (actions.includes('resume_batch') || actions.includes('set_batch_ceiling')) return 'IT: cooling is reported running and background jobs are paused. Propose only a permitted workload adjustment; work requires player confirmation.';
  if (actions.includes('verify_recovery')) return 'IT: propose a permitted recovery check using current readings. Work requires player confirmation; a proposal does not establish recovery.';
  return 'IT: ask for current workload readings or propose a permitted pause of background jobs. Deferred work is retained. Work requires player confirmation.';
}

export function projectCoworkerContext(start: GatewayStart): GatewayStart {
  const projected = structuredClone(start);
  if (start.interactionMode !== 'advisory') return projected;
  // Preserve the exact evidence/view identity: this narrows disclosure, never authority.
  projected.view.affordances = validStart(start) ? ownAffordances(start) : [];
  projected.procedures = validStart(start) && ['facilities', 'electrical', 'remote'].includes(start.role)
    ? projected.procedures.filter(p => p.id === 'hot-restart-v1').map(p => ({ id: p.id, text: procedureText(projected) })) : [];
  return projected;
}

const workText: Partial<Record<ActionIntent['action'], string>> = {
  inspect: 'I can inspect that equipment if you confirm.',
  independent_reading: 'I can take an independent reading if you confirm.',
  repair_cooling: 'I can repair the controls if you confirm.',
  reset_ups: 'I can reset that power unit if you confirm.',
  pause_batch: 'I can pause background jobs if you confirm.',
  resume_batch: 'I can resume background jobs if you confirm.',
  set_batch_ceiling: 'I can adjust the background job limit if you confirm.',
  verify_recovery: 'I can check recovery if you confirm.',
  cancel_task: 'I can stop my current task if you confirm.',
};
const historical = 'These are earlier readings; please check the latest report.';
const uncertainties = ['', 'The cause is unverified.', 'The cause remains unverified.', 'The cause is still unverified.', 'Inspection needed.', 'I need a current reading before I can advise.', historical];

function legalProposal(start: GatewayStart, action: ActionIntent): boolean {
  const { args } = action;
  if (args.destination !== undefined || args.technicianId !== undefined && args.technicianId !== start.actorId) return false;
  if ((args.ceiling !== undefined) !== (action.action === 'set_batch_ceiling') || (args.taskId !== undefined) !== (action.action === 'cancel_task')) return false;
  if (action.action === 'cancel_task') return args.technicianId === undefined && start.view.tasks.some(t => t.id === args.taskId && t.targetId === action.targetId && t.actorId === start.actorId && active(t.status));
  return start.role === 'remote' || args.technicianId === start.actorId;
}

export function conciseCoworkerResponse(start: GatewayStart, response: AgentResponse): AgentResponse | null {
  if (!validateResponse(response, start)) return null;
  if (start.interactionMode !== 'advisory') return response;
  if (!validStart(start) || !['facilities', 'electrical', 'remote'].includes(start.role)) return null;
  const projected = projectCoworkerContext(start);
  if (!validateResponse(response, projected) || response.proposals.length > 1 || !response.proposals.every(a => legalProposal(projected, a))) return null;
  if (new Set(start.view.observations.map(o => o.id)).size !== start.view.observations.length) return null;
  for (const fact of response.facts) {
    if (!('observationId' in fact)) return null;
    const o = start.view.observations.find(o => o.id === fact.observationId)!;
    if (!usable(o, start)) return null;
    const superseded = start.view.observations.some(newer => delivered(newer, start) && newer.assetId === o.assetId && newer.field === o.field && newer.source === o.source && (newer.observedAt > o.observedAt || newer.observedAt === o.observedAt && newer.receivedAt > o.receivedAt));
    if (superseded && response.uncertainty !== historical) return null;
  }
  // shortcut: authored English only; add reviewed evidence-bound phrases when dialogue needs grow.
  const allowed = ['', 'Which equipment should I check?', 'What would you like me to check?', 'Please share the latest report.', 'Please check the latest readings.', 'I need a current reading before I can advise.', 'The cause is still unverified.', 'The cause is unverified.', 'The cause remains unverified.'];
  if (response.proposals.length) {
    allowed.length = 0;
    allowed.push(workText[response.proposals[0].action]!, 'Please confirm the proposed work.');
  } else {
    if (response.facts.some(f => 'observationId' in f && reported(start, start.view.observations.find(o => o.id === f.observationId)) && ['inspection_complete', 'prerequisite_ready'].includes(start.view.observations.find(o => o.id === f.observationId)!.field))) allowed.push('The inspection report is available.');
    if (projected.view.affordances.some(a => a.action === 'inspect')) allowed.push(start.role === 'facilities' ? 'A cooling inspection would help.' : 'A power inspection would help.');
    if (start.view.tasks.some(t => t.actorId === start.actorId && active(t.status))) allowed.push("I'm still on my current assignment.");
  }
  const size = response.inference.length + response.uncertainty.length + response.facts.reduce((sum, fact) => sum + String(factValue(fact, start)).length + 32, 0);
  if (!allowed.includes(response.inference) || !uncertainties.includes(response.uncertainty) || size > 260 || !size) return null;
  return response;
}
