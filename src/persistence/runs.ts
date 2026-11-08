import type { Checkpoint, RunRecord, SavedRunRecord } from '../shared/contracts';
import { CheckpointSchema, RunRecordSchema, SavedRunRecordSchema } from '../shared/schemas';
import { hotRestart, practiceScenario } from '../content/scenarios/hot-restart';
import { ENGINE_VERSION } from '../sim/engine';
import { EngineStateSchema } from '../sim/state';
import { canonicalJson, orderedEvents } from '../sim/replay/canonical';
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

export interface SavedRunSummary {
  runId: string; scenarioId: string; simTime: number;
  incompatibility?: { code: 'VERSION_MISMATCH'; engineVersion: string; scenarioVersion: string; reason: string };
}

const shippedScenarios = [hotRestart, practiceScenario];
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function identity(actual: string, expected: string) {
  if (actual !== expected) throw new ReplayDataError('IDENTITY_MISMATCH', 'Stored key and run identity differ.');
}
function archiveBoundary<T>(decode: () => T): T {
  try { return decode(); }
  catch (error) {
    if (error instanceof ReplayDataError) throw error;
    throw new ReplayDataError('CORRUPT', 'Archived data does not match its saved format.');
  }
}

/** Archive checks do not execute an incompatible engine or claim replay validity. */
function archivedCheckpoint(input: unknown, runId: string) {
  return archiveBoundary(() => {
    const checkpoint = CheckpointSchema.parse(input);
    const state = EngineStateSchema.parse(checkpoint.state);
    identity(checkpoint.runId, runId);
    if (checkpoint.scenarioVersion !== state.scenario.contentVersion) throw new ReplayDataError('IDENTITY_MISMATCH', 'Checkpoint and scenario identities differ.');
    const shipped = shippedScenarios.find(spec => spec.contentVersion === checkpoint.scenarioVersion);
    if (shipped && !equal(state.scenario, shipped)) throw new ReplayDataError('VERSION_MISMATCH', 'Saved content differs from its published version.');
    if (state.commands.some(c => c.receipt.runId !== runId || c.receipt.actorId !== c.actorId || c.receipt.observedAt !== c.at)) throw new ReplayDataError('IDENTITY_MISMATCH', 'Checkpoint command identity mismatch.');
    const totals = state.physical.totals;
    const initialBacklog = state.initialPhysical.racks.reduce((sum, rack) => sum + rack.backlog, 0);
    const backlog = state.physical.racks.reduce((sum, rack) => sum + rack.backlog, 0);
    if (Math.abs(initialBacklog + totals.batchArrivals - totals.batchCompleted - backlog) > 1e-6 || totals.criticalDelivered > totals.criticalDemand + 1e-6 || totals.interactiveDelivered > totals.interactiveDemand + 1e-6) throw new ReplayDataError('CORRUPT', 'Physical conservation mismatch.');
    if (!Number.isInteger(checkpoint.simTime) || state.telemetry.length !== checkpoint.simTime + 1 || state.telemetry.some((sample, index) => sample.simTime !== index) || state.events.some(event => event.simTime > checkpoint.simTime) || state.commands.some(command => !Number.isInteger(command.at) || command.at > checkpoint.simTime || command.receipt.status === 'queued')) throw new ReplayDataError('CORRUPT', 'Incomplete or unresolved engine history.');
    return { checkpoint, state };
  });
}

function archivedRun(input: unknown, runId: string) {
  return archiveBoundary(() => {
    if (input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion !== 1 && input.schemaVersion !== 2) throw new ReplayDataError('VERSION_MISMATCH', 'Supported saved run formats are 1 and 2.');
    const record = input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion === 1 ? RunRecordSchema.parse(input) : SavedRunRecordSchema.parse(input);
    identity(record.runId, runId);
    const first = archivedCheckpoint(record.initialCheckpoint, runId);
    const last = archivedCheckpoint(record.finalCheckpoint, runId);
    if (first.checkpoint.simTime !== 0 || [first, last].some(({ checkpoint, state }) => checkpoint.engineVersion !== record.engineVersion || !equal(state.scenario, record.scenario)) || record.provenance.procedureVersion !== record.scenario.procedureVersion) throw new ReplayDataError('IDENTITY_MISMATCH', 'Record, checkpoint or procedure identity mismatch.');
    const state = last.state;
    if (!equal([...record.commands].sort((a, b) => a.sequence - b.sequence), [...state.commands].sort((a, b) => a.sequence - b.sequence)) || !equal(orderedEvents(record.events), orderedEvents(state.events)) || !equal(record.observations, state.observations.map(row => row.observation)) || !equal(record.telemetry, state.telemetry)) throw new ReplayDataError('HISTORY_MISMATCH', 'Record histories must match the final checkpoint.');
    if (new Set(record.dialogue.map(message => message.id)).size !== record.dialogue.length || record.dialogue.some(message => message.at > last.checkpoint.simTime) || state.messages.some(row => !record.dialogue.some(message => equal(message, row.message)))) throw new ReplayDataError('HISTORY_MISMATCH', 'Recorded dialogue differs from the saved history.');
    return record;
  });
}

