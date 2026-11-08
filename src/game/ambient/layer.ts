import type * as Phaser from 'phaser';
import type { KnowledgeView } from '../../shared/contracts';
import { sampleAmbient, type AmbientSample } from './sampling';

/** One optional Graphics object. The host owns shutdown, visibility, and the scaled clock. */
export class AmbientLayer {
  private graphics: Phaser.GameObjects.Graphics | null;
  private runId: string | null = null;
  private clockSeconds: number | null = null;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(16);
  }

  /** Returns the same sampled idle offsets the host can apply to its existing sprites. */
  update(view: KnowledgeView, animationClockSeconds: number, paused: boolean, reducedMotion: boolean): AmbientSample {
    if (!this.graphics) return { pixels: [], idleOffsets: [] };
    if (this.runId !== view.runId) this.reset(view.runId);
    if (!paused || this.clockSeconds === null) this.clockSeconds = animationClockSeconds;
    const sample = sampleAmbient(view, this.clockSeconds, reducedMotion);
    this.graphics.clear();
    for (const pixel of sample.pixels) {
      this.graphics.fillStyle(pixel.color, 1);
      this.graphics.fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
    }
    return sample;
  }

  reset(runId: string): void {
    if (!this.graphics) return;
    this.runId = runId;
    this.clockSeconds = null;
    this.graphics.clear();
  }

  destroy(): void {
    if (!this.graphics) return;
    this.graphics.clear();
    this.graphics.destroy();
    this.graphics = null;
    this.runId = null;
    this.clockSeconds = null;
  }
}
