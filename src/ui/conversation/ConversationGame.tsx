import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, Send } from 'lucide-react';
import type { ConversationEntry, ConversationGameProps, ConversationThread } from '../../shared/contracts';
import { ConversationMap } from '../../game/ConversationMap';
import { DesktopPortrait } from '../../game/DesktopPortrait';
import { DraftEditor, PagedText } from '../DesktopPaging';
import { entryPresentation, wholeEntryPages } from './history';
import './ConversationGame.css';

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const kindLabels = { player: 'You', order: 'Order', system: 'System', live: 'Live reply', fallback: 'Offline fallback', report: 'Report' };
const statusLabels = { ready: 'Ready', walking: 'Walking', checking: 'Checking', working: 'Working', report_pending: 'Report arriving', delivered: 'Report delivered' };
const portraitRoles = { Cooling: 'facilities', Power: 'electrical', IT: 'remote' } as const;

function Proposals({ entry, props }: { entry: ConversationEntry; props: ConversationGameProps }) {
  return <>{entry.proposals?.map(proposal => <div className="conv-proposal" key={proposal.id}>
    <button disabled={proposal.status !== 'ready' || props.busy || ['success', 'failure'].includes(props.view.mission.status)} onClick={() => props.onExecuteProposal(proposal.id)}>{proposal.label} · {proposal.assignedName}</button>
    {proposal.status !== 'ready' && <span>{proposal.status === 'sending' ? 'Sending' : proposal.status === 'accepted' ? 'Accepted' : 'Rejected'}{proposal.reason ? `: ${proposal.reason}` : ''}</span>}
  </div>)}</>;
}

function Entry({ entry, props, oversized = false }: { entry: ConversationEntry; props: ConversationGameProps; oversized?: boolean }) {
  const display = entryPresentation(entry, oversized);
  return <article className={`conv-entry conv-entry-${entry.kind}`} data-entry-id={entry.id}>
    <div className="conv-entry-meta"><span>{kindLabels[entry.kind]}</span><time>{time(entry.at)}</time></div>
    <p>{display.text}</p>
    {display.reader ? <button className="conv-open-entry" onClick={() => props.onOpenEntry(entry.actorId, entry.id)}>Read {entry.kind === 'report' ? 'report' : 'full message'}</button> : <Proposals entry={entry} props={props} />}
  </article>;
}

function History({ thread, props, anchor, onAnchor }: { thread: ConversationThread; props: ConversationGameProps; anchor: string | null; onAnchor: (id: string | null) => void }) {
  const window = useRef<HTMLDivElement>(null), measure = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ pages: string[][]; oversized: string[] }>({ pages: [thread.entries.slice(-1).map(entry => entry.id)], oversized: [] });
  useLayoutEffect(() => {
    const container = window.current, mirror = measure.current; if (!container || !mirror) return;
    const update = () => {
      const height = container.clientHeight; if (!height) return;
      const items = Array.from(mirror.children) as HTMLElement[];
      const oversized = items.filter(item => item.offsetHeight > height).map(item => item.dataset.entryId!);
      const compactHeight = 104;
      const pages = wholeEntryPages(items.map(item => ({ id: item.dataset.entryId!, height: oversized.includes(item.dataset.entryId!) ? compactHeight : item.offsetHeight })), height, 8);
      setLayout(previous => JSON.stringify(previous) === JSON.stringify({ pages, oversized }) ? previous : { pages, oversized });
    };
    update(); const observer = new ResizeObserver(update); observer.observe(container); observer.observe(mirror);
    document.fonts.addEventListener('loadingdone', update);
    return () => { observer.disconnect(); document.fonts.removeEventListener('loadingdone', update); };
  }, [thread.entries]);
  const found = anchor ? layout.pages.findIndex(page => page.includes(anchor)) : -1;
  const page = found < 0 ? layout.pages.length - 1 : found;
  const visible = thread.entries.filter(entry => layout.pages[page]?.includes(entry.id));
  const read = visible.filter(entry => entry.unread && !entryPresentation(entry, layout.oversized.includes(entry.id)).reader).map(entry => entry.id);
  const readKey = JSON.stringify(read), sent = useRef('');
  useEffect(() => { if (read.length && sent.current !== readKey) { sent.current = readKey; props.onReadEntries(thread.actorId, read); } }, [readKey, props.onReadEntries, thread.actorId]);
  return <div className="conv-history">
    <div className="conv-history-window" ref={window} aria-label={`${thread.name} conversation history`}>
      {!thread.entries.length && <p className="conv-empty">Ask {thread.name} a question or choose an order below.</p>}
      {visible.map(entry => <Entry key={entry.id} entry={entry} props={props} oversized={layout.oversized.includes(entry.id)} />)}
      <div className="conv-history-measure" ref={measure} aria-hidden="true" inert>{thread.entries.map(entry => <Entry key={entry.id} entry={entry} props={props} />)}</div>
    </div>
    <nav className="conv-history-controls" aria-label="Conversation history pages">
      <button disabled={page === 0} onClick={() => onAnchor(layout.pages[page - 1][0])}><ChevronLeft size={16} />Older messages</button>
      <span>{page + 1}/{layout.pages.length}</span>
      <button disabled={page >= layout.pages.length - 1} onClick={() => onAnchor(page === layout.pages.length - 2 ? null : layout.pages[page + 1][0])}>Newer messages<ChevronRight size={16} /></button>
    </nav>
  </div>;
}

