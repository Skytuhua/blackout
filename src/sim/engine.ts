import type { ScenarioSpec, SimulationEngine, Checkpoint, CommandReceipt, KnowledgeView, ActionRequest } from '../shared/contracts';
import { ActionRequestSchema, CheckpointSchema, ScenarioSpecSchema } from '../shared/schemas';
import { EngineStateSchema, type EngineState } from './state';
import { advancePhysical, createPhysical } from './systems/physical';
import { actorIds, evidence, evidenceConditions, isActor, latest, publicSummary, sampleSensors } from './knowledge';
import { actionPlan, active, advanceTasks, affordances, cancelTask, deliverReports, requiredRole, reserveTask, taskArgumentError, taskResources, workSeconds, type Emit } from './tasks';
import { isWalkablePath, isWalkablePosition, pathMeters, positionAlong, route } from './navigation';

export const ENGINE_VERSION = 'sim-desktop-v2';
const phase: Record<ScenarioSpec['externalEvents'][number]['kind'], number> = {
  utility_loss: 10, utility_restore: 10, generator_ready: 20, transfer_complete: 30,
  cooling_control_fault: 40, workload_pulse_start: 50, workload_pulse_end: 50,
};
function schedule(spec: ScenarioSpec) {
  return spec.externalEvents.map((event, sequence) => ({ ...event, sequence }))
    .sort((a, b) => a.at - b.at || phase[a.kind] - phase[b.kind] || a.sequence - b.sequence);
}

function validateTopology(spec: ScenarioSpec) {
  if (spec.mode === 'practice' && spec.externalEvents.length) throw new Error('Practice cannot schedule external disturbances.');
  const assets = spec.topology.assets;
  const ids = new Set(assets.map(a => a.id));
  if (ids.size !== assets.length || ids.has('site') || assets.some(a => a.dependencies.some(id => !ids.has(id)))) throw new Error('Invalid topology asset references.');
  if (!assets.some(a => a.kind === 'rack') || spec.profile.peakKw < spec.profile.idleKw) throw new Error('Invalid physical profile.');
  const crewIds = new Set(spec.crew.map(c => c.id));
  if (crewIds.size !== spec.crew.length || spec.crew.some(c => ids.has(c.id) || ['site', 'player'].includes(c.id) || c.taskId !== null)) throw new Error('Invalid crew identity.');
  for (const role of ['facilities', 'electrical', 'remote']) if (spec.crew.filter(c => c.role === role).length !== 1) throw new Error('Contract v1 requires one qualified worker per role.');
  const inGrid = (p: { x: number; y: number }) => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < spec.topology.width && p.y >= 0 && p.y < spec.topology.height;
  if (spec.topology.walkable.some(p => !inGrid(p) || assets.some(a => p.x >= a.x && p.x < a.x + a.width && p.y >= a.y && p.y < a.y + a.height))) throw new Error('Invalid walkable grid.');
  if (assets.some(a => !spec.topology.walkable.some(p => p.x === a.serviceTile.x && p.y === a.serviceTile.y))) throw new Error('Asset service tile is not walkable.');
  if (spec.crew.some(c => c.role !== 'remote' && !route(spec, c, c))) throw new Error('Invalid crew position.');
}

