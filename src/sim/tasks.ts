import type { Action, ActionIntent, Crew, KnowledgeView, Observation } from '../shared/contracts';
import type { EngineState, EngineTask } from './state';
import { REPORT_DELAY_SECONDS, evidence, evidenceConditions, observation, prerequisiteEvidence } from './knowledge';
import { pathMeters, positionAlong, route } from './navigation';
import { hasUpstream, resolvePower } from './systems/power';

export type Emit = (type: string, ids: string[], payload?: Record<string, string | number | boolean | null | string[]>, visibility?: 'public' | 'actor' | 'forensic', actorIds?: string[]) => void;
export const active = (task: EngineTask) => !['completed', 'canceled'].includes(task.public.status);
const remoteActions: Action[] = ['pause_batch', 'resume_batch', 'set_batch_ceiling', 'verify_recovery'];

export function requiredRole(state: EngineState, intent: ActionIntent): Crew['role'] | null {
  const asset = state.scenario.topology.assets.find(a => a.id === intent.targetId);
  if (remoteActions.includes(intent.action)) return intent.targetId === 'site' || (asset?.kind === 'rack' && intent.action !== 'verify_recovery') ? 'remote' : null;
  if (!asset) return null;
  if (intent.action === 'reset_ups') return asset.kind === 'ups' ? 'electrical' : null;
  if (intent.action === 'repair_cooling' || intent.action === 'restart_cooling') return ['cooling', 'controller'].includes(asset.kind) ? 'facilities' : null;
  if (intent.action === 'independent_reading') return asset.kind === 'rack' ? 'facilities' : null;
  if (intent.action === 'inspect') return ['ups', 'distribution', 'generator'].includes(asset.kind) ? 'electrical' : 'facilities';
  return null;
}

export function workSeconds(state: EngineState, action: Action) {
  const m = state.scenario.mission;
  return Math.ceil(action === 'repair_cooling' ? m.repairSeconds : ['inspect', 'independent_reading'].includes(action) ? m.inspectSeconds
    : action === 'verify_recovery' ? m.verifySeconds : action === 'reset_ups' ? 20 : action === 'restart_cooling' ? 0 : m.remoteSeconds);
}

export function taskArgumentError(state: EngineState, intent: ActionIntent): string | null {
  const role = requiredRole(state, intent);
  if (role && role !== 'remote' && !intent.args.technicianId) return 'TECHNICIAN_REQUIRED';
  if (intent.action === 'set_batch_ceiling' && intent.args.ceiling === undefined) return 'CEILING_REQUIRED';
  return null;
}

export function taskResources(intent: ActionIntent) {
  return [intent.targetId, ...(['repair_cooling', 'restart_cooling'].includes(intent.action) && intent.targetId !== 'controller' ? ['controller'] : [])];
}

export function actionPlan(state: EngineState, actorId: string, intent: ActionIntent) {
  const fail = (reason: string) => ({ reason, worker: null, path: null, travelSeconds: 0, workSeconds: 0, resources: [] as string[] });
  if (state.mission.status !== 'active') return fail('MISSION_ENDED');
  if (intent.action === 'cancel_task') {
    const task = state.tasks.find(t => t.public.id === intent.args.taskId && t.public.targetId === intent.targetId);
    if (!task || !active(task)) return fail('TASK_NOT_ACTIVE');
    if (!['player', task.requestedBy, task.technicianId].includes(actorId)) return fail('NOT_AUTHORIZED');
    return { reason: null, worker: state.crew.find(c => c.id === task.technicianId)!, path: [] as { x: number; y: number }[], travelSeconds: 0, workSeconds: 0, resources: task.resources };
  }
  const role = requiredRole(state, intent);
  if (!role) return fail('INVALID_TARGET_ACTION');
  const argumentError = taskArgumentError(state, intent);
  if (argumentError) return fail(argumentError);
  const worker = role === 'remote' ? state.crew.find(c => c.role === 'remote') : state.crew.find(c => c.id === intent.args.technicianId);
  if (!worker) return fail('TECHNICIAN_REQUIRED');
  if (worker.role !== role) return fail('NOT_QUALIFIED');
  if (actorId !== 'player' && actorId !== worker.id) return fail('NOT_AUTHORIZED');
  if (worker.taskId !== null) return fail('WORKER_BUSY');
  if (['repair_cooling', 'restart_cooling'].includes(intent.action)) {
    const inspection = prerequisiteEvidence(state, actorId, intent.targetId);
    if (!inspection) return fail('INSPECTION_REQUIRED');
    if (intent.action === 'restart_cooling' && inspection.value !== true) return fail('PREREQUISITE_UNAVAILABLE');
    if (intent.action === 'repair_cooling' && inspection.value === true) return fail('NO_REPAIR_REQUIRED');
  }
  if (intent.action === 'reset_ups' && !evidence(state, actorId).some(o => o.assetId === intent.targetId && o.field === 'inspection_complete' && o.value === true)) return fail('INSPECTION_REQUIRED');
  const resources = taskResources(intent);
  if (resources.some(id => state.reservations[id])) return fail('RESOURCE_BUSY');
  const path = role === 'remote' ? [] : route(state.scenario, worker, state.scenario.topology.assets.find(a => a.id === intent.targetId)!.serviceTile);
  if (path === null) return fail('PATH_BLOCKED');
  const travelSeconds = role === 'remote' ? 0 : Math.ceil(pathMeters(state.scenario, path) / worker.speed);
  return { reason: null, worker, path, travelSeconds, workSeconds: workSeconds(state, intent.action), resources };
}

