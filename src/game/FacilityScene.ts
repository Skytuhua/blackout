import * as Phaser from 'phaser';
import type { KnowledgeView } from '../shared/contracts';
import { indicatorState, readingStatus } from '../ui/presentation';

export type MapOverlay = 'none' | 'temperature' | 'power';
type SceneView = { view: KnowledgeView; selectedId: string | null; overlay: MapOverlay };

export class FacilityScene extends Phaser.Scene {
  private state: SceneView;
  private choose: (id: string) => void;
  constructor(state: SceneView, choose: (id: string) => void) { super('facility'); this.state = state; this.choose = choose; }
  preload() {
    this.load.spritesheet('tiles', '/assets/floor-wall.png', { frameWidth: 16, frameHeight: 16 });
    this.load.image('rack', '/assets/rack.png'); this.load.image('cooling', '/assets/cooling.png'); this.load.image('technician', '/assets/technician.png');
  }
  create() { this.drawView(); }
  setView(state: SceneView) { this.state = state; if (this.sys.isActive()) this.drawView(); }
  private drawView() {
    this.children.removeAll(true);
    const { view, selectedId, overlay } = this.state;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) this.add.image(x * 16, y * 16, 'tiles', x === 0 || y === 0 || x === 19 || y === 11 ? 1 : 0).setOrigin(0);
    const graphics = this.add.graphics().setDepth(2);
    for (const asset of view.knownTopology.assets) {
      const x = Math.round(asset.x * 16), y = Math.round(asset.y * 16);
      if (asset.kind === 'rack' || asset.kind === 'cooling') this.add.image(x, y, asset.kind).setOrigin(0);
      else { graphics.fillStyle(0x315a68); graphics.fillRect(x + 1, y + 1, asset.width * 16 - 2, asset.height * 16 - 2); graphics.lineStyle(1, 0x83adba); graphics.strokeRect(x + 2, y + 2, asset.width * 16 - 4, asset.height * 16 - 4); }
      const indicator = indicatorState(view.observations.filter(o => o.assetId === asset.id), view.simTime);
      if (indicator !== 'unknown') { graphics.fillStyle(indicator === 'active' ? 0x45d5e8 : 0xf4b860); graphics.fillRect(x + 3, y + 3, 2, 2); }
      const field = overlay === 'temperature' ? 'temperature' : 'power';
      const reading = overlay === 'none' ? undefined : view.observations.filter(o => o.assetId === asset.id && o.field.toLowerCase().includes(field)).sort((a,b) => b.observedAt - a.observedAt)[0];
      if (overlay !== 'none') { const status = readingStatus(reading ?? null, view.simTime); graphics.lineStyle(2, status === 'unknown' ? 0x92a8b7 : status === 'stale' ? 0xf4b860 : 0x45d5e8); graphics.strokeRect(x, y, asset.width * 16, asset.height * 16); }
      if (selectedId === asset.id) { graphics.lineStyle(2, 0xf4b860); graphics.strokeRect(x - 1, y - 1, asset.width * 16 + 2, asset.height * 16 + 2); }
      this.add.zone(x, y, Math.max(16, asset.width * 16), Math.max(16, asset.height * 16)).setOrigin(0).setInteractive().on('pointerdown', () => this.choose(asset.id));
    }
    for (const crew of view.crew.filter(c => c.role !== 'remote')) this.add.image(Math.round(crew.x * 16 + 2), Math.round(crew.y * 16), 'technician').setOrigin(0);
  }
}
