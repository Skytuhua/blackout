import { useEffect, useRef, useState } from 'react';
import type { ConversationGameProps } from '../shared/contracts';
import type { DesktopScene, DesktopSceneState } from './DesktopScene';
import { fitWorld, routePosition } from './desktop-world';
import { DesktopPortrait } from './DesktopPortrait';
import { NearbyEquipment } from './NearbyEquipment';

const sceneKey = Symbol.for('blackout.conversation.scene');
const sceneHost = (element: HTMLElement) => element as unknown as Record<symbol, DesktopScene | undefined>;
export const conversationSceneFor = (element: HTMLElement) => sceneHost(element)[sceneKey];

export function ConversationMap(props: ConversationGameProps) {
  const stage = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), scene = useRef<DesktopScene | null>(null);
  const latest = useRef(props); latest.current = props;
  const [art, setArt] = useState('loading');
  useEffect(() => {
    const element = host.current, container = stage.current; if (!element || !container) return;
    let disposed = false, game: import('phaser').Game | undefined;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const state = (): DesktopSceneState => ({ view: latest.current.view, selectedAssetId: latest.current.selectedAssetId, selectedCrewId: latest.current.selectedActorId, paused: latest.current.paused, speed: latest.current.speed, session: latest.current.session, reducedMotion: media.matches, displayOnly: true });
    const resize = () => { const size = fitWorld(container.clientWidth, container.clientHeight); element.style.width = `${size.width}px`; element.style.height = `${size.height}px`; game?.scale.refresh(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const refresh = () => scene.current?.setView(state()); media.addEventListener('change', refresh);
    const atlasReady = fetch('/assets/facility-v2.json').then(async response => response.ok && response.headers.get('content-type')?.includes('json') ? Boolean((await response.json()).frames?.floor_0) : false).catch(() => false);
    void Promise.all([import('phaser'), import('./DesktopScene'), atlasReady]).then(([Phaser, module, ready]) => {
      if (disposed) return;
      scene.current = new module.DesktopScene(state(), { asset: id => latest.current.onSelectAsset(id), crew: () => {}, floor: () => {}, moved: () => {}, pose: () => {}, art: complete => setArt(complete ? 'atlas' : 'fallback') }, ready);
      sceneHost(element)[sceneKey] = scene.current;
      game = new Phaser.Game({ type: Phaser.CANVAS, parent: element, width: 320, height: 192, pixelArt: true, roundPixels: true, scene: scene.current, banner: false, audio: { noAudio: true }, input: { keyboard: false }, render: { antialias: false } });
      resize();
    });
    return () => { disposed = true; observer.disconnect(); media.removeEventListener('change', refresh); delete sceneHost(element)[sceneKey]; scene.current?.clearKeys(); scene.current = null; game?.destroy(true); };
  }, []);
  useEffect(() => { scene.current?.setView({ view: props.view, selectedAssetId: props.selectedAssetId, selectedCrewId: props.selectedActorId, paused: props.paused, speed: props.speed, session: props.session, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, displayOnly: true }); }, [props]);
  const asset = props.view.knownTopology.assets.find(item => item.id === props.selectedAssetId);
  return <section className="conv-map" aria-label="Facility world">
    <NearbyEquipment {...props} />
    <div className="conv-stage" ref={stage}><div ref={host} className="conv-canvas" data-art={art} role="img" aria-label="Facility equipment. Select known equipment for conversation context. Crew travel follows accepted tasks.">
      {props.view.crew.filter(crew => crew.role !== 'remote').map(crew => { const pose = routePosition(crew, props.view.tasks.find(task => task.id === crew.taskId), props.view.simTime, props.view.knownTopology); const thread = props.conversations.find(item => item.actorId === crew.id); return <span key={crew.id} className="conv-map-name" style={{ left: `${(pose.x + .5) / props.view.knownTopology.width * 100}%`, top: `${pose.y / props.view.knownTopology.height * 100}%` }} aria-hidden="true">{thread?.name ?? crew.name}</span>; })}
    </div></div>
    <div className="conv-map-caption">{art === 'fallback' ? <span>Development art</span> : null}<label>Context<select aria-label="Equipment context" value={asset?.id ?? ''} onChange={event => { if (event.target.value) props.onSelectAsset(event.target.value); }}><option value="">Select equipment</option>{props.view.knownTopology.assets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
    <div key={props.view.runId} className="conv-map-crew" aria-label="Team assignments">{props.conversations.map(thread => <div key={thread.actorId} data-actor={thread.actorId}><DesktopPortrait role={thread.role === 'Cooling' ? 'facilities' : thread.role === 'Power' ? 'electrical' : 'remote'} /><div><strong>{thread.name}</strong><span>{thread.assignment.label}</span></div></div>)}</div>
  </section>;
}
