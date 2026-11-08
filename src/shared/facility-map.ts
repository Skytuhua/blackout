import { z } from 'zod';
import { AssetSchema, PointSchema, TopologySchema } from './schemas';
import type { KnowledgeView } from './contracts';

export const FACILITY_MAP_CONTRACT_VERSION = 7;
const id = z.string().min(1).max(120);
const integer = z.number().int().nonnegative();
const tile = z.strictObject({ x: integer, y: integer });
export const FacilityRoomSchema = z.strictObject({
  id, label: z.string().min(1), kind: z.enum(['control', 'hall', 'power', 'cooling', 'yard']),
  bounds: z.strictObject({ x: integer, y: integer, width: integer.positive(), height: integer.positive() }),
  doors: z.array(tile).min(1),
});
export const FacilityAssetSchema = AssetSchema.extend({ roomId: id, x: integer, y: integer, width: integer.positive(), height: integer.positive(), serviceTile: tile });
export const FacilityTopologySchema = TopologySchema.extend({
  width: z.literal(48), height: z.literal(28), assets: z.array(FacilityAssetSchema), rooms: z.array(FacilityRoomSchema),
  walkable: z.array(tile),
  sharedUpstream: z.strictObject({ id, label: z.string().min(1) }),
  connections: z.array(z.strictObject({ id, kind: z.enum(['power', 'control', 'cooling_supply', 'cooling_return']), fromId: id, toId: id, points: z.array(PointSchema).min(2) })),
}).superRefine((topology, context) => {
  const problem = (message: string) => context.addIssue({ code: 'custom', message });
  for (const [name, rows] of [['room', topology.rooms], ['asset', topology.assets], ['connection', topology.connections]] as const) if (new Set(rows.map(row => row.id)).size !== rows.length) problem(`Duplicate ${name} ID.`);
  const floor = new Set(topology.walkable.map(p => `${p.x},${p.y}`));
  if (topology.walkable.some(p => p.x >= topology.width || p.y >= topology.height)) problem('Walkable tile outside site.');
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (let i = 0; i < topology.rooms.length; i++) for (let j = 0; j < i; j++) if (overlaps(topology.rooms[i].bounds, topology.rooms[j].bounds)) problem('Room bounds overlap.');
  for (let i = 0; i < topology.assets.length; i++) for (let j = 0; j < i; j++) if (overlaps(topology.assets[i], topology.assets[j])) problem('Equipment footprints overlap.');
  const ids = new Set([topology.sharedUpstream.id, ...topology.assets.map(a => a.id)]);
  if (ids.size !== topology.assets.length + 1) problem('Shared upstream must have its own ID.');
  for (const room of topology.rooms) {
    const b = room.bounds;
    if (b.x + b.width > topology.width || b.y + b.height > topology.height) problem('Room outside site.');
    for (const d of room.doors) if (d.x < b.x || d.x >= b.x + b.width || d.y < b.y || d.y >= b.y + b.height || !floor.has(`${d.x},${d.y}`)) problem('Door outside room or walkable floor.');
  }
  for (const a of topology.assets) {
    const room = topology.rooms.find(r => r.id === a.roomId), b = room?.bounds;
    if (!b || a.x < b.x || a.y < b.y || a.x + a.width > b.x + b.width || a.y + a.height > b.y + b.height) problem('Asset outside declared room.');
    if (!floor.has(`${a.serviceTile.x},${a.serviceTile.y}`)) problem('Service tile is not walkable.');
    if (a.dependencies.some(dependency => !ids.has(dependency))) problem('Unknown dependency.');
    for (let y = a.y; y < a.y + a.height; y++) for (let x = a.x; x < a.x + a.width; x++) if (floor.has(`${x},${y}`)) problem('Equipment footprint cannot be walkable.');
  }
  for (const connection of topology.connections) if (!ids.has(connection.fromId) || !ids.has(connection.toId)) problem('Unknown connection endpoint.');
});
export type FacilityRoom = z.infer<typeof FacilityRoomSchema>;
export type FacilityAsset = z.infer<typeof FacilityAssetSchema>;
export type FacilityTopology = z.infer<typeof FacilityTopologySchema>;
/** Public presentation only. No physical state, checkpoint or latent fault fields. */
export type FacilityMapView = Pick<KnowledgeView, 'runId' | 'simTime' | 'crew' | 'tasks' | 'observations' | 'mission'> & { knownTopology: FacilityTopology };
export type FacilityMapProps = {
  view: FacilityMapView;
  selectedRoomId: string | null;
  selectedAssetId: string | null;
  selectedActorId: string | null;
  paused: boolean;
  speed: 1 | 2 | 4;
  reducedMotion: boolean;
  onSelectRoom: (roomId: string | null) => void;
  onSelectAsset: (assetId: string) => void;
};
