import type { ScenarioSpec, SimulationEngine, Checkpoint, CommandReceipt, KnowledgeView, Action } from '../shared/contracts';
import { ActionRequestSchema, CheckpointSchema, ScenarioSpecSchema } from '../shared/schemas';
import { EngineStateSchema, type EngineState } from './state';
import { advancePhysical, createPhysical } from './systems/physical';

export const ENGINE_VERSION = 'sim-01-v1';

// External power transitions precede control faults, then workload pulses; input order breaks ties.
const phase: Record<ScenarioSpec['externalEvents'][number]['kind'], number> = {
  utility_loss: 10, utility_restore: 10, generator_ready: 20, transfer_complete: 30,
  cooling_control_fault: 40, workload_pulse_start: 50, workload_pulse_end: 50,
};
function schedule(spec: ScenarioSpec) {
  return spec.externalEvents.map((event, sequence) => ({ ...event, sequence }))
    .sort((a, b) => a.at - b.at || phase[a.kind] - phase[b.kind] || a.sequence - b.sequence);
}

function validateTopology(spec: ScenarioSpec) {
  const ids = new Set(spec.topology.assets.map(a => a.id));
  if (ids.size !== spec.topology.assets.length || spec.topology.assets.some(a => a.dependencies.some(id => !ids.has(id)))) throw new Error('Invalid topology asset references.');
  if (!spec.topology.assets.some(a => a.kind === 'rack') || spec.profile.peakKw < spec.profile.idleKw) throw new Error('Invalid physical profile.');
}

export function initialize(spec: ScenarioSpec, runId: string): SimulationEngine {
  const scenario = ScenarioSpecSchema.parse(spec);
  validateTopology(scenario);
  const physical = createPhysical(scenario);
  const state: EngineState = {
    scenario, physical, initialPhysical: structuredClone(physical), eventCursor: 0, nextSequence: 0,
    commands: [], events: [], telemetry: [{ simTime: 0, hottestTemperatureC: Math.max(...physical.racks.map(r => r.temperatureC)), criticalServedFraction: 1, batchBacklog: 0 }], idempotency: [],
  };
  return createEngine(state, runId, 0);
}

export function restore(checkpoint: Checkpoint, runId: string): SimulationEngine {
  const parsed = CheckpointSchema.parse(checkpoint);
  if (parsed.engineVersion !== ENGINE_VERSION) throw new Error('Unsupported engine version.');
  const state = EngineStateSchema.parse(parsed.state);
  if (parsed.scenarioVersion !== state.scenario.contentVersion || !Number.isInteger(parsed.simTime)) throw new Error('Checkpoint identity mismatch.');
  validateTopology(state.scenario);
  const matches = (kind: string, actual: { id: string }[]) => JSON.stringify(state.scenario.topology.assets.filter(a => a.kind === kind).map(a => a.id)) === JSON.stringify(actual.map(a => a.id));
  for (const physical of [state.physical, state.initialPhysical]) {
    if (!matches('rack', physical.racks) || !matches('ups', physical.ups) || !matches('cooling', physical.cooling) || physical.ups.some(u => u.energyKwh > state.scenario.profile.upsEnergyKwh)) throw new Error('Checkpoint physical identity or energy mismatch.');
  }
  const ordered = schedule(state.scenario);
  if (state.eventCursor > ordered.length || ordered.slice(0, state.eventCursor).some(e => e.at >= parsed.simTime) || ordered.slice(state.eventCursor).some(e => e.at < parsed.simTime)) throw new Error('Invalid checkpoint event cursor.');
  if ([...state.events, ...state.commands].some(e => e.sequence >= state.nextSequence)) throw new Error('Invalid checkpoint sequence counter.');
  return createEngine(state, runId, parsed.simTime);
}

