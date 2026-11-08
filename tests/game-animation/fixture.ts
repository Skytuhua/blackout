import * as Phaser from 'phaser';
import { AmbientLayer, type AmbientSample } from '../../src/game/ambient';
import { workingView } from './fixtures';

class MotionFixture extends Phaser.Scene {
  view = workingView();
  layer!: AmbientLayer;
  sample: AmbientSample = { pixels: [], idleOffsets: [] };
  private clock = 0;
  private crewImages = new Map<string, Phaser.GameObjects.Image>();
  preload() { this.load.atlas('facility', '/assets/facility-v2.png', '/assets/facility-v2.json'); }
  create() {
    const topology = this.view.knownTopology;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) {
      const floor = topology.walkable.some(p => p.x === x && p.y === y) || topology.assets.some(a => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height);
      this.add.image(x * 16, y * 16, 'facility', floor ? 'floor_0' : y === 0 || y === 7 || y === 11 ? 'wall_0' : 'wall_1').setOrigin(0);
    }
    for (const asset of topology.assets) this.add.image(asset.x * 16, asset.y * 16, 'facility', asset.kind === 'generator' ? 'generator_0' : asset.kind).setOrigin(0).setDisplaySize(asset.width * 16, asset.height * 16).setDepth(4);
    for (const crew of this.view.crew) if (crew.role !== 'remote') this.crewImages.set(crew.id, this.add.image(0, 0, 'facility', `${crew.role}_s_idle`).setOrigin(0).setDepth(15));
    this.layer = new AmbientLayer(this);
    this.events.once('shutdown', () => this.layer.destroy());
    this.renderAt(1.37, false, false);
    window.animationFixture = {
      render: (clock, paused = false, reducedMotion = false) => this.renderAt(clock, paused, reducedMotion),
      cancel: () => { this.view.tasks[0].status = 'canceled'; },
      reset: () => {
        const next = workingView(); next.runId = 'reset-fixture'; next.observations = []; next.tasks = []; next.crew = [];
        this.view = next; this.clock = 0; this.layer.reset(next.runId);
      },
      destroy: () => this.layer.destroy(),
      diagnostics: () => ({ objects: this.children.length, graphics: this.children.list.filter(o => o.type === 'Graphics').length, commands: this.children.list.filter(o => o.type === 'Graphics').map(o => (o as Phaser.GameObjects.Graphics).commandBuffer.length), listeners: this.input.eventNames().map(name => [String(name), this.input.listenerCount(name)]), sample: this.sample }),
    };
  }
  renderAt(clock: number, paused: boolean, reducedMotion: boolean) {
    if (!paused) this.clock = clock;
    this.sample = this.layer.update(this.view, clock, paused, reducedMotion);
    for (const [id, image] of this.crewImages) {
      const crew = this.view.crew.find(c => c.id === id);
      image.setVisible(!!crew);
      if (!crew) continue;
      const task = this.view.tasks.find(t => t.id === crew.taskId && t.actorId === crew.id);
      const working = task && ['working', 'inspecting'].includes(task.status) && this.view.simTime >= task.arrivalAt;
      image.setTexture('facility', `${crew.role}_s_${working && !reducedMotion ? `work${Math.floor(this.clock * 4) % 2}` : 'idle'}`).setOrigin(0);
      const offset = this.sample.idleOffsets.find(p => p.actorId === id);
      image.setPosition(Math.round(crew.x * 16 + 2) + (offset?.x ?? 0), Math.round(crew.y * 16) + (offset?.y ?? 0));
    }
    return this.sample;
  }
}

interface FixtureApi {
  render(clock: number, paused?: boolean, reducedMotion?: boolean): AmbientSample;
  cancel(): void;
  reset(): void;
  destroy(): void;
  diagnostics(): { objects: number; graphics: number; commands: number[]; listeners: (string | number)[][]; sample: AmbientSample };
}
declare global { interface Window { animationFixture?: FixtureApi } }

const scale = new URLSearchParams(location.search).get('scale') === '1' ? 1 : 3;
new Phaser.Game({ type: Phaser.CANVAS, parent: 'world', width: 320, height: 192, zoom: scale, pixelArt: true, roundPixels: true, banner: false, audio: { noAudio: true }, scene: MotionFixture });