function initialState(scenario: ScenarioSpec): EngineState {
  const physical = createPhysical(scenario);
  const state: EngineState = {
    scenario, physical, initialPhysical: structuredClone(physical), eventCursor: 0, nextSequence: 0, boundaryConsumed: false,
    crew: structuredClone(scenario.crew), tasks: [], reservations: {}, entityVersions: Object.fromEntries(['site', ...scenario.topology.assets.map(a => a.id), ...scenario.crew.map(c => c.id)].map(id => [id, 0])),
    observations: [], messages: [], pendingReports: [], nextObservation: 0, lastSensorAt: -1,
    mission: { status: scenario.mode === 'practice' ? 'practice' : 'active', reason: null, stabilitySeconds: 0, criticalLossSeconds: 0, heldAt: null, evidenceHoldSeconds: Object.fromEntries(['player', ...scenario.crew.map(c => c.id)].map(id => [id, 0])) },
    commands: [], events: [], telemetry: [{ simTime: 0, hottestTemperatureC: Math.max(...physical.racks.map(r => r.temperatureC)), criticalServedFraction: 1, batchBacklog: 0 }], idempotency: [],
  };
  sampleSensors(state, 0);
  state.messages.push({ message: { id: 'briefing', at: 0, speaker: 'system', text: scenario.mode === 'practice'
    ? 'This healthy facility has no incident deadline. Practice moving crew, inspect timestamps, and wait for travel, work and delivered reports. Pause and adjust speed while learning the controls.'
    : 'Select cooling, check reading timestamps, then dispatch a qualified inspection. Protect critical service while retaining deferred work. Verify recovery before restoring workload.', evidenceIds: [], mode: 'system' }, actorIds: actorIds(state) });
  return state;
}

export function initialize(spec: ScenarioSpec, runId: string): SimulationEngine {
  const scenario = ScenarioSpecSchema.parse(spec);
  validateTopology(scenario);
  return createEngine(initialState(scenario), runId, 0);
}

