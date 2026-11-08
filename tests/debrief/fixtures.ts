import type { AgentResponse, ComparisonResult, GatewayStart } from '../../src/shared/contracts';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { buildOutcomeLedger, compareEarlierCap } from '../../src/sim/replay';
import { recordedRun } from '../replay/fixtures';
import { successfulPolicy } from '../sim/mission-policy';
import type { DebriefViewProps } from '../../src/ui/debrief/DebriefView';

// Physical outcomes come from the actual replay library, never hand-authored metrics.
const record = recordedRun();
export const ledger = buildOutcomeLedger(record);
const acceptedCaps = record.commands.filter(c => ['accepted', 'applied'].includes(c.receipt.status) && ['pause_batch', 'set_batch_ceiling'].includes(c.intent.action));
export const capOptions = acceptedCaps.map(c => ({ sequence: c.sequence, at: c.at, label: `${c.intent.action} · ${c.intent.targetId}` }));
export const complete = compareEarlierCap(record, { commandSequence: capOptions[0].sequence, earlierAt: 5, branchRunId: 'earlier' });
const conflictingRecord = recordedRun(true);
const conflictingCap = conflictingRecord.commands.find(c => c.intent.action === 'pause_batch' && c.receipt.status === 'accepted')!;
const result = compareEarlierCap(conflictingRecord, { commandSequence: conflictingCap.sequence, earlierAt: 9, branchRunId: 'unsupported' });
if (result.status !== 'unsupported') throw new Error('Expected unsupported engine fixture');
// The schema permits a full original baseline here. It must never enter prefix comparisons.
export const unsupported: ComparisonResult = { ...result, baseline: buildOutcomeLedger(conflictingRecord) };
const idle = initialize(hotRestart, 'idle-accounting');
idle.step(600);
export const terminalLedger = buildOutcomeLedger(idle.exportRecord());
const recovered = initialize(hotRestart, 'recovered-accounting');
successfulPolicy(recovered);
recovered.step(400 - recovered.observe('player').simTime);
const recoveredRecord = recovered.exportRecord();
export const recoveredProps = {
  ledger: buildOutcomeLedger(recoveredRecord), dialogue: recoveredRecord.dialogue,
  capOptions: recoveredRecord.commands.filter(c => ['accepted', 'applied'].includes(c.receipt.status) && ['pause_batch', 'set_batch_ceiling'].includes(c.intent.action)).map(c => ({ sequence: c.sequence, at: c.at, label: `${c.intent.action} · ${c.intent.targetId}` })),
};
const viewEngine = initialize(hotRestart, ledger.runId);
viewEngine.step(100);
export const context: GatewayStart = {
  kind: 'start', runId: ledger.runId, requestId: 'debrief-fixture', actorId: 'player', role: 'debrief',
  message: 'Explain the computed tradeoff.', view: viewEngine.observe('player'), procedures: [],
  promptVersion: 'debrief-fixture-v1', debriefContext: { ledger, comparison: unsupported },
};
export const response: AgentResponse = {
  runId: ledger.runId, requestId: context.requestId, actorId: 'player', speaker: 'player', mode: 'recorded',
  facts: [{ ledgerRunId: ledger.runId, field: 'batchBacklog' }],
  inference: 'An earlier cap can trade batch delay for thermal relief.',
  uncertainty: 'Different human decisions are outside this continuation policy.', proposals: [],
};
export const baseProps: DebriefViewProps = {
  ledger, comparison: null, dialogue: [...record.dialogue,
    { id: 'fixture-live', at: 49, speaker: 'alex', text: 'Recorded inspection discussion.', evidenceIds: [], mode: 'live' },
    { id: 'fixture-scripted', at: 50, speaker: 'player', text: '<script>not executable</script>', evidenceIds: [], mode: 'scripted' },
  ], capOptions, replay: { cursor: 20, playing: false },
  onSeek: () => {}, onToggle: () => {}, onCompare: () => {}, onRetry: () => {}, onReturn: () => {}, onRequestExplanation: () => {},
};
