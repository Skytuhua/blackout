import { useEffect, useRef } from 'react';
import type { KnowledgeView } from '../shared/contracts';
import type { MapOverlay } from './FacilityScene';

type Props = { view: KnowledgeView; selectedId: string | null; overlay: MapOverlay; onSelect: (id: string) => void };
export function FacilityMap({ view, selectedId, overlay, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<import('./FacilityScene').FacilityScene | null>(null);
  const latest = useRef({ view, selectedId, overlay, onSelect }); latest.current = { view, selectedId, overlay, onSelect };
  useEffect(() => {
    let disposed = false; let game: import('phaser').Game | undefined;
    const element = host.current; if (!element) return;
    const resize = () => { const scale = Math.max(1, Math.min(4, Math.floor(element.clientWidth / 320))); element.style.setProperty('--map-width', `${scale * 320}px`); };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    void Promise.all([import('phaser'), import('./FacilityScene')]).then(([Phaser, module]) => {
      if (disposed) return;
      scene.current = new module.FacilityScene(latest.current, id => latest.current.onSelect(id));
      game = new Phaser.Game({ type: Phaser.CANVAS, parent: element, width: 320, height: 192, pixelArt: true, roundPixels: true, scene: scene.current, banner: false, audio: { noAudio: true } });
    });
    return () => { disposed = true; observer.disconnect(); scene.current = null; game?.destroy(true); };
  }, []);
  useEffect(() => { scene.current?.setView({ view, selectedId, overlay }); }, [view, selectedId, overlay]);
  return <div ref={host} className="bo-map" aria-label="Facility map. Use the equipment list to select assets with a keyboard." role="img" />;
}
