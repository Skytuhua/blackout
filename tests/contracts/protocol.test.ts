import { describe, expect, it } from 'vitest';
import { WorkerReplySchema, WorkerRequestSchema } from '../../src/workers/protocol';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { alarmFixture } from '../../src/shared/fixtures';
import { ScenarioSpecSchema } from '../../src/shared/schemas';
describe('worker boundary', () => {
  it('validates actual authored content and referenced service tiles', () => {
    const spec = ScenarioSpecSchema.parse(hotRestart);
    expect(spec.topology.assets.filter(a => a.kind === 'rack')).toHaveLength(8);
    for (const a of spec.topology.assets) expect(spec.topology.walkable).toContainEqual(a.serviceTile);
  });
  it('requires run and correlation identity and bounds advancement', () => {
    expect(WorkerRequestSchema.safeParse({ kind: 'advance', runId: 'run', ticks: 1 }).success).toBe(false);
    expect(WorkerRequestSchema.safeParse({ kind: 'advance', runId: 'run', correlationId: 'c', ticks: 601 }).success).toBe(false);
    expect(WorkerRequestSchema.safeParse({ kind: 'initialize', runId: 'run', correlationId: 'c', spec: hotRestart }).success).toBe(true);
  });
  it('covers projection replies and explicit stale-run errors', () => {
    expect(WorkerReplySchema.parse({ kind: 'view', runId: alarmFixture.runId, correlationId: 'c', view: alarmFixture }).kind).toBe('view');
    expect(WorkerReplySchema.parse({ kind: 'error', runId: 'old', correlationId: 'c', code: 'stale_run', message: 'This run is no longer active.' }).kind).toBe('error');
  });
  it('parses every frozen request and reply variant', () => {
    const identity = { runId: 'fixture-development', correlationId: 'fixture-correlation' };
    const checkpoint = { schemaVersion: 1, engineVersion: '1.0.0', scenarioVersion: 'hot-restart-v1', runId: identity.runId, simTime: 0, state: { fixture: true } };
    const request = { schemaVersion: 1, runId: identity.runId, requestId: 'request', actorId: 'player', intent: { action: 'pause_batch', targetId: 'site', atSimTime: 0, args: {} }, expectedEntityVersions: {}, idempotencyKey: 'once' };
    const receipt = { schemaVersion: 1, runId: identity.runId, requestId: 'request', actorId: 'player', status: 'queued', reason: 'queued', taskId: null, eta: null, evidenceIds: [], observedAt: 0 };
    const record = { schemaVersion: 1, engineVersion: '1.0.0', runId: identity.runId, scenario: hotRestart, initialCheckpoint: checkpoint, finalCheckpoint: checkpoint, commands: [], events: [], observations: [], dialogue: [], telemetry: [], provenance: { model: null, promptVersion: 'coworker-v1', procedureVersion: 'procedures-v1' } };
    for (const payload of [{ kind: 'initialize', spec: hotRestart }, { kind: 'advance', ticks: 1 }, { kind: 'command', request }, { kind: 'observe', actorId: 'player' }, { kind: 'snapshot' }, { kind: 'restore', checkpoint, newRunId: 'branch' }, { kind: 'record' }]) expect(WorkerRequestSchema.safeParse({ ...identity, ...payload }).success).toBe(true);
    for (const payload of [{ kind: 'initialized', view: alarmFixture }, { kind: 'advanced', view: alarmFixture }, { kind: 'receipt', receipt }, { kind: 'view', view: alarmFixture }, { kind: 'checkpoint', checkpoint }, { kind: 'restored', view: alarmFixture }, { kind: 'record', record }, { kind: 'error', code: 'stale_run', message: 'Run expired.' }]) expect(WorkerReplySchema.safeParse({ ...identity, ...payload }).success).toBe(true);
  });
});