function validateRestoredState(state: EngineState, at: number) {
  validateTopology(state.scenario);
  if ((state.scenario.mode === 'practice') !== (state.mission.status === 'practice')) throw new Error('Invalid checkpoint mission mode.');
  if (state.mission.status === 'practice' && (state.mission.reason !== null || state.mission.heldAt !== null || state.mission.stabilitySeconds !== 0 || state.mission.criticalLossSeconds !== 0 || Object.values(state.mission.evidenceHoldSeconds).some(s => s !== 0))) throw new Error('Practice cannot contain mission outcome progress.');
  const matches = (kind: string, actual: { id: string }[]) => JSON.stringify(state.scenario.topology.assets.filter(a => a.kind === kind).map(a => a.id)) === JSON.stringify(actual.map(a => a.id));
  for (const physical of [state.physical, state.initialPhysical]) {
    if (!matches('rack', physical.racks) || !matches('ups', physical.ups) || !matches('cooling', physical.cooling) || physical.ups.some(u => u.energyKwh > state.scenario.profile.upsEnergyKwh)) throw new Error('Checkpoint physical identity or energy mismatch.');
  }
  const ordered = schedule(state.scenario);
  const consumed = ordered.filter(e => state.boundaryConsumed ? e.at <= at : e.at < at).length;
  if (state.eventCursor !== consumed || (!state.boundaryConsumed && at !== 0)) throw new Error('Invalid checkpoint event cursor or boundary.');
  const sequences = [...state.events, ...state.commands].map(e => e.sequence);
  if (new Set(sequences).size !== sequences.length || sequences.some(s => s >= state.nextSequence) || state.events.some(e => e.simTime > at) || state.commands.some(c => c.at > at)) throw new Error('Invalid checkpoint sequence counter or event time.');
  if (state.lastSensorAt !== at - at % state.scenario.profile.sensorIntervalSeconds) throw new Error('Invalid checkpoint sensor boundary.');
  const actors = actorIds(state);
  if (state.crew.length !== state.scenario.crew.length || state.crew.some((c, i) => c.id !== state.scenario.crew[i].id || c.role !== state.scenario.crew[i].role || c.speed !== state.scenario.crew[i].speed)) throw new Error('Invalid checkpoint crew identity.');
  if (state.crew.some((c, i) => c.role === 'remote' ? c.x !== state.scenario.crew[i].x || c.y !== state.scenario.crew[i].y : !isWalkablePosition(state.scenario, c))) throw new Error('Invalid checkpoint crew position.');
  const versionIds = ['site', ...state.scenario.topology.assets.map(a => a.id), ...state.crew.map(c => c.id)].sort();
  if (JSON.stringify(Object.keys(state.entityVersions).sort()) !== JSON.stringify(versionIds) || JSON.stringify(Object.keys(state.mission.evidenceHoldSeconds).sort()) !== JSON.stringify([...actors].sort())) throw new Error('Invalid checkpoint entity versions.');
  const reservations: Record<string, string> = {};
  const workers = new Set<string>();
  if (new Set(state.tasks.map(t => t.public.id)).size !== state.tasks.length) throw new Error('Duplicate checkpoint task.');
  for (const task of state.tasks) {
    const pub = task.public;
    const worker = state.crew.find(c => c.id === task.technicianId);
    const command = state.commands.find(c => c.receipt.taskId === pub.id && c.receipt.status === 'accepted');
    if (taskArgumentError(state, task.intent) || !command || command.actorId !== task.requestedBy || command.at !== pub.startedAt || JSON.stringify(command.intent) !== JSON.stringify(task.intent)) throw new Error('Invalid checkpoint task arguments or accepted command.');
    if (!worker || pub.actorId !== worker.id || !actors.includes(task.requestedBy) || pub.targetId !== task.intent.targetId || pub.action !== task.intent.action || pub.startedAt > at || pub.arrivalAt < pub.startedAt || pub.completesAt !== pub.arrivalAt + task.workSeconds || task.traveledMeters > task.distanceMeters) throw new Error('Invalid checkpoint task identity or time.');
    const moving = task.intent.action === 'move_crew';
    if (worker.role !== requiredRole(state, task.intent) || (moving ? worker.role === 'remote' || worker.id !== task.intent.targetId || task.requestedBy !== 'player'
      : worker.role !== 'remote' && task.intent.args.technicianId !== worker.id) || !['player', worker.id].includes(task.requestedBy) || task.workSeconds !== workSeconds(state, pub.action) || JSON.stringify(task.resources) !== JSON.stringify(taskResources(task.intent))) throw new Error('Invalid checkpoint task qualification or duration.');
    const asset = state.scenario.topology.assets.find(a => a.id === pub.targetId);
    const endpoint = task.intent.action === 'move_crew' ? task.intent.args.destination : asset?.serviceTile;
    if (worker.role !== 'remote' && (!endpoint || !isWalkablePath(state.scenario, pub.path, endpoint))) throw new Error('Invalid checkpoint task path.');
    if (worker.role === 'remote' && (pub.path.length || task.distanceMeters !== 0 || task.traveledMeters !== 0 || pub.arrivalAt !== pub.startedAt)) throw new Error('Invalid checkpoint remote travel.');
    if (worker.role !== 'remote' && (Math.abs(pathMeters(state.scenario, pub.path) - task.distanceMeters) > 1e-8 || pub.arrivalAt !== pub.startedAt + Math.ceil(task.distanceMeters / worker.speed))) throw new Error('Invalid checkpoint travel timing.');
    if (pub.status === 'completed' && (pub.completesAt > at || pub.progress !== 1 || Math.abs(task.traveledMeters - task.distanceMeters) > 1e-8)) throw new Error('Invalid checkpoint completed task timing or progress.');
    if (active(task)) {
      if (!['active', 'practice'].includes(state.mission.status) || workers.has(worker.id) || worker.taskId !== pub.id || pub.completesAt <= at) throw new Error('Invalid checkpoint worker reservation.');
      workers.add(worker.id);
      const expectedStatus = at < pub.arrivalAt ? 'traveling' : ['inspect', 'independent_reading'].includes(pub.action) ? 'inspecting' : 'working';
      const expectedProgress = at < pub.arrivalAt ? 0 : task.workSeconds === 0 ? 1 : Math.max(0, (at - pub.arrivalAt) / task.workSeconds);
      if (pub.status !== expectedStatus || Math.abs(pub.progress - expectedProgress) > 1e-8) throw new Error('Invalid checkpoint work progress.');
      for (const resource of task.resources) {
        if (!(resource in state.entityVersions) || reservations[resource]) throw new Error('Invalid checkpoint resource reservation.');
        reservations[resource] = pub.id;
      }
      if (worker.role !== 'remote') {
        const expectedDistance = Math.min(task.distanceMeters, (at - pub.startedAt) * worker.speed);
        const expectedPosition = positionAlong(state.scenario, pub.path, expectedDistance);
        if (Math.abs(expectedDistance - task.traveledMeters) > 1e-8 || Math.abs(worker.x - expectedPosition.x) > 1e-8 || Math.abs(worker.y - expectedPosition.y) > 1e-8) throw new Error('Invalid checkpoint movement progress.');
      }
    }
  }
  const sorted = (record: Record<string, string>) => JSON.stringify(Object.entries(record).sort());
  if (sorted(reservations) !== sorted(state.reservations) || state.crew.some(c => c.taskId !== null && !workers.has(c.id))) throw new Error('Invalid checkpoint reservations.');
  const idempotencyKeys = new Set<string>();
  for (const entry of state.idempotency) {
    const key = JSON.stringify([entry.actorId, entry.key]);
    const command = state.commands.find(c => c.actorId === entry.actorId && c.receipt.requestId === entry.receipt.requestId && JSON.stringify(c.intent) === entry.intent && JSON.stringify(c.receipt) === JSON.stringify(entry.receipt));
    if (idempotencyKeys.has(key) || !actors.includes(entry.actorId) || entry.receipt.actorId !== entry.actorId || !command || entry.receipt.observedAt > at || (entry.receipt.taskId !== null && !state.tasks.some(t => t.public.id === entry.receipt.taskId))) throw new Error('Invalid checkpoint idempotency.');
    idempotencyKeys.add(key);
  }
  for (const entry of state.observations) {
    if (entry.actorIds.some(id => !actors.includes(id)) || entry.observation.observedAt > entry.observation.receivedAt || entry.observation.receivedAt > at) throw new Error('Invalid checkpoint delivered observation.');
  }
  for (const report of state.pendingReports) {
    if (report.deliverAt <= at || !state.tasks.some(t => t.public.id === report.taskId && t.public.status === 'completed') || report.observations.some(o => o.observation.observedAt > at || o.observation.receivedAt !== report.deliverAt || o.actorIds.some(id => !actors.includes(id)))) throw new Error('Invalid checkpoint pending report.');
  }
  const observationIds = [...state.observations.map(o => o.observation.id), ...state.pendingReports.flatMap(r => r.observations.map(o => o.observation.id))];
  if (new Set(observationIds).size !== observationIds.length || observationIds.some(id => !/^observation-\d+$/.test(id) || Number(id.slice(12)) >= state.nextObservation)) throw new Error('Invalid checkpoint observation counter.');
  if (state.mission.stabilitySeconds > at || state.mission.criticalLossSeconds > at || Object.values(state.mission.evidenceHoldSeconds).some(s => s > at) || (state.mission.heldAt !== null && state.mission.heldAt > at)) throw new Error('Invalid checkpoint mission time.');
  if (state.telemetry.at(-1)?.simTime !== at || state.messages.some(m => m.message.at > at)) throw new Error('Invalid checkpoint history horizon.');
}

