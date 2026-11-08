import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DesktopGameProps, KnowledgeView } from '../shared/contracts';
import { moveCrewIntent, terminal } from '../game/desktop-world';
import { makeAction, parseCeiling, readingStatus } from './presentation';
import { missionText, observationText, proposalForConfirmation, radioCitations, radioProvenance, radioReceipts, radioReport, timeLabel, words } from './desktop-copy';
import { DraftEditor, PagedText } from './DesktopPaging';

type Affordance = KnowledgeView['affordances'][number];
export function SectionChoice({ value, choices, onChange, label }: { value: string; choices: readonly string[]; onChange: (value: string) => void; label: string }) {
  return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>{choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}</select>;
}
function RecordChoice({ index, count, onIndex, label }: { index: number; count: number; onIndex: (index: number) => void; label: string }) {
  return <div className="blackout-record-choice" aria-label={`${label} selection`}><button aria-label={`Previous ${label.toLowerCase()}`} disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronLeft size={16} /></button><span>{index + 1} / {count}</span><button aria-label={`Next ${label.toLowerCase()}`} disabled={index >= count - 1} onClick={() => onIndex(index + 1)}><ChevronRight size={16} /></button></div>;
}

function ActionPanel({ props, affordances }: { props: DesktopGameProps; affordances: Affordance[] }) {
  const [index, setIndex] = useState(0), [mode, setMode] = useState('Details'), [ceiling, setCeiling] = useState('50'), [taskId, setTaskId] = useState('');
  const { view } = props, action = affordances[Math.min(index, affordances.length - 1)];
  if (!action) return <PagedText text="No public actions are offered here. Select equipment or review the available evidence." />;
  const tasks = view.tasks.filter(t => t.targetId === action.targetId && !['completed', 'canceled'].includes(t.status));
  const taskIndex = tasks.findIndex(t => t.id === taskId), task = tasks[taskIndex];
  const extra = action.action === 'set_batch_ceiling' ? { ceiling: parseCeiling(ceiling) } : action.action === 'cancel_task' ? { taskId: task?.id } : {};
  const intent = terminal(view) || props.busy || props.session === 'welcome' ? null : makeAction(action, view.simTime, props.selectedCrewId ?? '', extra);
  const detail = `${action.action === 'inspect' ? 'TECHNICAL INSPECTION' : words(action.action).toUpperCase()}\nTarget: ${action.targetId}\n\n${action.enabled ? 'Offered by the engine.' : 'UNAVAILABLE'}\n${action.reason ?? ''}\nTravel: ${action.travelSeconds === null ? 'not supplied' : `${action.travelSeconds} seconds`}\nWork: ${action.workSeconds} seconds\n\n${action.technicianIds.length ? `Choose an eligible technician:\n${action.technicianIds.map(id => view.crew.find(c => c.id === id)?.name ?? id).join('\n')}` : 'No field technician is required.'}\n\n${action.action === 'cancel_task' ? 'Cancellation is explicit. Completed work is handled by the engine; replacement never cancels another assignment automatically.' : 'Dispatch requests validation. A receipt or visible progress does not mean the task has finished.'}`;
  return <div className="blackout-fill">
    <div className="blackout-toolbar"><RecordChoice index={Math.min(index, affordances.length - 1)} count={affordances.length} onIndex={next => { setIndex(next); setTaskId(''); }} label="Action" /><button aria-pressed={mode === 'Dispatch'} onClick={() => setMode(mode === 'Details' ? 'Dispatch' : 'Details')}>{mode === 'Details' ? 'Dispatch controls' : 'Review details'}</button></div>
    {mode === 'Details' ? <PagedText text={`${detail}${action.action === 'cancel_task' ? `\n\nSELECTED TASK\n${task ? `${task.id}\nActor: ${task.actorId}\n${words(task.action)} · ${task.status}\nTarget: ${task.targetId}` : 'Choose a task in Dispatch controls. An obsolete task selection cannot cancel a replacement.'}` : ''}`} label="Action details" /> : <div className="blackout-dispatch">
      <p className="blackout-action-name">Travel {action.travelSeconds ?? '?'}s · Work {action.workSeconds}s</p>
      {action.technicianIds.length > 0 && <select aria-label="Technician" value={action.technicianIds.includes(props.selectedCrewId ?? '') ? props.selectedCrewId! : ''} onChange={event => { props.onSelectCrew(event.target.value || null); if (event.target.value) props.onTutorialEvent('crew_selected'); }}><option value="">Choose technician</option>{action.technicianIds.map(id => <option key={id} value={id}>{view.crew.find(c => c.id === id)?.name ?? id}</option>)}</select>}
      {action.action === 'set_batch_ceiling' && <label className="blackout-inline-field">Ceiling (units/s per rack)<input aria-label="Batch ceiling" type="number" min={0} max={100} value={ceiling} onChange={event => setCeiling(event.target.value)} /></label>}
      {action.action === 'cancel_task' && (tasks.length ? task ? <RecordChoice index={taskIndex} count={tasks.length} onIndex={next => setTaskId(tasks[next].id)} label="Task" /> : <button onClick={() => setTaskId(tasks[0].id)}>Choose task</button> : <p>No active task can be canceled.</p>)}
      <button className="blackout-primary" disabled={!intent} onClick={() => { if (intent) props.onAction(intent); }}>Dispatch {words(action.action)}</button>
    </div>}
  </div>;
}

