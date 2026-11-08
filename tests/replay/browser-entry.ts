import { initialize, restore } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { openRunStore } from '../../src/persistence/runs';
import { engineRecordOf } from '../../src/persistence/saved-record';
import { scopeKnowledge } from '../../src/llm/context';
import { procedures } from '../../src/content/procedures';
import type { GatewayStart, GatewayResponse } from '../../src/shared/contracts';
import { deterministicHash, verifyReplay } from '../../src/sim/replay';
import { request } from '../sim/mission-policy';

const database = 'replay-01-isolated-proof';
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

async function rawPut(key: string, value: unknown, store: 'runs' | 'checkpoints' = 'runs') {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

async function rejected(action: () => Promise<unknown>, code: string) {
  try { await action(); } catch (error) { assert(error instanceof Error && error.message.includes(code), `Expected ${code}: ${String(error)}`); return; }
  throw new Error(`Expected explicit ${code} failure`);
}

const api = {
  async save() {
    const engine = initialize(hotRestart, 'browser-saved');
    engine.applyCommand(request(engine, 'inspect', 'rack-8', { technicianId: 'alex' })); engine.step(1);
    const record = engine.exportRecord();
    assert(record.finalCheckpoint.state.reservations !== undefined, 'Active reservations recorded');
    const store = await openRunStore(database);
    try {
      assert((await store.listRuns()).length === 0 && (await store.listCheckpoints()).length === 0, 'Fresh profile starts empty');
      await store.saveRun(record); await store.saveCheckpoint(record.finalCheckpoint);
      const upgraded = await store.loadRun(record.runId);
      assert(upgraded?.schemaVersion === 2 && upgraded.interactions.length === 0, 'Legacy save upgrades without invented history');
      if (!upgraded) throw new Error('Missing legacy upgrade');
      const start: GatewayStart = { kind: 'start', runId: record.runId, requestId: 'native-saved-turn', actorId: 'alex', role: 'facilities', message: 'What is known?', view: scopeKnowledge(engine.observe('alex'), ['rack-8']), procedures, promptVersion: 'coworker-v1' };
      const reply: GatewayResponse = { kind: 'fallback', runId: start.runId, requestId: start.requestId, actorId: start.actorId, mode: 'scripted', reason: 'scripted_mode', message: 'Use permitted observations.', facts: [] };
      await store.saveRun({ ...upgraded, interactions: [{ turns: [{ atSimTime: 1, input: start, reply, call: null, toolResult: null }], end: { atSimTime: 1, reason: 'fallback', reply, durationMs: 0 } }] });
      assert((await store.listRuns())[0]?.runId === record.runId, 'Committed run listed');
      assert((await store.listCheckpoints())[0]?.simTime === 1, 'Committed checkpoint listed');
      engine.step(99);
      return { at: 1, continuedHash: deterministicHash(engine.snapshot()), initialHash: deterministicHash(record.finalCheckpoint) };
    } finally { store.close(); }
  },
  async reloadAndResume(expected: { initialHash: string; continuedHash: string }) {
    const store = await openRunStore(database);
    try {
      const record = await store.loadRun('browser-saved'); const checkpoint = await store.loadCheckpoint('browser-saved');
      assert(record && checkpoint, 'Both persisted across actual browser restart');
      if (!record || !checkpoint) throw new Error('Missing persisted run');
      assert(deterministicHash(checkpoint) === expected.initialHash, 'Checkpoint survives restart exactly');
      assert(record.schemaVersion === 2 && record.interactions.length === 1 && record.interactions[0].turns[0].input.requestId === 'native-saved-turn' && record.interactions[0].turns[0].call === null, 'V2 exact scoped transcript survives native restart with metadata still unknown');
      assert(verifyReplay(engineRecordOf(record), 'browser-replayed').matches, 'Loaded run is deterministically replayable');
      const resumed = restore(checkpoint, 'browser-resumed'); resumed.step(99);
      assert(deterministicHash(resumed.snapshot()) === expected.continuedHash, 'Reloaded travel/knowledge resumes exactly');
      await store.saveRun(resumed.exportRecord());
      assert((await store.listRuns()).length === 2, 'Resumed branch saved independently');
      await store.removeRun('browser-saved'); await store.removeCheckpoint('browser-saved');
      assert(await store.loadRun('browser-saved') === null && await store.loadCheckpoint('browser-saved') === null, 'Remove applies to native storage');
      await store.removeRun('browser-resumed');
      assert((await store.listRuns()).length === 0 && (await store.listCheckpoints()).length === 0, 'Stores empty after own-data removal');
      return { resumedAt: 100, runCount: 0, checkpointCount: 0 };
    } finally { store.close(); }
  },
  async corruptBoundaries() {
    const store = await openRunStore(database);
    const record = initialize(hotRestart, 'bad').exportRecord();
    try {
      const archived = initialize(hotRestart, 'archived').exportRecord();
      archived.engineVersion = 'sim-02-v1';
      archived.scenario.contentVersion = 'hot-restart-v1';
      delete archived.scenario.mode;
      for (const checkpoint of [archived.initialCheckpoint, archived.finalCheckpoint]) {
        checkpoint.engineVersion = archived.engineVersion;
        checkpoint.scenarioVersion = archived.scenario.contentVersion;
        checkpoint.state.scenario = structuredClone(archived.scenario);
      }
      const runText = `\n${JSON.stringify({ ...archived, schemaVersion: 2, lineage: [], interactions: [] }, null, 2)}\n`;
      const checkpointText = ` ${JSON.stringify(archived.finalCheckpoint)}\n`;
      await store.saveRun(record); await store.saveCheckpoint(record.finalCheckpoint);
      await rawPut('archived', runText); await rawPut('archived', checkpointText, 'checkpoints');
      for (const summaries of [await store.listRuns(), await store.listCheckpoints()]) {
        assert(summaries.length === 2, 'Old and current records coexist in native storage listings');
        const old = summaries.find(summary => summary.runId === 'archived');
        assert(old?.incompatibility?.code === 'VERSION_MISMATCH' && old.scenarioId === 'hot-restart' && old.simTime === 0, 'Old save is explicitly archive-only');
        assert(JSON.stringify(summaries.find(summary => summary.runId === 'bad')) === JSON.stringify({ runId: 'bad', scenarioId: 'hot-restart', simTime: 0 }), 'Compatible summary shape remains unchanged');
      }
      await rejected(() => store.loadRun('archived'), 'VERSION_MISMATCH');
      await rejected(() => store.loadCheckpoint('archived'), 'VERSION_MISMATCH');
      assert(await store.exportRun('archived') === runText && await store.exportCheckpoint('archived') === checkpointText, 'Raw archive export preserves exact stored JSON bytes');
      assert((await store.loadRun('bad'))?.runId === 'bad' && (await store.loadCheckpoint('bad'))?.runId === 'bad', 'Incompatible neighbors do not block current resumes');
      assert(await store.exportRun('missing') === null && await store.exportCheckpoint('missing') === null, 'Missing export is explicit');
      await rawPut('wrong-key', runText); await rejected(() => store.exportRun('wrong-key'), 'IDENTITY_MISMATCH'); await store.removeRun('wrong-key');
      await rawPut('wrong-key', checkpointText, 'checkpoints'); await rejected(() => store.exportCheckpoint('wrong-key'), 'IDENTITY_MISMATCH'); await store.removeCheckpoint('wrong-key');
      assert(await store.exportRun('archived') === runText && await store.exportCheckpoint('archived') === checkpointText, 'Inspection and refused resume leave archived bytes intact');
      await store.removeRun('archived'); await store.removeCheckpoint('archived'); await store.removeCheckpoint('bad');
      await rawPut('bad', '{'); await rejected(() => store.loadRun('bad'), 'CORRUPT');
      await rejected(() => store.listRuns(), 'CORRUPT');
      await rejected(() => store.exportRun('bad'), 'CORRUPT');
      await rawPut('bad', JSON.stringify({ ...record, engineVersion: 'future' }));
      await rejected(() => store.loadRun('bad'), 'VERSION_MISMATCH');
      await rawPut('bad', record); await rejected(() => store.loadRun('bad'), 'CORRUPT');
      await rawPut('bad', JSON.stringify({ ...record, runId: 'different' }));
      await rejected(() => store.loadRun('bad'), 'IDENTITY_MISMATCH');
      await store.removeRun('bad');
      await store.saveRun(record);
      const corrupt = structuredClone(record); corrupt.finalCheckpoint.state.reservations = { site: 'ghost' };
      await rejected(() => store.saveRun(corrupt), 'CORRUPT');
      assert((await store.loadRun('bad'))?.runId === 'bad', 'Invalid save never replaces accepted bytes');
      await store.removeRun('bad');
    } finally { store.close(); }
    await rejected(() => store.listRuns(), 'FAILED');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('replay-01-future-db', 2);
      request.onupgradeneeded = () => { request.result.createObjectStore('runs'); request.result.createObjectStore('checkpoints'); };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    await rejected(() => openRunStore('replay-01-future-db'), 'VERSION_MISMATCH');
    return { corrupt: 'rejected', versionMismatch: 'rejected', incompatibleArchives: 'listed and exported exactly, resume refused', badSavePreservedData: true, closedStore: 'explicit failure' };
  },
};
declare global { interface Window { replayProof: typeof api } }
window.replayProof = api;
