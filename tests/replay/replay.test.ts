import { describe, expect, it } from 'vitest';
import * as replay from '../../src/sim/replay';
import { initialize, restore } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { request } from '../sim/mission-policy';
import { recordedRun } from './fixtures';

describe('frozen engine saved records', () => {
  it('accepts engine records whose optional command arguments were explicitly undefined', () => {
    const engine = initialize(hotRestart, 'optional-args');
    engine.applyCommand(request(engine, 'pause_batch', 'site', { technicianId: undefined, ceiling: undefined }));
    engine.step(5);
    expect(replay.validateRunRecord(engine.exportRecord()).runId).toBe('optional-args');
    expect(replay.verifyReplay(engine.exportRecord(), 'optional-replay').matches).toBe(true);
  });
  it('validates engine, content, identity, histories and actual restore structure', () => {
    const record = recordedRun();
    expect(replay.validateRunRecord(record)).toEqual(record);
    const badVersion = structuredClone(record); badVersion.engineVersion = 'sim-01-v1';
    expect(() => replay.validateRunRecord(badVersion)).toThrow(/VERSION/);
    const badScenario = structuredClone(record); badScenario.scenario.seed++;
    expect(() => replay.validateRunRecord(badScenario)).toThrow(/VERSION|IDENTITY/);
    const badIdentity = structuredClone(record); badIdentity.finalCheckpoint.runId = 'another';
    expect(() => replay.validateRunRecord(badIdentity)).toThrow(/IDENTITY/);
    const badHistory = structuredClone(record); badHistory.events.pop();
    expect(() => replay.validateRunRecord(badHistory)).toThrow(/HISTORY/);
    const badTravel = structuredClone(record.finalCheckpoint);
    (badTravel.state.reservations as Record<string, string>).controller = 'missing-task';
    expect(() => replay.validateCheckpoint(badTravel)).toThrow(/CORRUPT/);
  });

  it('reissues domain intents with new receipts, remaps canceled tasks, and retains rejected audit attempts', () => {
    const record = recordedRun();
    const result = replay.verifyReplay(record, 'replayed');
    expect(result.matches).toBe(true);
    expect(result.originalHash).toBe(result.replayHash);
    expect(result.record.runId).toBe('replayed');
    expect(result.rejectedAttempts).toEqual(record.commands.filter(c => c.receipt.status === 'rejected'));
    expect(result.record.commands.every(c => c.receipt.status !== 'rejected')).toBe(true);
    const cancel = result.record.commands.find(c => c.intent.action === 'cancel_task')!;
    const first = result.record.commands[0];
    expect(cancel.intent.args.taskId).toBe(first.receipt.taskId);
    expect(first.receipt.taskId).not.toBe(record.commands[1].receipt.taskId);
    expect(result.record.commands.every(c => c.receipt.runId === 'replayed' && c.receipt.requestId.startsWith('replay-'))).toBe(true);
    expect(result.dialogue).toEqual(record.dialogue);
  });

  it('hashes real physical/knowledge/task state, normalized keys and stable event order', () => {
    const checkpoint = recordedRun().finalCheckpoint;
    const reordered = structuredClone(checkpoint);
    reordered.state = Object.fromEntries(Object.entries(reordered.state).reverse());
    (reordered.state.events as unknown[]).reverse();
    expect(replay.deterministicHash(reordered)).toBe(replay.deterministicHash(checkpoint));
    for (const mutate of [
      (c: typeof checkpoint) => { (c.state.physical as any).racks[0].temperatureC += 0.001; },
      (c: typeof checkpoint) => { (c.state.tasks as any)[2].traveledMeters += 0.01; },
      (c: typeof checkpoint) => { (c.state.mission as any).stabilitySeconds++; },
      (c: typeof checkpoint) => { (c.state.observations as any)[0].actorIds = ['player']; },
    ]) {
      const changed = structuredClone(checkpoint); mutate(changed);
      expect(replay.deterministicHash(changed)).not.toBe(replay.deterministicHash(checkpoint));
    }
    const forged = structuredClone(recordedRun());
    (forged.finalCheckpoint.state.physical as any).racks[0].temperatureC += 0.01;
    expect(replay.verifyReplay(forged, 'detect-forged-truth').matches).toBe(false);
  });

  it('restores fractional travel, delayed reports, reservations and continued protection exactly', () => {
    const engine = initialize(hotRestart, 'checkpoint-source');
    engine.applyCommand(request(engine, 'inspect', 'rack-8', { technicianId: 'alex' }));
    engine.step(1);
    const traveling = replay.validateCheckpoint(engine.snapshot());
    expect((traveling.state.tasks as any)[0].public.status).toBe('traveling');
    const resumed = restore(traveling, 'travel-restored');
    engine.step(45); resumed.step(45);
    expect(replay.deterministicHash(resumed.snapshot())).toBe(replay.deterministicHash(engine.snapshot()));
    const eta = engine.observe('player').tasks[0].completesAt;
    // A separate record captured exactly at completion has report evidence still pending.
    const pendingEngine = restore(traveling, 'pending-source'); pendingEngine.step(eta - 1);
    const pending = replay.validateCheckpoint(pendingEngine.snapshot());
    expect((pending.state.pendingReports as any[]).length).toBe(1);
    const restoredPending = restore(pending, 'pending-restored');
    pendingEngine.step(600 - eta); restoredPending.step(600 - eta);
    expect(replay.deterministicHash(restoredPending.snapshot())).toBe(replay.deterministicHash(pendingEngine.snapshot()));
    expect(replay.verifyReplay(pendingEngine.exportRecord(), 'full-replay').matches).toBe(true);
    expect(pendingEngine.exportRecord().events.some(e => e.type === 'thermal_trip')).toBe(true);
  });
});
