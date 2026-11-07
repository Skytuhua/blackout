import { describe, expect, it } from 'vitest';
import { alarmFixture } from '../../src/shared/fixtures';
import { makeAction, readingStatus } from '../../src/ui/presentation';

describe('operational evidence and dispatch', () => {
  it('labels missing and old evidence without implying it is current', () => {
    expect(readingStatus(null, 75)).toBe('unknown');
    expect(readingStatus({ ...alarmFixture.observations[0], observedAt: 60 }, 75)).toBe('stale');
    expect(readingStatus(alarmFixture.observations[0], 75)).toBe('fresh');
  });
  it('forms a dispatch only for an enabled affordance and eligible technician', () => {
    const affordance = alarmFixture.affordances[0];
    expect(makeAction(affordance, 75, 'alex')).toEqual({ action: 'inspect', targetId: 'cooling-1', atSimTime: 75, args: { technicianId: 'alex' } });
    expect(makeAction(affordance, 75, 'unavailable')).toBeNull();
    expect(makeAction({ ...affordance, enabled: false }, 75, 'alex')).toBeNull();
  });
});

it('does not light equipment indicators without a current observed state', async () => {
  const { indicatorState } = await import('../../src/ui/presentation');
  expect(indicatorState([], 75)).toBe('unknown');
  expect(indicatorState([{ ...alarmFixture.observations[1], observedAt: 60 }], 75)).toBe('unknown');
  expect(indicatorState(alarmFixture.observations.filter(o => o.assetId === 'cooling-1'), 75)).toBe('attention');
});

it('does not turn an empty batch ceiling into a zero-percent dispatch', async () => {
  const { parseCeiling } = await import('../../src/ui/presentation');
  expect(parseCeiling('')).toBeUndefined();
  expect(parseCeiling('50')).toBe(50);
});