export function bumpVersions(state: EngineState, ids: string[]) {
  for (const id of new Set(ids)) state.entityVersions[id]++;
}

export function reserveTask(state: EngineState, actorId: string, intent: ActionIntent, at: number, sequence: number, emit: Emit) {
  const plan = actionPlan(state, actorId, intent);
  if (plan.reason || !plan.worker || !plan.path) throw new Error('Cannot reserve an invalid action.');
  const id = `task-${sequence}`;
  const task: EngineTask = {
    public: { id, actorId: plan.worker.id, targetId: intent.targetId, action: intent.action, status: plan.travelSeconds > 0 ? 'traveling' : intent.action === 'inspect' || intent.action === 'independent_reading' ? 'inspecting' : 'working', startedAt: at, arrivalAt: at + plan.travelSeconds, completesAt: at + plan.travelSeconds + plan.workSeconds, progress: 0, path: plan.path, reason: null },
    requestedBy: actorId, intent: structuredClone(intent), technicianId: plan.worker.id, distanceMeters: pathMeters(state.scenario, plan.path), traveledMeters: 0, workSeconds: plan.workSeconds, resources: plan.resources,
  };
  state.tasks.push(task); plan.worker.taskId = id;
  for (const resource of task.resources) state.reservations[resource] = id;
  bumpVersions(state, [...task.resources, plan.worker.id]);
  emit('task.reserved', [intent.targetId, plan.worker.id], { taskId: id, action: intent.action, arrivalAt: task.public.arrivalAt, completesAt: task.public.completesAt });
  return task;
}

function release(state: EngineState, task: EngineTask) {
  state.crew.find(c => c.id === task.technicianId)!.taskId = null;
  for (const resource of task.resources) delete state.reservations[resource];
  bumpVersions(state, [...task.resources, task.technicianId]);
}

export function cancelTask(state: EngineState, task: EngineTask, reason: string, emit: Emit) {
  task.public.status = 'canceled'; task.public.reason = reason;
  release(state, task);
  emit('task.canceled', [task.public.targetId, task.technicianId], { taskId: task.public.id, reason, completedWorkSeconds: task.public.progress * task.workSeconds });
}

function queueReport(state: EngineState, task: EngineTask, at: number, readings: { assetId: string; field: string; value: Observation['value']; units?: string; quality?: Observation['quality']; observedAt?: number }[], text: string, evidenceIds: string[] = []) {
  const recipients = [...new Set(['player', task.technicianId, ...state.crew.filter(c => c.role === 'remote').map(c => c.id)])];
  const receivedAt = at + REPORT_DELAY_SECONDS;
  const observations = readings.map(r => ({ observation: observation(state, r.assetId, r.field, r.value, r.units ?? '', r.observedAt ?? at, `report:${task.technicianId}`, r.quality ?? 'reported', receivedAt), actorIds: recipients }));
  const ids = [...evidenceIds, ...observations.map(o => o.observation.id)];
  state.pendingReports.push({ deliverAt: receivedAt, taskId: task.public.id, observations, actorIds: recipients, message: { id: `report-${task.public.id}`, at: receivedAt, speaker: task.technicianId, text, evidenceIds: ids, mode: 'system' } });
}

