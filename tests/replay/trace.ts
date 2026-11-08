import { writeFileSync } from 'node:fs';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { buildOutcomeLedger, compareEarlierCap, deterministicHash, verifyReplay } from '../../src/sim/replay';
import type { OutcomeLedger } from '../../src/shared/contracts';
import { recordedRun } from './fixtures';
import { request, successfulPolicy } from '../sim/mission-policy';

const summary = (ledger: OutcomeLedger) => {
  const { timeline, telemetry, protectionEvents, ...totals } = ledger;
  return { ...totals, conservationResidual: totals.batchArrivals - totals.batchCompleted - totals.batchBacklog, protectionCount: protectionEvents.length,
    terminalEvents: timeline.filter(e => e.type === 'mission.success' || e.type === 'mission.failure').map(e => ({ at: e.simTime, type: e.type, reason: e.payload.reason })), samples: telemetry.length };
};
const mission = initialize(hotRestart, 'evidence-mission'); successfulPolicy(mission);
const terminalAt = mission.observe('player').simTime; mission.step(600 - terminalAt);
const record = mission.exportRecord();
const verification = verifyReplay(record, 'evidence-replay');
const cap = record.commands.find(c => c.intent.action === 'pause_batch')!;
const complete = compareEarlierCap(record, { commandSequence: cap.sequence, earlierAt: 0, branchRunId: 'evidence-earlier' });
if (complete.status !== 'complete') throw new Error(complete.reason);
const conflicting = recordedRun(true);
const moved = conflicting.commands.find(c => c.intent.action === 'pause_batch' && c.receipt.status === 'accepted')!;
const unsupported = compareEarlierCap(conflicting, { commandSequence: moved.sequence, earlierAt: 9, branchRunId: 'evidence-unsupported' });
if (unsupported.status !== 'unsupported') throw new Error('Missing expected unsupported case');

const traveler = initialize(hotRestart, 'evidence-travel'); traveler.applyCommand(request(traveler, 'inspect', 'rack-8', { technicianId: 'alex' })); traveler.step(1);
const checkpointHash = deterministicHash(traveler.snapshot());
const pendingAt = traveler.observe('player').tasks[0].completesAt; traveler.step(pendingAt - 1);
const pendingHash = deterministicHash(traveler.snapshot());
const evidence = {
  base: '2cf2c351fec184268481bf3e364e3879b052ba8b', engineVersion: record.engineVersion, contentVersion: record.scenario.contentVersion,
  verification: { matches: verification.matches, originalHash: verification.originalHash, replayHash: verification.replayHash, canonicalScope: 'Full authoritative engine state, accepted domain commands and non-transport events; not just terminal ledgers', rejectedAttempts: verification.rejectedAttempts.length },
  checkpoints: { traveling: { at: 1, hash: checkpointHash }, pendingReport: { at: pendingAt, hash: pendingHash } },
  complete: { status: complete.status, policy: complete.continuationPolicy, schedule: complete.externalScheduleIdentity, baseline: summary(complete.baseline), alternative: summary(complete.alternative) },
  unsupported: { status: unsupported.status, reason: unsupported.reason, supportedHorizon: unsupported.supportedHorizon, offendingOriginalCommand: unsupported.firstInvalidAction, baseline: summary(unsupported.validPrefix.baseline), alternative: summary(unsupported.validPrefix.alternative), hasFullAlternative: 'alternative' in unsupported },
  evidenceBoundary: 'Headless engine trace. Native IndexedDB proof is browser-evidence.json; no provider calls or application replay integration.',
};
writeFileSync(new URL('./replay-evidence.json', import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