function incompatibleSummary(summary: SavedRunSummary, engineVersion: string, scenarioVersion: string, error: unknown): SavedRunSummary {
  if (!(error instanceof ReplayDataError) || error.code !== 'VERSION_MISMATCH' || engineVersion === ENGINE_VERSION && shippedScenarios.some(spec => spec.contentVersion === scenarioVersion)) throw error;
  return { ...summary, incompatibility: { code: 'VERSION_MISMATCH', engineVersion, scenarioVersion, reason: error.message } };
}

/** Preserve the original serialized text; metadata inspection never migrates stored bytes. */
export function inspectStoredRun(text: string, runId: string): { text: string; summary: SavedRunSummary } {
  const input = parse(text);
  try {
    const record = validateSavedRun(input); identity(record.runId, runId);
    return { text, summary: { runId, scenarioId: record.scenario.id, simTime: record.finalCheckpoint.simTime } };
  } catch (error) {
    if (!(error instanceof ReplayDataError) || error.code !== 'VERSION_MISMATCH') throw error;
    const record = archivedRun(input, runId);
    return { text, summary: incompatibleSummary({ runId, scenarioId: record.scenario.id, simTime: record.finalCheckpoint.simTime }, record.engineVersion, record.scenario.contentVersion, error) };
  }
}

export function inspectStoredCheckpoint(text: string, runId: string): { text: string; summary: SavedRunSummary } {
  const input = parse(text);
  try {
    const checkpoint = validateCheckpoint(input); identity(checkpoint.runId, runId);
    return { text, summary: { runId, scenarioId: (checkpoint.state.scenario as RunRecord['scenario']).id, simTime: checkpoint.simTime } };
  } catch (error) {
    if (!(error instanceof ReplayDataError) || error.code !== 'VERSION_MISMATCH') throw error;
    const { checkpoint, state } = archivedCheckpoint(input, runId);
    return { text, summary: incompatibleSummary({ runId, scenarioId: state.scenario.id, simTime: checkpoint.simTime }, checkpoint.engineVersion, checkpoint.scenarioVersion, error) };
  }
}

export interface RunStore {
  saveRun(record: RunRecord | SavedRunRecord): Promise<void>;
  loadRun(runId: string): Promise<SavedRunRecord | null>;
  listRuns(): Promise<SavedRunSummary[]>;
  /** Original serialized JSON, including incompatible archives; never a resume operation. */
  exportRun(runId: string): Promise<string | null>;
  removeRun(runId: string): Promise<void>;
  saveCheckpoint(checkpoint: Checkpoint): Promise<void>;
  loadCheckpoint(runId: string): Promise<Checkpoint | null>;
  listCheckpoints(): Promise<SavedRunSummary[]>;
  exportCheckpoint(runId: string): Promise<string | null>;
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
  async function read(store: 'runs' | 'checkpoints', runId: string): Promise<string | null> {
    const value: unknown = await transact(store, 'readonly', s => s.get(runId));
    if (value === undefined) return null;
    if (typeof value !== 'string') throw new ReplayDataError('CORRUPT', 'Stored value is not serialized JSON.');
    return value;
  }
  async function load<T>(store: 'runs' | 'checkpoints', runId: string, decode: (text: string) => T): Promise<T | null> {
    const text = await read(store, runId);
    if (text === null) return null;
    const decoded = decode(text);
    identity((decoded as RunRecord | Checkpoint).runId, runId);
    return decoded;
  }
  async function inspect(store: 'runs' | 'checkpoints', runId: string) {
    const text = await read(store, runId);
    return text === null ? null : (store === 'runs' ? inspectStoredRun : inspectStoredCheckpoint)(text, runId);
  }
  async function list(store: 'runs' | 'checkpoints'): Promise<SavedRunSummary[]> {
    const entries = await transact(store, 'readonly', s => s.getAllKeys());
    const summaries: SavedRunSummary[] = [];
    for (const key of entries) {
      if (typeof key !== 'string') throw new ReplayDataError('CORRUPT', 'Invalid local run key.');
      const entry = await inspect(store, key);
      if (entry) summaries.push(entry.summary);
    }
    return summaries.sort((a, b) => a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0);
  }
  return {
    async saveRun(record) { const text = serializeRun(record); await transact('runs', 'readwrite', s => s.put(text, record.runId)); },
    loadRun: runId => load('runs', runId, deserializeRun),
    listRuns: () => list('runs'),
    exportRun: async runId => (await inspect('runs', runId))?.text ?? null,
    async removeRun(runId) { await transact('runs', 'readwrite', s => s.delete(runId)); },
    async saveCheckpoint(checkpoint) { const text = serializeCheckpoint(checkpoint); await transact('checkpoints', 'readwrite', s => s.put(text, checkpoint.runId)); },
    loadCheckpoint: runId => load('checkpoints', runId, deserializeCheckpoint),
    listCheckpoints: () => list('checkpoints'),
    exportCheckpoint: async runId => (await inspect('checkpoints', runId))?.text ?? null,
    async removeCheckpoint(runId) { await transact('checkpoints', 'readwrite', s => s.delete(runId)); },
    close: () => db.close(),
  };
}
