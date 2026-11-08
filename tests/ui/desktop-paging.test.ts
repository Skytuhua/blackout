import { describe, expect, it } from 'vitest';
import { paginateText, replaceDraftPage } from '../../src/ui/paging';
import { proposalForConfirmation, radioReport } from '../../src/ui/desktop-copy';
import { alarmFixture } from '../../src/shared/fixtures';
import type { DesktopRadioExchange } from '../../src/shared/contracts';

describe('lossless measured paging', () => {
  it('retains all whitespace, long IDs and code points through any page size', () => {
    const text = `Report\n${'x'.repeat(280)}\n\n  🌡️ evidence retained\n`;
    for (const capacity of [1, 7, 48]) {
      const pages = paginateText(text, candidate => Array.from(candidate).length <= capacity);
      expect(pages.join('')).toBe(text);
      expect(pages.every(p => Array.from(p).length <= capacity)).toBe(true);
      expect(pages.some(p => /[\uD800-\uDBFF]$/.test(p))).toBe(false);
    }
  });
  it('replaces only the edited page and enforces the total 1600 character draft limit', () => {
    expect(replaceDraftPage('abcdef', 2, 4, 'XYZ')).toBe('abXYZef');
    const draft = `${'a'.repeat(1500)}${'b'.repeat(100)}`;
    expect(replaceDraftPage(draft, 0, 100, 'z'.repeat(300))).toBe(`${'z'.repeat(100)}${draft.slice(100)}`);
  });
});

describe('radio authority and provenance', () => {
  const proposal = { action: 'inspect' as const, targetId: 'cooling-1', atSimTime: 50, args: { technicianId: 'alex' } };
  const exchange: DesktopRadioExchange = {
    start: { kind: 'start', runId: alarmFixture.runId, requestId: 'request', actorId: 'alex', role: 'facilities', message: 'Check evidence', view: alarmFixture, procedures: [], promptVersion: 'test' },
    view: alarmFixture, targetId: 'cooling-1', reply: { kind: 'final', runId: alarmFixture.runId, requestId: 'request', actorId: 'alex', response: { runId: alarmFixture.runId, requestId: 'request', actorId: 'alex', speaker: 'Alex', mode: 'scripted', facts: [{ observationId: 'obs-fixture-cooling', field: 'value' }], inference: 'A hypothesis', uncertainty: 'Needs verification', proposals: [proposal] } },
    tools: [], intents: [], calls: [], durationMs: 0,
  };
  it('returns the original proposal object and original simulation time', () => {
    expect(proposalForConfirmation(exchange, 0, alarmFixture.runId)).toBe(proposal);
    expect(proposalForConfirmation(exchange, 0, 'reset-run')).toBeNull();
    expect(proposalForConfirmation(exchange, 9, alarmFixture.runId)).toBeNull();
  });
  it('labels inference and uncertainty and resolves facts only from the exchange view', () => {
    const text = radioReport(exchange);
    expect(text).toContain('not_ready'); expect(text).toContain('INFERENCE'); expect(text).toContain('UNCERTAINTY');
    expect(radioReport({ ...exchange, view: { ...alarmFixture, observations: [] } })).toContain('Unavailable citation');
  });
});
