import type { GatewayStart, Observation, OutcomeLedger, RunRecord, SavedRunRecord } from '../shared/contracts';
import { SavedRunRecordSchema } from '../shared/schemas';
import { ReplayDataError, validateRunRecord } from '../sim/replay/validation';
import { canonicalJson } from '../sim/replay/canonical';
import { EngineStateSchema } from '../sim/state';
import { procedures } from '../content/procedures';
import { factValue, validAction, validStart, validateResponse } from '../llm/validation';
import { acceptedCommands, advanceTo, reissue, verifyReplay } from '../sim/replay/recorder';
import { restore } from '../sim/engine';
import { buildOutcomeLedger } from '../sim/replay/ledger';
import { usesConversationPolicy } from '../llm/conversation-mode';
import { projectCoworkerContext } from '../llm/conversation-policy';

const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function fail(message: string): never { throw new ReplayDataError('HISTORY_MISMATCH', message); }

/** Project host provenance out before calling the unchanged deterministic engine APIs. */
export function engineRecordOf(record: SavedRunRecord): RunRecord {
  const { interactions: _interactions, lineage: _lineage, ...engine } = record;
  return { ...structuredClone(engine), schemaVersion: 1 };
}

export function replaySavedRun(input: unknown, runId: string) {
  const source = validateSavedRun(input);
  return { ...verifyReplay(engineRecordOf(source), runId), sourceTranscript: structuredClone({ runId: source.runId, lineage: source.lineage, interactions: source.interactions }) };
}

