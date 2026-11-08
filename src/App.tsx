import { useEffect, useRef, useState } from 'react';
import { SimulationClient } from './workers/SimulationClient';
import { hotRestart } from './content/scenarios/hot-restart';
import { procedures } from './content/procedures';
import type { ActionIntent, KnowledgeView, PublicMessage } from './shared/contracts';
import { latestObservations } from './llm/context';
import { OperationalView } from './ui/OperationalView';

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const words = (text: string) => text.toLowerCase().replaceAll('_', ' ');
const actionLabel = (action: ActionIntent['action']) => action === 'inspect' ? 'Inspection' : words(action);

export default function App() {
  const client = useRef<SimulationClient | null>(null);
  const current = useRef<KnowledgeView | null>(null);
  const generation = useRef(0);
  const selected = useRef<string | null>(null);
  const commandPending = useRef(false);
  const radioPending = useRef(false);
  const [view, setView] = useState<KnowledgeView | null>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [busy, setBusy] = useState(false);
  const [radioBusy, setRadioBusy] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tutorial, setTutorial] = useState('Select equipment on the map or from the keyboard list.');
  const [radio, setRadio] = useState<PublicMessage[]>([]);

  useEffect(() => {
    const simulation = new SimulationClient(); client.current = simulation;
    let disposed = false; const token = ++generation.current;
    const unsubscribe = simulation.subscribe(raw => {
      if (disposed) return;
      current.current = raw;
      setView({ ...raw, observations: latestObservations(raw.observations), messages: raw.messages.slice(-8), affordances: raw.affordances.map(a => ({ ...a, reason: a.reason ? words(a.reason) : null })) });
      if (['success', 'failure'].includes(raw.mission.status)) setPaused(true);
    });
    void simulation.initialize(hotRestart).catch(() => { if (!disposed && token === generation.current) setError('Could not start the simulation. Retry the mission.'); });
    const visibility = () => { if (document.hidden) { simulation.pause(); setPaused(true); } };
    document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; generation.current++; unsubscribe(); simulation.dispose(); if (client.current === simulation) client.current = null; document.removeEventListener('visibilitychange', visibility); };
  }, []);

  async function retry() {
    const simulation = client.current; if (!simulation) return;
    const token = ++generation.current;
    simulation.pause(); current.current = null; selected.current = null;
    commandPending.current = false; radioPending.current = false;
    setView(null); setStarted(false); setPaused(true); setBusy(false); setRadioBusy(false); setError(''); setNotice(''); setRadio([]); setSpeed(1);
    setTutorial('Select equipment on the map or from the keyboard list.'); simulation.setSpeed(1);
    try { await simulation.initialize(hotRestart); }
    catch { if (token === generation.current) setError('Could not retry the mission. Reload the page to reconnect.'); }
  }

  async function dispatch(intent: ActionIntent) {
    const simulation = client.current, known = current.current;
    if (!simulation || !known || commandPending.current || known.mission.status !== 'active') return;
    const token = generation.current;
    commandPending.current = true; setBusy(true); setError('');
    try {
      const receipt = await simulation.command({ schemaVersion: 1, runId: known.runId, requestId: crypto.randomUUID(), actorId: 'player', intent, expectedEntityVersions: known.observedEntityVersions, idempotencyKey: crypto.randomUUID() });
      if (token !== generation.current) return;
      await simulation.observe('player');
      if (token !== generation.current) return;
      setNotice(receipt.status === 'rejected' ? `${actionLabel(intent.action)} rejected: ${words(receipt.reason)}. Check the current evidence and available crew.` : `${actionLabel(intent.action)} accepted${receipt.eta === null ? '' : `; work completes at ${time(receipt.eta)}`}. Reports arrive after completion.`);
      if (intent.action === 'inspect' && receipt.status === 'accepted') setTutorial('Inspection dispatched. The technician must travel and finish the work; wait for the timestamped report before choosing a repair.');
    } catch { if (token === generation.current) setError('The command could not be confirmed. Refresh the evidence before dispatching again.'); }
    finally { if (token === generation.current) { commandPending.current = false; setBusy(false); } }
  }

  async function step() {
    const simulation = client.current; if (!simulation || commandPending.current) return;
    const token = generation.current;
    commandPending.current = true; setBusy(true);
    try { await simulation.advance(1); }
    catch { if (token === generation.current) setError('The simulation could not advance. Retry the mission.'); }
    finally { if (token === generation.current) { commandPending.current = false; setBusy(false); } }
  }

  async function askCoworker(actorId: string, _message: string) {
    const simulation = client.current; if (!simulation || radioPending.current || current.current?.mission.status !== 'active') return;
    const token = generation.current; radioPending.current = true; setRadioBusy(true);
    try {
      const actorView = await simulation.observe(actorId);
      if (token !== generation.current) return;
      const readings = latestObservations(actorView.observations).filter(o => o.assetId === (selected.current ?? 'site')).slice(-4);
      const text = readings.length ? readings.map(o => `${words(o.field)}: ${String(o.value ?? 'unknown')} ${o.units}; observed ${time(o.observedAt)}, received ${time(o.receivedAt)}.`).join(' ') : 'I have no delivered observations for this equipment yet.';
      const advice = actorView.crew.find(c => c.id === actorId)?.role === 'remote' ? 'Batch controls preserve backlog. Keep critical demand served and verify recovery after the stability hold.' : 'Check timestamps and dispatch a qualified inspection before deciding on a repair. Task acceptance does not mean work is complete.';
      const reply: PublicMessage = { id: crypto.randomUUID(), at: actorView.simTime, speaker: actorId, mode: 'scripted', text: `${text} ${advice}`, evidenceIds: readings.map(o => o.id) };
      setRadio(previous => [...previous, reply].slice(-8));
    } catch { if (token === generation.current) setError('Coworker evidence is unavailable. Direct inspection and dispatch controls remain available.'); }
    finally { if (token === generation.current) { radioPending.current = false; setRadioBusy(false); } }
  }

  const terminal = view && ['success', 'failure'].includes(view.mission.status);
  if (!started) return <main className="mission-briefing">
    <h1>BLACKOUT</h1><h2>Hot Restart</h2><p>{hotRestart.description}</p>
    <p>Keep critical service running. Use timestamped observations, qualified technicians and workload controls to diagnose the incident and recover the hall.</p>
    <ul><li>Eight cohosted racks, two field technicians and one remote operator.</li><li>Travel, work and delayed reports take simulation time. Pausing batch retains its backlog.</li><li>Restore sustainable service, hold recovery for 60 seconds, then receive a fresh final verification.</li></ul>
    <p className="mission-mode">Scripted coworkers available. The complete mission works offline.</p>
    <button disabled={!view} onClick={() => { if (view) { setStarted(true); setPaused(false); client.current?.resume(); } }}>Start mission</button>
    {!view && !error && <p role="status">Connecting simulation…</p>}{error && <><p role="alert">{error}</p><button onClick={() => void retry()}>Retry mission</button></>}
    <footer>Fictional training model. No live facility connection.</footer>
  </main>;

  return <>
    <section className="mission-controls" aria-label="Mission controls">
      <div className="mission-playback"><button disabled={!!terminal || busy} onClick={() => { if (paused) client.current?.resume(); else client.current?.pause(); setPaused(!paused); }}>{paused ? 'Resume simulation' : 'Pause simulation'}</button>
        <button disabled={!paused || !!terminal || busy} onClick={() => void step()}>Step 1 second</button>
        <label>Simulation speed<select value={speed} disabled={!!terminal} onChange={e => { const next = Number(e.target.value) as 1 | 2 | 4; setSpeed(next); client.current?.setSpeed(next); }}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
        <span>{terminal ? 'Mission ended' : paused ? 'Paused' : 'Running'}{busy ? ' · Confirming command…' : ''}</span>
        <button className="mission-retry" onClick={() => void retry()}>Retry mission</button></div>
      <p className="mission-guidance">{tutorial}</p>
      <details><summary>Training procedure</summary><p>{procedures[0].text}</p></details>
      <p role="status" aria-live="polite">{notice}</p>{error && <p role="alert">{error}</p>}
      {radioBusy && <p role="status">Reading the coworker’s permitted evidence…</p>}
    </section>
    {view && <OperationalView view={{ ...view, messages: [...view.messages, ...radio] }} onAction={intent => void dispatch(intent)} onInspect={id => { selected.current = id; setTutorial('Check when each reading was observed and received. Choose an inspection, review travel/work time and select a qualified technician before dispatch.'); }} onAskCoworker={(actor, message) => void askCoworker(actor, message)} />}
  </>;
}
