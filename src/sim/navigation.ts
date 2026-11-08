import type { Point, ScenarioSpec } from '../shared/contracts';

const key = (p: Point) => `${p.x},${p.y}`;
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function isWalkablePosition(spec: ScenarioSpec, point: Point) {
  const walkable = new Set(spec.topology.walkable.map(key));
  if (Number.isInteger(point.x) && Number.isInteger(point.y)) return walkable.has(key(point));
  if (Number.isInteger(point.x)) return walkable.has(key({ x: point.x, y: Math.floor(point.y) })) && walkable.has(key({ x: point.x, y: Math.ceil(point.y) }));
  if (Number.isInteger(point.y)) return walkable.has(key({ x: Math.floor(point.x), y: point.y })) && walkable.has(key({ x: Math.ceil(point.x), y: point.y }));
  return false;
}

export function isWalkablePath(spec: ScenarioSpec, path: Point[], end: Point) {
  if (!path.length || !isWalkablePosition(spec, path[0]) || key(path.at(-1)!) !== key(end)) return false;
  return path.slice(1).every((p, i) => {
    const previous = path[i]; const length = distance(previous, p);
    return Number.isInteger(p.x) && Number.isInteger(p.y) && isWalkablePosition(spec, p) && length > 0 && length <= 1 && (p.x === previous.x || p.y === previous.y);
  });
}

// Stable breadth-first ties: north, east, south, west. A canceled walker may start on an edge.
export function route(spec: ScenarioSpec, start: Point, end: Point): Point[] | null {
  const walkable = new Set(spec.topology.walkable.map(key));
  const starts = Number.isInteger(start.x) && Number.isInteger(start.y) ? [{ x: start.x, y: start.y }]
    : Number.isInteger(start.x) ? [{ x: start.x, y: Math.floor(start.y) }, { x: start.x, y: Math.ceil(start.y) }]
      : Number.isInteger(start.y) ? [{ x: Math.floor(start.x), y: start.y }, { x: Math.ceil(start.x), y: start.y }] : [];
  let best: Point[] | null = null;
  let bestLength = Infinity;
  for (const origin of starts) {
    if (!walkable.has(key(origin)) || !walkable.has(key(end))) continue;
    const queue: Point[][] = [[origin]];
    const seen = new Set([key(origin)]);
    for (let i = 0; i < queue.length; i++) {
      const path = queue[i];
      const last = path.at(-1)!;
      if (key(last) === key(end)) {
        const length = path.length - 1 + distance(start, origin);
        if (length < bestLength) {
          bestLength = length;
          best = distance(start, origin) > 0 ? [{ x: start.x, y: start.y }, ...path] : path;
        }
        break;
      }
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const next = { x: last.x + dx, y: last.y + dy };
        if (walkable.has(key(next)) && !seen.has(key(next))) {
          seen.add(key(next)); queue.push([...path, next]);
        }
      }
    }
  }
  return best;
}

export function pathMeters(spec: ScenarioSpec, path: Point[]) {
  return path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p) * spec.topology.tileMeters, 0);
}

export function positionAlong(spec: ScenarioSpec, path: Point[], meters: number): Point {
  let remaining = meters / spec.topology.tileMeters;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]; const b = path[i]; const length = distance(a, b);
    if (remaining < length) return { x: a.x + (b.x - a.x) * remaining / length, y: a.y + (b.y - a.y) * remaining / length };
    remaining -= length;
  }
  return { ...path.at(-1)! };
}
