import { afterEach, expect, it, vi } from 'vitest';
import type { GatewayInput, GatewayResponse, PublicMessage, SimulationEngine } from '../../src/shared/contracts';
import { initialize, restore } from '../../src/sim/engine';
import { hotRestart, practiceScenario } from '../../src/content/scenarios/hot-restart';
import { runCoworker } from '../../src/llm/interaction';
import { deserializeRun, serializeRun } from '../../src/persistence/runs';
import { engineRecordOf, replaySavedRun } from '../../src/persistence/saved-record';
import { deterministicHash } from '../../src/sim/replay/canonical';
import { request } from '../sim/mission-policy';

afterEach(() => vi.unstubAllGlobals());

// Exercise the actual wire recorder and engine; only the HTTP provider boundary is offline.
async function recordedInteraction(runId = 'archive-source') {
  const engine = initialize(hotRestart, runId); engine.step(10);
  const wire: GatewayInput[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/cancel')) return new Response('{}');
    const input: GatewayInput = JSON.parse(String(init.body)); wire.push(input);
    const identity = { runId: input.runId, requestId: input.requestId, actorId: input.actorId };
    const reply: GatewayResponse = wire.length < 3
      ? { kind: 'tool_request', ...identity, interactionId: 'archive-tools', intent: { ...identity, interactionId: 'archive-tools', callId: `tool-${wire.length}`, tool: wire.length === 1 ? 'read_observations' : 'read_procedure', targetId: wire.length === 1 ? 'cooling-1' : 'hot-restart-v1', action: null } }
      : { kind: 'final', ...identity, response: { ...identity, speaker: input.actorId, mode: 'live', facts: [], inference: 'Inspect the prerequisite before deciding.', uncertainty: 'No repair has been verified.', proposals: [] } };
    return new Response(JSON.stringify(reply), { headers: { 'X-Blackout-Call': JSON.stringify({ ...identity, receiptId: `receipt-${wire.length}`, provider: 'openai', responseId: `response-${wire.length}`, model: `observed-model-${wire.length}`, inputTokens: null, outputTokens: null, durationMs: 7, status: 'completed' }) } });
  });
  const result = await runCoworker({ simulation: { observe: async (id = 'player') => engine.observe(id), command: async (command: Parameters<SimulationEngine['applyCommand']>[0]) => engine.applyCommand(command) }, runId, actorId: 'alex', targetId: 'cooling-1', message: 'What is known?', signal: new AbortController().signal, onTool: async () => { if (wire.length === 1) engine.step(5); } });
  expect(result.recording?.turns).toHaveLength(3);
  return { engine, interaction: result.recording!, wire };
}

const hostMessage = (id = 'host-question'): PublicMessage => ({ id, at: 10, speaker: 'player', text: 'What is known?', evidenceIds: [], mode: 'system' });

// Dynamic loading makes the absent API an assertion failure in the initial RED run.
async function archiveType() {
  const module = await import('../../src/persistence/host-archive').catch(() => null);
  expect(module?.HostArchive, 'The packet requires the HostArchive export').toBeTypeOf('function');
  return module!.HostArchive;
}

it('archives exact scoped wire/provider data and host dialogue without changing physical history or losing engine reports', async () => {
  const { engine, interaction, wire } = await recordedInteraction();
  const HostArchive = await archiveType();
  const archive = new HostArchive(engine.observe('player').runId);
  const original = structuredClone(interaction), message = hostMessage();
  archive.capture(null); archive.capture(interaction); archive.message(message);
  interaction.turns[0].input.view.observations.length = 0; message.text = 'mutated by caller';
  engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' })); engine.step(65);
  const record = engine.exportRecord(), saved = deserializeRun(serializeRun(archive.build(record)));
  expect(saved.schemaVersion).toBe(2); expect(saved.lineage).toEqual([]);
  expect(saved.interactions).toEqual([original]);
  expect(saved.interactions[0].turns.map(turn => turn.input)).toEqual(wire);
  expect(saved.interactions[0].turns[2].call).toMatchObject({ responseId: 'response-3', model: 'observed-model-3', inputTokens: null, outputTokens: null });
  expect(saved.dialogue).toEqual(expect.arrayContaining([...record.dialogue, hostMessage()]));
  expect(record.dialogue.some(row => row.id.startsWith('report-'))).toBe(true);
  expect(saved.dialogue).toHaveLength(record.dialogue.length + 1);
  expect(saved.provenance).toEqual({ ...record.provenance, model: 'observed-model-3', promptVersion: 'coworker-v1' });
  expect(deterministicHash(saved.finalCheckpoint)).toBe(deterministicHash(record.finalCheckpoint));
  expect(replaySavedRun(saved, 'archive-replay').matches).toBe(true);
  saved.interactions.length = 0; saved.dialogue.length = 0;
  expect(archive.build(record).interactions).toEqual([original]);
  expect(archive.build(record).dialogue).toContainEqual(hostMessage());
});