export function restore(checkpoint: Checkpoint, runId: string): SimulationEngine {
  const parsed = CheckpointSchema.parse(checkpoint);
  if (parsed.engineVersion !== ENGINE_VERSION) throw new Error('Unsupported engine version.');
  const state = EngineStateSchema.parse(parsed.state);
  if (parsed.scenarioVersion !== state.scenario.contentVersion || !Number.isInteger(parsed.simTime)) throw new Error('Checkpoint identity mismatch.');
  validateRestoredState(state, parsed.simTime);
  for (const entry of state.idempotency) entry.receipt.runId = runId;
  for (const command of state.commands) command.receipt.runId = runId;
  return createEngine(state, runId, parsed.simTime);
}

function truthStable(state: EngineState) {
  const p = state.physical;
  return !p.controllerFault && p.lastInterval.criticalServedFraction === 1 && !p.ups.some(u => u.tripped)
    && p.racks.every(r => r.temperatureC < state.scenario.profile.warningC && r.batchCeiling >= state.scenario.workload.batch && r.batch >= state.scenario.workload.batch && r.powered);
}

function createEngine(state: EngineState, runId: string, initialTime: number): SimulationEngine {
  CheckpointSchema.shape.runId.parse(runId);
  const spec = state.scenario; const external = schedule(spec);
  let simTime = initialTime;
  function snapshot(): Checkpoint {
    const serializable = JSON.parse(JSON.stringify(EngineStateSchema.parse(state))) as Checkpoint['state'];
    return { schemaVersion: 1, engineVersion: ENGINE_VERSION, scenarioVersion: spec.contentVersion, runId, simTime, state: serializable };
  }
  function event(type: string, ids: string[], at: number, payload: Checkpoint['state'] = {}, visibility: 'public' | 'actor' | 'forensic' = 'forensic', recipients: string[] = []) {
    const sequence = state.nextSequence++;
    state.events.push({ id: `event-${sequence}`, simTime: at, sequence, type, entityIds: ids, causalParents: [], visibility, actorIds: recipients, payload });
  }
  const emit: Emit = (type, ids, payload = {}, visibility = 'public', recipients = []) => event(type, ids, simTime, payload, visibility, recipients);
  function boundary() {
    if (state.boundaryConsumed) return;
    // Boundary t: external phases/input order, task insertion order, sensors, delayed reports.
    // Endpoints are consumed exactly once; paused commands resolve after these transitions.
    while (state.eventCursor < external.length && external[state.eventCursor].at <= simTime) {
      const e = external[state.eventCursor++]; const p = state.physical;
      switch (e.kind) {
        case 'utility_loss': p.sources.utilityAvailable = false; break;
        case 'utility_restore': p.sources.utilityAvailable = true; break;
        case 'generator_ready': p.sources.generatorReady = true; break;
        case 'transfer_complete': p.sources.transferComplete = true; break;
        case 'cooling_control_fault': p.controllerFault = true; break;
        case 'workload_pulse_start': p.pulse = Math.max(0, e.value ?? 0); break;
        case 'workload_pulse_end': p.pulse = 0; break;
      }
      event(`external.${e.kind}`, [], simTime, { externalId: e.id, value: e.value });
    }
    advanceTasks(state, simTime, emit);
    sampleSensors(state, simTime);
    deliverReports(state, simTime, emit);
    state.boundaryConsumed = true;
  }
  function endMission(status: 'success' | 'failure', reason: string) {
    state.mission.status = status; state.mission.reason = reason;
    emit(`mission.${status}`, [], { reason, stabilitySeconds: state.mission.stabilitySeconds });
    for (const task of state.tasks.filter(active)) cancelTask(state, task, 'MISSION_ENDED', emit);
    if (state.pendingReports.length) emit('reports.closed', [], { count: state.pendingReports.length });
    state.pendingReports = [];
  }
  function updateMission(previouslyStable: boolean) {
    const mission = state.mission;
    if (mission.status !== 'active') return;
    const stable = truthStable(state);
    mission.stabilitySeconds = previouslyStable && stable ? mission.stabilitySeconds + 1 : 0;
    mission.criticalLossSeconds = state.physical.lastInterval.criticalServedFraction === 0 ? mission.criticalLossSeconds + 1 : 0;
    if (mission.stabilitySeconds >= spec.mission.stabilityHoldSeconds && mission.heldAt === null) {
      mission.heldAt = simTime; emit('mission.stability_held', [], { stabilitySeconds: mission.stabilitySeconds }, 'forensic');
    }
    if (!stable) mission.heldAt = null;
    for (const id of actorIds(state)) {
      const conditions = evidenceConditions(state, id, simTime);
      mission.evidenceHoldSeconds[id] = conditions.prerequisite && conditions.thermal && conditions.service && conditions.batch ? mission.evidenceHoldSeconds[id] + 1 : 0;
    }
    const report = latest(state, 'player', 'site', 'recovery_verified');
    const readings = latest(state, 'player', 'site', 'verification_readings_at');
    if (mission.stabilitySeconds >= spec.mission.stabilityHoldSeconds && mission.heldAt !== null && report?.value === true && report.observedAt >= mission.heldAt && simTime - report.observedAt <= spec.mission.verificationMaxAgeSeconds
      && typeof readings?.value === 'number' && simTime - readings.value <= spec.mission.verificationMaxAgeSeconds) endMission('success', 'RECOVERY_VERIFIED');
    else if (mission.criticalLossSeconds >= spec.mission.criticalLossSeconds) endMission('failure', 'CRITICAL_SERVICE_LOST');
    else if (simTime >= spec.mission.windowSeconds) endMission('failure', 'MISSION_TIMEOUT');
  }
  function commandReceipt(request: ActionRequest, status: CommandReceipt['status'], reason: string, taskId: string | null = null, eta: number | null = null): CommandReceipt {
    return { schemaVersion: 1, runId, requestId: request.requestId, actorId: request.actorId, status, reason, taskId, eta, evidenceIds: [], observedAt: simTime };
  }
  return {
    step(ticks) {
      if (!Number.isInteger(ticks) || ticks < 0 || ticks > 600) throw new Error('Advance requires 0..600 whole one-second ticks.');
      const eventStart = state.events.length;
      boundary();
      for (let tick = 0; tick < ticks; tick++) {
        const stable = truthStable(state);
        advancePhysical(state.physical, spec, (type, ids, offset) => event(type, ids, simTime + offset));
        simTime++; state.boundaryConsumed = false;
        boundary(); updateMission(stable);
        state.telemetry.push({ simTime, hottestTemperatureC: Math.max(...state.physical.racks.map(r => r.temperatureC)), criticalServedFraction: state.physical.lastInterval.criticalServedFraction, batchBacklog: state.physical.racks.reduce((sum, r) => sum + r.backlog, 0) });
      }
      return { runId, simTime, events: structuredClone(state.events.slice(eventStart)) };
    },
    applyCommand(input) {
      const request = ActionRequestSchema.parse(input);
      boundary();
      const intent = JSON.stringify(request.intent);
      const previous = request.runId === runId ? state.idempotency.find(entry => entry.actorId === request.actorId && entry.key === request.idempotencyKey) : undefined;
      if (previous?.intent === intent) return { ...structuredClone(previous.receipt), runId, requestId: request.requestId };
      emit('command.boundary', [], { requestId: request.requestId }, 'forensic');
      emit('command.queued', [], { requestId: request.requestId }, 'actor', [request.actorId]);
      const sequence = state.nextSequence++;
      let reason = request.runId !== runId ? 'STALE_RUN' : !isActor(state, request.actorId) ? 'UNKNOWN_ACTOR' : previous ? 'IDEMPOTENCY_CONFLICT' : request.intent.atSimTime > simTime ? 'FUTURE_INTENT' : null;
      const plan = reason ? null : actionPlan(state, request.actorId, request.intent);
      reason ??= plan?.reason ?? null;
      if (!reason && plan) {
        const relevant = [...plan.resources, ...(plan.worker ? [plan.worker.id] : [])];
        for (const id of relevant) {
          if (request.expectedEntityVersions[id] === undefined) { reason = 'MISSING_ENTITY_VERSION'; break; }
          if (request.expectedEntityVersions[id] !== state.entityVersions[id]) { reason = 'STALE_ENTITY_VERSION'; break; }
        }
      }
      let result: CommandReceipt;
      if (reason) result = commandReceipt(request, 'rejected', reason);
      else if (request.intent.action === 'cancel_task') {
        const task = state.tasks.find(t => t.public.id === request.intent.args.taskId)!;
        cancelTask(state, task, 'CANCELED_BY_ACTOR', emit);
        result = commandReceipt(request, 'applied', 'TASK_CANCELED', task.public.id);
      } else {
        const task = reserveTask(state, request.actorId, request.intent, simTime, sequence, emit);
        result = commandReceipt(request, 'accepted', 'TASK_RESERVED', task.public.id, task.public.completesAt);
        advanceTasks(state, simTime, emit);
      }
      state.commands.push({ at: simTime, sequence, intent: request.intent, actorId: request.actorId, receipt: result });
      if (!previous && request.runId === runId && isActor(state, request.actorId)) state.idempotency.push({ actorId: request.actorId, key: request.idempotencyKey, intent, receipt: result });
      emit(`command.${result.status}`, [request.intent.targetId], { requestId: request.requestId, reason: result.reason, taskId: result.taskId }, 'actor', [request.actorId]);
      return structuredClone(result);
    },
    observe(actorId) {
      if (!isActor(state, actorId)) throw new Error('Unknown observation actor.');
      const conditions = evidenceConditions(state, actorId, simTime);
      const allKnown = conditions.prerequisite && conditions.thermal && conditions.service && conditions.batch;
      const verification = latest(state, actorId, 'site', 'recovery_verified');
      const objective = (id: string, label: string, met: boolean): KnowledgeView['objectives'][number] => ({ id, label, state: met ? 'complete' : 'awaiting_verification' });
      const view: KnowledgeView = {
        schemaVersion: 1, runId, actorId, simTime, viewHash: 'pending', knownTopology: spec.topology, crew: state.crew,
        observations: evidence(state, actorId), tasks: state.tasks.map(t => t.public), messages: state.messages.filter(m => m.actorIds.includes(actorId)).map(m => m.message), allowedProcedureIds: spec.mode === 'practice' ? [] : ['hot-restart-v1'], observedEntityVersions: state.entityVersions,
        affordances: affordances(state, actorId, simTime), objectives: spec.mode === 'practice' ? [] : [
          objective('prerequisite', 'Verify the cooling prerequisite is restored', conditions.prerequisite),
          objective('service', 'Critical demand fully served with no overload', conditions.service),
          objective('temperature', 'Verify every inlet below the warning threshold', conditions.thermal),
          objective('batch', 'Resume sustainable batch processing', conditions.batch),
          { id: 'stability', label: `Hold verified recovery for ${spec.mission.stabilityHoldSeconds} seconds`, state: allKnown ? (state.mission.evidenceHoldSeconds[actorId] >= spec.mission.stabilityHoldSeconds ? 'complete' : 'in_progress') : 'awaiting_verification' },
          objective('verification', 'Receive a fresh authorized final recovery report', verification?.value === true && simTime - verification.observedAt <= spec.mission.verificationMaxAgeSeconds),
        ], summary: publicSummary(state, actorId),
        mission: { status: state.mission.status, reason: state.mission.reason, stabilitySeconds: spec.mode !== 'practice' && allKnown ? state.mission.evidenceHoldSeconds[actorId] : null, windowSeconds: spec.mode === 'practice' ? 0 : spec.mission.windowSeconds },
      };
      let hash = 2166136261;
      for (const c of JSON.stringify(view)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
      view.viewHash = `view-${hash.toString(16)}`;
      return structuredClone(view);
    },
    snapshot,
    exportRecord() {
      const finalCheckpoint = snapshot();
      const initialCheckpoint: Checkpoint = { ...finalCheckpoint, simTime: 0, state: JSON.parse(JSON.stringify(initialState(spec))) as Checkpoint['state'] };
      return structuredClone({ schemaVersion: 1, engineVersion: ENGINE_VERSION, runId, scenario: spec, initialCheckpoint, finalCheckpoint, commands: state.commands, events: state.events, observations: state.observations.map(o => o.observation), dialogue: state.messages.map(m => m.message), telemetry: state.telemetry, provenance: { model: null, promptVersion: 'not-used-sim-02', procedureVersion: spec.procedureVersion } });
    },
  };
}