function createEngine(state: EngineState, runId: string, initialTime: number): SimulationEngine {
  CheckpointSchema.shape.runId.parse(runId);
  const spec = state.scenario;
  const external = schedule(spec);
  let simTime = initialTime;

  function snapshot(): Checkpoint {
    // Validate before JSON conversion so non-finite values cannot silently become null.
    const serializable = JSON.parse(JSON.stringify(EngineStateSchema.parse(state))) as Checkpoint['state'];
    return { schemaVersion: 1, engineVersion: ENGINE_VERSION, scenarioVersion: spec.contentVersion, runId, simTime, state: serializable };
  }

  function emit(type: string, ids: string[], at: number, payload: Checkpoint['state'] = {}) {
    const sequence = state.nextSequence++;
    state.events.push({ id: `event-${sequence}`, simTime: at, sequence, type, entityIds: ids, causalParents: [], visibility: 'forensic', actorIds: [], payload });
  }

  function receipt(request: ReturnType<typeof ActionRequestSchema.parse>, reason: string): CommandReceipt {
    return { schemaVersion: 1, runId, requestId: request.requestId, actorId: request.actorId, status: 'rejected', reason, taskId: null, eta: null, evidenceIds: [], observedAt: simTime };
  }

  return {
    step(ticks) {
      if (!Number.isInteger(ticks) || ticks < 0 || ticks > 600) throw new Error('Advance requires 0..600 whole one-second ticks.');
      const eventStart = state.events.length;
      for (let tick = 0; tick < ticks; tick++) {
        // Events at t are applied before [t,t+1); events at the returned endpoint await the next tick.
        while (state.eventCursor < external.length && external[state.eventCursor].at <= simTime) {
          const event = external[state.eventCursor++];
          const physical = state.physical;
          switch (event.kind) {
            case 'utility_loss': physical.sources.utilityAvailable = false; break;
            case 'utility_restore': physical.sources.utilityAvailable = true; break;
            case 'generator_ready': physical.sources.generatorReady = true; break;
            case 'transfer_complete': physical.sources.transferComplete = true; break;
            case 'cooling_control_fault': physical.controllerFault = true; break;
            case 'workload_pulse_start': physical.pulse = Math.max(0, event.value ?? 0); break;
            case 'workload_pulse_end': physical.pulse = 0; break;
          }
          emit(`external.${event.kind}`, [], simTime, { externalId: event.id, value: event.value });
        }
        advancePhysical(state.physical, spec, (type, ids, offset) => emit(type, ids, simTime + offset));
        simTime++;
        state.telemetry.push({ simTime, hottestTemperatureC: Math.max(...state.physical.racks.map(r => r.temperatureC)), criticalServedFraction: state.physical.lastInterval.criticalServedFraction, batchBacklog: state.physical.racks.reduce((sum, r) => sum + r.backlog, 0) });
      }
      return { runId, simTime, events: structuredClone(state.events.slice(eventStart)) };
    },
    applyCommand(input) {
      const request = ActionRequestSchema.parse(input);
      if (request.runId !== runId) return receipt(request, 'STALE_RUN');
      const intent = JSON.stringify(request.intent);
      const previous = state.idempotency.find(entry => entry.actorId === request.actorId && entry.key === request.idempotencyKey);
      if (previous) return previous.intent === intent
        ? { ...structuredClone(previous.receipt), runId, requestId: request.requestId }
        : receipt(request, 'IDEMPOTENCY_CONFLICT');
      const result = receipt(request, 'SIM01_ACTION_UNAVAILABLE');
      const sequence = state.nextSequence++;
      state.commands.push({ at: simTime, sequence, intent: request.intent, actorId: request.actorId, receipt: result });
      state.idempotency.push({ actorId: request.actorId, key: request.idempotencyKey, intent, receipt: result });
      return structuredClone(result);
    },
    observe(actorId) {
      CheckpointSchema.shape.runId.parse(actorId);
      const actions = (kind: string): Action[] => kind === 'rack' ? ['inspect', 'independent_reading', 'pause_batch', 'resume_batch', 'set_batch_ceiling']
        : kind === 'cooling' ? ['inspect', 'repair_cooling', 'restart_cooling'] : kind === 'ups' ? ['inspect', 'reset_ups'] : ['inspect'];
      const view: KnowledgeView = {
        schemaVersion: 1, runId, actorId, simTime, viewHash: 'pending', knownTopology: spec.topology, crew: spec.crew,
        observations: [], tasks: [], messages: [], allowedProcedureIds: [], observedEntityVersions: {},
        affordances: spec.topology.assets.flatMap(asset => actions(asset.kind).map(action => ({ action, targetId: asset.id, enabled: false, reason: 'SIM01_ACTION_UNAVAILABLE', technicianIds: [], travelSeconds: null, workSeconds: 0 }))),
        objectives: [], summary: { criticalServedFraction: null, interactiveServedFraction: null, batchBacklog: null, itPowerKw: null, sourceHeadroomKw: null, hottestTemperatureC: null, observedAt: 0 },
        mission: { status: 'briefing', reason: 'SIM-01 physical reference slice; mission and observations are unavailable.', stabilitySeconds: null, windowSeconds: spec.mission.windowSeconds },
      };
      let hash = 2166136261;
      for (const character of JSON.stringify(view)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
      view.viewHash = `view-${hash.toString(16)}`;
      return structuredClone(view);
    },
    snapshot,
    exportRecord() {
      const finalCheckpoint = snapshot();
      const initialState: EngineState = { ...state, physical: state.initialPhysical, eventCursor: 0, nextSequence: 0, commands: [], events: [], idempotency: [], telemetry: state.telemetry.slice(0, 1) };
      const initialCheckpoint: Checkpoint = { ...finalCheckpoint, simTime: 0, state: JSON.parse(JSON.stringify(initialState)) as Checkpoint['state'] };
      return structuredClone({ schemaVersion: 1, engineVersion: ENGINE_VERSION, runId, scenario: spec, initialCheckpoint, finalCheckpoint, commands: state.commands, events: state.events, observations: [], dialogue: [], telemetry: state.telemetry, provenance: { model: null, promptVersion: 'not-used-sim-01', procedureVersion: spec.procedureVersion } });
    },
  };
}
