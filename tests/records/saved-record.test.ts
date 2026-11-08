import { expect, it, vi } from 'vitest';
import { initialize, restore } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { procedures } from '../../src/content/procedures';
import { scopeKnowledge } from '../../src/llm/context';
import { serializeRun, deserializeRun } from '../../src/persistence/runs';
import type { GatewayStart, GatewayResponse, PublicToolResult, SavedRunRecord } from '../../src/shared/contracts';
import * as savedRecords from '../../src/persistence/saved-record';
import { buildOutcomeLedger } from '../../src/sim/replay/ledger';

function fixture() {
  const engine = initialize(hotRestart, 'saved-source'); engine.step(10);
  const view = scopeKnowledge(engine.observe('alex'), ['cooling-1']);
  const start: GatewayStart = { kind: 'start', runId: view.runId, requestId: 'saved-request', actorId: 'alex', role: 'facilities', message: 'Inspect selected equipment.', view, procedures, promptVersion: 'coworker-v1' };
  const intent = { runId: view.runId, requestId: start.requestId, actorId: 'alex', interactionId: 'saved-interaction', callId: 'inspect-call', tool: 'inspect_asset' as const, targetId: 'cooling-1', action: { action: 'inspect' as const, targetId: 'cooling-1', atSimTime: 10, args: { technicianId: 'alex' } } };
  const reply: GatewayResponse = { kind: 'tool_request', runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: intent.interactionId, intent };
  const receipt = engine.applyCommand({ schemaVersion: 1, runId: start.runId, requestId: start.requestId, actorId: start.actorId, idempotencyKey: 'ordinary-inspection', expectedEntityVersions: view.observedEntityVersions, intent: intent.action });
  const result: PublicToolResult = { runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: intent.interactionId, callId: intent.callId, status: 'accepted', reason: 'inspection_receipt', receipt, observations: [], procedureText: null };
  const next = { kind: 'continue' as const, runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: intent.interactionId, expectedCallId: intent.callId, view: scopeKnowledge(engine.observe('alex'), ['cooling-1']), result };
  const final: GatewayResponse = { kind: 'final', runId: start.runId, requestId: start.requestId, actorId: start.actorId, response: { runId: start.runId, requestId: start.requestId, actorId: start.actorId, speaker: start.actorId, mode: 'live', facts: [{ observationId: view.observations[0].id, field: 'value' }], inference: 'Inspection is pending.', uncertainty: 'The cause is unverified.', proposals: [] } };
  const call = { receiptId: 'local-receipt-1', provider: 'openai' as const, responseId: 'resp_fixture_1', runId: start.runId, requestId: start.requestId, actorId: start.actorId, model: 'fixture-model', inputTokens: 40, outputTokens: 13, durationMs: 2, status: 'completed' };
  const record = engine.exportRecord();
  const saved = { ...record, schemaVersion: 2 as const, provenance: { ...record.provenance, model: call.model, promptVersion: start.promptVersion }, lineage: [], interactions: [{ turns: [{ atSimTime: 10, input: start, reply, call, toolResult: result }, { atSimTime: 10, input: next, reply: final, call: { ...call, receiptId: 'local-receipt-2', responseId: 'resp_fixture_2' }, toolResult: null }], end: { atSimTime: 10, reason: 'final' as const, reply: final, durationMs: 5 } }] };
  return { engine, record, saved };
}

it('upgrades a valid legacy engine record without inventing model history', () => {
  const { record } = fixture();
  const loaded = JSON.parse(serializeRun(record));
  expect(loaded.schemaVersion).toBe(2); expect(loaded.interactions).toEqual([]); expect(loaded.lineage).toEqual([]);
  expect(record.schemaVersion).toBe(1);
});

it('round trips exact scoped turns, ordinary tool receipts, final selectors and real-call metadata', () => {
  const { saved } = fixture();
  const loaded = deserializeRun(serializeRun(saved as SavedRunRecord));
  expect(loaded).toEqual(saved);
  loaded.interactions[0].turns[0].input.view.observations[0].value = 'changed';
  expect(saved.interactions[0].turns[0].input.view.observations[0].value).not.toBe('changed');
});