it('resumes multiple generations with exact inherited identities, dialogue, provenance and checkpoint lineage', async () => {
  const { engine, interaction } = await recordedInteraction(); const HostArchive = await archiveType();
  const original = new HostArchive('archive-source'); original.capture(interaction); original.message(hostMessage());
  const source = original.build(engine.exportRecord()), inherited = structuredClone(source);
  const archive = new HostArchive('archive-child', source);
  source.interactions.length = 0; source.dialogue.length = 0;
  const resumed = restore(inherited.finalCheckpoint, 'archive-child'); resumed.step(5);
  const saved = archive.build(resumed.exportRecord());
  expect(saved.lineage).toEqual([{ runId: 'archive-source', throughSimTime: 15 }]);
  expect(saved.interactions).toEqual(inherited.interactions);
  expect(saved.interactions[0].turns[0].input.runId).toBe('archive-source');
  expect(saved.dialogue).toEqual(expect.arrayContaining(inherited.dialogue));
  expect(saved.provenance).toEqual(inherited.provenance);
  const grandchild = new HostArchive('archive-grandchild', saved);
  const next = restore(saved.finalCheckpoint, 'archive-grandchild'); next.step(1);
  expect(grandchild.build(next.exportRecord()).lineage).toEqual([{ runId: 'archive-source', throughSimTime: 15 }, { runId: 'archive-child', throughSimTime: 20 }]);
  expect(deterministicHash(saved.finalCheckpoint)).toBe(deterministicHash(resumed.snapshot()));
  expect(engineRecordOf(saved).schemaVersion).toBe(1);
  expect(() => new HostArchive('archive-source', inherited)).toThrow(/IDENTITY/);
  expect(() => new HostArchive('archive-source', saved)).toThrow(/IDENTITY/);
});

it('deduplicates exact captures and messages while rejecting conflicting and wrong-run inputs atomically', async () => {
  const { engine, interaction } = await recordedInteraction(); const HostArchive = await archiveType();
  const archive = new HostArchive('archive-source');
  archive.capture(interaction); archive.capture(structuredClone(interaction));
  archive.message(hostMessage()); archive.message(hostMessage());
  const conflict = structuredClone(interaction); conflict.end.durationMs++;
  expect(() => archive.capture(conflict)).toThrow(/IDENTITY|HISTORY/);
  const wrong = structuredClone(interaction); wrong.turns[0].input.runId = 'other';
  expect(() => archive.capture(wrong)).toThrow(/IDENTITY/);
  expect(() => archive.message({ ...hostMessage(), text: 'conflict' })).toThrow(/IDENTITY|HISTORY/);
  expect(() => archive.build(initialize(hotRestart, 'other').exportRecord())).toThrow(/IDENTITY/);
  const saved = archive.build(engine.exportRecord());
  expect(saved.interactions).toEqual([interaction]);
  expect(saved.dialogue.filter(row => row.id === 'host-question')).toEqual([hostMessage()]);
});

it('retains unknown model provenance, validates build content and rejects practice and incompatible records', async () => {
  const HostArchive = await archiveType(); const engine = initialize(hotRestart, 'no-provider');
  const archive = new HostArchive('no-provider');
  expect(archive.build(engine.exportRecord()).provenance).toEqual(engine.exportRecord().provenance);
  const bad = engine.exportRecord(); bad.events.length = 0;
  engine.step(10); const corrupt = engine.exportRecord(); corrupt.events.length = 0;
  expect(() => archive.build(corrupt)).toThrow(/HISTORY/);
  expect(() => archive.build({ ...bad, engineVersion: 'sim-01-v1' })).toThrow(/VERSION/);
  expect(() => new HostArchive('practice').build(initialize(practiceScenario, 'practice').exportRecord())).toThrow(/VERSION/);
});

it('preserves source provenance when a resumed run has not observed a new model or prompt', async () => {
  const { engine, interaction } = await recordedInteraction(); const HostArchive = await archiveType();
  const archive = new HostArchive('archive-source'); archive.capture(interaction);
  const source = archive.build(engine.exportRecord());
  source.provenance = { ...source.provenance, model: 'original-model-provenance', promptVersion: 'original-prompt-provenance' };
  const resumed = restore(source.finalCheckpoint, 'provenance-child');
  const child = new HostArchive('provenance-child', source);
  expect(() => child.capture(interaction)).toThrow(/IDENTITY/);
  expect(child.build(resumed.exportRecord()).provenance).toEqual(source.provenance);
});
