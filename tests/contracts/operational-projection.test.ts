import { expect, it } from 'vitest';
import { initialize } from '../../src/sim/engine';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { indicatorState } from '../../src/ui/presentation';

it('renders real engine equipment states and preserves stale or unknown indicators', () => {
  const engine = initialize(hotRestart, 'indicators');
  const view = engine.observe('player');
  for (const id of ['rack-1', 'cooling-1', 'ups-1']) expect(indicatorState(view.observations.filter(o => o.assetId === id), 0)).toBe('active');
  engine.step(10);
  const stopped = engine.observe('player').observations.filter(o => o.assetId === 'cooling-1');
  expect(indicatorState(stopped, 10)).toBe('attention');
  expect(indicatorState(stopped, 30)).toBe('unknown');
  expect(indicatorState([], 10)).toBe('unknown');
});
