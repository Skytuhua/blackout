import { afterEach, expect, it, vi } from 'vitest';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { runCoworker } from '../../src/llm/interaction';
import { parameters, initialHistory } from '../../server/llm/adapter';
import { projectCoworkerContext, coworkerReplyVocabulary } from '../../src/llm/conversation-policy';
import { procedures } from '../../src/content/procedures';
import type { GatewayStart } from '../../src/shared/contracts';
import { HostArchive } from '../../src/persistence/host-archive';
import { deserializeRun, serializeRun } from '../../src/persistence/runs';
import { replaySavedRun } from '../../src/persistence/saved-record';

afterEach(() => vi.unstubAllGlobals());
it('projects generic help before its exact wire, retains a rejected raw final and registers no proposal', async () => {
  const engine = initialize(hotRestart, 'policy-host'); engine.step(20); let wire: GatewayStart | undefined;
  const command = vi.fn();
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    if (path.endsWith('/cancel')) return new Response('{}');
    wire = JSON.parse(String(init.body)); const input = wire!;
    return new Response(JSON.stringify({ kind: 'final', runId: input.runId, requestId: input.requestId, actorId: input.actorId, response: { runId: input.runId, requestId: input.requestId, actorId: input.actorId, speaker: input.actorId, mode: 'live', facts: [], inference: 'The controller has failed. Repair it, resume jobs, then verify recovery.', uncertainty: '', proposals: [] } }));
  });
  const result = await runCoworker({ simulation: { observe: async actor => engine.observe(actor ?? 'player'), command }, runId: 'policy-host', actorId: 'alex', targetId: 'controller', message: 'What should I do?', signal: new AbortController().signal, interactionMode: 'advisory', promptVersion: 'coworker-v2' });
  expect(wire!.view.affordances).toEqual([]);
  expect(JSON.stringify(wire!.procedures)).not.toContain('ceiling');
  expect(result.reply).toMatchObject({ kind: 'fallback', reason: 'unsafe_narrative' });
  expect(result.recording?.turns[0].reply?.kind).toBe('final');
  expect(result.authorizations).toEqual([]); expect(command).not.toHaveBeenCalled();
});

it('supplies strict vocabulary and in-world task context for the new prompt version', () => {
  const engine = initialize(hotRestart, 'policy-params');
  const start = projectCoworkerContext({ kind: 'start', runId: 'policy-params', requestId: 'ask', actorId: 'alex', role: 'facilities', message: 'What should I do?', view: engine.observe('alex'), procedures, interactionMode: 'advisory', promptVersion: 'coworker-v2' });
  const params = parameters(start, initialHistory(start), 1);
  const format = params.text!.format as any;
  expect(format.schema.properties.inference.enum).toEqual(coworkerReplyVocabulary(start).inference);
  const context = JSON.parse((initialHistory(start)[0] as { content: string }).content);
  expect(context.view.taskFields).not.toContain('completesAt');
});

it('keeps Sam’s own permitted cooling and hottest-rack evidence on the bounded wire', async () => {
  const engine = initialize(hotRestart, 'sam-context'); engine.step(20); let wire: GatewayStart | undefined;
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => { wire = JSON.parse(String(init.body)); return new Response(JSON.stringify({ kind: 'fallback', runId: wire!.runId, requestId: wire!.requestId, actorId: 'sam', mode: 'scripted', reason: 'scripted', message: 'Offline.', facts: [] })); });
  await runCoworker({ simulation: { observe: async actor => engine.observe(actor ?? 'player'), command: vi.fn() }, runId: 'sam-context', actorId: 'sam', targetId: null, message: 'What do you see?', signal: new AbortController().signal, interactionMode: 'advisory', promptVersion: 'coworker-v2' });
  expect(wire!.view.observations.some(observation => observation.assetId === 'cooling-1' && observation.field === 'running' && observation.value === false)).toBe(true);
  expect(wire!.view.observations.some(observation => observation.field.includes('temperature'))).toBe(true);
});

it('saves exact v2 role excerpts and offline fallback while rejecting edited procedure prose', async () => {
  const engine = initialize(hotRestart, 'v2-save'); engine.step(20);
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => { const input = JSON.parse(String(init.body)); return new Response(JSON.stringify({ kind: 'fallback', runId: input.runId, requestId: input.requestId, actorId: input.actorId, mode: 'scripted', reason: 'scripted', message: 'Offline.', facts: [] })); });
  const result = await runCoworker({ simulation: { observe: async actor => engine.observe(actor ?? 'player'), command: vi.fn() }, runId: 'v2-save', actorId: 'alex', targetId: 'controller', message: 'What should I do?', signal: new AbortController().signal, interactionMode: 'advisory', promptVersion: 'coworker-v2' });
  const archive = new HostArchive('v2-save'); archive.capture(result.recording);
  const saved = deserializeRun(serializeRun(archive.build(engine.exportRecord())));
  expect(saved.interactions).toEqual([result.recording]);
  const legacy = await runCoworker({ simulation: { observe: async actor => engine.observe(actor ?? 'player'), command: vi.fn() }, runId: 'v2-save', actorId: 'alex', targetId: 'controller', message: 'Help', signal: new AbortController().signal, interactionMode: 'advisory', promptVersion: 'coworker-v1' });
  archive.capture(legacy.recording);
  const mixed = deserializeRun(serializeRun(archive.build(engine.exportRecord())));
  expect(mixed.interactions).toEqual([result.recording, legacy.recording]);
  expect(replaySavedRun(mixed, 'mixed-replay').matches).toBe(true);
  const first = saved.interactions[0].turns[0].input; if (first.kind !== 'start') throw new Error('Missing original start');
  first.procedures[0].text += ' Then repair everything.';
  expect(() => serializeRun(saved)).toThrow(/HISTORY_MISMATCH/);
});
