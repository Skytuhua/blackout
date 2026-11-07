import { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { SimulationClient } from './workers/SimulationClient';
import { hotRestart } from './content/scenarios/hot-restart';
import type { KnowledgeView } from './shared/contracts';

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const client = useRef<SimulationClient | null>(null);
  const [view, setView] = useState<KnowledgeView | null>(null);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const simulation = new SimulationClient(); client.current = simulation;
    const unsubscribe = simulation.subscribe(setView);
    void simulation.initialize(hotRestart).catch(e => setError(String(e)));
    const visibility = () => { if (document.hidden) simulation.pause(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { unsubscribe(); simulation.dispose(); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!host.current) return;
    class FoundationScene extends Phaser.Scene {
      create() {
        const g = this.add.graphics();
        g.fillStyle(0x102332); g.fillRect(0, 0, 320, 192);
        g.lineStyle(1, 0x193747);
        for (let x = 0; x <= 320; x += 16) g.lineBetween(x, 0, x, 192);
        for (let y = 0; y <= 192; y += 16) g.lineBetween(0, y, 320, y);
        for (const a of hotRestart.topology.assets) {
          g.fillStyle(a.kind === 'rack' ? 0x2f5366 : a.kind === 'cooling' ? 0x316775 : 0x4d4169);
          g.fillRect(a.x * 16, a.y * 16, a.width * 16 - 2, a.height * 16 - 2);
          g.fillStyle(0x45d5e8); g.fillRect(a.x * 16 + 3, a.y * 16 + 3, 3, 2);
        }
      }
    }
    const game = new Phaser.Game({ type: Phaser.CANVAS, parent: host.current, width: 320, height: 192, pixelArt: true, roundPixels: true, scene: FoundationScene, banner: false, audio: { noAudio: true } });
    return () => game.destroy(true);
  }, []);
  return <main className="foundation">
    <header><h1>BLACKOUT</h1><span>Incident command · Hot Restart</span><strong>Development fixture</strong></header>
    <div className="foundation-notice">Foundation shell. Mission simulation and final artwork are not integrated.</div>
    <div className="foundation-layout"><section aria-label="Development facility map"><div className="foundation-map" ref={host} /><p>One hall · Eight racks · Two field technicians</p></section>
      <aside><h2>Timestamped evidence</h2><p role="status">{view ? 'Worker connected' : 'Connecting simulation worker…'}</p>
        {view?.observations.map(o => <p key={o.id}>{o.assetId}: {String(o.value)} {o.units} <small>Observed {o.observedAt}s</small></p>)}
        <button onClick={() => void client.current?.observe().then(() => setChecked(true)).catch(e => setError(String(e)))}>Check worker round trip</button>
        {checked && <p role="status">Projected view received</p>}{error && <p role="alert">{error}</p>}
      </aside></div>
    <footer>Fictional training model. Source baseline preserved; no real facility connection.</footer>
  </main>;
}