it('retains an accepted command when the interaction ends canceled before continuation', () => {
  const { saved } = fixture();
  saved.interactions[0].turns.splice(1);
  const changed = { ...saved, interactions: [{ ...saved.interactions[0], end: { atSimTime: 10, reason: 'canceled' as const, reply: null, durationMs: 5 } }] };
  const loaded = deserializeRun(serializeRun(changed));
  expect(loaded.interactions[0].turns[0].toolResult?.receipt?.status).toBe('accepted');
  expect(loaded.interactions[0].end.reply).toBeNull();
});

it('rejects a real command receipt that predates the tool request it is attributed to', () => {
  const { saved, engine } = fixture(); engine.step(50);
  const changed = { ...engine.exportRecord(), schemaVersion: 2 as const, lineage: [], interactions: structuredClone(saved.interactions) };
  const turn = changed.interactions[0].turns[0];
  turn.atSimTime = 60; turn.input.view = scopeKnowledge(engine.observe('alex'), ['cooling-1']);
  expect(turn.input.view.affordances.some(a => a.action === 'inspect' && a.targetId === 'cooling-1' && a.enabled)).toBe(true);
  if (turn.reply?.kind !== 'tool_request' || !turn.reply.intent.action) throw new Error('Fixture requires inspection');
  turn.reply.intent.action.atSimTime = 60;
  changed.interactions[0].turns.splice(1);
  changed.interactions[0].end = { atSimTime: 60, reason: 'canceled' as any, reply: null as any, durationMs: 5 };
  expect(turn.toolResult?.receipt?.observedAt).toBe(10);
  expect(() => serializeRun(changed)).toThrow(/HISTORY/);
});

it('rejects completed inspections without ordinary receipts and incoherent successful tool targets', () => {
  const { saved } = fixture();
  for (const mutate of [
    (record: any) => { record.interactions[0].turns[0].toolResult = { ...record.interactions[0].turns[0].toolResult, status: 'completed', receipt: null }; },
    (record: any) => { const turn = record.interactions[0].turns[0]; turn.reply.intent.targetId = 'unknown'; turn.reply.intent.action.targetId = 'different'; turn.toolResult = { ...turn.toolResult, status: 'completed', receipt: null }; },
  ]) {
    const changed: any = structuredClone(saved); mutate(changed);
    changed.interactions[0].turns.splice(1);
    changed.interactions[0].end = { atSimTime: 10, reason: 'canceled', reply: null, durationMs: 5 };
    expect(() => serializeRun(changed)).toThrow(/HISTORY/);
  }
});

it('accepts bounded source debrief evidence but rejects metric values not produced by the source engine', () => {
  const { engine, record } = fixture();
  const ledger = buildOutcomeLedger(record);
  const start: GatewayStart = { kind: 'start', runId: record.runId, requestId: 'saved-debrief', actorId: 'player', role: 'debrief', message: 'Explain the recorded outcome.', view: scopeKnowledge(engine.observe('player'), []), procedures: [], promptVersion: 'debrief-v1', debriefContext: { ledger: { ...ledger, telemetry: [], timeline: [], protectionEvents: [] }, comparison: null } };
  const final: GatewayResponse = { kind: 'final', runId: start.runId, requestId: start.requestId, actorId: start.actorId, response: { runId: start.runId, requestId: start.requestId, actorId: start.actorId, speaker: start.actorId, mode: 'live', facts: [{ ledgerRunId: start.runId, field: 'peakTemperatureC' }], inference: 'This is recorded simulation evidence.', uncertainty: 'The run is fictional.', proposals: [] } };
  const saved: SavedRunRecord = { ...record, schemaVersion: 2, lineage: [], interactions: [{ turns: [{ atSimTime: 10, input: start, reply: final, call: null, toolResult: null }], end: { atSimTime: 10, reason: 'final', reply: final, durationMs: 1 } }] };
  expect(deserializeRun(serializeRun(saved))).toEqual(saved);
  const changed = structuredClone(saved);
  const input = changed.interactions[0].turns[0].input;
  if (input.kind !== 'start' || !input.debriefContext) throw new Error('Fixture requires ledger');
  input.debriefContext.ledger.peakTemperatureC = 999;
  expect(() => serializeRun(changed)).toThrow(/HISTORY/);
});

