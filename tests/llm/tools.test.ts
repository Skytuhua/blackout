import { it, expect } from 'vitest';
import { alarmFixture } from '../../src/shared/fixtures';
import type { ToolIntent } from '../../src/shared/contracts';
import { start } from './fixtures';
import { executeToolIntent } from '../../src/llm/tools';
const intent: ToolIntent = { runId: start.runId, requestId: start.requestId, actorId: start.actorId, interactionId: 'interaction', callId: 'call', tool: 'read_observations', targetId: 'cooling-1', action: null };
it('reads only target observations from a permitted view', async () => {
  const result = await executeToolIntent(intent, { start });
  expect(result.status).toBe('completed');
  expect(result.observations.map(o => o.id)).toEqual(['obs-fixture-cooling']);
});
it('rejects wrong actor, unknown tool, asset and stale run without executing commands', async () => {
  for (const patch of [{ actorId: 'alex' }, { runId: 'old' }, { targetId: 'hidden' }, { tool: 'reveal_truth' }]) {
    expect((await executeToolIntent({ ...intent, ...patch } as ToolIntent, { start })).status).toBe('rejected');
  }
});
it('executes inspection once through command with observed versions and returns the original receipt', async () => {
  let commands = 0;
  const simulation = { observe: async () => alarmFixture, command: async (request: import('../../src/shared/contracts').ActionRequest) => {
    commands++;
    expect(request.expectedEntityVersions).toEqual(alarmFixture.observedEntityVersions);
    return { schemaVersion: 1 as const, runId: start.runId, requestId: start.requestId, actorId: 'player', status: 'accepted' as const, reason: 'queued', taskId: 'task', eta: 109, evidenceIds: [], observedAt: 75 };
  } };
  const inspection: ToolIntent = { ...intent, callId: 'inspection', tool: 'inspect_asset', action: { action: 'inspect', targetId: 'cooling-1', atSimTime: 75, args: { technicianId: 'alex' } } };
  const context = { start, simulation };
  const a = await executeToolIntent(inspection, context);
  const b = await executeToolIntent(inspection, context);
  expect(a.status).toBe('accepted'); expect(b).toEqual(a); expect(commands).toBe(1);
  expect((await executeToolIntent(inspection, { start, simulation: { ...simulation, observe: async () => ({ ...alarmFixture, observedEntityVersions: { 'cooling-1': 2 } }) } })).reason).toBe('stale_action');
});
it('rejects missing versions before dispatch and bounds long provider idempotency keys', async () => {
  let commands = 0;
  const inspection: ToolIntent = { ...intent, callId: 'c'.repeat(120), tool: 'inspect_asset', action: { action: 'inspect', targetId: 'cooling-1', atSimTime: 75, args: { technicianId: 'alex' } } };
  const simulation = { observe: async () => alarmFixture, command: async (request: import('../../src/shared/contracts').ActionRequest) => {
    commands++; expect(request.idempotencyKey.length).toBeLessThanOrEqual(120);
    return { schemaVersion: 1 as const, runId: start.runId, requestId: 'req', actorId: 'player', status: 'accepted' as const, reason: 'queued', taskId: 'task', eta: 109, evidenceIds: [], observedAt: 75 };
  } };
  expect((await executeToolIntent(inspection, { start, simulation })).status).toBe('accepted');
  const missing = { ...start, view: { ...start.view, observedEntityVersions: {} } };
  expect((await executeToolIntent(inspection, { start: missing, simulation: { ...simulation, observe: async () => missing.view } })).status).toBe('rejected');
  expect(commands).toBe(1);
});
