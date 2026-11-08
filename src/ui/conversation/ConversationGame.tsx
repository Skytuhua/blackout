import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Send } from 'lucide-react';
import type { ConversationEntry, ConversationGameProps, ConversationThread } from '../../shared/contracts';
import { ConversationMap } from '../../game/ConversationMap';
import { DesktopPortrait } from '../../game/DesktopPortrait';
import { DraftEditor, PagedText } from '../DesktopPaging';
import { entryPresentation, wholeEntryPages } from './history';
import './ConversationGame.css';
import { TaskProgress } from './TaskProgress';
import { publicTaskProgress } from '../../game/public-task-ui';

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const kindLabels = { player: 'You', order: 'Order', system: 'System', live: 'Live reply', fallback: 'Scripted fallback', report: 'Report' };
const statusLabels = { ready: 'Ready', walking: 'Walking', checking: 'Checking', working: 'Working', report_pending: 'Report arriving', delivered: 'Report delivered' };
const portraitRoles = { Cooling: 'facilities', Power: 'electrical', IT: 'remote' } as const;

function Proposals({ entry, props, compact = false, measurement = false }: { entry: ConversationEntry; props: ConversationGameProps; compact?: boolean; measurement?: boolean }) {
  const [page, setPage] = useState(0), proposals = entry.proposals ?? [], index = Math.min(page, Math.max(0, proposals.length - 1));
  if (!proposals.length) return null;
  return <div className="conv-proposals">{(measurement ? proposals : proposals.slice(index, index + 1)).map(proposal => <div className="conv-proposal" key={proposal.id}>
    <div className="conv-proposal-actions">
      {proposals.length > 1 && <button aria-label="Previous proposal" disabled={index === 0} onClick={() => setPage(index - 1)}><ChevronLeft size={16} /></button>}
      <button className="conv-authorize" disabled={proposal.status !== 'ready' || props.busy || ['success', 'failure'].includes(props.view.mission.status)} onClick={() => props.onExecuteProposal(proposal.id)}>{proposal.label} · {proposal.assignedName}</button>
      {proposals.length > 1 && <button aria-label="Next proposal" disabled={index === proposals.length - 1} onClick={() => setPage(index + 1)}><ChevronRight size={16} /></button>}
    </div>
    {proposal.status !== 'ready' && <span>{proposal.status === 'sending' ? 'Sending' : proposal.status === 'accepted' ? 'Accepted' : 'Rejected'}{!compact && proposal.reason && proposal.reason.length <= 120 ? `: ${proposal.reason}` : ''}</span>}
    {!compact && proposal.reason && proposal.reason.length > 120 && <button onClick={() => props.onOpenEntry(entry.actorId, entry.id)}>Read action details</button>}
  </div>)}</div>;
}

function Entry({ entry, props, oversized = false, measurement = false }: { entry: ConversationEntry; props: ConversationGameProps; oversized?: boolean; measurement?: boolean }) {
  const display = entryPresentation(entry, oversized);
  return <article className={`conv-entry conv-entry-${entry.kind}${oversized ? ' conv-entry-compact' : ''}`} data-entry-id={entry.id}>
    <div className="conv-entry-meta"><span>{kindLabels[entry.kind]}</span><time>{time(entry.at)}</time></div>
    {(!oversized || !display.reader) && <p>{display.text}</p>}
    {display.reader && <button className="conv-open-entry" onClick={() => props.onOpenEntry(entry.actorId, entry.id)}>Read {entry.kind === 'report' ? 'report' : 'full message'}</button>}
    <Proposals entry={entry} props={props} compact={oversized} measurement={measurement} />
  </article>;
}

