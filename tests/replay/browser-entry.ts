import { initialize, restore } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { openRunStore } from '../../src/persistence/runs';
import { deterministicHash, verifyReplay } from '../../src/sim/replay';
import { request } from '../sim/mission-policy';

const database = 'replay-01-isolated-proof';
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

async function rawPut(key: string, value: unknown) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('runs', 'readwrite'); tx.objectStore('runs').put(value, key);
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
      assert(verifyReplay(record, 'browser-replayed').matches, 'Loaded run is deterministically replayable');
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
      await rawPut('bad', '{'); await rejected(() => store.loadRun('bad'), 'CORRUPT');
      await rejected(() => store.listRuns(), 'CORRUPT');
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
    return { corrupt: 'rejected', versionMismatch: 'rejected', badSavePreservedData: true, closedStore: 'explicit failure' };
  },
};
declare global { interface Window { replayProof: typeof api } }
window.replayProof = api;
