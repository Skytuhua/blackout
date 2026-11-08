import { expect, it } from 'vitest';
import { serializeRun, deserializeRun, serializeCheckpoint, deserializeCheckpoint, openRunStore } from '../../src/persistence/runs';
import { recordedRun } from './fixtures';
import { engineRecordOf } from '../../src/persistence/saved-record';

it('round-trips validated serialized records and checkpoints without accepting corrupt/versioned data', () => {
  const record = recordedRun();
  const saved = deserializeRun(serializeRun(record));
  expect(saved.schemaVersion).toBe(2);
  expect(engineRecordOf(saved)).toEqual(record);
  expect(deserializeCheckpoint(serializeCheckpoint(record.finalCheckpoint))).toEqual(record.finalCheckpoint);
  expect(() => deserializeRun('{')).toThrow(/CORRUPT/);
  expect(() => deserializeCheckpoint('null')).toThrow(/CORRUPT/);
  expect(() => deserializeRun(JSON.stringify({ ...record, engineVersion: 'future' }))).toThrow(/VERSION/);
  const corrupt = structuredClone(record); (corrupt.finalCheckpoint.state.physical as any).totals.batchCompleted = 1000000;
  expect(() => serializeRun(corrupt)).toThrow(/CORRUPT/);
});

it('reports unavailable browser storage explicitly without an in-memory fallback', async () => {
  await expect(openRunStore()).rejects.toThrow(/UNAVAILABLE/);
});
