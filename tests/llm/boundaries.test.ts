import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alarmFixture } from '../../src/shared/fixtures';
import type { GatewayStart, AgentResponse } from '../../src/shared/contracts';
import { validateResponse } from '../../src/llm/validation';
import { Budget } from '../../server/llm/budget';
export const start: GatewayStart = { kind: 'start', runId: alarmFixture.runId, requestId: 'req', actorId: 'player', role: 'player', message: 'Help', view: alarmFixture, procedures: [], promptVersion: '1' };
export const final: AgentResponse = { runId: start.runId, requestId: 'req', actorId: 'player', speaker: 'player', mode: 'live', facts: [{ observationId: 'obs-fixture-temp', field: 'value' }], inference: 'Check cooling.', uncertainty: 'Inspection needed.', proposals: [] };
describe('grounding boundary', () => {
  it('accepts permitted selectors but rejects forged evidence and identity', () => {
    expect(validateResponse(final, start)).toBe(true);
    expect(validateResponse({ ...final, facts: [{ observationId: 'secret', field: 'value' }] }, start)).toBe(false);
    expect(validateResponse({ ...final, actorId: 'alex' }, start)).toBe(false);
    expect(validateResponse({ ...final, runId: 'old' }, start)).toBe(false);
  });
  it('rejects unknown targets and unauthorized ledger selectors', () => {
    expect(validateResponse({ ...final, proposals: [{ action: 'inspect', targetId: 'secret', atSimTime: 75, args: {} }] }, start)).toBe(false);
    expect(validateResponse({ ...final, facts: [{ ledgerRunId: start.runId, field: 'peakTemperatureC' }] }, start)).toBe(false);
  });
  it('permits workload proposals only when the view grants the site affordance', () => {
    const proposal = { action: 'pause_batch' as const, targetId: 'site', atSimTime: 75, args: {} };
    const scoped = { ...start, view: { ...start.view, affordances: [{ action: 'pause_batch' as const, targetId: 'site', enabled: true, reason: null, technicianIds: [], travelSeconds: null, workSeconds: 5 }] } };
    expect(validateResponse({ ...final, proposals: [proposal] }, scoped)).toBe(true);
    expect(validateResponse({ ...final, proposals: [proposal] }, start)).toBe(false);
  });
});
describe('durable allowance', () => {
  it('retains unknown reservations after restart regardless of run IDs', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'blackout-budget-')), 'usage.json');
    new Budget(path, .01).reserve(6000, 400);
    expect(() => new Budget(path, .01).reserve(6000, 400)).toThrow('budget_exhausted');
  });
  it('reconciles known usage and refuses malformed accounting', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'blackout-budget-')), 'usage.json');
    const budget = new Budget(path, .01);
    const id = budget.reserve(6000, 400);
    budget.reconcile(id, 40, 13);
    expect(() => new Budget(path, .01).reserve(6000, 400)).not.toThrow();
    expect(() => budget.reserve(-1, 1)).toThrow();
  });
  it('enforces the mission ceiling for prototype-shaped run IDs', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'blackout-budget-')), 'usage.json');
    const budget = new Budget(path);
    for (let i = 0; i < 24; i++) budget.reserve(6000, 400, '__proto__');
    expect(() => new Budget(path).reserve(6000, 400, '__proto__')).toThrow('mission_quota');
  });
});
