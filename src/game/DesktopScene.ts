import * as Phaser from 'phaser';
import type { DesktopGameProps, Point } from '../shared/contracts';
import { indicatorState, readingStatus } from '../ui/presentation';
import { Commander, nearbyAsset, pointKey, routePosition, terminal, type Direction } from './desktop-world';
import { atlasFrame } from './atlas-frame';

export type DesktopSceneState = Pick<DesktopGameProps, 'view' | 'selectedAssetId' | 'selectedCrewId' | 'paused' | 'speed' | 'session'> & { reducedMotion: boolean };
export type DesktopSceneEvents = { asset: (id: string) => void; crew: (id: string) => void; floor: (point: Point) => void; moved: () => void; pose: (position: Point) => void; art: (ready: boolean) => void };
const keys: Record<string, Direction> = { w: 'n', ArrowUp: 'n', d: 'e', ArrowRight: 'e', s: 's', ArrowDown: 's', a: 'w', ArrowLeft: 'w' };

/** One persistent display tree and one pointer listener for the lifetime of the world. */
export class DesktopScene extends Phaser.Scene {
  private state: DesktopSceneState;
  private eventsOut: DesktopSceneEvents;
  commander: Commander;
  private worldFocused = false;
  private presentationTime = 0;
  private clock = 0;
  private topologyKey = '';
  private terrain: Phaser.GameObjects.Image[] = [];
  private equipment = new Map<string, Phaser.GameObjects.Image>();
  private badges = new Map<string, Phaser.GameObjects.Image>();
  private workers = new Map<string, Phaser.GameObjects.Image>();
  private fans: Phaser.GameObjects.Image[] = [];
  private commanderSprite!: Phaser.GameObjects.Image;
  private marks!: Phaser.GameObjects.Graphics;
  private hasAtlas = false;
  private availableFrames = new Set<string>();
  constructor(state: DesktopSceneState, events: DesktopSceneEvents, private atlasExpected = false) {
    super('desktop-facility'); this.state = state; this.eventsOut = events; this.commander = new Commander(state.view.knownTopology); this.presentationTime = state.view.simTime;
  }
  preload() {
    if (this.atlasExpected) this.load.atlas('facility-v2', '/assets/facility-v2.png', '/assets/facility-v2.json');
    // Explicit development fallback. The integrated release must supply facility-v2.
    this.load.spritesheet('desktop-legacy-tiles', '/assets/floor-wall.png', { frameWidth: 16, frameHeight: 16 });
    for (const name of ['rack', 'cooling', 'technician']) this.load.image(`desktop-legacy-${name}`, `/assets/${name}.png`);
  }
  create() {
    this.hasAtlas = this.textures.exists('facility-v2') && this.textures.get('facility-v2').has('floor_0');
    if (this.hasAtlas) this.availableFrames = new Set(this.textures.get('facility-v2').getFrameNames());
    this.eventsOut.art(this.hasAtlas && this.availableFrames.size >= 111);
    this.marks = this.add.graphics().setDepth(8);
    this.commanderSprite = this.sprite(0, 0, 'commander_s_idle', 'technician').setDepth(20);
    this.fans = [this.sprite(9 * 16, 16, 'fan_0', 'cooling'), this.sprite(12 * 16, 16, 'fan_0', 'cooling')];
    this.fans.forEach(f => f.setDisplaySize(16, 16).setDepth(3));
    this.input.on('pointerdown', this.pointer, this);
    this.reconcile();
    this.eventsOut.pose(this.commander.position);
  }
  setView(state: DesktopSceneState) {
    const reset = state.view.runId !== this.state.view.runId;
    if (reset) { this.commander.clear(); this.commander = new Commander(state.view.knownTopology); this.clock = 0; this.eventsOut.pose(this.commander.position); }
    if (reset || state.view.simTime !== this.state.view.simTime) this.presentationTime = state.view.simTime;
    if (reset || state.paused || terminal(state.view) || state.session === 'welcome') this.clearKeys();
    this.state = state;
    if (this.marks) this.reconcile();
  }
  focusWorld(focused: boolean) { this.worldFocused = focused; if (!focused) this.clearKeys(); }
  clearKeys() { this.commander.clear(); }
  handleKey(key: string, down: boolean) {
    if (!down) { const direction = keys[key]; if (direction) this.commander.release(direction); return; }
    if (!this.worldFocused || this.state.paused || terminal(this.state.view) || this.state.session === 'welcome') return;
    const direction = keys[key];
    if (direction) this.commander.hold(direction);
    if (key.toLowerCase() === 'e') this.inspectNearby();
  }
  nudge(direction: Direction) {
    if (this.state.paused || terminal(this.state.view) || this.state.session === 'welcome') return;
    this.commander.clear(); this.commander.hold(direction);
    if (this.commander.advance(.5, 1)) { this.eventsOut.moved(); this.eventsOut.pose(this.commander.position); }
    this.commander.clear();
  }
  inspectNearby() {
    const asset = nearbyAsset(this.state.view, this.commander.position);
    if (asset) this.eventsOut.asset(asset.id);
  }
  diagnostics() { return { objects: this.children.length, pointerListeners: this.input.listenerCount('pointerdown'), equipment: this.equipment.size, crew: this.workers.size, atlas: this.hasAtlas, position: { ...this.commander.position }, clock: this.clock }; }
  private sprite(x: number, y: number, frame: string, fallback: string) {
    const safeFrame = atlasFrame(frame, this.availableFrames);
    return this.add.image(x, y, safeFrame ? 'facility-v2' : `desktop-legacy-${fallback}`, safeFrame ?? undefined).setOrigin(0);
  }
  private frame(sprite: Phaser.GameObjects.Image, name: string) { const safeFrame = atlasFrame(name, this.availableFrames); if (safeFrame) sprite.setTexture('facility-v2', safeFrame); }
  private pointer(pointer: Phaser.Input.Pointer) {
    const { view } = this.state, point = { x: Math.floor(pointer.x / 16), y: Math.floor(pointer.y / 16) };
    const crew = view.crew.find(c => { if (c.role === 'remote') return false; const pose = routePosition(c, view.tasks.find(t => t.id === c.taskId), this.presentationTime, view.knownTopology); return Math.abs(pose.x + .5 - pointer.x / 16) < .45 && Math.abs(pose.y + .5 - pointer.y / 16) < .55; });
    if (crew) { this.eventsOut.crew(crew.id); return; }
    const asset = view.knownTopology.assets.find(a => point.x >= a.x && point.x < a.x + a.width && point.y >= a.y && point.y < a.y + a.height);
    if (asset) { this.eventsOut.asset(asset.id); return; }
    this.eventsOut.floor(point);
  }
  private reconcile() {
    const { view } = this.state, topology = view.knownTopology;
    const topologyKey = JSON.stringify(topology);
    if (this.topologyKey !== topologyKey) {
      this.topologyKey = topologyKey;
      for (const tile of this.terrain) tile.destroy(); this.terrain = [];
      const walkable = new Set(topology.walkable.map(pointKey));
      for (let y = 0; y < topology.height; y++) for (let x = 0; x < topology.width; x++) {
        const assetCell = topology.assets.some(a => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height);
        const floor = walkable.has(`${x},${y}`) || assetCell;
        const frame = floor ? `floor_${(x * 7 + y * 3) % 3}` : `wall_${y === 0 || y === 7 || y === 11 ? 0 : x === 0 || x === 19 || x === 7 || x === 14 ? 1 : 2}`;
        const image = this.hasAtlas ? this.sprite(x * 16, y * 16, frame, 'tiles') : this.add.image(x * 16, y * 16, 'desktop-legacy-tiles', floor ? 0 : 1).setOrigin(0);
        this.terrain.push(image.setDepth(0));
      }
    }
    for (const [id, image] of this.equipment) if (!topology.assets.some(a => a.id === id)) { image.destroy(); this.equipment.delete(id); this.badges.get(id)?.destroy(); this.badges.delete(id); }
    for (const asset of topology.assets) {
      let image = this.equipment.get(asset.id);
      if (!image) { image = this.sprite(0, 0, asset.kind === 'generator' ? 'generator_0' : asset.kind, asset.kind === 'cooling' ? 'cooling' : 'rack'); this.equipment.set(asset.id, image); }
      image.setPosition(asset.x * 16, asset.y * 16).setDepth(4).setDisplaySize(asset.width * 16, asset.height * 16);
      if (this.availableFrames.has('badge_unknown') && !this.badges.has(asset.id)) this.badges.set(asset.id, this.sprite(asset.x * 16 + asset.width * 16 - 8, asset.y * 16, 'badge_unknown', 'rack').setDepth(7));
    }
    for (const [id, image] of this.workers) if (!view.crew.some(c => c.id === id && c.role !== 'remote')) { image.destroy(); this.workers.delete(id); }
    for (const crew of view.crew.filter(c => c.role !== 'remote')) if (!this.workers.has(crew.id)) this.workers.set(crew.id, this.sprite(0, 0, `${crew.role}_s_idle`, 'technician').setDepth(15));
  }
  update(_time: number, delta: number) {
    if (!this.marks) return;
    const { view, paused, speed, reducedMotion, session } = this.state;
    const running = !paused && !terminal(view) && session !== 'welcome';
    const dt = Math.min(delta, 100) / 1000;
    if (running) { this.clock += dt * speed; this.presentationTime = Math.min(view.simTime + 1, this.presentationTime + dt * speed); }
    if (running && this.worldFocused && this.commander.advance(dt, speed)) { this.eventsOut.moved(); this.eventsOut.pose(this.commander.position); }
    const walkFrame = Math.floor(this.clock * 6) % 2, workFrame = Math.floor(this.clock * 4) % 2;
    this.commanderSprite.setPosition(Math.round(this.commander.position.x * 16 + 2), Math.round(this.commander.position.y * 16));
    this.frame(this.commanderSprite, `commander_${this.commander.facing}_${this.commander.moving && !reducedMotion ? `walk${walkFrame}` : 'idle'}`);
    this.marks.clear();
    for (const asset of view.knownTopology.assets) {
      const observations = view.observations.filter(o => o.assetId === asset.id), state = indicatorState(observations, view.simTime);
      const stale = observations.length > 0 && observations.every(o => readingStatus(o, view.simTime) === 'stale');
      const badge = this.badges.get(asset.id); if (badge) this.frame(badge, `badge_${stale ? 'stale' : state === 'attention' ? 'warning' : state}`);
      if (!this.hasAtlas) { this.marks.fillStyle(state === 'active' ? 0x45d5e8 : state === 'attention' ? 0xf4b860 : 0x92a8b7); this.marks.fillRect(asset.x * 16 + 3, asset.y * 16 + 3, 2, 2); }
      if (asset.kind === 'generator') this.frame(this.equipment.get(asset.id)!, `generator_${state === 'active' && !reducedMotion ? Math.floor(this.clock * 4) % 3 : 0}`);
      if (asset.id === this.state.selectedAssetId) { this.marks.lineStyle(1, 0x45d5e8); this.marks.strokeRect(asset.x * 16 - 1, asset.y * 16 - 1, asset.width * 16 + 2, asset.height * 16 + 2); }
    }
    this.fans.forEach((fan, i) => { const asset = view.knownTopology.assets.filter(a => a.kind === 'cooling')[i]; const active = asset && indicatorState(view.observations.filter(o => o.assetId === asset.id), view.simTime) === 'active'; this.frame(fan, `fan_${active && !reducedMotion ? Math.floor(this.clock * 6) % 4 : 0}`); });
    for (const crew of view.crew.filter(c => c.role !== 'remote')) {
      const task = view.tasks.find(t => t.id === crew.taskId), pose = reducedMotion ? crew : routePosition(crew, task, this.presentationTime, view.knownTopology), image = this.workers.get(crew.id)!;
      const dx = pose.x * 16 + 2 - image.x, dy = pose.y * 16 - image.y;
      const facing = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'w' : 'e' : dy < 0 ? 'n' : 's';
      const moving = task?.status === 'traveling' && crew.taskId === task.id;
      const working = task && ['working', 'inspecting'].includes(task.status) && crew.taskId === task.id && this.presentationTime >= task.arrivalAt;
      this.frame(image, `${crew.role}_${facing}_${reducedMotion ? 'idle' : moving ? `walk${walkFrame}` : working ? `work${workFrame}` : 'idle'}`);
      image.setPosition(Math.round(pose.x * 16 + 2), Math.round(pose.y * 16));
      if (crew.id === this.state.selectedCrewId) {
        this.marks.lineStyle(1, 0xf4b860); this.marks.strokeRect(Math.round(pose.x * 16), Math.round(pose.y * 16), 16, 16);
        if (task?.status === 'traveling' && task.path.length > 1) { this.marks.lineStyle(1, 0x45d5e8, .8); this.marks.beginPath(); this.marks.moveTo(task.path[0].x * 16 + 8, task.path[0].y * 16 + 8); for (const p of task.path.slice(1)) this.marks.lineTo(p.x * 16 + 8, p.y * 16 + 8); this.marks.strokePath(); }
      }
    }
  }
}