function completeTask(state: EngineState, task: EngineTask, at: number, emit: Emit) {
  const p = state.physical; const target = task.public.targetId; const action = task.public.action;
  const asset = state.scenario.topology.assets.find(a => a.id === target);
  let applied = true;
  if (action === 'pause_batch' || action === 'resume_batch' || action === 'set_batch_ceiling') {
    const ceiling = action === 'pause_batch' ? 0 : action === 'resume_batch' ? state.scenario.workload.batch : task.intent.args.ceiling!;
    const racks = p.racks.filter(r => target === 'site' || r.id === target);
    for (const rack of racks) rack.batchCeiling = ceiling;
    bumpVersions(state, racks.map(r => r.id));
    queueReport(state, task, at, racks.map(r => ({ assetId: r.id, field: 'batch_ceiling', value: ceiling, units: 'units/s' })), 'Workload admission updated; deferred work is retained.');
  } else if (action === 'inspect' || action === 'independent_reading') {
    const readings: Parameters<typeof queueReport>[3] = [{ assetId: target, field: 'inspection_complete', value: true }];
    if (asset?.kind === 'cooling' || asset?.kind === 'controller') readings.push({ assetId: target, field: 'prerequisite_ready', value: !p.controllerFault });
    if (asset?.kind === 'rack') readings.push({ assetId: target, field: 'inlet_temperature_c', value: p.racks.find(r => r.id === target)!.temperatureC, units: 'C', quality: 'independent' });
    if (asset?.kind === 'ups') readings.push({ assetId: target, field: 'output_state', value: p.ups.find(u => u.id === target)!.tripped ? 'tripped' : p.ups.find(u => u.id === target)!.faulted ? 'unavailable' : 'available' });
    if (asset?.kind === 'distribution') readings.push({ assetId: target, field: 'upstream_available', value: hasUpstream(state.scenario, p.sources, target) });
    if (asset?.kind === 'generator') readings.push({ assetId: target, field: 'running', value: p.sources.generatorReady && p.sources.transferComplete });
    queueReport(state, task, at, readings, 'Inspection complete. Timestamped field report delivered.');
  } else if (action === 'repair_cooling') {
    p.controllerFault = false;
    // The physical kernel retains stored heat and starts each train's declared restart delay.
    for (const cooling of p.cooling) { cooling.ready = false; cooling.restartRemainingSeconds = state.scenario.mission.recoveryRestartSeconds; }
    queueReport(state, task, at, [{ assetId: 'controller', field: 'prerequisite_ready', value: true }], 'Cooling control prerequisite restored. Cooling still requires its restart delay and temperature verification.');
  } else if (action === 'restart_cooling') {
    applied = !p.controllerFault;
    if (applied) for (const cooling of p.cooling.filter(c => asset?.kind === 'controller' || c.id === target)) { cooling.ready = false; cooling.restartRemainingSeconds = state.scenario.mission.recoveryRestartSeconds; }
    queueReport(state, task, at, [{ assetId: target, field: 'restart_accepted', value: applied }], applied ? 'Cooling restart initiated; stored heat remains.' : 'Restart could not proceed. Reinspect the prerequisite.');
  } else if (action === 'reset_ups') {
    const unit = p.ups.find(u => u.id === target)!;
    const candidates = structuredClone(p.ups); candidates.find(u => u.id === target)!.tripped = false;
    const demand = p.racks.map(r => ({ id: r.id, powerKw: r.mode === 'off' && !r.thermalLatched ? state.scenario.profile.bootKw : r.powerKw }));
    const power = resolvePower(state.scenario, p.sources, candidates, demand);
    applied = !unit.faulted && !candidates.find(u => u.id === target)!.tripped && (unit.energyKwh > 0 || hasUpstream(state.scenario, p.sources, target)) && power.poweredRackIds.length === p.racks.length;
    if (applied) unit.tripped = false;
    queueReport(state, task, at, [{ assetId: target, field: 'reset_accepted', value: applied }], applied ? 'UPS output reset; downstream boot and protection remain active.' : 'UPS reset conditions are not satisfied.');
  } else if (action === 'verify_recovery') {
    const conditions = evidenceConditions(state, task.technicianId, at);
    const verified = conditions.prerequisite && conditions.thermal && conditions.service && conditions.batch;
    queueReport(state, task, at, [{ assetId: 'site', field: 'recovery_verified', value: verified }, { assetId: 'site', field: 'verification_readings_at', value: conditions.oldestReadingAt, units: 's' }], verified ? 'Recovery readings verified. Continue the required stability hold.' : 'Recovery is not yet verified; consult the timestamped evidence.', conditions.evidenceIds);
  }
  task.public.status = 'completed'; task.public.progress = 1; task.public.reason = applied ? null : 'PRECONDITION_CHANGED';
  release(state, task);
  emit('task.applied', [target, task.technicianId], { taskId: task.public.id, action, applied });
}

