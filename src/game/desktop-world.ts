import type { ActionIntent, Crew, KnowledgeView, Point, PublicTask } from '../shared/contracts';

type Topology = KnowledgeView['knownTopology'];
export type Direction = 'n' | 'e' | 's' | 'w';
const vectors: Record<Direction, Point> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };
export const pointKey = (p: Point) => `${p.x},${p.y}`;
export const terminal = (view: KnowledgeView) => ['success', 'failure'].includes(view.mission.status);

export function fitWorld(width: number, height: number) {
  const scale = Math.max(1, Math.floor(Math.min(width / 320, height / 192)));
  return { scale, width: scale * 320, height: scale * 192 };
}

/** Local presentation only. It owns no observation, command or simulation clock. */
export class Commander {
  position: Point;
  facing: Direction = 's';
  moving = false;
  private held = new Set<Direction>();
  private cells: Set<string>;
  private segment: { from: Point; to: Point; distance: number; direction: Direction } | null = null;
  constructor(topology: Topology, start: Point = { x: 10, y: 6 }) {
    this.cells = new Set(topology.walkable.map(pointKey));
    this.position = { ...(this.cells.has(pointKey(start)) ? start : topology.walkable[0] ?? start) };
  }
  hold(direction: Direction) { this.held.add(direction); }
  release(direction: Direction) { this.held.delete(direction); }
  clear() { this.held.clear(); this.moving = false; }
  advance(seconds: number, speed: number): boolean {
    const direction = this.held.values().next().value;
    this.moving = false;
    if (!direction || seconds <= 0) return false;
    this.facing = direction;
    let remaining = seconds * speed * 2;
    const before = { ...this.position };
    while (remaining > 1e-7) {
      if (!this.segment) {
        const v = vectors[direction], from = { ...this.position }, to = { x: from.x + v.x, y: from.y + v.y };
        if (!this.cells.has(pointKey(to))) break;
        this.segment = { from, to, distance: 0, direction };
      }
      // Complete the current cardinal segment before turning; never cut a corner.
      const segment = this.segment;
      this.facing = segment.direction;
      const distance = Math.min(1 - segment.distance, remaining);
      segment.distance += distance; remaining -= distance;
      this.position = { x: segment.from.x + (segment.to.x - segment.from.x) * segment.distance, y: segment.from.y + (segment.to.y - segment.from.y) * segment.distance };
      if (segment.distance >= 1 - 1e-7) { this.position = { ...segment.to }; this.segment = null; }
    }
    this.moving = this.position.x !== before.x || this.position.y !== before.y;
    return this.moving;
  }
}

export function moveCrewIntent(view: KnowledgeView, crewId: string | null, destination: Point): ActionIntent | null {
  const crew = view.crew.find(c => c.id === crewId);
  if (view.actorId !== 'player' || terminal(view) || !crew || crew.role === 'remote' || crew.taskId !== null) return null;
  if (!Number.isInteger(destination.x) || !Number.isInteger(destination.y) || !view.knownTopology.walkable.some(p => p.x === destination.x && p.y === destination.y)) return null;
  if (!view.affordances.some(a => a.action === 'move_crew' && a.targetId === crew.id && a.enabled)) return null;
  return { action: 'move_crew', targetId: crew.id, atSimTime: view.simTime, args: { destination } };
}

/** Public accepted paths can contain collinear compressed segments, never diagonals. */
export function routePosition(crew: Crew, task: PublicTask | undefined, time: number, topology: Topology): Point {
  if (!task || crew.taskId !== task.id || task.actorId !== crew.id || task.status !== 'traveling' || task.path.length < 2) return { x: crew.x, y: crew.y };
  const cells = new Set(topology.walkable.map(pointKey));
  let length = 0;
  for (let i = 1; i < task.path.length; i++) {
    const a = task.path[i - 1], b = task.path[i];
    if (![a.x, a.y, b.x, b.y].every(Number.isInteger) || (a.x !== b.x && a.y !== b.y)) return { x: crew.x, y: crew.y };
    const distance = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    for (let n = 0; n <= distance; n++) if (!cells.has(pointKey({ x: a.x + Math.sign(b.x - a.x) * n, y: a.y + Math.sign(b.y - a.y) * n }))) return { x: crew.x, y: crew.y };
    length += distance;
  }
  let distance = length * Math.max(0, Math.min(1, (time - task.startedAt) / Math.max(.001, task.arrivalAt - task.startedAt)));
  for (let i = 1; i < task.path.length; i++) {
    const a = task.path[i - 1], b = task.path[i], segment = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (distance <= segment) return { x: a.x + Math.sign(b.x - a.x) * distance, y: a.y + Math.sign(b.y - a.y) * distance };
    distance -= segment;
  }
  return { ...task.path[task.path.length - 1] };
}

export function nearbyAsset(view: KnowledgeView, position: Point) {
  return view.knownTopology.assets.filter(a => Math.abs(a.serviceTile.x - position.x) + Math.abs(a.serviceTile.y - position.y) <= 1.05)
    .sort((a, b) => (Math.abs(a.serviceTile.x - position.x) + Math.abs(a.serviceTile.y - position.y)) - (Math.abs(b.serviceTile.x - position.x) + Math.abs(b.serviceTile.y - position.y)))[0];
}
