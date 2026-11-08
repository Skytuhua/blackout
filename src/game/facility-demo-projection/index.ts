import type { KnowledgeView, Point } from '../../shared/contracts';
import { TopologySchema } from '../../shared/schemas';
import { FacilityTopologySchema, type FacilityMapView, type FacilityTopology } from '../../shared/facility-map';
import { onPublicFloor } from '../desktop-world';

const OFFSET = Object.freeze({ x: 14, y: 8 });
const ROOM_ID = 'demo-current-facility';
const NOTICE = 'Outside the playable facility - unavailable in this demo';

type UnavailableArea = { id: string; label: string; bounds: { x: number; y: number; width: number; height: number } };
export type DemoProjection =
  | { status: 'available'; view: FacilityMapView; offset: Point; roomId: string; notice: string; unavailableAreas: UnavailableArea[] }
  | { status: 'unsupported'; reason: string };

function shifted(point: Point): Point { return { x: point.x + OFFSET.x, y: point.y + OFFSET.y }; }

/** Display geometry only: never send this coordinate to the engine without reversing the offset. */
export function demoToEnginePoint(point: Point): Point | null {
  const x = point.x - OFFSET.x, y = point.y - OFFSET.y;
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < 20 && y < 12 ? { x, y } : null;
}

function freezeTree<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

function geometry(input: KnowledgeView['knownTopology']): FacilityTopology | null {
  const parsed = TopologySchema.safeParse(input);
  if (!parsed.success) return null;
  const source = parsed.data;
  if (source.width !== 20 || source.height !== 12 || source.walkable.length === 0) return null;
  const sourceIds = new Set(source.assets.map(asset => asset.id));
  if (sourceIds.size !== source.assets.length || source.assets.some(asset => asset.dependencies.some(id => !sourceIds.has(id)))) return null;
  const inSource = (p: Point) => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < source.width && p.y < source.height;
  if (source.walkable.some(p => !inSource(p)) || source.assets.some(a => !inSource(a) || !inSource(a.serviceTile) || !Number.isInteger(a.width) || !Number.isInteger(a.height) || a.x + a.width > source.width || a.y + a.height > source.height)) return null;
  const cells = [...source.walkable, ...source.assets.flatMap(a => [{ x: a.x, y: a.y }, { x: a.x + a.width - 1, y: a.y + a.height - 1 }])];
  const minX = Math.min(...cells.map(p => p.x)), maxX = Math.max(...cells.map(p => p.x));
  const minY = Math.min(...cells.map(p => p.y)), maxY = Math.max(...cells.map(p => p.y));
  // The outline and its openings describe existing public walkable cells only.
  const doors = source.walkable.filter(p => p.x === minX || p.x === maxX || p.y === minY || p.y === maxY).map(shifted);
  if (doors.length === 0) return null;
  const assets = source.assets.map(a => ({ ...a, ...shifted(a), serviceTile: shifted(a.serviceTile), roomId: ROOM_ID }));
  let unavailableId = 'demo-unavailable-power-diagram';
  while (assets.some(a => a.id === unavailableId)) unavailableId += '-';
  const candidate = {
    width: 48, height: 28, tileMeters: source.tileMeters,
    walkable: source.walkable.map(shifted), assets,
    rooms: [{ id: ROOM_ID, label: 'Current simulated facility', kind: 'hall' as const, bounds: { x: minX + OFFSET.x, y: minY + OFFSET.y, width: maxX - minX + 1, height: maxY - minY + 1 }, doors }],
    sharedUpstream: { id: unavailableId, label: 'Power connections unavailable in this demo' },
    connections: [],
  };
  const result = FacilityTopologySchema.safeParse(candidate);
  return result.success ? freezeTree(result.data) : null;
}

/** Instantiate once per host. Only the latest public topology is cached; no engine state is stored. */
export function createFacilityDemoProjector(): (view: KnowledgeView) => DemoProjection {
  let previousKey: string | null = null, previousGeometry: FacilityTopology | null = null;
  return source => {
    const key = JSON.stringify(source.knownTopology);
    if (key !== previousKey) { previousGeometry = geometry(source.knownTopology); previousKey = key; }
    if (!previousGeometry) return { status: 'unsupported', reason: 'This facility layout is not available in the demo map.' };
    return {
      status: 'available', offset: { ...OFFSET }, roomId: ROOM_ID,
      notice: 'Only the current facility is simulated. The map outline is illustrative; the surrounding area is unavailable in this demo.',
      unavailableAreas: [
        { id: 'left', label: NOTICE, bounds: { x: 0, y: 0, width: 14, height: 28 } },
        { id: 'right', label: NOTICE, bounds: { x: 34, y: 0, width: 14, height: 28 } },
        { id: 'top', label: NOTICE, bounds: { x: 14, y: 0, width: 20, height: 8 } },
        { id: 'bottom', label: NOTICE, bounds: { x: 14, y: 20, width: 20, height: 8 } },
      ],
      view: {
        runId: source.runId, simTime: source.simTime, knownTopology: previousGeometry,
        crew: source.crew.map(c => c.role === 'remote' && !onPublicFloor(c, source.knownTopology) ? { ...c } : { ...c, ...shifted(c) }),
        tasks: source.tasks.map(t => ({ ...t, path: t.path.map(shifted) })),
        observations: structuredClone(source.observations), mission: { ...source.mission },
      },
    };
  };
}

/** Recheck against the current public view when the host handles a click, including resets. */
export function selectDemoAsset(current: KnowledgeView, expectedRunId: string, assetId: string): string | null {
  if (current.runId !== expectedRunId || !geometry(current.knownTopology)) return null;
  return current.knownTopology.assets.some(asset => asset.id === assetId) ? assetId : null;
}

export function selectDemoRoom(current: KnowledgeView, expectedRunId: string, roomId: string | null): { accepted: false } | { accepted: true; roomId: string | null } {
  if (current.runId !== expectedRunId || !geometry(current.knownTopology) || (roomId !== null && roomId !== ROOM_ID)) return { accepted: false };
  return { accepted: true, roomId };
}
