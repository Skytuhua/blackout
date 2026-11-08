import type { Checkpoint, RunRecord } from '../../shared/contracts';
import { CheckpointSchema, RunRecordSchema } from '../../shared/schemas';
import { hotRestart, practiceScenario } from '../../content/scenarios/hot-restart';
import { ENGINE_VERSION, initialize, restore } from '../engine';
import { EngineStateSchema } from '../state';
import { canonicalJson, orderedEvents } from './canonical';

export class ReplayDataError extends Error {
  constructor(public readonly code: 'VERSION_MISMATCH' | 'IDENTITY_MISMATCH' | 'CORRUPT' | 'HISTORY_MISMATCH', detail: string) { super(`${code}: ${detail}`); this.name = 'ReplayDataError'; }
}

function version(input: unknown) {
  if (input && typeof input === 'object') {
    const v = input as Record<string, unknown>;
    if (v.schemaVersion !== undefined && v.schemaVersion !== 1 || typeof v.engineVersion === 'string' && v.engineVersion !== ENGINE_VERSION) throw new ReplayDataError('VERSION_MISMATCH', `Requires schema 1 / ${ENGINE_VERSION}.`);
  }
}

/** Only the actual shipped content is supported; changing physics requires a new content version. */
export function validateCheckpoint(input: unknown): Checkpoint {
  version(input);
  try {
    const checkpoint = CheckpointSchema.parse(input);
    const state = EngineStateSchema.parse(checkpoint.state);
    if (![hotRestart, practiceScenario].some(spec => checkpoint.scenarioVersion === spec.contentVersion && canonicalJson(state.scenario) === canonicalJson(spec))) throw new ReplayDataError('VERSION_MISMATCH', 'Unsupported scenario content, seed or procedure identity.');
    if (state.commands.some(c => c.receipt.runId !== checkpoint.runId || c.receipt.actorId !== c.actorId || c.receipt.observedAt !== c.at)) throw new ReplayDataError('IDENTITY_MISMATCH', 'Checkpoint command identity mismatch.');
    restore(checkpoint, checkpoint.runId);
    const totals = state.physical.totals;
    const initialBacklog = state.initialPhysical.racks.reduce((sum, r) => sum + r.backlog, 0);
    const backlog = state.physical.racks.reduce((sum, r) => sum + r.backlog, 0);
    if (Math.abs(initialBacklog + totals.batchArrivals - totals.batchCompleted - backlog) > 1e-6 || totals.criticalDelivered > totals.criticalDemand + 1e-6 || totals.interactiveDelivered > totals.interactiveDemand + 1e-6) throw new Error('Physical conservation mismatch.');
    if (state.telemetry.length !== checkpoint.simTime + 1 || state.telemetry.some((t, i) => t.simTime !== i) || state.events.some(e => e.simTime > checkpoint.simTime) || state.commands.some(c => !Number.isInteger(c.at) || c.at > checkpoint.simTime || c.receipt.status === 'queued')) throw new Error('Incomplete or unresolved engine history.');
    return checkpoint;
  } catch (error) {
    if (error instanceof ReplayDataError) throw error;
    throw new ReplayDataError('CORRUPT', error instanceof Error ? error.message : 'Invalid checkpoint.');
  }
}

export function validateRunRecord(input: unknown): RunRecord {
  version(input);
  try {
    const record = RunRecordSchema.parse(input);
    const first = validateCheckpoint(record.initialCheckpoint); const last = validateCheckpoint(record.finalCheckpoint);
    if ([first, last].some(c => c.runId !== record.runId || c.engineVersion !== record.engineVersion || canonicalJson(c.state.scenario) !== canonicalJson(record.scenario)) || record.provenance.procedureVersion !== record.scenario.procedureVersion) throw new ReplayDataError('IDENTITY_MISMATCH', 'Record, checkpoint or procedure identity mismatch.');
    if (canonicalJson(first) !== canonicalJson(initialize(record.scenario, record.runId).snapshot())) throw new ReplayDataError('IDENTITY_MISMATCH', 'Initial checkpoint must be the declared engine initial state.');
    const state = EngineStateSchema.parse(last.state);
    const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
    if (!equal([...record.commands].sort((a, b) => a.sequence - b.sequence), [...state.commands].sort((a, b) => a.sequence - b.sequence)) || !equal(orderedEvents(record.events), orderedEvents(state.events)) || !equal(record.observations, state.observations.map(o => o.observation)) || !equal(record.telemetry, state.telemetry)) throw new ReplayDataError('HISTORY_MISMATCH', 'Record histories must match the final engine checkpoint.');
    const ids = new Set(record.dialogue.map(m => m.id));
    if (ids.size !== record.dialogue.length || record.dialogue.some(m => m.at > last.simTime) || state.messages.some(m => !record.dialogue.some(d => equal(d, m.message)))) throw new ReplayDataError('HISTORY_MISMATCH', 'Recorded dialogue omitted engine reports or has invalid identity/time.');
    return record;
  } catch (error) {
    if (error instanceof ReplayDataError) throw error;
    throw new ReplayDataError('CORRUPT', error instanceof Error ? error.message : 'Invalid record.');
  }
}
