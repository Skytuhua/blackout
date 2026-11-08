import type { Checkpoint, RunRecord, SavedRunRecord } from '../shared/contracts';
import { ReplayDataError, validateCheckpoint } from '../sim/replay/validation';
import { validateSavedRun } from './saved-record';

function parse(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new ReplayDataError('CORRUPT', 'Saved data is not valid JSON.'); }
}
export const serializeRun = (record: RunRecord | SavedRunRecord): string => JSON.stringify(validateSavedRun(record));
export const deserializeRun = (text: string): SavedRunRecord => validateSavedRun(parse(text));
export const serializeCheckpoint = (checkpoint: Checkpoint): string => JSON.stringify(validateCheckpoint(checkpoint));
export const deserializeCheckpoint = (text: string): Checkpoint => validateCheckpoint(parse(text));

export class StorageError extends Error {
  constructor(public readonly code: 'UNAVAILABLE' | 'BLOCKED' | 'VERSION_MISMATCH' | 'FAILED', detail: string) { super(`${code}: ${detail}`); this.name = 'StorageError'; }
}

export interface SavedRunSummary { runId: string; scenarioId: string; simTime: number; unavailableReason?: string }
export interface RunStore {
  saveRun(record: RunRecord | SavedRunRecord): Promise<void>;
  loadRun(runId: string): Promise<SavedRunRecord | null>;
  exportRun(runId: string): Promise<string | null>;
  listRuns(): Promise<SavedRunSummary[]>;
  removeRun(runId: string): Promise<void>;
  saveCheckpoint(checkpoint: Checkpoint): Promise<void>;
  loadCheckpoint(runId: string): Promise<Checkpoint | null>;
  listCheckpoints(): Promise<SavedRunSummary[]>;
  removeCheckpoint(runId: string): Promise<void>;
  close(): void;
}

