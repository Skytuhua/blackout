import { useEffect, useState } from 'react';
import type { KnowledgeView, OperationalViewProps } from '../shared/contracts';
import { FacilityMap } from '../game/FacilityMap';
import type { MapOverlay } from '../game/FacilityScene';
import { makeAction, parseCeiling, readingStatus } from './presentation';
import './OperationalView.css';

const label = (value: string) => value.replaceAll('_', ' ');
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const value = (n: number | null, suffix = '') => n === null ? 'Unknown' : `${Number(n.toFixed(1))}${suffix}`;

export function OperationalView({ view, onAction, onInspect, onAskCoworker }: OperationalViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<MapOverlay>('none');
  const [technician, setTechnician] = useState('');
  const [ceiling, setCeiling] = useState('50');
  const [taskId, setTaskId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { setSelectedId(null); setTechnician(''); setTaskId(''); setRecipient(''); setMessage(''); }, [view.runId]);
  const asset = view.knownTopology.assets.find(a => a.id === selectedId);
  const observations = view.observations.filter(o => o.assetId === selectedId).sort((a, b) => b.observedAt - a.observedAt);
  const affordances = view.affordances.filter(a => a.targetId === selectedId);
  const globalAffordances = view.affordances.filter(a => !view.knownTopology.assets.some(asset => asset.id === a.targetId));
  const canAct = view.mission.status !== 'success' && view.mission.status !== 'failure';
  const choose = (id: string) => { setSelectedId(id); setTechnician(''); setTaskId(''); onInspect(id); };
  const summaryAge = view.simTime - view.summary.observedAt;
  const summaryFreshness = summaryAge < 0 ? 'time unavailable' : summaryAge > 10 ? `stale · ${summaryAge}s old` : `observed ${time(view.summary.observedAt)}`;
  const renderAction = (a: KnowledgeView['affordances'][number]) => {
    const selectedTech = a.technicianIds.includes(technician) ? technician : '';
    const relevantTasks = view.tasks.filter(t => t.targetId === a.targetId && !['completed', 'canceled'].includes(t.status));
    const selectedTaskId = relevantTasks.some(t => t.id === taskId) ? taskId : '';
    const extras = a.action === 'set_batch_ceiling' ? { ceiling: parseCeiling(ceiling) } : a.action === 'cancel_task' ? { taskId: selectedTaskId } : {};
    const intent = canAct ? makeAction(a, view.simTime, selectedTech, extras) : null;
    return <div className="bo-action" key={`${a.targetId}-${a.action}`}>
      <strong>{label(a.action)}</strong>
      <small>Travel {a.travelSeconds === null ? 'not provided' : `${a.travelSeconds}s`} · Work {a.workSeconds}s</small>
      {a.reason && <p>{a.reason}</p>}
      {a.technicianIds.length > 0 && <label>Technician<select value={selectedTech} onChange={e => setTechnician(e.target.value)}><option value="">Choose a technician</option>{a.technicianIds.map(id => <option key={id} value={id}>{view.crew.find(c => c.id === id)?.name ?? id}</option>)}</select></label>}
      {a.action === 'set_batch_ceiling' && <label>Batch ceiling (units/s per rack)<input type="number" min="0" max="100" value={ceiling} onChange={e => setCeiling(e.target.value)} /></label>}
      {a.action === 'cancel_task' && <label>Task<select value={selectedTaskId} onChange={e => setTaskId(e.target.value)}><option value="">Choose a task</option>{relevantTasks.map(t => <option key={t.id} value={t.id}>{label(t.action)} · {label(t.status)}</option>)}</select></label>}
      <button disabled={!intent} onClick={() => { if (intent && canAct) onAction(intent); }}>Dispatch {label(a.action)}</button>
    </div>;
  };
  return <main className="bo">
    <header className="bo-header"><div><h1>BLACKOUT</h1><p>Hot Restart <span> / </span> Incident operations</p></div><div className="bo-header-status"><span className="bo-dot" />{label(view.mission.status)} <span>·</span> Simulation {time(view.simTime)}</div></header>
    <section className="bo-summary" aria-label="Mission overview">
      <div><span>Critical service</span><strong>{value(view.summary.criticalServedFraction === null ? null : view.summary.criticalServedFraction * 100, '%')}</strong><small>{summaryFreshness}</small></div>
      <div><span>Hottest observed inlet</span><strong>{value(view.summary.hottestTemperatureC, ' °C')}</strong><small>{summaryFreshness}</small></div>
      <div><span>Power headroom</span><strong>{value(view.summary.sourceHeadroomKw, ' kW')}</strong><small>{summaryFreshness}</small></div>
      <div><span>Simulation time</span><strong>{time(view.simTime)}</strong><small>Mission window {time(view.mission.windowSeconds)}</small></div>
    </section>
    {(view.mission.status === 'success' || view.mission.status === 'failure') && <section className="bo-result" role="status"><h2>Mission {view.mission.status}</h2><p>{view.mission.reason ?? 'No further result details were provided.'}</p></section>}
    {globalAffordances.length > 0 && <section className="bo-site-actions" aria-labelledby="bo-site-actions-title"><h2 id="bo-site-actions-title">Workload & recovery</h2><div>{globalAffordances.map(renderAction)}</div></section>}
    <div className="bo-layout"><div className="bo-main">
      <section className="bo-world" aria-labelledby="bo-map-title"><div className="bo-section-heading"><div><h2 id="bo-map-title">Facility overview</h2><p>Select equipment to inspect its evidence and available actions.</p></div><label>Map overlay <select value={overlay} onChange={e => setOverlay(e.target.value as MapOverlay)}><option value="none">None</option><option value="temperature">Temperature</option><option value="power">Power</option></select></label></div>
        <FacilityMap view={view} selectedId={selectedId} overlay={overlay} onSelect={choose} />
        <div className="bo-map-caption"><span>20 × 12 tiles · overhead view</span><span>{overlay === 'none' ? 'Select an asset for details' : 'Cyan: recent · Amber: stale · Gray: unknown'}</span></div>
      </section>
      <section className="bo-list" aria-labelledby="bo-equipment-title"><div className="bo-section-heading"><div><h2 id="bo-equipment-title">Equipment</h2><p>Keyboard accessible asset selection</p></div><span>{view.knownTopology.assets.length} assets</span></div><div className="bo-equipment">{view.knownTopology.assets.map(a => <button key={a.id} type="button" aria-pressed={a.id === selectedId} onClick={() => choose(a.id)}><span>{a.label}</span><small>{label(a.kind)}</small></button>)}</div></section>
      <section className="bo-crew" aria-labelledby="bo-crew-title"><div className="bo-section-heading"><div><h2 id="bo-crew-title">Crew & assignments</h2><p>Public task progress</p></div></div><div className="bo-crew-list">{view.crew.map(c => { const task = view.tasks.find(t => t.id === c.taskId) ?? view.tasks.find(t => t.actorId === c.id && !['completed','canceled'].includes(t.status)); return <div key={c.id}><strong>{c.name}</strong><span>{label(c.role)}</span><p>{task ? `${label(task.action)} · ${label(task.status)}` : 'No active assignment'}</p>{task && <><progress max="1" value={task.progress} aria-label={`${c.name} task progress`} /><small>{Math.round(task.progress * 100)}% · {task.reason ?? `Target ${view.knownTopology.assets.find(a => a.id === task.targetId)?.label ?? task.targetId}`}</small></>}</div>; })}</div></section>
    </div><aside className="bo-inspector" aria-label="Asset inspector">
      <div className="bo-inspector-heading"><h2>{asset?.label ?? 'Select equipment'}</h2><p>{asset ? label(asset.kind) : 'Choose an asset on the map or from the equipment list.'}</p></div>
      {asset ? <><section><h3>Observations</h3>{observations.length ? observations.map(o => <div className="bo-observation" key={o.id}><div><strong>{label(o.field)}</strong><span className={`bo-status bo-${readingStatus(o, view.simTime)}`}>{readingStatus(o, view.simTime)}</span></div><p>{o.value === null ? 'Unknown' : String(o.value)} {o.units}</p><small>{label(o.quality)} · {o.source} · observed {time(o.observedAt)} · received {time(o.receivedAt)}</small></div>) : <p className="bo-muted">No observations received. State is unknown.</p>}</section>
        <section><h3>Known dependencies</h3><p>{asset.dependencies.length ? asset.dependencies.map(id => view.knownTopology.assets.find(a => a.id === id)?.label ?? id).join(', ') : 'None listed'}</p></section>
        <section><h3>Actions</h3>{affordances.length ? affordances.map(renderAction) : <p className="bo-muted">No actions available for this asset.</p>}</section></> : <section><h3>First steps</h3><ol><li>Select an asset to see its observations.</li><li>Check when each reading was observed and received.</li><li>Choose an available inspection, review timing and select a technician before dispatch.</li></ol></section>}
      <section><h3>Mission objectives</h3><ul className="bo-objectives">{view.objectives.map(o => <li key={o.id}><span>{o.label}</span><strong>{label(o.state)}</strong></li>)}</ul></section>
      <section><h3>Ask a coworker</h3><label>Recipient<select value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">Choose a coworker</option>{view.crew.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Message<textarea value={message} maxLength={1600} onChange={e => setMessage(e.target.value)} placeholder="Ask about the available evidence" /></label><button disabled={!canAct || !recipient || !message.trim()} onClick={() => { if (canAct && recipient && message.trim()) { onAskCoworker(recipient, message.trim()); setMessage(''); } }}>Send message</button>{view.messages.map(m => <p className="bo-message" key={m.id}><strong>{m.speaker} · {label(m.mode)} · {time(m.at)}</strong><br />{m.text}</p>)}</section>
    </aside></div><footer className="bo-footer">Fictional training model · No live facility connection</footer>
  </main>;
}
