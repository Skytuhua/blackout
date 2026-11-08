import type { ComparisonResult, RunRecord } from '../../shared/contracts';
import { ComparisonResultSchema } from '../../shared/schemas';
import { restore } from '../engine';
import { canonicalJson, fingerprint } from './canonical';
import { buildOutcomeLedger } from './ledger';
import { acceptedCommands, advanceTo, reissue } from './recorder';
import { validateRunRecord } from './validation';

export const EARLIER_CAP_POLICY = 'Earlier batch cap, with the same subsequent accepted commands and external disturbances.';
export interface EarlierCapChange { commandSequence: number; earlierAt: number; branchRunId: string }

/** Move one existing accepted pause/ceiling. Every other accepted action retains its boundary/order. */
export function compareEarlierCap(input: RunRecord, change: EarlierCapChange): ComparisonResult {
  const record = validateRunRecord(input);
  const accepted = acceptedCommands(record);
  const selected = accepted.find(c => c.sequence === change.commandSequence);
  if (!selected || !['pause_batch', 'set_batch_ceiling'].includes(selected.intent.action)) throw new Error('EARLIER_CAP: Select an existing accepted pause or ceiling.');
  if (!Number.isInteger(change.earlierAt) || change.earlierAt < 0 || change.earlierAt >= selected.at) throw new Error('EARLIER_CAP: New boundary must be strictly earlier.');
  if (change.branchRunId === record.runId) throw new Error('REPLAY_IDENTITY: Supply a new branch run identity.');
  const baseline = restore(record.initialCheckpoint, record.runId);
  const alternative = restore(record.initialCheckpoint, change.branchRunId);
  const baseTasks = new Map<string, string>(); const altTasks = new Map<string, string>();
  const scheduled = accepted.map(c => ({ command: c, at: c === selected ? change.earlierAt : c.at })).sort((a, b) => a.at - b.at || a.command.sequence - b.command.sequence);
  const identity = { baseRunId: record.runId, branchRunId: change.branchRunId, continuationPolicy: EARLIER_CAP_POLICY, externalScheduleIdentity: `external-${fingerprint(canonicalJson({ seed: record.scenario.seed, events: record.scenario.externalEvents }))}` };
  const explanation = 'The selected cap is moved, removing its original instance. All other accepted commands retain their original times and order; original rejected attempts remain in the source audit and are omitted. Identical external disturbances and keyed sensor noise are preserved. This does not predict player decisions under different observations.';
  let baseIndex = 0;
  for (const [index, entry] of scheduled.entries()) {
    while (baseIndex < accepted.length && (accepted[baseIndex].at < entry.at || accepted[baseIndex].at === entry.at && accepted[baseIndex].sequence < entry.command.sequence)) {
      const command = accepted[baseIndex]; advanceTo(baseline, command.at);
      const receipt = reissue(baseline, command, baseTasks, baseIndex++);
      if (receipt.status === 'rejected') throw new Error(`BASELINE_DIVERGED: ${receipt.reason}`);
    }
    advanceTo(baseline, entry.at); advanceTo(alternative, entry.at);
    const receipt = reissue(alternative, entry.command, altTasks, index, entry.at);
    if (receipt.status === 'rejected') {
      const baseLedger = buildOutcomeLedger(baseline.exportRecord());
      const altLedger = buildOutcomeLedger(alternative.exportRecord());
      return ComparisonResultSchema.parse({ status: 'unsupported', ...identity, supportedHorizon: entry.at, baseline: baseLedger, explanation, firstInvalidAction: entry.command, reason: receipt.reason, validPrefix: { baseline: baseLedger, alternative: altLedger } });
    }
  }
  while (baseIndex < accepted.length) {
    const command = accepted[baseIndex]; advanceTo(baseline, command.at);
    const receipt = reissue(baseline, command, baseTasks, baseIndex++);
    if (receipt.status === 'rejected') throw new Error(`BASELINE_DIVERGED: ${receipt.reason}`);
  }
  const horizon = record.finalCheckpoint.simTime;
  advanceTo(baseline, horizon); advanceTo(alternative, horizon);
  return ComparisonResultSchema.parse({ status: 'complete', ...identity, supportedHorizon: horizon, baseline: buildOutcomeLedger(baseline.exportRecord()), alternative: buildOutcomeLedger(alternative.exportRecord()), explanation });
}
