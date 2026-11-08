import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ScanSearch } from 'lucide-react';
import type { DesktopGameProps, Point } from '../shared/contracts';
import type { DesktopScene } from './DesktopScene';
import { fitWorld, moveCrewIntent } from './desktop-world';

const scenes = new WeakMap<HTMLElement, DesktopScene>();
export const desktopSceneFor = (element: HTMLElement) => scenes.get(element);

export function DesktopMap(props: DesktopGameProps) {
  const stage = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null);
  const scene = useRef<DesktopScene | null>(null), latest = useRef(props); latest.current = props;
  const [art, setArt] = useState<'loading' | 'atlas' | 'fallback'>('loading');
  const [feedback, setFeedback] = useState('WASD / arrows to walk · E to view nearby equipment');
  const [position, setPosition] = useState<Point>({ x: 10, y: 6 });
  useEffect(() => {
    const element = host.current, container = stage.current; if (!element || !container) return;
    let disposed = false, game: import('phaser').Game | undefined;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const state = () => ({ ...latest.current, reducedMotion: media.matches });
    const resize = () => { const size = fitWorld(container.clientWidth, container.clientHeight); element.style.width = `${size.width}px`; element.style.height = `${size.height}px`; element.dataset.scale = String(size.scale); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const clear = () => scene.current?.clearKeys();
    const visibility = () => { if (document.hidden) clear(); };
    const focus = (event: FocusEvent) => { scene.current?.focusWorld(event.target === element); };
    const key = (event: KeyboardEvent) => {
      if (document.activeElement !== element || event.altKey || event.metaKey || event.ctrlKey || event.isComposing) return;
      if (!['w', 'a', 's', 'd', 'e', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || (event.repeat && event.key === 'e')) return;
      event.preventDefault(); scene.current?.handleKey(event.key, event.type === 'keydown');
    };
    const blur = () => { clear(); scene.current?.focusWorld(false); };
    const refresh = () => scene.current?.setView(state());
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility); document.addEventListener('focusin', focus);
    element.addEventListener('keydown', key); element.addEventListener('keyup', key); element.addEventListener('blur', clear); media.addEventListener('change', refresh);
    const atlasReady = fetch('/assets/facility-v2.json').then(async response => response.ok && response.headers.get('content-type')?.includes('json') ? Boolean((await response.json()).frames?.floor_0) : false).catch(() => false);
    void Promise.all([import('phaser'), import('./DesktopScene'), atlasReady]).then(([Phaser, module, ready]) => {
      if (disposed) return;
      scene.current = new module.DesktopScene(state(), {
        asset: id => { clear(); latest.current.onSelectAsset(id); latest.current.onPanelChange('equipment'); latest.current.onTutorialEvent('equipment_opened'); },
        crew: id => { clear(); latest.current.onSelectCrew(id); latest.current.onTutorialEvent('crew_selected'); },
        floor: destination => {
          const current = latest.current;
          if (current.busy || current.session === 'welcome') return;
          const intent = moveCrewIntent(current.view, current.selectedCrewId, destination);
          if (intent) { current.onAction(intent); setFeedback('Movement requested. The engine validates the route and technician availability.'); }
          else setFeedback(current.selectedCrewId ? 'Movement unavailable. A busy technician needs explicit cancellation first.' : 'Select Alex or Jules, then click a walkable floor tile.');
        },
        moved: () => latest.current.onTutorialEvent('commander_moved'), pose: setPosition,
        art: ready => setArt(ready ? 'atlas' : 'fallback'),
      }, ready);
      scenes.set(element, scene.current);
      game = new Phaser.Game({ type: Phaser.CANVAS, parent: element, width: 320, height: 192, pixelArt: true, roundPixels: true, scene: scene.current, banner: false, audio: { noAudio: true }, input: { keyboard: false }, render: { antialias: false } });
    });
    return () => {
      disposed = true; observer.disconnect(); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('focusin', focus);
      element.removeEventListener('keydown', key); element.removeEventListener('keyup', key); element.removeEventListener('blur', clear); media.removeEventListener('change', refresh);
      scenes.delete(element); scene.current = null; game?.destroy(true);
    };
  }, []);
  useEffect(() => { scene.current?.setView({ ...props, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }); }, [props]);
  return <section className="blackout-world" aria-label="Facility world">
    <div className="blackout-stage" ref={stage}>
      <div ref={host} className="blackout-canvas" role="application" tabIndex={0} aria-label="Facility. WASD or arrows move the commander; E opens nearby equipment. Tab leaves the world." onPointerDown={() => host.current?.focus({ preventScroll: true })} onFocus={() => scene.current?.focusWorld(true)} data-art={art} data-commander-x={position.x.toFixed(3)} data-commander-y={position.y.toFixed(3)} />
    </div>
    <div className="blackout-world-hint"><span>{art === 'fallback' ? 'Temporary development art · ' : ''}{feedback}</span><button onClick={() => host.current?.focus({ preventScroll: true })}>Focus world</button></div>
    <div className="blackout-world-controls" aria-label="Commander controls">
      {([['n', ArrowUp, 'Move commander north'], ['w', ArrowLeft, 'Move commander west'], ['s', ArrowDown, 'Move commander south'], ['e', ArrowRight, 'Move commander east']] as const).map(([direction, Icon, name]) => <button key={direction} aria-label={name} disabled={props.paused || ['success', 'failure'].includes(props.view.mission.status)} onClick={() => scene.current?.nudge(direction)}><Icon size={16} /></button>)}
      <button aria-label="View nearby equipment" onClick={() => scene.current?.inspectNearby()}><ScanSearch size={16} /> E</button>
    </div>
  </section>;
}
