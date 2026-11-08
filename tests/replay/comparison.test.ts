import { expect, it } from 'vitest';
import * as replay from '../../src/sim/replay';
import { ComparisonResultSchema } from '../../src/shared/schemas';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { successfulPolicy } from '../sim/mission-policy';
import { recordedRun } from './fixtures';

it('moves one existing cap, removes its old instance and conserves equal-horizon batch accounting', () => {
  const record = recordedRun();
  const cap = record.commands.find(c => c.intent.action === 'pause_batch' && c.receipt.status === 'accepted')!;
  const result = replay.compareEarlierCap(record, { commandSequence: cap.sequence, earlierAt: 5, branchRunId: 'earlier' });
  expect(ComparisonResultSchema.parse(result)).toEqual(result);
  expect(result.status).toBe('complete');
  if (result.status !== 'complete') throw new Error(result.reason);
  expect(result.continuationPolicy).toBe('Earlier batch cap, with the same subsequent accepted commands and external disturbances.');
  expect(result.supportedHorizon).toBe(100);
  expect(result.alternative.horizon).toBe(result.baseline.horizon);
  expect(result.baseline.batchArrivals).toBe(24000);
  expect(result.alternative.batchCompleted).toBe(result.baseline.batchCompleted - 15 * 240);
  expect(result.alternative.batchBacklog).toBe(result.baseline.batchBacklog + 15 * 240);
  expect(result.alternative.batchArrivals - result.alternative.batchCompleted).toBe(result.alternative.batchBacklog);
  expect(result.alternative.timeline.filter(e => e.type === 'task.reserved' && e.payload.action === 'pause_batch')).toHaveLength(1);
  expect(result.alternative.timeline.filter(e => e.type.startsWith('external.')).map(e => [e.simTime, e.payload])).toEqual(result.baseline.timeline.filter(e => e.type.startsWith('external.')).map(e => [e.simTime, e.payload]));
  expect(() => replay.compareEarlierCap(record, { commandSequence: cap.sequence, earlierAt: 20, branchRunId: 'bad' })).toThrow(/EARLIER/);
});

it('stops at the exact first invalid retained action with equal-prefix ledgers only', () => {
  const record = recordedRun(true);
  const cap = record.commands.find(c => c.intent.action === 'pause_batch' && c.receipt.status === 'accepted')!;
  const result = replay.compareEarlierCap(record, { commandSequence: cap.sequence, earlierAt: 9, branchRunId: 'unsupported' });
  expect(ComparisonResultSchema.parse(result)).toEqual(result);
  expect(result.status).toBe('unsupported');
  if (result.status !== 'unsupported') throw new Error('Expected an invalid retained remote task');
  expect(result.firstInvalidAction).toEqual(record.commands.find(c => c.intent.action === 'verify_recovery'));
  expect(result.reason).toBe('WORKER_BUSY');
  expect(result.supportedHorizon).toBe(10);
  expect(result.validPrefix.baseline.horizon).toBe(10);
  expect(result.validPrefix.alternative.horizon).toBe(10);
  expect(result.baseline.horizon).toBe(10);
  expect(result).not.toHaveProperty('alternative');
});

it('uses real totals, peak and protection events through a terminal physical continuation', () => {
  const engine = initialize(hotRestart, 'idle'); engine.step(600);
  const record = engine.exportRecord();
  const ledger = replay.buildOutcomeLedger(record);
  expect(ledger.horizon).toBe(600);
  expect(ledger.criticalDemand).toBe(96000);
  expect(ledger.criticalDelivered).toBe(71200);
  expect(ledger.batchArrivals).toBe(144000);
  expect(ledger.batchCompleted + ledger.batchBacklog).toBe(ledger.batchArrivals);
  expect(ledger.protectionEvents.filter(e => e.type === 'thermal_trip')).toHaveLength(8);
  expect(ledger.telemetry).toHaveLength(601);
  expect(ledger.peakTemperatureC).toBe(Math.max(...record.telemetry.map(t => t.hottestTemperatureC)));
  expect(replay.verifyReplay(record, 'idle-replay').matches).toBe(true);
});

it('replays the real successful mission and continues both policies to the recorded horizon', () => {
  const engine = initialize(hotRestart, 'mission'); successfulPolicy(engine);
  expect(engine.observe('player').mission.status).toBe('success');
  engine.step(600 - engine.observe('player').simTime);
  const record = engine.exportRecord();
  expect(replay.verifyReplay(record, 'mission-replay').matches).toBe(true);
  const cap = record.commands.find(c => c.intent.action === 'pause_batch')!;
  const result = replay.compareEarlierCap(record, { commandSequence: cap.sequence, earlierAt: 0, branchRunId: 'early-mission' });
  expect(result.status).toBe('complete');
  if (result.status !== 'complete') throw new Error(result.reason);
  expect(result.alternative.horizon).toBe(600);
  expect(result.alternative.criticalDelivered).toBe(96000);
  expect(result.alternative.batchArrivals).toBe(144000);
  expect(result.alternative.batchBacklog + result.alternative.batchCompleted).toBe(144000);
}, 30000);