function History({ thread, props }: { thread: ConversationThread; props: ConversationGameProps }) {
  const window = useRef<HTMLDivElement>(null), measure = useRef<HTMLDivElement>(null), compact = useRef<HTMLDivElement>(null);
  const measureKey = JSON.stringify(thread.entries.map(entry => [entry.id, entry.text, entry.proposals]));
  const [layout, setLayout] = useState<{ pages: string[][]; oversized: string[]; measured: string }>({ pages: [thread.entries.slice(-1).map(entry => entry.id)], oversized: [], measured: '' });
  useLayoutEffect(() => {
    const container = window.current, mirror = measure.current; if (!container || !mirror) return;
    const update = () => {
      const height = container.clientHeight; if (!height) return;
      const items = Array.from(mirror.children) as HTMLElement[];
      const oversized = items.filter(item => item.offsetHeight > height).map(item => item.dataset.entryId!);
      const compactItems = Array.from(compact.current?.children ?? []) as HTMLElement[];
      const pages = wholeEntryPages(items.map((item, i) => ({ id: item.dataset.entryId!, height: oversized.includes(item.dataset.entryId!) ? compactItems[i].offsetHeight : item.offsetHeight })), height, 8);
      setLayout(previous => JSON.stringify(previous) === JSON.stringify({ pages, oversized, measured: measureKey }) ? previous : { pages, oversized, measured: measureKey });
    };
    update(); const observer = new ResizeObserver(update); observer.observe(container); observer.observe(mirror);
    document.fonts.addEventListener('loadingdone', update);
    return () => { observer.disconnect(); document.fonts.removeEventListener('loadingdone', update); };
  }, [thread.entries]);
  const page = layout.pages.length - 1;
  const visible = thread.entries.filter(entry => layout.pages[page]?.includes(entry.id));
  const read = visible.filter(entry => { const display = entryPresentation(entry, layout.oversized.includes(entry.id)); return layout.measured === measureKey && entry.unread && display.text === entry.text; }).map(entry => entry.id);
  const readKey = JSON.stringify(read), sent = useRef('');
  useEffect(() => { if (read.length && sent.current !== readKey) { sent.current = readKey; props.onReadEntries(thread.actorId, read); } }, [readKey, props.onReadEntries, thread.actorId]);
  return <div className="conv-history">
    <div className="conv-history-window" ref={window} aria-label={`${thread.name} conversation history`}>
      {!thread.entries.length && <p className="conv-empty">Ask {thread.name} a question or choose an order below.</p>}
      {visible.map(entry => <Entry key={entry.id} entry={entry} props={props} oversized={layout.oversized.includes(entry.id)} />)}
      <div className="conv-history-measure" ref={measure} aria-hidden="true" inert>{thread.entries.map(entry => <Entry key={entry.id} entry={entry} props={props} measurement />)}</div>
      <div className="conv-history-measure" ref={compact} aria-hidden="true" inert>{thread.entries.map(entry => <Entry key={entry.id} entry={entry} props={props} oversized measurement />)}</div>
    </div>
  </div>;
}

function Reader({ props, thread, entry }: { props: ConversationGameProps; thread: ConversationThread; entry: ConversationEntry }) {
  const [section, setSection] = useState(0);
  const read = useRef(false);
  useEffect(() => { if (entry.unread && !read.current) { read.current = true; props.onReadEntries(thread.actorId, [entry.id]); } }, [entry.unread, entry.id, thread.actorId, props.onReadEntries]);
  // Full text always remains present even when the host adds structured evidence.
  const sections = [{ id: 'full-text', label: 'Full message', text: entry.text }, ...(entry.sections ?? []), ...(entry.proposals ?? []).filter(proposal => proposal.reason).map(proposal => ({ id: proposal.id, label: `${proposal.assignedName} action result`, text: `${proposal.label} · ${proposal.assignedName}\n${proposal.status}\n${proposal.reason}` }))];
  const index = Math.min(section, sections.length - 1);
  return <section className="conv-reader" aria-label={`${thread.name} message reader`}>
    <div className="conv-reader-heading"><button onClick={props.onCloseEntry}>Back</button><strong>{thread.name} · {kindLabels[entry.kind]}</strong></div>
    {sections.length > 1 && <label className="conv-section-label">Section<select aria-label="Section" value={index} onChange={event => setSection(Number(event.target.value))}>{sections.map((item, i) => <option key={item.id} value={i}>{item.label}</option>)}</select></label>}
    <PagedText key={`${index}:${sections[index].id}`} text={sections[index].text} label="Message text" />
    <div className="conv-reader-proposals"><Proposals entry={entry} props={props} compact /></div>
  </section>;
}