export function EquipmentPanel({ props }: { props: DesktopGameProps }) {
  const { view } = props, [tab, setTab] = useState('Overview');
  const index = view.knownTopology.assets.findIndex(a => a.id === props.selectedAssetId), asset = view.knownTopology.assets[index];
  const choose = (next: number) => { const selected = view.knownTopology.assets[next]; if (selected) { props.onSelectAsset(selected.id); props.onTutorialEvent('equipment_opened'); } };
  const observations = view.observations.filter(o => o.assetId === asset?.id).sort((a, b) => b.observedAt - a.observedAt);
  return <div className="blackout-fill">
    <div className="blackout-toolbar"><RecordChoice index={Math.max(0, index)} count={view.knownTopology.assets.length} onIndex={choose} label="Equipment" /><SectionChoice label="Equipment section" value={tab} choices={['Overview', 'Readings', 'Work', 'Dependencies']} onChange={setTab} /></div>
    {asset && tab === 'Overview' ? <div className="blackout-equipment-overview">
      <table className="blackout-equipment-table"><tbody>{[
        ['Power', observations.find(o => ['power', 'power_state', 'output_state'].includes(o.field))],
        ['Output', observations.find(o => ['running', 'state', 'inlet_temperature_c', 'temperatureC'].includes(o.field))],
        ['Cause', observations.find(o => o.field === 'prerequisite_ready')],
      ].map(([label, entry]) => { const observation = typeof entry === 'object' ? entry : undefined; const state = readingStatus(observation ?? null, view.simTime); const text = observation ? `${typeof observation.value === 'boolean' ? observation.field === 'running' ? observation.value ? 'Running' : 'Stopped' : String(observation.value) : words(String(observation.value))}${observation.units && observation.units !== 'state' ? ` ${observation.units}` : ''}` : label === 'Cause' ? 'Unconfirmed' : 'Unknown'; return <tr key={String(label)} className={label === 'Cause' ? 'blackout-overview-extra' : ''}><th scope="row">{String(label)}</th><td>{text.length > 22 ? <button onClick={() => setTab('Readings')}>Read full evidence</button> : state === 'stale' ? `${text} · stale` : text}</td></tr>; })}<tr className="blackout-overview-extra"><th scope="row">Sample</th><td>{observations[0] ? timeLabel(observations[0].observedAt) : 'Unknown'}</td></tr></tbody></table>
      <div className="blackout-toolbar"><button data-training="timestamp_read" disabled={!observations.length} onClick={() => { setTab('Readings'); props.onTutorialEvent('timestamp_read'); }}>Read timestamps</button><button onClick={() => setTab('Dependencies')}>Dependencies</button></div>
      <button className="blackout-primary" onClick={() => setTab('Work')}>Technical inspection / work</button>
    </div> : null}
    {!asset ? <><PagedText text="Choose equipment on the map, use E near its service tile, or browse the equipment records. E only opens already permitted information. Technical inspection dispatches real crew work." /><button onClick={() => choose(0)}>Choose first equipment</button></> : tab === 'Work' ? <ActionPanel key={asset.id} props={props} affordances={view.affordances.filter(a => a.targetId === asset.id && a.action !== 'move_crew')} /> : tab === 'Dependencies' ? <PagedText text={`${asset.label}\nAsset: ${asset.id}\nKind: ${asset.kind}\nService tile: ${asset.serviceTile.x}, ${asset.serviceTile.y}\n\nKNOWN DEPENDENCIES\n${asset.dependencies.map(id => `${view.knownTopology.assets.find(a => a.id === id)?.label ?? id}\n${id}`).join('\n\n') || 'None listed.'}\n\nDependencies describe the public layout. Their current state still requires evidence.\n\nPERMITTED PROCEDURES\n${view.allowedProcedureIds.join('\n') || 'None supplied in this view.'}\nUse Radio provenance for the excerpts supplied with a coworker exchange.`} label="Dependencies" /> : tab === 'Readings' ? <>
      <PagedText text={`${asset.label}\n\n${observations.length ? observations.map(o => observationText(o, view.simTime)).join('\n\n') : 'Unknown. No observations have been delivered for this asset.'}`} label="Equipment evidence" />
      <button data-training="timestamp_read" disabled={!observations.length} onClick={() => props.onTutorialEvent('timestamp_read')}>Read timestamps</button>
    </> : null}
  </div>;
}

