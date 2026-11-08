import { hotRestart, practiceScenario } from '../../src/content/scenarios/hot-restart';
import { initialize, ENGINE_VERSION } from '../../src/sim/engine';
import type { SimulationEngine } from '../../src/shared/contracts';
import type { PhysicalState } from '../../src/sim/state';
import { successfulPolicy } from './mission-policy';
import { INTEGRATION_CONTRACT_VERSION } from '../../src/shared/schemas';

function metrics(engine: SimulationEngine) {
  const record = engine.exportRecord();
  const p = record.finalCheckpoint.state.physical as unknown as PhysicalState;
  return {
    horizon: record.finalCheckpoint.simTime, result: engine.observe('player').mission,
    peakTemperatureC: Math.max(...record.telemetry.map(t => t.hottestTemperatureC)),
    finalTemperatureC: Math.max(...p.racks.map(r => r.temperatureC)),
    criticalDemand: p.totals.criticalDemand, criticalDelivered: p.totals.criticalDelivered,
    interactiveDemand: p.totals.interactiveDemand, interactiveDelivered: p.totals.interactiveDelivered,
    batchArrivals: p.totals.batchArrivals, batchCompleted: p.totals.batchCompleted,
    batchBacklog: p.racks.reduce((sum, r) => sum + r.backlog, 0), batchDelayUnitSeconds: p.totals.batchDelayUnitSeconds,
    conservationResidual: p.totals.batchArrivals - p.totals.batchCompleted - p.racks.reduce((sum, r) => sum + r.backlog, 0),
    thermalTrips: record.events.filter(e => e.type === 'thermal_trip').length,
    terminal: record.events.find(e => ['mission.success', 'mission.failure'].includes(e.type)) ?? null,
  };
}
const success = initialize(hotRestart, 'success-policy');
const actions = successfulPolicy(success);
const atSuccess = metrics(success);
const milestones = success.exportRecord().events.filter(e => e.type.startsWith('mission.') || e.type === 'task.applied' || e.type === 'cooling_ready' || e.type === 'report.delivered').map(e => ({ at: e.simTime, sequence: e.sequence, type: e.type, payload: e.payload }));
success.step(600 - atSuccess.horizon);
const idle = initialize(hotRestart, 'idle-policy'); idle.step(600);
const timeoutSpec = structuredClone(hotRestart); timeoutSpec.profile.tripC = 200;
const timeout = initialize(timeoutSpec, 'timeout-policy'); timeout.step(600);
const practice = initialize(practiceScenario, 'practice-policy'); practice.step(600); practice.step(120);
console.log(JSON.stringify({ scope: 'Headless engine proof only; no browser, replay, persistence, provider, or G1 acceptance.', base: '8b1f4242bbdf38db0633f8fca39bf555bc2d20da', contractVersion: INTEGRATION_CONTRACT_VERSION, engineSchemaVersion: 1, engineVersion: ENGINE_VERSION, scenarioVersion: hotRestart.contentVersion, policyUses: 'Public observations, public task summaries, and published affordances only.', actions, milestones, atSuccess, equalHorizonSuccess: metrics(success), equalHorizonIdle: metrics(idle), timeout: metrics(timeout), practice: metrics(practice) }, null, 2));
