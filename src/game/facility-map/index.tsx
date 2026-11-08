import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import type { FacilityMapProps } from '../../shared/facility-map';
import type { DemoProjection } from '../facility-demo-projection';
import { onPublicFloor } from '../desktop-world';
import { assetEvidence, fitMap, roomViewport } from './model';
import { FacilityRenderer, type ConnectionKind } from './renderer';
import './map.css';

type DemoMapDetails = Extract<DemoProjection, { status: 'available' }>;
export function FacilityMap(props: FacilityMapProps & { demo?: DemoMapDetails }) {
  const { view, selectedRoomId, selectedAssetId, selectedActorId, onSelectRoom, onSelectAsset } = props;
  const topology = view.knownTopology, room = topology.rooms.find(r => r.id === selectedRoomId);
  const bounds = roomViewport(topology, selectedRoomId), id = useId();
  const stage = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), navMeasure = useRef<HTMLDivElement>(null);
  const renderer = useRef<FacilityRenderer | null>(null), latest = useRef(props); latest.current = props;
  const [box, setBox] = useState({ width: 0, height: 0, fontSize: 16 });
  const [navWidth, setNavWidth] = useState(0);
  const [equipmentPage, setEquipmentPage] = useState(0);
  const [kind, setKind] = useState<ConnectionKind>('power'), [art, setArt] = useState<'loading' | 'ready' | 'error'>('loading');
  const [systemReduced, setSystemReduced] = useState(false);
  const state = { ...props, reducedMotion: props.reducedMotion || systemReduced, illustrative: Boolean(props.demo) };
  const fitted = fitMap(box.width, box.height, { width: bounds.width * 16, height: bounds.height * 16 });
  const assets = room ? topology.assets.filter(a => a.roomId === room.id) : [];
  const compact = box.width > 0 && (box.width / box.fontSize < 50 || navWidth > box.width);
  const pageSize = box.fontSize >= 28 ? 1 : Math.max(1, Math.min(4, Math.floor((box.width - 160) / (box.fontSize * 11))));
  const pages = Math.max(1, Math.ceil(assets.length / pageSize)), page = Math.min(equipmentPage, pages - 1);

  useEffect(() => {
    const index = assets.findIndex(a => a.id === selectedAssetId);
    setEquipmentPage(index < 0 ? 0 : Math.floor(index / pageSize));
  }, [selectedRoomId, selectedAssetId, pageSize]);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)'), change = () => setSystemReduced(media.matches);
    change(); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const element = stage.current!;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setBox({ width: Math.max(0, width - 16), height: Math.max(0, height - 16), fontSize: parseFloat(getComputedStyle(element.parentElement!).fontSize) });
    });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const measure = navMeasure.current!;
    const observer = new ResizeObserver(entries => setNavWidth(entries[0].contentRect.width));
    observer.observe(measure); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const instance = new FacilityRenderer(canvas.current!, world.current!, { ...latest.current, illustrative: Boolean(latest.current.demo) }); renderer.current = instance;
    const image = new Image();
    image.onload = () => { instance.setAtlas(image); setArt('ready'); };
    image.onerror = () => setArt('error');
    image.src = '/assets/facility-v2.png';
    return () => { image.onload = null; image.onerror = null; instance.destroy(); renderer.current = null; };
  }, []);
  useEffect(() => { renderer.current?.update(state, kind); });

  // Overlay labels are optional; the room and equipment controls retain their names.
  function arrangeLabels() {
    const element = world.current;
    if (!element) return;
    const labels = [...element.querySelectorAll<HTMLElement>('.fm-room-label, .fm-upstream-mark, .fm-asset-label')];
    const bounds = element.getBoundingClientRect(), placed: DOMRect[] = [];
    const rectangles = labels.map(label => label.getBoundingClientRect());
    const visible = rectangles.map(rect => {
      const outside = !bounds.width || !bounds.height || rect.left < bounds.left || rect.right > bounds.right || rect.top < bounds.top || rect.bottom > bounds.bottom;
      const collision = placed.some(other => rect.left < other.right + 2 && rect.right + 2 > other.left && rect.top < other.bottom + 2 && rect.bottom + 2 > other.top);
      if (!outside && !collision) placed.push(rect);
      return !outside && !collision;
    });
    labels.forEach((label, index) => {
      const visibility = visible[index] ? 'visible' : 'hidden';
      if (label.style.visibility !== visibility) label.style.visibility = visibility;
    });
  }
  useLayoutEffect(arrangeLabels);
  useLayoutEffect(() => {
    const labels = world.current?.querySelectorAll<HTMLElement>('.fm-room-label, .fm-upstream-mark, .fm-asset-label');
    const observer = new ResizeObserver(arrangeLabels);
    labels?.forEach(label => observer.observe(label));
    return () => observer.disconnect();
  }, [topology, room?.id, compact]);
  useEffect(() => {
    const fonts = document.fonts;
    fonts?.addEventListener('loadingdone', arrangeLabels);
    return () => fonts?.removeEventListener('loadingdone', arrangeLabels);
  }, []);

  function selectFromMap(event: MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = bounds.x + (event.clientX - rect.left) / rect.width * bounds.width;
    const y = bounds.y + (event.clientY - rect.top) / rect.height * bounds.height;
    const asset = topology.assets.find(a => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height);
    if (asset) { onSelectAsset(asset.id); return; }
    if (!room) {
      const hit = topology.rooms.find(r => x >= r.bounds.x && x < r.bounds.x + r.bounds.width && y >= r.bounds.y && y < r.bounds.y + r.bounds.height);
      if (hit) onSelectRoom(hit.id);
    }
  }

  const upstream = topology.connections.find(c => c.fromId === topology.sharedUpstream.id)?.points[0];
  return <section className="facility-map" aria-label="Public facility map" data-room={room?.id ?? 'overview'} data-art={art} data-compact={compact} data-demo={Boolean(props.demo)}>
    {props.demo && <p className="fm-demo-description">Additional rooms are visual only and cannot be entered.</p>}
    <nav className="fm-rooms" aria-label="Facility rooms">
      <div className="fm-rooms-measure" ref={navMeasure} aria-hidden="true"><span>Overview</span>{topology.rooms.map(r => <span key={r.id}>{r.label}</span>)}</div>
      <button type="button" aria-pressed={!room} onClick={() => onSelectRoom(null)}>Overview</button>
      {topology.rooms.map(r => <button key={r.id} type="button" hidden={compact} aria-pressed={r.id === room?.id} onClick={() => onSelectRoom(r.id)}>{r.label}</button>)}
      {compact && <label className="fm-room-select">Room <select aria-label="Room view" value={room?.id ?? ''} onChange={e => onSelectRoom(e.target.value || null)}>
        <option value="">Overview</option>{topology.rooms.map(r => <option key={r.id} value={r.id}>{r.label.split(' ').map(word => word[0]).join('')} · {r.label}</option>)}
      </select></label>}
    </nav>
    {!props.demo && <div className="fm-toolbar">
      <strong>{room?.label ?? 'Facility overview'}</strong>
      <label htmlFor={`${id}-connections`}>Connections <select aria-label="Connections" id={`${id}-connections`} value={kind} onChange={e => setKind(e.target.value as ConnectionKind)}>
        <option value="power">Power</option><option value="control">Controls</option><option value="cooling_supply">Cooling supply</option><option value="cooling_return">Cooling return</option>
      </select></label>
      <span className="fm-topology-note">Known layout · flow unconfirmed</span>
    </div>}
    <div className="fm-stage" ref={stage}>
      <div className="fm-world" ref={world} style={{ width: fitted.width, height: fitted.height }}>
        <canvas ref={canvas} width={bounds.width * 16} height={bounds.height * 16} aria-hidden="true" onClick={selectFromMap} />
        {props.demo && !room && props.demo.unavailableAreas.map(area => <div key={area.id} data-demo-unavailable aria-hidden="true" className="fm-demo-unavailable" style={{ left: `${area.bounds.x / topology.width * 100}%`, top: `${area.bounds.y / topology.height * 100}%`, width: `${area.bounds.width / topology.width * 100}%`, height: `${area.bounds.height / topology.height * 100}%` }}>
          {(area.id === 'left' || area.id === 'right' ? [0, 1] : [0]).map(part => <span key={part} data-demo-room className="fm-demo-room-label" style={{ top: area.id === 'left' || area.id === 'right' ? `${part * 50 + 50}%` : '100%' }}>Visual only</span>)}
        </div>)}
        {!room && topology.rooms.map(r => <span key={r.id} className="fm-room-label" title={r.label} style={{ left: `${(r.bounds.x + r.bounds.width / 2) / topology.width * 100}%`, top: `${(r.bounds.y + r.bounds.height - 1) / topology.height * 100}%` }}>{compact ? r.label.split(' ').map(word => word[0]).join('') : r.label}</span>)}
        {!room && upstream && <span className="fm-upstream-mark" style={{ left: `${(upstream.x + .5) / topology.width * 100}%`, top: `${(upstream.y + 1) / topology.height * 100}%` }}>Shared upstream</span>}
        {assets.map((a, i) => <span key={a.id} className="fm-asset-label" style={{ left: `${(a.x + a.width / 2 - bounds.x) / bounds.width * 100}%`, top: `${(a.y + a.height - bounds.y) / bounds.height * 100}%` }}>{a.kind === 'rack' && !compact ? a.label.replace(/^Rack /, '') : i + 1}</span>)}
        {view.crew.filter(c => c.role !== 'remote' || onPublicFloor(c, topology)).map(c => <span key={c.id} className="fm-crew-label" data-crew-label={c.id} data-selected={c.id === selectedActorId} hidden>{c.name}</span>)}
      </div>
      {art !== 'ready' && <p className="fm-art-status" role="status">{art === 'error' ? 'Map artwork unavailable. Room and equipment controls remain available.' : 'Loading facility artwork…'}</p>}
    </div>
    {!props.demo && <div className="fm-equipment" role="group" aria-label={room ? `${room.label} equipment` : 'Overview information'}>
      <div className="fm-equipment-items">{room ? assets.length ? assets.map((asset, index) => {
        const evidence = assetEvidence(view.observations.filter(o => o.assetId === asset.id), view.simTime);
        return <button key={asset.id} type="button" hidden={index < page * pageSize || index >= (page + 1) * pageSize} aria-pressed={asset.id === selectedAssetId} onClick={() => onSelectAsset(asset.id)} title={evidence.readings || 'No delivered reading'}>
          <span>{index + 1}. {asset.label}</span><small data-evidence={evidence.state}>{evidence.label}</small>
        </button>;
      }) : <span>No known equipment in this room.</span> : <span>Choose a room to see equipment names.{fitted.scale > 0 && fitted.scale < 1 ? ' Overview is below native scale.' : ''}</span>}</div>
      {pages > 1 && <div className="fm-equipment-pages" aria-label="Equipment pages">
        <button type="button" aria-label="Previous equipment page" disabled={page === 0} onClick={() => setEquipmentPage(page - 1)}>Back</button>
        <span>{page + 1} / {pages}</span>
        <button type="button" aria-label="Next equipment page" disabled={page === pages - 1} onClick={() => setEquipmentPage(page + 1)}>Next</button>
      </div>}
    </div>}
    {!props.demo && <footer className="fm-footer">
      <div className="fm-crew" aria-label="Public crew assignments">{view.crew.map(c => {
        const task = view.tasks.find(t => t.id === c.taskId && t.actorId === c.id), target = topology.assets.find(a => a.id === task?.targetId);
        return <span key={c.id} data-selected={c.id === selectedActorId}>{c.name} · {task ? `${task.status}${target ? ` · ${target.label}` : ''}` : c.role === 'remote' && !onPublicFloor(c, topology) ? 'remote' : 'ready'}</span>;
      })}</div>
      <span className="fm-upstream">{topology.sharedUpstream.label}</span>
    </footer>}
  </section>;
}
