import type { Checkpoint, RunRecord } from '../shared/contracts';
import { ReplayDataError, validateCheckpoint, validateRunRecord } from '../sim/replay/validation';

function parse(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new ReplayDataError('CORRUPT', 'Saved data is not valid JSON.'); }
}
export const serializeRun = (record: RunRecord): string => JSON.stringify(validateRunRecord(record));
export const deserializeRun = (text: string): RunRecord => validateRunRecord(parse(text));
export const serializeCheckpoint = (checkpoint: Checkpoint): string => JSON.stringify(validateCheckpoint(checkpoint));
export const deserializeCheckpoint = (text: string): Checkpoint => validateCheckpoint(parse(text));

export class StorageError extends Error {
  constructor(public readonly code: 'UNAVAILABLE' | 'BLOCKED' | 'VERSION_MISMATCH' | 'FAILED', detail: string) { super(`${code}: ${detail}`); this.name = 'StorageError'; }
}

export interface SavedRunSummary { runId: string; scenarioId: string; simTime: number }
export interface RunStore {
  saveRun(record: RunRecord): Promise<void>;
  loadRun(runId: string): Promise<RunRecord | null>;
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
  async function list(store: 'runs' | 'checkpoints'): Promise<SavedRunSummary[]> {
    const entries = await transact(store, 'readonly', s => s.getAllKeys());
    const summaries: SavedRunSummary[] = [];
    for (const key of entries) {
      if (typeof key !== 'string') throw new ReplayDataError('CORRUPT', 'Invalid local run key.');
      if (store === 'runs') {
        const record = await load(store, key, deserializeRun);
        if (record) summaries.push({ runId: key, scenarioId: record.scenario.id, simTime: record.finalCheckpoint.simTime });
      } else {
        const checkpoint = await load(store, key, deserializeCheckpoint);
        if (checkpoint) summaries.push({ runId: key, scenarioId: (checkpoint.state.scenario as RunRecord['scenario']).id, simTime: checkpoint.simTime });
      }
    }
    return summaries.sort((a, b) => a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0);
  }
  return {
    async saveRun(record) { const text = serializeRun(record); await transact('runs', 'readwrite', s => s.put(text, record.runId)); },
    loadRun: runId => load('runs', runId, deserializeRun),
    listRuns: () => list('runs'),
    async removeRun(runId) { await transact('runs', 'readwrite', s => s.delete(runId)); },
    async saveCheckpoint(checkpoint) { const text = serializeCheckpoint(checkpoint); await transact('checkpoints', 'readwrite', s => s.put(text, checkpoint.runId)); },
    loadCheckpoint: runId => load('checkpoints', runId, deserializeCheckpoint),
    listCheckpoints: () => list('checkpoints'),
    async removeCheckpoint(runId) { await transact('checkpoints', 'readwrite', s => s.delete(runId)); },
    close: () => db.close(),
  };
}
