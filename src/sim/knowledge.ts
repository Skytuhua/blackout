import type { KnowledgeView, Observation } from '../shared/contracts';
import type { EngineState } from './state';

export const REPORT_DELAY_SECONDS = 2;
export const actorIds = (state: EngineState) => ['player', ...state.crew.map(c => c.id)];
export const isActor = (state: EngineState, actorId: string) => actorIds(state).includes(actorId);
export const evidence = (state: EngineState, actorId: string) => state.observations.filter(o => o.actorIds.includes(actorId)).map(o => o.observation);
export function latest(state: EngineState, actorId: string, assetId: string, field: string) {
  for (let i = state.observations.length - 1; i >= 0; i--) {
    const entry = state.observations[i];
    if (entry.observation.assetId === assetId && entry.observation.field === field && entry.actorIds.includes(actorId)) return entry.observation;
  }
}

export function observation(state: EngineState, assetId: string, field: string, value: Observation['value'], units: string, at: number, source: string, quality: Observation['quality'] = 'reported', receivedAt = at): Observation {
  return { id: `observation-${state.nextObservation++}`, assetId, source, field, value, units, observedAt: at, receivedAt, quality };
}

function noise(seed: number, assetId: string, at: number, amplitude: number) {
  let hash = 2166136261;
  for (const c of `${seed}:${assetId}:${at}:inlet`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return (hash / 4294967295 * 2 - 1) * amplitude;
}

export function sampleSensors(state: EngineState, at: number) {
  if (at === state.lastSensorAt || at % state.scenario.profile.sensorIntervalSeconds !== 0) return;
  state.lastSensorAt = at;
  const everyone = actorIds(state);
  const add = (id: string, field: string, value: Observation['value'], units = '') => {
    state.observations.push({ observation: observation(state, id, field, value, units, at, 'dashboard'), actorIds: everyone });
  };
  const p = state.physical;
  for (const r of p.racks) {
    add(r.id, 'inlet_temperature_c', r.temperatureC + noise(state.scenario.seed, r.id, at, state.scenario.profile.sensorNoiseC), 'C');
    add(r.id, 'batch_ceiling', r.batchCeiling, 'units/s');
    add(r.id, 'batch_processing_rate', r.batch, 'units/s');
    add(r.id, 'power_state', r.mode);
  }
  for (const c of p.cooling) add(c.id, 'running', c.ready && !p.controllerFault);
  for (const u of p.ups) add(u.id, 'output_state', u.tripped ? 'tripped' : u.faulted ? 'unavailable' : 'available');
  add('site', 'critical_served_fraction', p.lastInterval.criticalServedFraction, 'fraction');
  add('site', 'interactive_served_fraction', p.lastInterval.interactiveServedFraction, 'fraction');
  add('site', 'batch_backlog', p.racks.reduce((sum, r) => sum + r.backlog, 0), 'units');
  add('site', 'it_power_kw', p.lastInterval.itPowerKw, 'kW');
  add('site', 'source_headroom_kw', p.lastInterval.sourceCapacityKw === null ? null : p.lastInterval.sourceCapacityKw - p.lastInterval.sourceUsedKw, 'kW');
  add('site', 'active_overload', p.ups.some(u => u.tripped));
}

export function prerequisiteEvidence(state: EngineState, actorId: string, targetId?: string) {
  const all = evidence(state, actorId);
  return all.filter(o => o.field === 'prerequisite_ready' && (!targetId || o.assetId === targetId || o.assetId === 'controller')).at(-1);
}

export function evidenceConditions(state: EngineState, actorId: string, at: number) {
  const maxAge = state.scenario.mission.verificationMaxAgeSeconds;
  const fresh = (o: Observation | undefined) => o && at - o.observedAt <= maxAge && o.receivedAt <= at;
  const racks = state.scenario.topology.assets.filter(a => a.kind === 'rack');
  const prerequisite = prerequisiteEvidence(state, actorId);
  const temperatures = racks.map(r => latest(state, actorId, r.id, 'inlet_temperature_c'));
  const batch = racks.map(r => latest(state, actorId, r.id, 'batch_processing_rate'));
  const critical = latest(state, actorId, 'site', 'critical_served_fraction');
  const overload = latest(state, actorId, 'site', 'active_overload');
  return {
    prerequisite: prerequisite?.value === true,
    thermal: temperatures.every(o => fresh(o) && typeof o!.value === 'number' && o!.value < state.scenario.profile.warningC),
    service: !!fresh(critical) && critical!.value === 1 && !!fresh(overload) && overload!.value === false,
    batch: batch.every(o => fresh(o) && typeof o!.value === 'number' && o!.value >= state.scenario.workload.batch),
    evidenceIds: [prerequisite, ...temperatures, ...batch, critical, overload].filter((o): o is Observation => !!o).map(o => o.id),
    oldestReadingAt: Math.min(...[...temperatures, ...batch, critical, overload].map(o => o?.observedAt ?? 0)),
  };
}

export function publicSummary(state: EngineState, actorId: string): KnowledgeView['summary'] {
  const number = (id: string, field: string) => { const o = latest(state, actorId, id, field); return typeof o?.value === 'number' ? o.value : null; };
  const temperatures = state.scenario.topology.assets.filter(a => a.kind === 'rack').map(a => number(a.id, 'inlet_temperature_c'));
  return {
    criticalServedFraction: number('site', 'critical_served_fraction'), interactiveServedFraction: number('site', 'interactive_served_fraction'),
    batchBacklog: number('site', 'batch_backlog'), itPowerKw: number('site', 'it_power_kw'), sourceHeadroomKw: number('site', 'source_headroom_kw'),
    hottestTemperatureC: temperatures.every((t): t is number => t !== null) ? Math.max(...temperatures) : null,
    observedAt: latest(state, actorId, 'site', 'it_power_kw')?.observedAt ?? 0,
  };
}