it('preserves original transport provenance across an exact checkpoint resume', () => {
  const { saved } = fixture();
  const resumed = restore(saved.finalCheckpoint, 'resumed-source'); resumed.step(3);
  const inherited = { ...resumed.exportRecord(), schemaVersion: 2 as const, lineage: [{ runId: saved.runId, throughSimTime: 10 }], interactions: saved.interactions };
  const loaded = deserializeRun(serializeRun(inherited));
  expect(loaded.runId).toBe('resumed-source');
  expect(loaded.interactions).toEqual(saved.interactions);
  expect(loaded.commands[0].receipt.runId).toBe('resumed-source');
  expect(loaded.interactions[0].turns[0].toolResult?.receipt?.runId).toBe(saved.runId);
});

it('replays physical history without provider calls and returns original transcript separately', () => {
  const { saved } = fixture(); const original = structuredClone(saved);
  const noProvider = vi.fn(() => { throw new Error('Replay must never use transport'); });
  vi.stubGlobal('fetch', noProvider);
  try {
    const result = (savedRecords as any).replaySavedRun(saved, 'saved-replayed');
    expect(result.matches).toBe(true); expect(result.originalHash).toBe(result.replayHash);
    expect(result.record.schemaVersion).toBe(1);
    expect(result.sourceTranscript).toEqual({ runId: saved.runId, interactions: saved.interactions, lineage: [] });
    expect(saved).toEqual(original); expect(noProvider).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

it('rejects inconsistent endings, cross-asset read results, duplicate calls and invalid lineage', () => {
  const { saved } = fixture();
  for (const mutate of [
    (record: any) => { record.interactions[0].end.atSimTime = 9; },
    (record: any) => { record.interactions[0].turns[1].call.receiptId = record.interactions[0].turns[0].call.receiptId; },
    (record: any) => { record.lineage = [{ runId: record.runId, throughSimTime: 10 }]; },
    (record: any) => { record.lineage = [{ runId: 'unknown-origin', throughSimTime: 11 }]; },
    (record: any) => { record.interactions[0].turns[0].toolResult.observations = [record.interactions[0].turns[0].input.view.observations.find((o: any) => o.assetId === 'site')]; },
  ]) {
    const changed = structuredClone(saved); mutate(changed);
    expect(() => serializeRun(changed as any)).toThrow(/IDENTITY|CORRUPT|HISTORY/);
  }
});

it('distinguishes missing metadata from a zero-cost or fabricated provider call', () => {
  const { saved } = fixture(); const unknown = structuredClone(saved) as any;
  unknown.interactions[0].turns.forEach((turn: any) => { turn.call = null; }); unknown.provenance.model = null;
  const loaded = deserializeRun(serializeRun(unknown)) as any;
  expect(loaded.interactions[0].turns.every((turn: any) => turn.call === null)).toBe(true);
  expect(loaded.provenance.model).toBeNull();
});

it('rejects mismatched nested identities, invented evidence and forged acceptance', () => {
  const { saved } = fixture();
  for (const mutate of [
    (record: any) => { record.interactions[0].turns[1].input.expectedCallId = 'wrong-call'; },
    (record: any) => { record.interactions[0].turns[0].call.actorId = 'jules'; },
    (record: any) => { record.interactions[0].turns[0].toolResult.receipt.taskId = 'invented-task'; },
    (record: any) => { record.interactions[0].turns[1].reply.response.facts[0].observationId = 'hidden'; },
  ]) {
    const changed = structuredClone(saved); mutate(changed);
    expect(() => serializeRun(changed as any)).toThrow(/IDENTITY|CORRUPT|HISTORY/);
  }
});
