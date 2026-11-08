import type { FacilityAsset, FacilityMapView, FacilityRoom } from './facility-map';

/** Synthetic map-development data. This is not a playable scenario or engine outcome. */
export function createFacilityMapFixture(): FacilityMapView {
  const room = (id: string, label: string, kind: FacilityRoom['kind'], x: number, y: number, width: number, height: number, doors: FacilityRoom['doors']): FacilityRoom => ({ id, label, kind, bounds: { x, y, width, height }, doors });
  const rooms = [
    room('control-room', 'Control room', 'control', 1, 1, 9, 6, [{ x: 5, y: 6 }]),
    room('power-a', 'Power A', 'power', 11, 1, 8, 6, [{ x: 15, y: 6 }]),
    room('power-b', 'Power B', 'power', 21, 1, 8, 6, [{ x: 25, y: 6 }]),
    room('cooling-room', 'Cooling area', 'cooling', 31, 1, 15, 6, [{ x: 38, y: 6 }]),
    room('hall-a', 'Hall A', 'hall', 1, 10, 20, 10, [{ x: 11, y: 10 }, { x: 11, y: 19 }]),
    room('hall-b', 'Hall B', 'hall', 25, 10, 20, 10, [{ x: 35, y: 10 }, { x: 35, y: 19 }]),
    room('generator-yard', 'Generator yard', 'yard', 32, 22, 15, 5, [{ x: 38, y: 22 }]),
  ];
  const asset = (id: string, label: string, kind: FacilityAsset['kind'], roomId: string, x: number, y: number, width: number, height: number, sx: number, sy: number, dependencies: string[] = []): FacilityAsset => ({ id, label, kind, roomId, x, y, width, height, serviceTile: { x: sx, y: sy }, dependencies });
  const assets: FacilityAsset[] = [];
  for (const [hall, origin] of [['a', 1], ['b', 25]] as const) for (let i = 0; i < 8; i++) assets.push(asset(`rack-${hall}-${i + 1}`, `Rack ${hall.toUpperCase()}${i + 1}`, 'rack', `hall-${hall}`, origin + 2 + 2 * i, 12, 1, 2, origin + 2 + 2 * i, 14, [`ups-${hall}`, `cooling-${hall}-1`, `cooling-${hall}-2`]));
  assets.push(
    asset('ups-a', 'UPS A', 'ups', 'power-a', 12, 2, 1, 2, 12, 4, ['distribution-a']),
    asset('ups-b', 'UPS B', 'ups', 'power-b', 23, 2, 1, 2, 23, 4, ['distribution-b']),
    asset('distribution-a', 'Distribution A', 'distribution', 'power-a', 15, 2, 1, 1, 15, 3, ['shared-upstream']),
    asset('distribution-b', 'Distribution B', 'distribution', 'power-b', 26, 2, 1, 1, 26, 3, ['shared-upstream']),
    asset('controller-a', 'Hall A cooling controls', 'controller', 'cooling-room', 32, 5, 1, 1, 33, 5, ['distribution-a']),
    asset('controller-b', 'Hall B cooling controls', 'controller', 'cooling-room', 44, 5, 1, 1, 43, 5, ['distribution-b']),
    asset('generator', 'Generator', 'generator', 'generator-yard', 41, 23, 2, 2, 40, 24),
  );
  for (const [hall, xs] of [['a', [33, 36]], ['b', [39, 42]]] as const) xs.forEach((x, i) => assets.push(asset(`cooling-${hall}-${i + 1}`, `Hall ${hall.toUpperCase()} cooling ${i + 1}`, 'cooling', 'cooling-room', x, 2, 2, 2, x, 4, [`controller-${hall}`, `distribution-${hall}`])));
  const blocked = new Set<string>(), key = (x: number, y: number) => `${x},${y}`;
  for (const r of rooms) {
    const b = r.bounds;
    for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) if (x === b.x || y === b.y || x === b.x + b.width - 1 || y === b.y + b.height - 1) blocked.add(key(x, y));
    for (const d of r.doors) blocked.delete(key(d.x, d.y));
  }
  for (const a of assets) for (let y = a.y; y < a.y + a.height; y++) for (let x = a.x; x < a.x + a.width; x++) blocked.add(key(x, y));
  const walkable = []; for (let y = 1; y < 27; y++) for (let x = 1; x < 47; x++) if (!blocked.has(key(x, y))) walkable.push({ x, y });
  const connections: FacilityMapView['knownTopology']['connections'] = [];
  const connect = (kind: typeof connections[number]['kind'], fromId: string, toId: string) => {
    const a = assets.find(a => a.id === fromId), b = assets.find(a => a.id === toId)!;
    const from = a ? { x: a.x, y: a.y } : { x: 20, y: 8 };
    connections.push({ id: `${kind}:${fromId}:${toId}`, kind, fromId, toId, points: [from, { x: b.x, y: from.y }, { x: b.x, y: b.y }] });
  };
  for (const hall of ['a', 'b']) {
    connect('power', 'shared-upstream', `distribution-${hall}`); connect('power', `distribution-${hall}`, `ups-${hall}`);
    for (let i = 1; i <= 2; i++) connect('control', `controller-${hall}`, `cooling-${hall}-${i}`);
    for (let i = 1; i <= 8; i++) { connect('power', `ups-${hall}`, `rack-${hall}-${i}`); connect('cooling_supply', `cooling-${hall}-1`, `rack-${hall}-${i}`); connect('cooling_return', `rack-${hall}-${i}`, `cooling-${hall}-2`); }
  }
  connect('power', 'generator', 'distribution-a'); connect('power', 'generator', 'distribution-b');
  return {
    runId: 'facility-map-development', simTime: 20,
    knownTopology: { width: 48, height: 28, tileMeters: 1, rooms, assets, walkable, connections, sharedUpstream: { id: 'shared-upstream', label: 'Shared upstream utility / generator transfer' } },
    crew: [{ id: 'alex', name: 'Alex', role: 'facilities', x: 4, y: 16, speed: 1.25, taskId: null }, { id: 'jules', name: 'Jules', role: 'electrical', x: 27, y: 16, speed: 1.25, taskId: null }, { id: 'sam', name: 'Sam', role: 'remote', x: 0, y: 0, speed: 1, taskId: null }],
    tasks: [], observations: assets.filter(a => a.kind === 'rack').map(a => ({ id: `fixture:${a.id}:temperature`, assetId: a.id, source: 'monitoring', field: 'temperatureC', value: a.roomId === 'hall-a' ? 27 : 24, units: '°C', observedAt: 20, receivedAt: 20, quality: 'reported' })),
    mission: { status: 'active', reason: null, stabilitySeconds: 0, windowSeconds: 600 },
  };
}
