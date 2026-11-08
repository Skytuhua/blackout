import { expect, it } from 'vitest';
import { serializeRun, deserializeRun, serializeCheckpoint, deserializeCheckpoint, inspectStoredRun, inspectStoredCheckpoint, openRunStore } from '../../src/persistence/runs';
import { recordedRun } from './fixtures';
import { engineRecordOf } from '../../src/persistence/saved-record';
import type { ScenarioSpec } from '../../src/shared/contracts';

function archivedRun() {
  const record = recordedRun();
  record.engineVersion = 'sim-02-v1';
  record.scenario.contentVersion = 'hot-restart-v1';
  delete record.scenario.mode;
  for (const checkpoint of [record.initialCheckpoint, record.finalCheckpoint]) {
    checkpoint.engineVersion = record.engineVersion;
    checkpoint.scenarioVersion = record.scenario.contentVersion;
    checkpoint.state.scenario = structuredClone(record.scenario);
  }
  return record;
}

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

it('preserves the compatible summary shape and exact serialized text', () => {
  const record = recordedRun();
  const runText = `\n${JSON.stringify(record, null, 2)}\n`;
  const checkpointText = ` ${JSON.stringify(record.finalCheckpoint)}\n`;
  const summary = { runId: record.runId, scenarioId: record.scenario.id, simTime: record.finalCheckpoint.simTime };
  expect(inspectStoredRun(runText, record.runId)).toEqual({ text: runText, summary });
  expect(inspectStoredCheckpoint(checkpointText, record.runId)).toEqual({ text: checkpointText, summary });
});

it.each([1, 2])('summarizes saved host format %i with old engine/content without permitting resume or changing bytes', schemaVersion => {
  const record = archivedRun();
  const input = schemaVersion === 1 ? record : { ...record, schemaVersion: 2, lineage: [], interactions: [] };
  const runText = `\n${JSON.stringify(input, null, 2)}\n`;
  const checkpointText = `\n${JSON.stringify(record.finalCheckpoint, null, 2)}\n`;
  for (const archived of [inspectStoredRun(runText, record.runId), inspectStoredCheckpoint(checkpointText, record.runId)]) {
    expect(archived.summary).toMatchObject({
      runId: record.runId, scenarioId: record.scenario.id, simTime: record.finalCheckpoint.simTime,
      incompatibility: { code: 'VERSION_MISMATCH', engineVersion: 'sim-02-v1', scenarioVersion: 'hot-restart-v1' },
    });
  }
  expect(inspectStoredRun(runText, record.runId).text).toBe(runText);
  expect(inspectStoredCheckpoint(checkpointText, record.runId).text).toBe(checkpointText);
  expect(() => deserializeRun(runText)).toThrow(/VERSION_MISMATCH/);
  expect(() => deserializeCheckpoint(checkpointText)).toThrow(/VERSION_MISMATCH/);
});

it.each(['engine', 'content'])('keeps a %s-only version mismatch archiveable and nonresumable', changedVersion => {
  const record = recordedRun();
  if (changedVersion === 'engine') record.engineVersion = 'sim-02-v1';
  else record.scenario.contentVersion = 'hot-restart-v1';
  for (const checkpoint of [record.initialCheckpoint, record.finalCheckpoint]) {
    checkpoint.engineVersion = record.engineVersion;
    checkpoint.scenarioVersion = record.scenario.contentVersion;
    checkpoint.state.scenario = structuredClone(record.scenario);
  }
  const runText = JSON.stringify(record);
  const checkpointText = JSON.stringify(record.finalCheckpoint);
  expect(inspectStoredRun(runText, record.runId).summary.incompatibility).toMatchObject({
    engineVersion: record.engineVersion, scenarioVersion: record.scenario.contentVersion,
  });
  expect(inspectStoredCheckpoint(checkpointText, record.runId).summary.incompatibility?.code).toBe('VERSION_MISMATCH');
  expect(() => deserializeRun(runText)).toThrow(/VERSION_MISMATCH/);
  expect(() => deserializeCheckpoint(checkpointText)).toThrow(/VERSION_MISMATCH/);
});

it('rejects malformed archive envelopes, states and unknown host formats', () => {
  const record = archivedRun();
  expect(() => inspectStoredRun('{', record.runId)).toThrow(/CORRUPT/);
  expect(() => inspectStoredCheckpoint('null', record.runId)).toThrow(/CORRUPT/);
  expect(() => inspectStoredRun(JSON.stringify({ runId: record.runId, schemaVersion: 1, engineVersion: record.engineVersion }), record.runId)).toThrow(/CORRUPT/);
  expect(() => inspectStoredRun(JSON.stringify({ ...record, schemaVersion: 99 }), record.runId)).toThrow(/VERSION_MISMATCH/);
  const badState = structuredClone(record.finalCheckpoint); delete badState.state.physical;
  expect(() => inspectStoredCheckpoint(JSON.stringify(badState), record.runId)).toThrow(/CORRUPT/);
});

it('enforces storage-key and nested identities even for incompatible archives', () => {
  const record = archivedRun();
  expect(() => inspectStoredRun(JSON.stringify(record), 'different')).toThrow(/IDENTITY_MISMATCH/);
  expect(() => inspectStoredCheckpoint(JSON.stringify(record.finalCheckpoint), 'different')).toThrow(/IDENTITY_MISMATCH/);
  const wrongRun = structuredClone(record); wrongRun.finalCheckpoint.runId = 'different';
  expect(() => inspectStoredRun(JSON.stringify(wrongRun), record.runId)).toThrow(/IDENTITY_MISMATCH/);
  const wrongEngine = structuredClone(record); wrongEngine.initialCheckpoint.engineVersion = 'different';
  expect(() => inspectStoredRun(JSON.stringify(wrongEngine), record.runId)).toThrow(/IDENTITY_MISMATCH/);
  const wrongContent = structuredClone(record.finalCheckpoint); wrongContent.scenarioVersion = 'different';
  expect(() => inspectStoredCheckpoint(JSON.stringify(wrongContent), record.runId)).toThrow(/IDENTITY_MISMATCH/);
  const wrongScenario = structuredClone(record); wrongScenario.scenario.seed++;
  expect(() => inspectStoredRun(JSON.stringify(wrongScenario), record.runId)).toThrow(/IDENTITY_MISMATCH/);
});

it('keeps corruption checks for current data and structural history checks for old data', () => {
  const current = recordedRun();
  const corrupt = structuredClone(current); (corrupt.finalCheckpoint.state.physical as any).totals.batchCompleted = 1000000;
  expect(() => inspectStoredRun(JSON.stringify(corrupt), current.runId)).toThrow(/CORRUPT/);
  const changedContent = structuredClone(current.finalCheckpoint);
  (changedContent.state.scenario as ScenarioSpec).profile.coolingTrainKw++;
  expect(() => inspectStoredCheckpoint(JSON.stringify(changedContent), current.runId)).toThrow(/VERSION_MISMATCH/);
  const archived = archivedRun(); archived.events = [];
  expect(() => inspectStoredRun(JSON.stringify(archived), archived.runId)).toThrow(/HISTORY_MISMATCH/);
  const corruptArchive = archivedRun(); (corruptArchive.finalCheckpoint.state.physical as any).totals.batchCompleted = 1000000;
  expect(() => inspectStoredRun(JSON.stringify(corruptArchive), corruptArchive.runId)).toThrow(/CORRUPT/);
});