export function advanceTasks(state: EngineState, at: number, emit: Emit) {
  for (const task of state.tasks.filter(active)) {
    const worker = state.crew.find(c => c.id === task.technicianId)!;
    if (task.public.status === 'traveling') {
      task.traveledMeters = Math.min(task.distanceMeters, (at - task.public.startedAt) * worker.speed);
      Object.assign(worker, positionAlong(state.scenario, task.public.path, task.traveledMeters));
      if (at < task.public.arrivalAt) continue;
      task.public.status = ['inspect', 'independent_reading'].includes(task.public.action) ? 'inspecting' : 'working';
      emit('task.arrived', [task.public.targetId, worker.id], { taskId: task.public.id });
    }
    task.public.progress = task.workSeconds === 0 ? 1 : Math.min(1, Math.max(0, (at - task.public.arrivalAt) / task.workSeconds));
    if (at >= task.public.completesAt) completeTask(state, task, at, emit);
  }
}

export function deliverReports(state: EngineState, at: number, emit: Emit) {
  const due = state.pendingReports.filter(r => r.deliverAt <= at);
  state.pendingReports = state.pendingReports.filter(r => r.deliverAt > at);
  for (const report of due) {
    state.observations.push(...report.observations);
    state.messages.push({ message: report.message, actorIds: report.actorIds });
    emit('report.delivered', [], { taskId: report.taskId, evidenceIds: report.message.evidenceIds }, 'actor', report.actorIds);
  }
}

export function affordances(state: EngineState, actorId: string, at: number): KnowledgeView['affordances'] {
  const actions = (kind: string): Action[] => kind === 'rack' ? ['inspect', 'independent_reading', 'pause_batch', 'resume_batch', 'set_batch_ceiling']
    : kind === 'cooling' || kind === 'controller' ? ['inspect', 'repair_cooling', 'restart_cooling'] : kind === 'ups' ? ['inspect', 'reset_ups'] : ['inspect'];
  const pairs = [...state.scenario.topology.assets.flatMap(asset => actions(asset.kind).map(action => ({ action, targetId: asset.id }))), ...remoteActions.map(action => ({ action, targetId: 'site' }))];
  const result = pairs.map(({ action, targetId }) => {
    const intent: ActionIntent = { action, targetId, atSimTime: at, args: { ...(action === 'set_batch_ceiling' ? { ceiling: state.scenario.workload.batch } : {}) } };
    const role = requiredRole(state, intent);
    const eligible = state.crew.filter(c => c.role === role && (actorId === 'player' || actorId === c.id));
    const worker = eligible[0];
    if (role !== 'remote' && worker) intent.args.technicianId = worker.id;
    const plan = actionPlan(state, actorId, intent);
    return { action, targetId, enabled: !plan.reason, reason: plan.reason, technicianIds: role === 'remote' ? [] : eligible.map(c => c.id), travelSeconds: plan.path === null ? null : plan.travelSeconds, workSeconds: plan.workSeconds };
  });
  for (const task of state.tasks.filter(active)) {
    const intent: ActionIntent = { action: 'cancel_task', targetId: task.public.targetId, atSimTime: at, args: { taskId: task.public.id } };
    const plan = actionPlan(state, actorId, intent);
    result.push({ action: 'cancel_task', targetId: intent.targetId, enabled: !plan.reason, reason: plan.reason, technicianIds: [], travelSeconds: 0, workSeconds: 0 });
  }
  return result;
}