function Reader({ props, thread, entry }: { props: ConversationGameProps; thread: ConversationThread; entry: ConversationEntry }) {
  const [section, setSection] = useState(0);
  // Full text always remains present even when the host adds structured evidence.
  const sections = [{ id: 'full-text', label: 'Full message', text: entry.text }, ...(entry.sections ?? [])];
  const index = Math.min(section, sections.length - 1);
  return <section className="conv-reader" aria-label={`${thread.name} message reader`}>
    <div className="conv-reader-heading"><button onClick={props.onCloseEntry}>Back</button><strong>{thread.name} · {kindLabels[entry.kind]}</strong></div>
    {sections.length > 1 && <label className="conv-section-label">Section<select value={index} onChange={event => setSection(Number(event.target.value))}>{sections.map((item, i) => <option key={item.id} value={i}>{item.label}</option>)}</select></label>}
    <PagedText key={sections[index].id} text={sections[index].text} label="Message text" />
    <div className="conv-reader-proposals"><Proposals entry={entry} props={props} /></div>
  </section>;
}

export function ConversationGame(props: ConversationGameProps) {
  const [focus, setFocus] = useState<'conversation' | 'world'>('conversation'), [expanded, setExpanded] = useState(false);
  const [anchors, setAnchors] = useState<Record<string, string | null>>({}), [orderPages, setOrderPages] = useState<Record<string, number>>({});
  const run = useRef(props.view.runId);
  useEffect(() => { if (run.current !== props.view.runId) { run.current = props.view.runId; setAnchors({}); setOrderPages({}); setExpanded(false); } }, [props.view.runId]);
  const thread = props.conversations.find(item => item.actorId === props.selectedActorId);
  const readerThread = props.conversations.find(item => item.actorId === props.reader?.actorId);
  const entry = readerThread?.entries.find(item => item.id === props.reader?.entryId);
  const terminal = ['success', 'failure'].includes(props.view.mission.status);
  const summaryAge = props.view.simTime - props.view.summary.observedAt;
  const service = summaryAge < 0 || props.view.summary.criticalServedFraction === null ? 'Service unknown' : summaryAge > 10 ? 'Service stale' : props.view.summary.criticalServedFraction === 1 ? 'Service stable' : 'Service reduced';
  const orderPage = thread ? Math.min(orderPages[thread.actorId] ?? 0, Math.max(0, thread.suggestedOrders.length - 1)) : 0;
  return <main className={`conv-game conv-focus-${focus}${expanded ? ' conv-expanded' : ''}`} aria-label="Blackout conversation game">
    <div className="conv-world-pane">
      <header className="conv-header"><h1>BLACKOUT</h1><span>{service}</span><time>{time(props.view.simTime)}</time><button onClick={props.onPause}>{props.paused ? 'Resume' : 'Pause'}</button><button onClick={props.onMenuToggle}>Menu</button><button className="conv-chat-control" onClick={() => setFocus('conversation')}>Conversation</button></header>
      <div className="conv-objective"><h2>{props.objective}</h2>{props.alerts[0] && <p role={props.alerts[0].level === 'warning' ? 'alert' : 'status'}>{props.alerts[0].text}</p>}</div>
      <ConversationMap {...props} />
      {props.guidance && <div className="conv-guidance"><p>{props.guidance.text}</p>{props.guidance.canContinue && <button onClick={props.onContinueGuide}>Continue</button>}<button aria-pressed={props.guidance.enabled} onClick={() => props.onSetGuidance(!props.guidance!.enabled)}>{props.guidance.enabled ? 'Guidance on' : 'Guidance off'}</button></div>}
    </div>
    <aside className="conv-sidebar" aria-label="Team conversation">
      <div className="conv-compact-toolbar"><button onClick={() => { setFocus('world'); setExpanded(false); }}>World</button><time>{time(props.view.simTime)}</time><button onClick={props.onPause}>{props.paused ? 'Resume' : 'Pause'}</button><button onClick={props.onMenuToggle}>Menu</button></div>
      <div className="conv-tabs" role="tablist" aria-label="Coworkers">{props.conversations.map(item => <button key={item.actorId} role="tab" aria-selected={props.selectedActorId === item.actorId} aria-label={`${item.name} · ${item.role}${item.unread ? ` · ${item.unread} unread` : ''}`} onClick={() => { setExpanded(false); props.onSelectActor(item.actorId); }}>
        <DesktopPortrait role={portraitRoles[item.role]} /><span><strong>{item.name}</strong><span>{item.role}</span></span>{item.unread > 0 && <b className="conv-unread">{item.unread}</b>}
      </button>)}</div>
      {thread ? <>
        <div className="conv-assignment"><div><strong>{thread.name} · {statusLabels[thread.assignment.status]}</strong><p>{thread.assignment.label}</p></div>{thread.assignment.taskId && ['walking', 'checking', 'working', 'report_pending'].includes(thread.assignment.status) && <div className="conv-busy-actions"><button onClick={() => props.onWait(thread.actorId)}>Wait</button><button disabled={props.busy || terminal} onClick={() => props.onStopTask(thread.actorId, thread.assignment.taskId!)}>Stop current task</button></div>}{thread.busy && <span role="status">Waiting for {thread.name}’s reply…</span>}</div>
        {entry && readerThread ? <Reader key={`${props.view.runId}:${readerThread.actorId}:${entry.id}`} props={props} thread={readerThread} entry={entry} /> : expanded ? <div className="conv-expanded-editor"><button onClick={() => setExpanded(false)}>Back to conversation</button><DraftEditor key={thread.actorId} draft={thread.draft} onDraft={draft => props.onDraftChange(thread.actorId, draft)} /><button disabled={!thread.draft.trim() || thread.busy || props.busy || terminal} onClick={() => { props.onSend(thread.actorId); setExpanded(false); }}>Send to {thread.name}</button></div> : <>
          <History key={`${props.view.runId}:${thread.actorId}`} thread={thread} props={props} anchor={anchors[thread.actorId] ?? null} onAnchor={id => setAnchors(current => ({ ...current, [thread.actorId]: id }))} />
          <div className="conv-orders" aria-label="Suggested orders">{thread.suggestedOrders.length > 1 && <button aria-label="Previous suggested order" disabled={orderPage === 0} onClick={() => setOrderPages(current => ({ ...current, [thread.actorId]: orderPage - 1 }))}><ChevronLeft size={16} /></button>}{thread.suggestedOrders[orderPage] ? <button className="conv-suggested" title={thread.suggestedOrders[orderPage].reason} disabled={!thread.suggestedOrders[orderPage].enabled || props.busy || terminal} data-guide-target={props.guidance?.targetOrderId === thread.suggestedOrders[orderPage].id} onClick={() => props.onSuggestedOrder(thread.suggestedOrders[orderPage].id)}>{thread.suggestedOrders[orderPage].label}</button> : <span>No suggested orders.</span>}{thread.suggestedOrders.length > 1 && <button aria-label="Next suggested order" disabled={orderPage === thread.suggestedOrders.length - 1} onClick={() => setOrderPages(current => ({ ...current, [thread.actorId]: orderPage + 1 }))}><ChevronRight size={16} /></button>}</div>
          <div className="conv-composer"><label htmlFor="conv-message">Message {thread.name}</label><div><input id="conv-message" value={thread.draft} maxLength={1600} placeholder="Ask a question…" onChange={event => props.onDraftChange(thread.actorId, event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && thread.draft.trim() && !thread.busy && !props.busy && !terminal) props.onSend(thread.actorId); }} /><button aria-label="Expand draft" onClick={() => setExpanded(true)}><Expand size={18} /></button><button aria-label={`Send to ${thread.name}`} disabled={!thread.draft.trim() || thread.busy || props.busy || terminal} onClick={() => props.onSend(thread.actorId)}><Send size={18} />Send</button></div></div>
        </>}
      </> : <p>Select a coworker.</p>}
    </aside>
    {props.menuOpen && <section className="conv-menu" aria-label="Menu"><button onClick={props.onMenuToggle}>Back to game</button>{props.menuContent}</section>}
    {props.session === 'welcome' && <section className="conv-welcome" aria-label="Welcome to Blackout"><h2>Keep the facility running.</h2><p>Direct Alex, Jules and Sam through an incident. Choose suggested orders or ask your team a question.</p><button className="conv-primary" onClick={props.onStartGuided}>Start guided game</button><button onClick={props.onStartPractice}>Practice</button></section>}
  </main>;
}