export function validateSavedRun(input: unknown): SavedRunRecord {
  if (input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion === 1) {
    return { ...validateRunRecord(input), schemaVersion: 2, lineage: [], interactions: [] };
  }
  if (input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion !== 2) throw new ReplayDataError('VERSION_MISMATCH', 'Supported saved run versions are 1 and 2.');
  let saved: SavedRunRecord;
  try { saved = SavedRunRecordSchema.parse(input); }
  catch { throw new ReplayDataError('CORRUPT', 'Invalid saved interaction record.'); }
  const engine = validateRunRecord(engineRecordOf(saved));
  const state = EngineStateSchema.parse(engine.finalCheckpoint.state);
  const horizons = new Map<string, number>();
  let previousHorizon = 0;
  for (const ancestor of saved.lineage) {
    if (ancestor.runId === saved.runId || horizons.has(ancestor.runId) || ancestor.throughSimTime < previousHorizon || ancestor.throughSimTime > engine.finalCheckpoint.simTime) fail('Invalid resume lineage.');
    horizons.set(ancestor.runId, ancestor.throughSimTime); previousHorizon = ancestor.throughSimTime;
  }
  horizons.set(saved.runId, engine.finalCheckpoint.simTime);
  const requests = new Set<string>(), receipts = new Set<string>(), responseIds = new Set<string>();
  const lastStarted = new Map<string, number>();
  let previousRunIndex = -1;
  const runOrder = [...horizons.keys()];
  const observations = new Map(state.observations.map(row => [row.observation.id, row]));
  const sourceLedgers = new Map<string, OutcomeLedger>();
  function validateSourceLedger(ledger: OutcomeLedger, runId: string, horizon: number) {
    if (ledger.runId !== runId || !Number.isInteger(ledger.horizon) || ledger.horizon > horizon) fail('Source ledger identity or horizon differs from the saved run.');
    const key = JSON.stringify([runId, ledger.horizon]);
    let actual = sourceLedgers.get(key);
    if (!actual) {
      const prefix = restore(engine.initialCheckpoint, runId), tasks = new Map<string, string>();
      for (const [index, command] of acceptedCommands(engine).filter(c => c.at <= ledger.horizon).entries()) {
        advanceTo(prefix, command.at);
        const receipt = reissue(prefix, command, tasks, index);
        if (receipt.status !== command.receipt.status || receipt.reason !== command.receipt.reason) fail('Source ledger physical history diverges.');
      }
      advanceTo(prefix, ledger.horizon);
      actual = buildOutcomeLedger(prefix.exportRecord()); sourceLedgers.set(key, actual);
    }
    const { telemetry, timeline, protectionEvents, ...scalars } = ledger;
    const { telemetry: _telemetry, timeline: _timeline, protectionEvents: _protection, ...actualScalars } = actual;
    if (!equal(scalars, actualScalars) || telemetry.some(t => !saved.telemetry.some(known => equal(known, t) && t.simTime <= ledger.horizon)) || [...timeline, ...protectionEvents].some(e => !saved.events.some(known => equal(known, e) && e.simTime <= ledger.horizon))) fail('Source ledger values were not produced by the recorded simulation.');
  }
  function knownObservations(rows: Observation[], actorId: string, at: number) {
    const ids = new Set<string>();
    for (const observation of rows) {
      const known = observations.get(observation.id);
      if (ids.has(observation.id) || !known || !known.actorIds.includes(actorId) || !equal(known.observation, observation) || observation.receivedAt > at) fail('Observation was not available to the recorded actor.');
      ids.add(observation.id);
    }
  }
  for (const interaction of saved.interactions) {
    const first = interaction.turns[0].input;
    if (first.kind !== 'start' || !validStart(first)) fail('Interaction must start in its declared actor scope.');
    const start = first as GatewayStart;
    const horizon = horizons.get(start.runId), runIndex = runOrder.indexOf(start.runId);
    const identity = (value: { runId: string; requestId: string; actorId: string }) => value.runId === start.runId && value.requestId === start.requestId && value.actorId === start.actorId;
    const requestKey = JSON.stringify([start.runId, start.requestId]);
    if (horizon === undefined || requests.has(requestKey) || runIndex < previousRunIndex) fail('Unknown, duplicate or out-of-order interaction identity.');
    requests.add(requestKey); previousRunIndex = runIndex;
    if (interaction.turns[0].atSimTime < (lastStarted.get(start.runId) ?? 0)) fail('Interactions are not in original start order.');
    lastStarted.set(start.runId, interaction.turns[0].atSimTime);
    const canonicalProcedures = usesConversationPolicy(start)
      ? equal(start.procedures, projectCoworkerContext({ ...start, procedures: procedures.filter(procedure => start.view.allowedProcedureIds.includes(procedure.id)) }).procedures)
      : start.procedures.every(p => procedures.some(known => equal(p, known)));
    if (!canonicalProcedures || !equal(start.view.knownTopology, saved.scenario.topology)) fail('Unknown procedure or topology content.');
    if (start.debriefContext) {
      validateSourceLedger(start.debriefContext.ledger, start.runId, horizon);
      const comparison = start.debriefContext.comparison;
      if (comparison) {
        if (comparison.baseRunId !== start.runId || comparison.branchRunId === start.runId) fail('Comparison identity differs from its source.');
        validateSourceLedger(comparison.baseline, start.runId, horizon);
        if (comparison.status === 'unsupported') validateSourceLedger(comparison.validPrefix.baseline, start.runId, horizon);
      }
    }
    let previousAt = runIndex === 0 ? 0 : saved.lineage[runIndex - 1].throughSimTime;
    const evidence = new Map<string, Observation>();
    let interactionId: string | undefined;
    const callIds = new Set<string>();
    for (const [index, turn] of interaction.turns.entries()) {
      const { input: wire, reply, call, toolResult } = turn;
      if (!identity(wire) || wire.view.runId !== start.runId || wire.view.actorId !== start.actorId || wire.view.simTime !== turn.atSimTime || turn.atSimTime < previousAt || turn.atSimTime > horizon) fail('Turn identity or time differs from its interaction.');
      previousAt = turn.atSimTime;
      if (!equal(wire.view.knownTopology, saved.scenario.topology) || wire.view.crew.some(c => !saved.scenario.crew.some(known => known.id === c.id && known.role === c.role && known.name === c.name)) || wire.view.allowedProcedureIds.some(id => !procedures.some(p => p.id === id))) fail('Unknown actor or content scope.');
      knownObservations(wire.view.observations, start.actorId, turn.atSimTime);
      for (const observation of wire.view.observations) evidence.set(observation.id, observation);
      if (index > 0) {
        const prior = interaction.turns[index - 1];
        if (wire.kind !== 'continue' || prior.reply?.kind !== 'tool_request' || !prior.toolResult || wire.interactionId !== prior.reply.interactionId || wire.expectedCallId !== prior.reply.intent.callId || !equal(wire.result, prior.toolResult)) fail('Continuation does not match its recorded tool result.');
        knownObservations(wire.result.observations, start.actorId, turn.atSimTime);
      }
      const context = { ...start, view: { ...wire.view, observations: [...evidence.values()] } };
      if (reply) {
        if (!identity(reply)) fail('Reply identity differs from its request.');
        if (reply.kind === 'final' && !validateResponse(reply.response, context)) fail('Final response has invalid facts, proposals or actor identity.');
        if (reply.kind === 'fallback' && reply.facts.some(f => factValue(f, context) === undefined)) fail('Fallback cites unavailable facts.');
        if (reply.kind === 'tool_request') {
          if (!identity(reply.intent) || reply.intent.interactionId !== reply.interactionId || interactionId && interactionId !== reply.interactionId || callIds.has(reply.intent.callId)) fail('Tool identity is inconsistent or duplicated.');
          const intent = reply.intent;
          const targetPermitted = intent.tool === 'read_procedure' ? start.procedures.some(p => p.id === intent.targetId) : intent.tool === 'propose_action' && intent.action && validAction(intent.action, context) || wire.view.knownTopology.assets.some(a => a.id === intent.targetId);
          if (start.role === 'debrief' || !targetPermitted || ['inspect_asset', 'propose_action'].includes(intent.tool) && (!intent.action || intent.action.targetId !== intent.targetId || !validAction(intent.action, context))) fail('Tool target or action differs from the permitted request scope.');
          interactionId = reply.interactionId; callIds.add(reply.intent.callId);
        }
      }
      if (call) {
        if (!identity(call) || receipts.has(call.receiptId) || call.responseId !== null && responseIds.has(call.responseId)) fail('Provider receipt identity is inconsistent or duplicated.');
        receipts.add(call.receiptId); if (call.responseId !== null) responseIds.add(call.responseId);
      }
      if (toolResult) {
        if (start.interactionMode === 'advisory' && toolResult.receipt) fail('Advisory chat cannot execute a tool command.');
        if (reply?.kind !== 'tool_request' || !identity(toolResult) || toolResult.interactionId !== reply.interactionId || toolResult.callId !== reply.intent.callId) fail('Tool result has no corresponding request.');
        if (reply.intent.tool === 'inspect_asset' && toolResult.status === 'completed' || reply.intent.tool !== 'inspect_asset' && toolResult.receipt !== null) fail('Tool result status or receipt is incompatible with the tool.');
        knownObservations(toolResult.observations, start.actorId, interaction.end.atSimTime);
        if (toolResult.observations.length > 0 && (reply.intent.tool !== 'read_observations' || toolResult.observations.some(o => o.assetId !== reply.intent.targetId))) fail('Tool observations do not match the requested read.');
        if (toolResult.procedureText !== null && (reply.intent.tool !== 'read_procedure' || !start.procedures.some(p => p.id === reply.intent.targetId && p.text === toolResult.procedureText))) fail('Tool procedure was not supplied to the actor.');
        if (toolResult.receipt) {
          const receipt = toolResult.receipt;
          const command = saved.commands.find(c => equal(c.receipt, { ...receipt, runId: saved.runId }));
          const resultAt = interaction.turns[index + 1]?.atSimTime ?? interaction.end.atSimTime;
          if (reply.intent.tool !== 'inspect_asset' || !identity(receipt) || !command || !reply.intent.action || reply.intent.action.action !== 'inspect' || !reply.intent.action.args.technicianId || !equal({ ...command.intent, atSimTime: reply.intent.action.atSimTime }, reply.intent.action) || receipt.observedAt < turn.atSimTime || receipt.observedAt > resultAt || (receipt.status === 'rejected' ? toolResult.status !== 'rejected' : toolResult.status !== 'accepted')) fail('Tool acceptance does not match an ordinary engine command receipt in the request-to-result interval.');
        } else if (toolResult.status === 'accepted') fail('Accepted tool result requires an engine receipt.');
      }
    }
    const end = interaction.end, lastReply = interaction.turns.at(-1)!.reply;
    if (end.atSimTime < previousAt || end.atSimTime > horizon || end.reply && !identity(end.reply) || end.reason === 'final' && (lastReply?.kind !== 'final' || !equal(end.reply, lastReply)) || end.reason === 'fallback' && end.reply?.kind !== 'fallback') fail('Interaction ending is inconsistent with its turns.');
    if (end.reply?.kind === 'final' && !equal(lastReply, end.reply)) fail('Ending contains an unreceived final response.');
    if (end.reply?.kind === 'fallback' && end.reply.facts.length > 0 && !equal(lastReply, end.reply)) fail('Local fallback cannot invent facts.');
  }
  return saved;
}
