import type { RecordedCommand, RunRecord, SimulationEngine } from '../../shared/contracts';
import { restore } from '../engine';
import { canonicalCheckpoint, deterministicHash } from './canonical';
import { validateRunRecord } from './validation';

export const acceptedCommands = (record: RunRecord) => record.commands.filter(c => c.receipt.status === 'accepted' || c.receipt.status === 'applied').sort((a, b) => a.at - b.at || a.sequence - b.sequence);

export function advanceTo(engine: SimulationEngine, at: number) {
  let remaining = at - engine.observe('player').simTime;
  if (!Number.isInteger(remaining) || remaining < 0) throw new Error('REPLAY_TIME: Commands require ordered whole-second boundaries.');
  while (remaining > 0) { const ticks = Math.min(600, remaining); engine.step(ticks); remaining -= ticks; }
}

/** Every branch uses its own transport envelope and the engine's current actor-visible versions. */
export function reissue(engine: SimulationEngine, command: RecordedCommand, taskIds: Map<string, string>, index: number, at = command.at) {
  const view = engine.observe(command.actorId);
  const intent = structuredClone(command.intent);
  intent.atSimTime = Math.min(intent.atSimTime, at);
  if (intent.args.taskId) {
    const mapped = taskIds.get(intent.args.taskId);
    if (!mapped) return { status: 'rejected' as const, reason: 'UNMAPPED_TASK_REFERENCE', taskId: null };
    intent.args.taskId = mapped;
  }
  const id = `replay-${index}`;
  const receipt = engine.applyCommand({ schemaVersion: 1, runId: view.runId, requestId: id, idempotencyKey: id, actorId: command.actorId, intent, expectedEntityVersions: view.observedEntityVersions });
  if (command.receipt.taskId && receipt.taskId && receipt.status !== 'rejected') taskIds.set(command.receipt.taskId, receipt.taskId);
  return receipt;
}

/** Original rejected attempts stay in rejectedAttempts, never submitted into the physical replay. */
export function replayRun(input: RunRecord, runId: string) {
  const source = validateRunRecord(input);
  if (runId === source.runId) throw new Error('REPLAY_IDENTITY: Supply a new run identity.');
  const engine = restore(source.initialCheckpoint, runId);
  const taskIds = new Map<string, string>();
  const commands = acceptedCommands(source);
  for (const [index, command] of commands.entries()) {
    advanceTo(engine, command.at);
    const receipt = reissue(engine, command, taskIds, index);
    if (receipt.status !== command.receipt.status || receipt.reason !== command.receipt.reason || ('eta' in receipt && receipt.eta !== command.receipt.eta)) throw new Error(`REPLAY_DIVERGED: command ${command.sequence}: ${receipt.reason}`);
  }
  advanceTo(engine, source.finalCheckpoint.simTime);
  // A recorded t=0 explicit boundary can exist without commands or physical steps.
  if (source.finalCheckpoint.state.boundaryConsumed === true) engine.step(0);
  return { record: engine.exportRecord(), rejectedAttempts: source.commands.filter(c => c.receipt.status === 'rejected'), dialogue: structuredClone(source.dialogue) };
}

export function verifyReplay(input: RunRecord, runId: string) {
  const result = replayRun(input, runId);
  return { ...result, matches: canonicalCheckpoint(input.finalCheckpoint) === canonicalCheckpoint(result.record.finalCheckpoint), originalHash: deterministicHash(input.finalCheckpoint), replayHash: deterministicHash(result.record.finalCheckpoint) };
}
