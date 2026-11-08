import { useEffect, useRef, useState } from 'react';
import { SimulationClient } from './workers/SimulationClient';
import { hotRestart } from './content/scenarios/hot-restart';
import { procedures } from './content/procedures';
import type { ActionIntent, KnowledgeView, PublicMessage } from './shared/contracts';
import { latestObservations } from './llm/context';
import { OperationalView } from './ui/OperationalView';
import { runCoworker, type CoworkerResult } from './llm/interaction';
import { formatObservationFact } from './ui/presentation';

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
  const radioController = useRef<AbortController | null>(null);
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
  const [exchange, setExchange] = useState<CoworkerResult | null>(null);

  useEffect(() => {
    const simulation = new SimulationClient(); client.current = simulation;
    let disposed = false; const token = ++generation.current;
    const unsubscribe = simulation.subscribe(raw => {
      if (disposed) return;
      current.current = raw;
      setView({ ...raw, observations: latestObservations(raw.observations), messages: raw.messages.slice(-8), affordances: raw.affordances.map(a => ({ ...a, reason: a.reason ? words(a.reason) : null })) });
      if (['success', 'failure'].includes(raw.mission.status)) { setPaused(true); radioController.current?.abort(); }
    });
    void simulation.initialize(hotRestart).catch(() => { if (!disposed && token === generation.current) setError('Could not start the simulation. Retry the mission.'); });
    const visibility = () => { if (document.hidden) { simulation.pause(); setPaused(true); } };
    document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; generation.current++; radioController.current?.abort(); unsubscribe(); simulation.dispose(); if (client.current === simulation) client.current = null; document.removeEventListener('visibilitychange', visibility); };
  }, []);

  async function retry() {
    const simulation = client.current; if (!simulation) return;
    const token = ++generation.current;
    radioController.current?.abort(); radioController.current = null;
    simulation.pause(); current.current = null; selected.current = null;
    commandPending.current = false; radioPending.current = false;
    setView(null); setStarted(false); setPaused(true); setBusy(false); setRadioBusy(false); setError(''); setNotice(''); setRadio([]); setExchange(null); setSpeed(1);
    setTutorial('Select equipment on the map or from the keyboard list.'); simulation.setSpeed(1);
    try { await simulation.initialize(hotRestart); }
    catch { if (token === generation.current) setError('Could not retry the mission. Reload the page to reconnect.'); }
  }

  async function dispatch(intent: ActionIntent, proposalVersions?: Record<string, number>) {
    const simulation = client.current, known = current.current;
    if (!simulation || !known || commandPending.current || known.mission.status !== 'active') return;
    const token = generation.current;
    commandPending.current = true; setBusy(true); setError('');
    try {
      const receipt = await simulation.command({ schemaVersion: 1, runId: known.runId, requestId: crypto.randomUUID(), actorId: 'player', intent: { ...intent, atSimTime: known.simTime }, expectedEntityVersions: proposalVersions ?? known.observedEntityVersions, idempotencyKey: crypto.randomUUID() });
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

  async function askCoworker(actorId: string, message: string) {
    const simulation = client.current; if (!simulation || radioPending.current || current.current?.mission.status !== 'active') return;
    const token = generation.current, runId = current.current.runId, targetId = selected.current;
    const controller = new AbortController(); radioController.current = controller;
    radioPending.current = true; setRadioBusy(true); setError('');
    try {
      const result = await runCoworker({ simulation, runId, actorId, targetId, message, signal: controller.signal, onTool: async (_intent, tool) => {
        if (token !== generation.current || controller.signal.aborted) return;
        await simulation.observe('player');
        if (token !== generation.current || controller.signal.aborted) return;
        if (tool.receipt) setNotice(`Coworker inspection ${tool.receipt.status}${tool.receipt.eta === null ? '' : `; work completes at ${time(tool.receipt.eta)}`}. Check crew assignments; completion and reporting take time.`);
      } });
      if (token !== generation.current || controller.signal.aborted) return;
      const actorView = result.view;
      const readings = latestObservations(actorView.observations).filter(o => o.assetId === (targetId ?? 'site')).slice(-4);
      const text = readings.length ? readings.map(o => `${words(o.field)}: ${String(o.value ?? 'unknown')} ${o.units}; observed ${time(o.observedAt)}, received ${time(o.receivedAt)}.`).join(' ') : 'I have no delivered observations for this equipment yet.';
      const advice = actorView.crew.find(c => c.id === actorId)?.role === 'remote' ? 'Batch controls preserve backlog. Keep critical demand served and verify recovery after the stability hold.' : 'Check timestamps and dispatch a qualified inspection before deciding on a repair. Task acceptance does not mean work is complete.';
      const live = result.reply.kind === 'final';
      const answer = result.reply.kind === 'final' ? result.reply.response : null;
      const reply: PublicMessage = { id: crypto.randomUUID(), at: actorView.simTime, speaker: actorId, mode: live ? 'live' : 'scripted', text: (answer ? `Inference: ${answer.inference} Uncertainty: ${answer.uncertainty}. Evidence records are in the latest coworker response.` : `${text} ${advice}`).slice(0, 3000), evidenceIds: answer ? answer.facts.flatMap(f => 'observationId' in f ? [f.observationId] : []) : readings.map(o => o.id) };
      setExchange(result);
      setRadio(previous => [...previous, reply].slice(-8));
    } catch { if (token === generation.current) setError('Coworker evidence is unavailable. Direct inspection and dispatch controls remain available.'); }
    finally { if (token === generation.current) { radioPending.current = false; setRadioBusy(false); if (radioController.current === controller) radioController.current = null; } }
  }

  const terminal = view && ['success', 'failure'].includes(view.mission.status);
  const answer = exchange?.reply.kind === 'final' ? exchange.reply.response : null;
  const facts = answer ? answer.facts.flatMap(selector => {
    if (!('observationId' in selector)) return [];
    const observation = exchange!.view.observations.find(o => o.id === selector.observationId);
    return observation ? [{ observation, field: selector.field }] : [];
  }) : exchange ? latestObservations(exchange.view.observations).filter(o => o.assetId === (exchange.targetId ?? 'site')).slice(-4).map(observation => ({ observation, field: 'value' as const })) : [];
  if (!started) return <main className="mission-briefing">
    <h1>BLACKOUT</h1><h2>Hot Restart</h2><p>{hotRestart.description}</p>
    <p>Keep critical service running. Use timestamped observations, qualified technicians and workload controls to diagnose the incident and recover the hall.</p>
    <ul><li>Eight cohosted racks, two field technicians and one remote operator.</li><li>Travel, work and delayed reports take simulation time. Pausing batch retains its backlog.</li><li>Restore sustainable service, hold recovery for 60 seconds, then receive a fresh final verification.</li></ul>
    <p className="mission-mode">Coworkers use the local gateway with labeled scripted fallback. The complete mission works without a model connection.</p>
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
      <p className="mission-radio-scope">Coworkers may inspect selected equipment. Repairs and workload proposals require your confirmation.</p>
      {radioBusy && <div className="mission-radio-pending"><p role="status">Coworker reviewing permitted evidence…</p><button onClick={() => { radioController.current?.abort(); setNotice('Coworker request canceled. Check crew assignments for any inspection already accepted.'); }}>Cancel coworker request</button></div>}
      {exchange && <a href="#coworker-response">Latest coworker response</a>}
    </section>
    {view && <OperationalView view={{ ...view, messages: [...view.messages, ...radio] }} onAction={intent => void dispatch(intent)} onInspect={id => { selected.current = id; setTutorial('Check when each reading was observed and received. Choose an inspection, review travel/work time and select a qualified technician before dispatch.'); }} onAskCoworker={(actor, message) => void askCoworker(actor, message)} />}
    {exchange && <section className="coworker-response" id="coworker-response" aria-label="Coworker response">
      <h2>Coworker response</h2><p>{answer ? 'Live coworker' : 'Scripted fallback'} · {view?.crew.find(c => c.id === exchange.start.actorId)?.name ?? exchange.start.actorId}{exchange.reply.kind === 'fallback' ? ` · ${words(exchange.reply.reason)}` : ''}</p>
      <h3>Evidence from records</h3>{facts.length ? <><ul>{facts.map(({ observation, field }, index) => <li key={`${observation.id}-${field}`}><a href={`#coworker-source-${index}`}>{formatObservationFact(observation, field)}</a></li>)}</ul><div className="coworker-sources">{facts.map(({ observation }, index) => <p id={`coworker-source-${index}`} key={`${observation.id}-${index}`}><strong>{observation.id}</strong> · {observation.source} · {observation.quality} · observed {time(observation.observedAt)}, received {time(observation.receivedAt)}</p>)}</div></> : <p>No factual readings were cited. Unverified statements remain inference.</p>}
      {answer ? <><h3>Inference</h3><p>{answer.inference}</p><h3>Uncertainty</h3><p>{answer.uncertainty}</p></> : <p>Check timestamps, inspect before repair, and wait for delivered reports. Direct dispatch remains available.</p>}
      {exchange.tools.length > 0 && <><h3>Inspection receipts</h3><ul>{exchange.tools.map((tool, index) => <li key={tool.callId}>{words(exchange.intents[index].tool)}: {tool.status} · {words(tool.receipt?.reason ?? tool.reason)}{tool.receipt?.eta === null || tool.receipt?.eta === undefined ? '' : ` · task completes at ${time(tool.receipt.eta)}`}</li>)}</ul></>}
      {answer && answer.proposals.length > 0 && <><h3>Proposals awaiting confirmation</h3><p>Conditions are checked again when you confirm. If they have changed, ask the coworker for an updated proposal.</p>{answer.proposals.map((proposal, index) => <button key={index} disabled={busy || !!terminal || !view?.affordances.some(a => a.action === proposal.action && a.targetId === proposal.targetId && a.enabled)} onClick={() => void dispatch(proposal, exchange.start.view.observedEntityVersions)}>Confirm {words(proposal.action)} for {view?.knownTopology.assets.find(a => a.id === proposal.targetId)?.label ?? proposal.targetId}</button>)}</>}
      <details><summary>Response provenance</summary><p>{exchange.calls.length ? `Observed model: ${exchange.calls.at(-1)!.model}. ${exchange.calls.length} provider call receipt(s).` : 'No provider model identity was supplied.'} Total interaction: {(exchange.durationMs / 1000).toFixed(1)} seconds. Prompt: {exchange.start.promptVersion}.</p></details>
    </section>}
  </>;
}
