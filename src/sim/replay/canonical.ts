import type { Checkpoint, SimEvent } from '../../shared/contracts';
import { EngineStateSchema } from '../state';

/** Stable JSON: object keys sorted; array order retained unless explicitly normalized below. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

export const orderedEvents = (events: SimEvent[]) => [...events].sort((a, b) => a.simTime - b.simTime || a.sequence - b.sequence);

/** Non-cryptographic FNV-1a/64 fingerprint. Verification also compares canonical bytes exactly. */
export function fingerprint(value: string): string {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(value)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
  return hash.toString(16).padStart(16, '0');
}

/**
 * Checks all frozen authoritative state, scoped knowledge, pending reports, tasks/travel,
 * reservations, protection/mission timers, physical totals, telemetry and domain events.
 * Omits transport command audit/idempotency/counters; renames sequence-derived task/event
 * identities by stable engine order. Original rejected receipts are separately returned audit.
 */
export function canonicalCheckpoint(checkpoint: Checkpoint): string {
  const state = EngineStateSchema.parse(checkpoint.state);
  const tasks = new Map(state.tasks.map((t, i) => [t.public.id, `task@${i}`]));
  const events = orderedEvents(state.events).filter(e => !e.type.startsWith('command.'));
  const eventIds = new Map(events.map((e, i) => [e.id, `event@${i}`]));
  function normalize(value: unknown): unknown {
    if (typeof value === 'string') return tasks.get(value) ?? eventIds.get(value) ?? (value.startsWith('report-') && tasks.has(value.slice(7)) ? `report-${tasks.get(value.slice(7))}` : value);
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
    return value;
  }
  const { commands, idempotency: _idempotency, nextSequence: _sequence, ...authoritative } = state;
  const accepted = [...commands].sort((a, b) => a.at - b.at || a.sequence - b.sequence).filter(c => c.receipt.status !== 'rejected').map(c => {
    const { runId: _run, requestId: _request, ...receipt } = c.receipt;
    return { at: c.at, actorId: c.actorId, intent: c.intent, receipt };
  });
  return canonicalJson(normalize({ schemaVersion: checkpoint.schemaVersion, engineVersion: checkpoint.engineVersion, scenarioVersion: checkpoint.scenarioVersion, simTime: checkpoint.simTime,
    state: { ...authoritative, commands: accepted, events: events.map(({ sequence: _seq, ...e }) => e) } }));
}

export function deterministicHash(checkpoint: Checkpoint): string {
  return `replay-v1-${fingerprint(canonicalCheckpoint(checkpoint))}`;
}