/** Native IndexedDB only. Caller owns close(); failures never redirect to another backend. */
export async function openRunStore(databaseName = 'blackout-local-runs'): Promise<RunStore> {
  let factory: IDBFactory;
  try { factory = globalThis.indexedDB; } catch { throw new StorageError('UNAVAILABLE', 'Browser denied IndexedDB access.'); }
  if (!factory) throw new StorageError('UNAVAILABLE', 'IndexedDB is unavailable in this environment.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try { request = factory.open(databaseName, 1); } catch { reject(new StorageError('UNAVAILABLE', 'Cannot open local database.')); return; }
    let settled = false;
    request.onupgradeneeded = () => {
      for (const name of ['runs', 'checkpoints']) request.result.createObjectStore(name);
    };
    request.onblocked = () => { settled = true; reject(new StorageError('BLOCKED', 'Another connection blocks the database version.')); };
    request.onerror = () => { settled = true; reject(new StorageError(request.error?.name === 'VersionError' ? 'VERSION_MISMATCH' : 'UNAVAILABLE', request.error?.name ?? 'Database open failed.')); };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      const database = request.result;
      if (!['runs', 'checkpoints'].every(name => database.objectStoreNames.contains(name))) { database.close(); reject(new ReplayDataError('CORRUPT', 'Local database stores are missing.')); return; }
      resolve(database);
    };
  });
  db.onversionchange = () => db.close();

  function transact<T>(store: 'runs' | 'checkpoints', mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      let request: IDBRequest<T>;
      try { transaction = db.transaction(store, mode); request = operation(transaction.objectStore(store)); }
      catch { reject(new StorageError('FAILED', 'Local database is closed or inaccessible.')); return; }
      // A successful request is not a committed save: wait for the whole transaction.
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(new StorageError('FAILED', transaction.error?.name ?? request.error?.name ?? 'IndexedDB transaction failed.'));
    });
  }
  async function load<T>(store: 'runs' | 'checkpoints', runId: string, decode: (text: string) => T): Promise<T | null> {
    const value: unknown = await transact(store, 'readonly', s => s.get(runId));
    if (value === undefined) return null;
    if (typeof value !== 'string') throw new ReplayDataError('CORRUPT', 'Stored value is not serialized JSON.');
    const decoded = decode(value);
    if ((decoded as RunRecord | Checkpoint).runId !== runId) throw new ReplayDataError('IDENTITY_MISMATCH', 'Stored key and run identity differ.');
    return decoded;
  }
  function unavailable(runId: string, value: unknown, code: ReplayDataError['code']): SavedRunSummary {
    let metadata: unknown;
    try { metadata = typeof value === 'string' ? JSON.parse(value) : null; } catch { metadata = null; }
    const object = (input: unknown): Record<string, unknown> => input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const scenarioId = object(object(metadata).scenario).id;
    const simTime = object(object(metadata).finalCheckpoint).simTime;
    return {
      runId,
      scenarioId: typeof scenarioId === 'string' && scenarioId.length > 0 && scenarioId.length <= 120 && !/[\u0000-\u001f\u007f]/.test(scenarioId) ? scenarioId : 'Unknown scenario',
      simTime: typeof simTime === 'number' && Number.isSafeInteger(simTime) && simTime >= 0 ? simTime : 0,
      unavailableReason: `${code}: Stored run cannot resume with this build.`,
    };
  }
  async function list(store: 'runs' | 'checkpoints'): Promise<SavedRunSummary[]> {
    const entries = await transact(store, 'readonly', s => s.getAllKeys());
    const summaries: SavedRunSummary[] = [];
    for (const key of entries) {
      if (store === 'runs') {
        const value: unknown = await transact(store, 'readonly', s => s.get(key));
        if (value === undefined) continue;
        if (typeof key !== 'string') { summaries.push(unavailable('[invalid local run key]', value, 'CORRUPT')); continue; }
        try {
          if (typeof value !== 'string') throw new ReplayDataError('CORRUPT', 'Stored value is not serialized JSON.');
          const record = deserializeRun(value);
          if (record.runId !== key) throw new ReplayDataError('IDENTITY_MISMATCH', 'Stored key and run identity differ.');
          summaries.push({ runId: key, scenarioId: record.scenario.id, simTime: record.finalCheckpoint.simTime });
        } catch (error) {
          if (!(error instanceof ReplayDataError)) throw error;
          summaries.push(unavailable(key, value, error.code));
        }
      } else {
        if (typeof key !== 'string') throw new ReplayDataError('CORRUPT', 'Invalid local run key.');
        const checkpoint = await load(store, key, deserializeCheckpoint);
        if (checkpoint) summaries.push({ runId: key, scenarioId: (checkpoint.state.scenario as RunRecord['scenario']).id, simTime: checkpoint.simTime });
      }
    }
    return summaries.sort((a, b) => a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0);
  }
  return {
    async saveRun(record) { const text = serializeRun(record); await transact('runs', 'readwrite', s => s.put(text, record.runId)); },
    loadRun: runId => load('runs', runId, deserializeRun),
    async exportRun(runId) {
      const value: unknown = await transact('runs', 'readonly', s => s.get(runId));
      if (value === undefined) return null;
      if (typeof value !== 'string') throw new ReplayDataError('CORRUPT', 'Stored value is not serialized JSON.');
      return value;
    },
    listRuns: () => list('runs'),
    async removeRun(runId) { await transact('runs', 'readwrite', s => s.delete(runId)); },
    async saveCheckpoint(checkpoint) { const text = serializeCheckpoint(checkpoint); await transact('checkpoints', 'readwrite', s => s.put(text, checkpoint.runId)); },
    loadCheckpoint: runId => load('checkpoints', runId, deserializeCheckpoint),
    listCheckpoints: () => list('checkpoints'),
    async removeCheckpoint(runId) { await transact('checkpoints', 'readwrite', s => s.delete(runId)); },
    close: () => db.close(),
  };
}
