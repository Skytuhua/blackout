import type { OutcomeLedger, RunRecord } from '../../shared/contracts';
import { OutcomeLedgerSchema } from '../../shared/schemas';
import { EngineStateSchema } from '../state';
import { orderedEvents } from './canonical';
import { validateRunRecord } from './validation';

const protection = new Set(['ups_overload_trip', 'ups_depleted', 'power_off', 'boot_started', 'boot_completed', 'thermal_trip', 'thermal_throttle', 'throttle_released']);

/** Recorder-only truth. Never derive private metrics from a projected dashboard. */
export function buildOutcomeLedger(input: RunRecord): OutcomeLedger {
  const record = validateRunRecord(input);
  const state = EngineStateSchema.parse(record.finalCheckpoint.state);
  const totals = state.physical.totals;
  const timeline = orderedEvents(record.events);
  return OutcomeLedgerSchema.parse({ schemaVersion: 1, runId: record.runId, engineVersion: record.engineVersion, scenarioId: record.scenario.id,
    horizon: record.finalCheckpoint.simTime, criticalDemand: totals.criticalDemand, criticalDelivered: totals.criticalDelivered,
    interactiveDemand: totals.interactiveDemand, interactiveDelivered: totals.interactiveDelivered, batchArrivals: totals.batchArrivals,
    batchCompleted: totals.batchCompleted, batchBacklog: state.physical.racks.reduce((sum, r) => sum + r.backlog, 0), batchDelayUnitSeconds: totals.batchDelayUnitSeconds,
    peakTemperatureC: Math.max(...record.telemetry.map(t => t.hottestTemperatureC)), protectionEvents: timeline.filter(e => protection.has(e.type)), timeline, telemetry: record.telemetry });
}
