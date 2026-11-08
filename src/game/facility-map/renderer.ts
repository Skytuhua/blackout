import atlas from '../../../public/assets/facility-v2.json';
import type { FacilityMapProps, FacilityTopology } from '../../shared/facility-map';
import { freshRunning } from '../../ui/presentation';
import { routePosition } from '../desktop-world';
import { assetEvidence, PresentationClock, roomViewport } from './model';

export type ConnectionKind = FacilityTopology['connections'][number]['kind'];
const colors: Record<ConnectionKind, string> = { power: '#f4b860', control: '#ca70ea', cooling_supply: '#45d5e8', cooling_return: '#92a8b7' };
let nextRendererId = 0;

/** One canvas, one cancellable animation request, no global input listeners. */
export class FacilityRenderer {
  readonly id = ++nextRendererId;
  readonly clock = new PresentationClock();
  private state: FacilityMapProps;
  private kind: ConnectionKind = 'power';
  private atlas: HTMLImageElement | null = null;
  private terrain: HTMLCanvasElement;
  private topology: FacilityTopology | null = null;
  private frame: number | null = null;
  private lastFrame: number | null = null;
  private disposed = false;
  private poses = new Map<string, { x: number; y: number; facing: string }>();
  constructor(private canvas: HTMLCanvasElement, private labels: HTMLElement, state: FacilityMapProps) {
    this.state = state;
    this.terrain = document.createElement('canvas');
    canvas.dataset.rendererId = String(this.id);
    this.update(state, 'power');
  }
  setAtlas(image: HTMLImageElement) { if (!this.disposed) { this.atlas = image; this.topology = null; this.update(this.state, this.kind); } }
  update(state: FacilityMapProps, kind: ConnectionKind) {
    const reset = state.view.runId !== this.state.view.runId || state.view.simTime < this.state.view.simTime;
    if (reset) this.poses.clear();
    this.clock.receive(state.view.runId, state.view.simTime);
    this.state = state; this.kind = kind;
    const b = roomViewport(state.view.knownTopology, state.selectedRoomId);
    if (this.canvas.width !== b.width * 16) this.canvas.width = b.width * 16;
    if (this.canvas.height !== b.height * 16) this.canvas.height = b.height * 16;
    if (this.topology !== state.view.knownTopology) this.buildTerrain();
    this.cancel(); this.draw(); this.schedule();
  }
  destroy() { this.disposed = true; this.cancel(); this.atlas = null; this.terrain.width = 0; this.terrain.height = 0; this.poses.clear(); }
  private cancel() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null; this.lastFrame = null; this.canvas.dataset.animationRequests = '0';
  }
  private running() { return !this.state.paused && !this.state.reducedMotion && this.state.view.mission.status === 'active'; }
  private schedule() {
    if (this.disposed || !this.atlas || !this.running() || this.clock.time >= this.state.view.simTime + 1) { this.canvas.dataset.animationRequests = '0'; return; }
    const { view } = this.state;
    const motion = view.crew.some(c => c.role !== 'remote' && view.tasks.some(t => t.id === c.taskId && t.actorId === c.id && ['traveling', 'working', 'inspecting'].includes(t.status))) || view.knownTopology.assets.some(a => ['cooling', 'generator'].includes(a.kind) && freshRunning(view.observations.filter(o => o.assetId === a.id), view.simTime));
    if (!motion) return;
    this.canvas.dataset.animationRequests = '1';
    this.frame = requestAnimationFrame(now => {
      this.frame = null;
      const delta = this.lastFrame === null ? 0 : Math.min(.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.clock.advance(delta, this.state.speed, true);
      this.draw(); this.schedule();
    });
  }
  private sprite(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, width?: number, height?: number) {
    const source = atlas.frames[name as keyof typeof atlas.frames]?.frame;
    if (!source || !this.atlas) return;
    ctx.drawImage(this.atlas, source.x, source.y, source.w, source.h, Math.round(x), Math.round(y), width ?? source.w, height ?? source.h);
  }
  private buildTerrain() {
    const topology = this.state.view.knownTopology;
    this.topology = topology;
    this.terrain.width = topology.width * 16; this.terrain.height = topology.height * 16;
    const ctx = this.terrain.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const walkable = new Set(topology.walkable.map(p => `${p.x},${p.y}`));
    const doors = new Set(topology.rooms.flatMap(r => r.doors).map(p => `${p.x},${p.y}`));
    for (let y = 0; y < topology.height; y++) for (let x = 0; x < topology.width; x++) {
      const room = topology.rooms.find(r => x >= r.bounds.x && x < r.bounds.x + r.bounds.width && y >= r.bounds.y && y < r.bounds.y + r.bounds.height);
      const b = room?.bounds;
      const wall = b && (x === b.x || y === b.y || x === b.x + b.width - 1 || y === b.y + b.height - 1) && !doors.has(`${x},${y}`);
      const equipment = topology.assets.some(a => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height);
      if (wall) this.sprite(ctx, y === b.y || y === b.y + b.height - 1 ? 'wall_0' : 'wall_1', x * 16, y * 16);
      else if (walkable.has(`${x},${y}`) || equipment) this.sprite(ctx, (x * 7 + y * 3) % 13 === 0 ? 'floor_1' : 'floor_0', x * 16, y * 16);
      if (doors.has(`${x},${y}`)) { ctx.fillStyle = '#45d5e8'; ctx.fillRect(x * 16 + 2, y * 16 + 13, 12, 2); }
    }
  }
  private draw() {
    const ctx = this.canvas.getContext('2d'); if (!ctx) return;
    const { view, selectedRoomId, selectedAssetId, selectedActorId, reducedMotion } = this.state;
    const topology = view.knownTopology, b = roomViewport(topology, selectedRoomId);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07111b'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save(); ctx.translate(-b.x * 16, -b.y * 16); ctx.drawImage(this.terrain, 0, 0);
    // Connections describe topology only. Static lines never assert current flow.
    ctx.strokeStyle = colors[this.kind]; ctx.globalAlpha = .55; ctx.lineWidth = 1;
    const roomAssets = new Set(topology.assets.filter(a => a.roomId === selectedRoomId).map(a => a.id));
    const connections = topology.connections.filter(c => c.kind === this.kind && (!selectedRoomId || roomAssets.has(c.fromId) || roomAssets.has(c.toId)) && (!selectedAssetId || c.fromId === selectedAssetId || c.toId === selectedAssetId));
    for (const connection of connections) {
      ctx.beginPath(); connection.points.forEach((p, i) => i ? ctx.lineTo(p.x * 16 + 8.5, p.y * 16 + 8.5) : ctx.moveTo(p.x * 16 + 8.5, p.y * 16 + 8.5)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const upstream = topology.connections.find(c => c.fromId === topology.sharedUpstream.id)?.points[0];
    if (upstream) this.sprite(ctx, 'distribution', upstream.x * 16, upstream.y * 16);
    const cycle = this.clock.time;
    for (const asset of topology.assets) {
      const observations = view.observations.filter(o => o.assetId === asset.id), evidence = assetEvidence(observations, view.simTime);
      const active = freshRunning(observations, view.simTime) && !reducedMotion;
      const frame = asset.kind === 'generator' ? `generator_${active ? Math.floor(cycle * 4) % 3 : 0}` : asset.kind;
      this.sprite(ctx, frame, asset.x * 16, asset.y * 16, asset.width * 16, asset.height * 16);
      if (asset.kind === 'cooling') this.sprite(ctx, `fan_${active ? Math.floor(cycle * 6) % 4 : 0}`, asset.x * 16 + 8, asset.y * 16 + 8);
      this.sprite(ctx, `badge_${evidence.badge}`, (asset.x + asset.width) * 16 - 8, asset.y * 16);
      if (asset.id === selectedAssetId) { ctx.strokeStyle = '#45d5e8'; ctx.lineWidth = 1; ctx.strokeRect(asset.x * 16 - .5, asset.y * 16 - .5, asset.width * 16 + 1, asset.height * 16 + 1); }
    }
    const poses: Record<string, { x: number; y: number; frame: string }> = {};
    for (const id of this.poses.keys()) if (!view.crew.some(c => c.id === id && c.role !== 'remote')) this.poses.delete(id);
    for (const crew of view.crew.filter(c => c.role !== 'remote')) {
      const task = view.tasks.find(t => t.id === crew.taskId && t.actorId === crew.id);
      const pose = reducedMotion ? { x: crew.x, y: crew.y } : routePosition(crew, task, this.clock.time, topology);
      const previous = this.poses.get(crew.id), dx = pose.x - (previous?.x ?? pose.x), dy = pose.y - (previous?.y ?? pose.y);
      const facing = Math.abs(dx) + Math.abs(dy) < .001 ? previous?.facing ?? 's' : Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'w' : 'e' : dy < 0 ? 'n' : 's';
      const moving = task?.status === 'traveling' && (pose.x !== crew.x || pose.y !== crew.y) && this.clock.time < task.arrivalAt;
      const working = task && ['working', 'inspecting'].includes(task.status) && view.simTime >= task.arrivalAt && task.progress > 0 && task.progress < 1;
      const activity = reducedMotion ? 'idle' : moving ? `walk${Math.floor(cycle * 6) % 2}` : working ? `work${Math.floor(cycle * 4) % 2}` : 'idle';
      const frame = `${crew.role}_${facing}_${activity}`;
      this.sprite(ctx, frame, pose.x * 16 + 2, pose.y * 16);
      if (crew.id === selectedActorId) {
        ctx.strokeStyle = '#f4b860'; ctx.strokeRect(Math.round(pose.x * 16) + .5, Math.round(pose.y * 16) + .5, 15, 15);
        if (task?.status === 'traveling') {
          // routePosition is also the public walkability/cardinality validator.
          const end = routePosition(crew, task, task.arrivalAt, topology), last = task.path.at(-1);
          if (last && end.x === last.x && end.y === last.y) {
            ctx.strokeStyle = '#dceaf2'; ctx.setLineDash([3, 3]); ctx.beginPath();
            task.path.forEach((p, i) => i ? ctx.lineTo(p.x * 16 + 8.5, p.y * 16 + 8.5) : ctx.moveTo(p.x * 16 + 8.5, p.y * 16 + 8.5)); ctx.stroke(); ctx.setLineDash([]);
          }
        }
      }
      this.poses.set(crew.id, { ...pose, facing }); poses[crew.id] = { ...pose, frame };
    }
    ctx.restore();
    for (const label of this.labels.querySelectorAll<HTMLElement>('[data-crew-label]')) {
      const pose = poses[label.dataset.crewLabel!];
      label.hidden = !pose || pose.x < b.x || pose.y < b.y || pose.x >= b.x + b.width || pose.y >= b.y + b.height;
      if (pose) { label.style.left = `${(pose.x + .5 - b.x) / b.width * 100}%`; label.style.top = `${(pose.y - b.y) / b.height * 100}%`; }
    }
    this.canvas.dataset.presentationTime = String(this.clock.time);
    this.canvas.dataset.crew = JSON.stringify(poses);
    this.canvas.dataset.connections = JSON.stringify(connections.map(c => c.id));
    this.canvas.dataset.assetCount = String(topology.assets.length);
  }
}
