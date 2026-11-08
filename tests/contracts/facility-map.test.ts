import { expect, it } from 'vitest';
import { FacilityTopologySchema } from '../../src/shared/facility-map';
import { createFacilityMapFixture } from '../../src/shared/facility-map-fixture';

it('provides two eight-rack halls with distinct equipment membership and a shared upstream', () => {
  const view = createFacilityMapFixture();
  expect(FacilityTopologySchema.parse(view.knownTopology)).toEqual(view.knownTopology);
  expect([view.knownTopology.width, view.knownTopology.height]).toEqual([48, 28]);
  for (const hall of ['hall-a', 'hall-b']) expect(view.knownTopology.assets.filter(a => a.roomId === hall && a.kind === 'rack')).toHaveLength(8);
  expect(view.knownTopology.assets).toHaveLength(27);
  expect(new Set(view.knownTopology.assets.filter(a => a.kind === 'distribution').flatMap(a => a.dependencies))).toEqual(new Set(['shared-upstream']));
});

it('keeps every service location reachable from both on-site crew, without walking through equipment', () => {
  const { knownTopology: topology, crew } = createFacilityMapFixture();
  const key = (x: number, y: number) => `${x},${y}`;
  const floor = new Set(topology.walkable.map(p => key(p.x, p.y)));
  for (const worker of crew.filter(c => c.role !== 'remote')) {
    const queue = [{ x: worker.x, y: worker.y }], reached = new Set([key(worker.x, worker.y)]);
    for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = queue[i].x + dx, y = queue[i].y + dy, id = key(x, y);
      if (floor.has(id) && !reached.has(id)) { reached.add(id); queue.push({ x, y }); }
    }
    for (const asset of topology.assets) {
      expect(reached.has(key(asset.serviceTile.x, asset.serviceTile.y)), `${worker.id} -> ${asset.id}`).toBe(true);
      for (let y = asset.y; y < asset.y + asset.height; y++) for (let x = asset.x; x < asset.x + asset.width; x++) expect(floor.has(key(x, y))).toBe(false);
    }
  }
  expect(topology.rooms.every(room => room.bounds.width <= 20 && room.bounds.height <= 12)).toBe(true);
});

it('rejects orphan membership, duplicate rooms, unreachable service cells and unknown connections', () => {
  const topology = createFacilityMapFixture().knownTopology;
  for (const mutate of [
    (t: typeof topology) => { t.assets[0].roomId = 'missing'; },
    (t: typeof topology) => { t.rooms.push(t.rooms[0]); },
    (t: typeof topology) => { t.walkable = t.walkable.filter(p => p.x !== t.assets[0].serviceTile.x || p.y !== t.assets[0].serviceTile.y); },
    (t: typeof topology) => { t.connections[0].toId = 'missing'; },
    (t: typeof topology) => { t.assets[0].x += 0.25; },
    (t: typeof topology) => { t.walkable.push({ x: 100, y: -1 }); },
    (t: typeof topology) => { t.walkable.push({ x: 1.25, y: 8 }); },
    (t: typeof topology) => { Object.assign(t.assets[1], { x: t.assets[0].x, y: t.assets[0].y }); },
    (t: typeof topology) => { t.rooms.push({ ...t.rooms[0], id: 'overlapping-room' }); },
  ]) { const changed = structuredClone(topology); mutate(changed); expect(FacilityTopologySchema.safeParse(changed).success).toBe(false); }
});