export function CommandPanel({ props }: { props: DesktopGameProps }) {
  const [tab, setTab] = useState('Site'), [x, setX] = useState('10'), [y, setY] = useState('6');
  const { view } = props, crew = view.crew.find(c => c.id === props.selectedCrewId), task = view.tasks.find(t => t.id === crew?.taskId);
  const movement = !props.busy && props.session !== 'welcome' ? moveCrewIntent(view, props.selectedCrewId, { x: Number(x), y: Number(y) }) : null;
  return <div className="blackout-fill"><SectionChoice value={tab} onChange={setTab} choices={['Site', 'Crew', 'Movement', 'Tasks']} label="Command section" />
    {tab === 'Site' ? <ActionPanel props={props} affordances={view.affordances.filter(a => a.action !== 'move_crew' && !view.knownTopology.assets.some(asset => asset.id === a.targetId))} /> : tab === 'Crew' ? <>
      <div className="blackout-toolbar">{view.crew.filter(c => c.role !== 'remote').map(c => <button key={c.id} aria-pressed={props.selectedCrewId === c.id} onClick={() => { props.onSelectCrew(c.id); props.onTutorialEvent('crew_selected'); }}>{c.name.split(' ')[0]}</button>)}</div>
      <PagedText text={crew ? `${crew.name} · ${crew.role}\nPosition: ${crew.x}, ${crew.y}\n\n${task ? `${words(task.action)} · ${task.status}\nTarget: ${task.targetId}\nStarted ${timeLabel(task.startedAt)}\nArrival ${timeLabel(task.arrivalAt)}\nCompletion ${timeLabel(task.completesAt)}\nProgress: ${Math.round(task.progress * 100)}%\n${task.reason ?? ''}\n\nBusy technicians require explicit cancellation before new movement or work.` : 'Ready. Click a walkable floor tile to request a route, or use Movement for a keyboard equivalent.'}` : 'Select Alex or Jules here or in the crew dock, then click the floor to request movement.'} label="Crew assignment" />
    </> : tab === 'Movement' ? <><div className="blackout-toolbar"><label>X<input aria-label="Destination X" type="number" step={1} min={0} max={view.knownTopology.width - 1} value={x} onChange={event => setX(event.target.value)} /></label><label>Y<input aria-label="Destination Y" type="number" step={1} min={0} max={view.knownTopology.height - 1} value={y} onChange={event => setY(event.target.value)} /></label></div><PagedText text={crew ? `${crew.name}\nRequest movement to an integer walkable cell. The engine validates the route and availability. A movement arrival creates no equipment reading.` : 'First choose a field technician in the crew dock or Crew section.'} /><button disabled={!movement || !x.trim() || !y.trim()} onClick={() => { if (movement) props.onAction(movement); }}>Move selected technician</button></> : <PagedText text={view.tasks.map(t => `${words(t.action).toUpperCase()} · ${t.status}\nTask: ${t.id}\nActor: ${t.actorId}\nTarget: ${t.targetId}\nStarted ${timeLabel(t.startedAt)}\nArrival ${timeLabel(t.arrivalAt)}\nCompletion ${timeLabel(t.completesAt)}\nProgress ${Math.round(t.progress * 100)}%\n${t.reason ?? ''}`).join('\n\n') || 'No public tasks. Work and reports are controlled by the engine.'} label="Public tasks" />}
  </div>;
}

