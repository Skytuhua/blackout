import type * as Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { AmbientLayer, sampleAmbient } from '../../src/game/ambient';
import { fixture, workingView } from './fixtures';

function setup() {
  const graphics = { clear: vi.fn(), fillStyle: vi.fn(), fillRect: vi.fn(), destroy: vi.fn(), setDepth: vi.fn().mockReturnThis() };
  const scene = { add: { graphics: vi.fn(() => graphics) }, events: { on: vi.fn() }, time: { addEvent: vi.fn() }, tweens: { add: vi.fn() } };
  const layer = new AmbientLayer(scene as unknown as Phaser.Scene);
  return { layer, graphics, scene };
}

describe('one persistent optional ambient layer', () => {
  it('freezes exact nonzero phase for pause, including host visibility-as-pause', () => {
    const { layer } = setup(), view = workingView();
    const before = layer.update(view, 1.37, false, false);
    expect(before.pixels.length).toBeGreaterThan(0);
    expect(layer.update(view, 15.1, true, false)).toEqual(before);
    expect(layer.update(view, 99, true, false)).toEqual(before);
    expect(layer.update(view, 1.37, false, false)).toEqual(before);
    expect(layer.update(view, 1.87, false, false)).toEqual(sampleAmbient(view, 1.87));
  });
  it('still removes canceled work and stale observations while paused', () => {
    const { layer } = setup(), view = workingView();
    layer.update(view, 1.37, false, false);
    view.tasks[0].status = 'canceled'; view.simTime = 90;
    expect(layer.update(view, 100, true, false).pixels).toEqual([]);
  });
  it('switches reduced motion to a stable state and restores the frozen phase', () => {
    const { layer } = setup(), view = workingView();
    const before = layer.update(view, 1.37, false, false);
    expect(layer.update(view, 90, true, true)).toEqual(sampleAmbient(view, 0, true));
    expect(layer.update(view, 91, true, true)).toEqual(sampleAmbient(view, 0, true));
    expect(layer.update(view, 92, true, false)).toEqual(before);
  });
  it('resets idempotently, changes run without old phases/effects, and destroys once', () => {
    const { layer, graphics } = setup();
    layer.update(workingView(), 5.9, false, false);
    layer.reset('new'); layer.reset('new');
    const view = fixture(); view.runId = 'new'; view.observations = []; view.crew = [];
    expect(layer.update(view, 2.3, true, false)).toEqual({ pixels: [], idleOffsets: [] });
    const next = workingView(); next.runId = 'automatic-reset';
    expect(layer.update(next, 3.2, true, false)).toEqual(sampleAmbient(next, 3.2));
    layer.destroy(); layer.destroy(); layer.reset('after-destroy');
    const count = graphics.clear.mock.calls.length;
    expect(layer.update(next, 5, false, false)).toEqual({ pixels: [], idleOffsets: [] });
    expect(graphics.destroy).toHaveBeenCalledTimes(1);
    expect(graphics.clear.mock.calls.length).toBe(count);
  });
  it('does not grow display objects, listeners, tweens, timers or drawing buffers', () => {
    const { layer, graphics, scene } = setup(), view = workingView();
    layer.update(view, 0, false, false);
    graphics.clear.mockClear();
    let maximumDraws = 0;
    for (let i = 0; i < 2000; i++) {
      graphics.fillRect.mockClear();
      const sample = layer.update(view, i / 60, false, false);
      expect(graphics.fillRect.mock.calls.length).toBe(sample.pixels.length);
      maximumDraws = Math.max(maximumDraws, sample.pixels.length);
    }
    expect(maximumDraws).toBeGreaterThan(0);
    expect(scene.add.graphics).toHaveBeenCalledTimes(1);
    expect(graphics.clear).toHaveBeenCalledTimes(2000);
    expect(scene.events.on).not.toHaveBeenCalled();
    expect(scene.time.addEvent).not.toHaveBeenCalled();
    expect(scene.tweens.add).not.toHaveBeenCalled();
  });
});
