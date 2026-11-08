import { expect, it } from 'vitest';
import { atlasFrame } from '../../src/game/atlas-frame';
it('renders the nine-frame master safely without ever selecting the whole atlas', () => {
  const master = new Set(['__BASE', 'floor_0', 'wall_0', 'wall_1', 'rack', 'cooling', 'fan_0', 'commander_s_idle', 'portrait_commander']);
  expect(atlasFrame('floor_1', master)).toBe('floor_0');
  expect(atlasFrame('floor_2', master)).toBe('floor_0');
  expect(atlasFrame('commander_n_walk1', master)).toBe('commander_s_idle');
  expect(atlasFrame('electrical_s_idle', master)).toBeNull();
  expect(atlasFrame('badge_unknown', master)).toBeNull();
  expect(atlasFrame('__BASE', master)).toBeNull();
  expect(atlasFrame('rack', master)).toBe('rack');
});