export function RadioPanel({ props, recipient, onRecipient, draft, onDraft }: { props: DesktopGameProps; recipient: string; onRecipient: (id: string) => void; draft: string; onDraft: (draft: string) => void }) {
  const [tab, setTab] = useState('Report'), [index, setIndex] = useState(0);
  const proposalCount = props.exchange?.reply.kind === 'final' ? props.exchange.reply.response.proposals.length : 0;
  const proposal = proposalForConfirmation(props.exchange, Math.min(index, Math.max(0, proposalCount - 1)), props.view.runId);
  const sameRun = props.exchange?.start.runId === props.view.runId;
  const available = !terminal(props.view) && !props.busy && props.session !== 'welcome';
  return <div className="blackout-fill">
    <div className="blackout-toolbar"><SectionChoice value={tab} onChange={setTab} choices={['Report', 'Message', 'Citations', 'Proposals', 'Receipts', 'Provenance', 'Log']} label="Radio section" />{tab === 'Message' && <select aria-label="Recipient" value={recipient} onChange={event => onRecipient(event.target.value)}><option value="">To…</option>{props.view.crew.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div>
    {tab === 'Message' ? <><DraftEditor draft={draft} onDraft={onDraft} /><div className="blackout-toolbar"><button className="blackout-primary" disabled={!available || props.radioBusy || !recipient || !draft.trim()} onClick={() => { if (available && recipient && draft.trim()) props.onAskCoworker(recipient, draft); }}>Send message</button>{props.radioBusy && <button onClick={props.onCancelCoworker}>Cancel radio</button>}</div></> : tab === 'Proposals' ? <>
      {proposalCount > 0 && <RecordChoice index={Math.min(index, proposalCount - 1)} count={proposalCount} onIndex={setIndex} label="Proposal" />}
      <PagedText text={proposal ? `PROPOSAL · ${words(proposal.action)}\nTarget: ${proposal.targetId}\nOriginal intent time: ${timeLabel(proposal.atSimTime)}\nArguments:\n${JSON.stringify(proposal.args, null, 2)}\n\nConfirmation sends this original intent to the host for validation against its original exchange versions. A proposal is not authorization or completed work.` : sameRun ? 'No action proposals in this reply.' : 'No current-run proposal. Previous-run replies cannot be confirmed.'} label="Proposal" />
      <button className="blackout-primary" disabled={!proposal || !available || props.radioBusy} onClick={() => { if (proposal && available) props.onAction(proposal); }}>Confirm proposal</button>
    </> : <PagedText label={`Radio ${tab.toLowerCase()}`} text={tab === 'Report' ? radioReport(props.exchange) : tab === 'Citations' ? radioCitations(props.exchange) : tab === 'Receipts' ? radioReceipts(props.exchange) : tab === 'Provenance' ? radioProvenance(props.exchange) : props.view.messages.map(message => `${message.speaker} · ${message.mode.toUpperCase()} · ${timeLabel(message.at)}\n${message.text}\nEvidence: ${message.evidenceIds.join(', ') || 'none'}\nMessage: ${message.id}`).join('\n\n') || 'No delivered radio messages.'} />}
  </div>;
}

const instructions = `YOUR ROLE\nCoordinate the crew and protect critical service. The commander is a presentation avatar: walking and E never repair equipment or create evidence.\n\nWORLD CONTROLS\nFocus the world, then use WASD or arrows to walk. E opens already permitted information near an equipment service tile. Tab leaves the world. Direction buttons offer the same movement.\n\nCREW\nSelect Alex (Facilities) or Jules (Electrical), then click a walkable floor tile. This requests a real engine route. Busy workers require explicit task cancellation before replacement. Command → Movement provides a keyboard equivalent.\n\nEVIDENCE\nEquipment → Readings shows observed and received timestamps, source, quality and age. Use Read timestamps after reviewing them. Stale evidence is not a current state.\n\nTECHNICAL INSPECTION\nEquipment → Work offers the engine’s actions. Review travel and work time, open Dispatch controls, choose an eligible technician and dispatch. Arrival, work, and delivered reports are different milestones. Reports may arrive later.\n\nRADIO\nUse Message to ask a coworker. Every draft page belongs to one retained message, up to 1600 characters. Report labels facts, inference and uncertainty. Citations, proposals, receipts and provenance have separate pages. Confirming a proposal sends its original intent for validation. Scripted fallback is labeled.\n\nPLAYBACK\nPause freezes mission presentation. 1x, 2x and 4x scale mission animation. Input clears on focus loss, pause and reset. Reduced motion keeps decorative frames still.\n\nWORKLOAD\nSite commands trade deferrable work against service and thermal headroom. The engine retains backlog and decides outcomes; the UI cannot complete a repair or award success.\n\nPRACTICE\nSafe practice uses a healthy scenario with no scheduled disturbance or mission deadline. Start timed incident creates a fresh run at zero.\n\nREADING\nUse page arrows for every part of a long record. Enlarge text panel creates a full-stage reading view; World returns to the facility.\n\nFictional training model. No live facility connection or real equipment instructions.`;
export function InformationPanel({ props, feedback = false }: { props: DesktopGameProps; feedback?: boolean }) {
  const [tab, setTab] = useState(feedback ? 'Feedback' : 'Objectives');
  return <div className="blackout-fill">{props.panel === 'objectives' && <SectionChoice value={tab} choices={['Objectives', 'Feedback']} onChange={setTab} label="Mission section" />}
    <PagedText text={props.panel === 'help' ? instructions : tab === 'Feedback' ? `NOTICE\n${props.notice || 'No notice.'}\n\nERROR\n${props.error || 'No error.'}` : missionText(props.view)} label={props.panel === 'help' ? 'Instructions' : 'Mission information'} />
    {props.session === 'practice' && <button onClick={props.onStartMission}>Start timed incident</button>}
    {props.panel === 'help' && props.session === 'mission' && !terminal(props.view) && <button onClick={props.onRetry}>Restart mission</button>}
    {terminal(props.view) && <button onClick={props.onRetry}>Retry mission</button>}
  </div>;
}