export function ConversationGame(props: ConversationGameProps) {
  const [focus, setFocus] = useState<'conversation' | 'world'>('conversation'), [expanded, setExpanded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(360), [viewportWidth, setViewportWidth] = useState(1280);
  const dragging = useRef<number | null>(null), sent = useRef<string | null>(null);
  const maximumWidth = Math.max(320, Math.min(640, viewportWidth - 652));
  useEffect(() => {
    const resize = () => { setViewportWidth(innerWidth); setSidebarWidth(width => Math.max(320, Math.min(width, Math.min(640, innerWidth - 652)))); };
    const blur = () => { dragging.current = null; composing.current = false; };
    resize(); window.addEventListener('resize', resize); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('blur', blur); };
  }, []);
  const [orderPages, setOrderPages] = useState<Record<string, number>>({});
  const run = useRef(props.view.runId);
  useEffect(() => { if (run.current !== props.view.runId) { run.current = props.view.runId; setOrderPages({}); setExpanded(false); } }, [props.view.runId]);
  const thread = props.conversations.find(item => item.actorId === props.selectedActorId);
  const composer = useRef<HTMLTextAreaElement>(null), composing = useRef(false), shell = useRef<HTMLElement>(null);
  useLayoutEffect(() => { const field = composer.current; if (field && (field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1)) setExpanded(true); }, [thread?.actorId, sidebarWidth]);
  useEffect(() => { sent.current = null; }, [thread?.actorId, thread?.draft, props.view.runId]);
  useEffect(() => { composing.current = false; }, [thread?.actorId, props.view.runId]);
  useLayoutEffect(() => { if (expanded) shell.current?.querySelector<HTMLTextAreaElement>('.conv-expanded-editor textarea')?.focus(); }, [expanded]);
  useEffect(() => { if (!thread || !props.guidance?.targetOrderId) return; const index = thread.suggestedOrders.findIndex(order => order.id === props.guidance?.targetOrderId); if (index >= 0) setOrderPages(current => ({ ...current, [thread.actorId]: index })); }, [thread?.actorId, props.guidance?.targetOrderId]);
  const readerThread = props.conversations.find(item => item.actorId === props.reader?.actorId);
  const entry = props.menuOpen ? undefined : readerThread?.entries.find(item => item.id === props.reader?.entryId);
  const terminal = ['success', 'failure'].includes(props.view.mission.status);
  const send = () => {
    if (!thread?.draft.trim() || thread.busy || props.busy || terminal || props.menuOpen || props.session === 'welcome' || composing.current) return;
    const key = JSON.stringify([props.view.runId, thread.actorId, thread.draft]); if (sent.current === key) return;
    sent.current = key; props.onSend(thread.actorId); setExpanded(false);
  };
  const summaryAge = props.view.simTime - props.view.summary.observedAt;
  const service = summaryAge < 0 || props.view.summary.criticalServedFraction === null ? 'Critical service unknown' : summaryAge > 10 ? 'Critical service reading is old' : props.view.summary.criticalServedFraction === 1 ? 'Critical service 100%' : 'Critical service reduced';
  const orderPage = thread ? Math.min(orderPages[thread.actorId] ?? 0, Math.max(0, thread.suggestedOrders.length - 1)) : 0;
  const speedControl = <label className="conv-speed">Speed<select aria-label="Simulation speed" value={props.speed} onChange={event => props.onSpeed(Number(event.target.value) as 1 | 2 | 4)}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>;
  return <main ref={shell} className={`conv-game conv-focus-${focus}${expanded ? ' conv-expanded' : ''}`} style={{ '--conv-sidebar-width': `${sidebarWidth}px` } as CSSProperties} data-paused={props.paused} aria-label="Blackout conversation game">
    <div className="conv-world-pane" inert={props.menuOpen || props.session === 'welcome'}>
      <header className="conv-header"><h1>BLACKOUT</h1><span>{service}</span><time>{time(props.view.simTime)}</time>{speedControl}<button onClick={props.onPause}>{props.paused ? 'Resume' : 'Pause'}</button><button onClick={props.onMenuToggle}>Menu</button><button className="conv-chat-control" onClick={() => setFocus('conversation')}>Conversation</button></header>
      <div className="conv-objective"><h2>{props.objective}</h2>{props.alerts[0] && <div className="conv-notification" data-level={props.alerts[0].level} role={props.alerts[0].level === 'warning' ? 'alert' : 'status'} aria-label="Facility notification"><span className="conv-notification-icon" aria-hidden="true">!</span><div><strong>{props.alerts[0].level === 'warning' ? 'Facility alert' : 'Team update'}</strong><p>{props.alerts[0].text}</p></div></div>}</div>
      {props.guidance?.paused && <div className="conv-guidance"><p>{props.guidance.text}</p>{props.guidance.canContinue && <button onClick={props.onContinueGuide}>Continue</button>}</div>}
      <ConversationMap {...props} />
    </div>
    <div className="conv-sidebar-divider" role="separator" aria-label="Resize conversation sidebar" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={maximumWidth} aria-valuenow={sidebarWidth} aria-controls="conv-sidebar" tabIndex={props.menuOpen || props.session === 'welcome' ? -1 : 0} inert={props.menuOpen || props.session === 'welcome'} title="Drag to resize. Use arrow keys, Home or End."
      onPointerDown={event => { if (event.button !== 0) return; dragging.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); event.preventDefault(); }}
      onPointerMove={event => { if (dragging.current === event.pointerId) setSidebarWidth(Math.max(320, Math.min(maximumWidth, innerWidth - event.clientX - 6))); }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} onLostPointerCapture={() => { dragging.current = null; }}
      onKeyDown={event => { const width = event.key === 'Home' ? 320 : event.key === 'End' ? maximumWidth : event.key === 'ArrowLeft' ? sidebarWidth + 16 : event.key === 'ArrowRight' ? sidebarWidth - 16 : null; if (width !== null) { event.preventDefault(); setSidebarWidth(Math.max(320, Math.min(maximumWidth, width))); } }} />
    <aside id="conv-sidebar" className="conv-sidebar" aria-label="Team conversation" inert={props.menuOpen || props.session === 'welcome'} onCompositionStartCapture={() => { composing.current = true; }} onCompositionEndCapture={() => { composing.current = false; }} onKeyDownCapture={event => { if (!(event.target instanceof HTMLTextAreaElement) || event.key !== 'Enter' || event.shiftKey || composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return; event.preventDefault(); if (!event.repeat) send(); }}>
      <div className="conv-compact-toolbar"><button onClick={() => { setFocus('world'); setExpanded(false); }}>World</button><time>{time(props.view.simTime)}</time>{speedControl}<button onClick={props.onPause}>{props.paused ? 'Resume' : 'Pause'}</button><button onClick={props.onMenuToggle}>Menu</button></div>
      <div className="conv-tabs" role="tablist" aria-label="Coworkers">{props.conversations.map((item, index) => <button key={item.actorId} role="tab" tabIndex={props.selectedActorId === item.actorId ? 0 : -1} aria-selected={props.selectedActorId === item.actorId} data-guide-target={props.guidance?.targetActorId === item.actorId} aria-label={`${item.name} · ${item.role}${item.unread ? ` · ${item.unread} unread` : ''}`} onKeyDown={event => { const next = event.key === 'Home' ? 0 : event.key === 'End' ? props.conversations.length - 1 : event.key === 'ArrowLeft' ? (index + props.conversations.length - 1) % props.conversations.length : event.key === 'ArrowRight' ? (index + 1) % props.conversations.length : null; if (next === null) return; event.preventDefault(); setExpanded(false); props.onSelectActor(props.conversations[next].actorId); (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus(); }} onClick={() => { setExpanded(false); props.onSelectActor(item.actorId); }}>
        <DesktopPortrait role={portraitRoles[item.role]} /><span><strong>{item.name}</strong><span>{item.role}</span></span>{item.unread > 0 && <b className="conv-unread">{item.unread}</b>}
      </button>)}</div>
      {thread ? <>
        <div className="conv-assignment"><div><strong>{thread.name} · {publicTaskProgress(props.view, thread.actorId)?.phase ?? statusLabels[thread.assignment.status]}</strong><p>{thread.assignment.label}</p></div>{thread.assignment.taskId && ['walking', 'checking', 'working', 'report_pending'].includes(thread.assignment.status) && <div className="conv-busy-actions"><button onClick={() => props.onWait(thread.actorId)}>Wait</button><button disabled={props.busy || terminal} onClick={() => props.onStopTask(thread.actorId, thread.assignment.taskId!)}>Stop current task</button></div>}<TaskProgress view={props.view} actorId={thread.actorId} name={thread.name} />{thread.busy && <span role="status">Waiting for {thread.name}’s reply…</span>}</div>
        {entry && readerThread ? <Reader key={`${props.view.runId}:${readerThread.actorId}:${entry.id}`} props={props} thread={readerThread} entry={entry} /> : expanded ? <div className="conv-expanded-editor"><button onClick={() => setExpanded(false)}>Back to conversation</button><DraftEditor key={thread.actorId} draft={thread.draft} onDraft={draft => props.onDraftChange(thread.actorId, draft)} /><button disabled={!thread.draft.trim() || thread.busy || props.busy || terminal} onClick={send}>Send to {thread.name}</button></div> : <>
          <History key={`${props.view.runId}:${thread.actorId}`} thread={thread} props={props} />
          <div className="conv-orders" aria-label="Suggested orders">{thread.suggestedOrders.length > 1 && <button aria-label="Previous suggested order" disabled={orderPage === 0} onClick={() => setOrderPages(current => ({ ...current, [thread.actorId]: orderPage - 1 }))}><ChevronLeft size={16} /></button>}{thread.suggestedOrders[orderPage] ? <button className="conv-suggested" title={thread.suggestedOrders[orderPage].reason} disabled={!thread.suggestedOrders[orderPage].enabled || props.busy || terminal} data-guide-target={props.guidance?.targetOrderId === thread.suggestedOrders[orderPage].id} onClick={() => props.onSuggestedOrder(thread.suggestedOrders[orderPage].id)}>{thread.suggestedOrders[orderPage].label}</button> : <span>No suggested orders.</span>}{thread.suggestedOrders.length > 1 && <button aria-label="Next suggested order" disabled={orderPage === thread.suggestedOrders.length - 1} onClick={() => setOrderPages(current => ({ ...current, [thread.actorId]: orderPage + 1 }))}><ChevronRight size={16} /></button>}</div>
          <div className="conv-composer"><label htmlFor="conv-message">Message {thread.name}</label><div><textarea ref={composer} id="conv-message" rows={3} value={thread.draft} maxLength={1600} placeholder="Enter sends · Shift+Enter adds a line" onFocus={event => { if (event.target.scrollHeight > event.target.clientHeight + 1 || event.target.scrollWidth > event.target.clientWidth + 1) setExpanded(true); }} onChange={event => { props.onDraftChange(thread.actorId, event.target.value); if (!composing.current && (event.target.scrollHeight > event.target.clientHeight + 1 || event.target.scrollWidth > event.target.clientWidth + 1)) setExpanded(true); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; if (event.currentTarget.scrollHeight > event.currentTarget.clientHeight + 1) setExpanded(true); }} /><button aria-label={`Send to ${thread.name}`} disabled={!thread.draft.trim() || thread.busy || props.busy || terminal} onClick={send}><Send size={18} />Send</button></div></div>
        </>}
      </> : <p>Select a coworker.</p>}
    </aside>
    {props.menuOpen && props.menuContent}
    {props.session === 'welcome' && <section className="conv-welcome" aria-label="Welcome to Blackout"><h2>Keep the facility running.</h2><p>Direct Alex, Jules and Sam through an incident. Choose suggested orders or ask your team a question.</p><button className="conv-primary" onClick={props.onStartGuided}>Start guided game</button><button onClick={props.onStartPractice}>Practice</button></section>}
  </main>;
}
