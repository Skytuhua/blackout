import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parameters, initialHistory } from '../../server/llm/adapter';
import { Budget } from '../../server/llm/budget';
import { start } from './fixtures';

afterEach(() => vi.unstubAllEnvs());
const path = () => join(mkdtempSync(join(tmpdir(), 'blackout-model-')), 'usage.json');
function defaults() {
  for (const name of ['OPENAI_MODEL', 'OPENAI_REASONING_EFFORT', 'OPENAI_INPUT_USD_PER_MILLION', 'OPENAI_OUTPUT_USD_PER_MILLION']) vi.stubEnv(name, undefined);
}

it('uses Terra with low reasoning while preserving explicit model and effort overrides', () => {
  defaults();
  expect(parameters(start, initialHistory(start), 1)).toMatchObject({ model: 'gpt-6.1-terra', reasoning: { effort: 'low' } });
  vi.stubEnv('OPENAI_MODEL', 'gpt-5.6-luna'); vi.stubEnv('OPENAI_REASONING_EFFORT', 'none');
  expect(parameters(start, initialHistory(start), 1)).toMatchObject({ model: 'gpt-5.6-luna', reasoning: { effort: 'none' } });
  vi.stubEnv('OPENAI_REASONING_EFFORT', 'minimal');
  expect(parameters(start, initialHistory(start), 1).reasoning?.effort).toBe('minimal');
  vi.stubEnv('OPENAI_REASONING_EFFORT', 'light');
  expect(() => parameters(start, initialHistory(start), 1)).toThrow('invalid_reasoning_effort');
});

it('reserves Terra at the conservative input ceiling and retains prior ledger liabilities', () => {
  defaults(); const ledger = path();
  writeFileSync(ledger, JSON.stringify({ spent: 1, reservations: { old: .5 }, missions: [{ runId: 'kept', calls: 23 }] }));
  const budget = new Budget(ledger, 2); budget.reserve(6000, 400, 'kept');
  const state = JSON.parse(readFileSync(ledger, 'utf8'));
  expect(state.spent).toBe(1); expect(state.reservations.old).toBe(.5);
  expect(Object.values(state.reservations)).toContain(.0095);
  expect(() => new Budget(ledger, 2).reserve(1, 1, 'kept')).toThrow('mission_quota');
  expect(() => new Budget(ledger, 1.51).reserve(6000, 400)).toThrow('budget_exhausted');
});

it('settles a reservation using its originating model rates across restart and configuration changes', () => {
  defaults(); const ledger = path();
  const id = new Budget(ledger).reserve(6000, 400);
  vi.stubEnv('OPENAI_MODEL', 'gpt-5.6-luna');
  new Budget(ledger).reconcile(id, 1000, 100);
  const state = JSON.parse(readFileSync(ledger, 'utf8'));
  expect(state.spent).toBeCloseTo(.00175, 10);
  expect(state.reservations).toEqual({});
});

it('prices explicit model overrides without silently using the old model rates', () => {
  defaults(); vi.stubEnv('OPENAI_MODEL', 'custom-model');
  const ledger = path();
  expect(() => new Budget(ledger).reserve(6000, 400)).toThrow('model_pricing_unconfigured');
  vi.stubEnv('OPENAI_INPUT_USD_PER_MILLION', '3'); vi.stubEnv('OPENAI_OUTPUT_USD_PER_MILLION', '12');
  new Budget(ledger).reserve(6000, 400);
  expect(Object.values(JSON.parse(readFileSync(ledger, 'utf8')).reservations)).toEqual([.0228]);
});

it('keeps an old reservation charged when its original pricing was not recorded', () => {
  defaults(); const ledger = path();
  const original = { spent: 1, reservations: { old: .5 }, missions: [] };
  writeFileSync(ledger, JSON.stringify(original));
  expect(() => new Budget(ledger).reconcile('old', 10, 10)).toThrow('unknown_reservation_pricing');
  expect(JSON.parse(readFileSync(ledger, 'utf8'))).toEqual(original);
});
