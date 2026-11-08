import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ConversationThread } from '../../shared/contracts';
import type { SavedRunSummary } from '../../persistence/runs';
import { PagedText } from '../DesktopPaging';
import { reportFirstSections } from '../conversation/report-findings';
import './ConversationMenu.css';

export interface ConversationMenuProps {
  conversations: ConversationThread[];
  selectedActorId: string;
  reader: { actorId: string; entryId: string } | null;
  savedRuns: SavedRunSummary[];
  busy: boolean;
  notice: string;
  error: string;
  guidanceEnabled: boolean;
  speed: 1 | 2 | 4;
  afterActionContent?: ReactNode;
  onClose(): void;
  onSave(): void;
  onRefreshSaves(): void;
  onResumeSave(id: string): void;
  onReplaySave(id: string): void;
  onExportSave(id: string): void;
  onOpenEntry(actorId: string, entryId: string): void;
  onCloseEntry(): void;
  onReadEntries(actorId: string, entryIds: string[]): void;
  onExecuteProposal(id: string): void;
  onGuidanceChange(enabled: boolean): void;
  onSpeed(speed: 1 | 2 | 4): void;
  onRestart(): void;
  onStartPractice(): void;
}

type View = 'home' | 'history' | 'saves' | 'replay' | 'help' | 'options' | 'notice' | 'error';
const titles: Record<View, string> = { home: 'Menu', history: 'History', saves: 'Saved games', replay: 'Replay and results', help: 'How to play', options: 'Game options', notice: 'Notice', error: 'Error' };
const kindNames = { player: 'You', order: 'Order', system: 'Update', live: 'Coworker', fallback: 'Scripted fallback', report: 'Report' };
const time = (at: number) => `T+${Math.floor(at / 60)}:${String(at % 60).padStart(2, '0')}`;

/** Measure with the exact reader typography; short text never needs PagedText. */
function useTextFits(text: string, visible = true) {
  const measure = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState<boolean | null>(null);
  useLayoutEffect(() => {
    const element = measure.current;
    if (!visible || !element) return;
    const update = () => {
      if (element.clientWidth && element.clientHeight) setFits(element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1);
    };
    update();
    const observer = new ResizeObserver(update); observer.observe(element);
    document.fonts.addEventListener('loadingdone', update);
    return () => { observer.disconnect(); document.fonts.removeEventListener('loadingdone', update); };
  }, [text, visible]);
  return { measure, fits };
}

function ReaderText({ text, label }: { text: string; label: string }) {
  const { measure, fits } = useTextFits(text);
  return <div className="cm-reader-text">
    <div className="cm-text-measure" ref={measure} aria-hidden="true">{text}</div>
    {fits === false ? <PagedText text={text} label={label} /> : <div className="cm-direct-text" aria-label={label}>{text}</div>}
  </div>;
}

function HistoryEntry({ props, thread, entryId }: { props: ConversationMenuProps; thread: ConversationThread | undefined; entryId: string | null }) {
  const identity = props.reader ?? { actorId: thread?.actorId, entryId };
  const owner = props.reader ? props.conversations.find(item => item.actorId === identity.actorId) : thread;
  const entry = owner?.entries.find(item => item.id === identity.entryId && item.actorId === owner.actorId);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const read = useRef(new Set<string>());
  const opened = !!props.reader;
  const { measure, fits } = useTextFits(entry?.text ?? '', !opened);
  const long = !!entry && (entry.kind === 'report' || !!entry.sections?.length || entry.text.length > 240 || fits === false);
  const shown = !!entry && (opened || !long && fits === true);
  useEffect(() => {
    if (!shown || !entry?.unread || !owner) return;
    const key = JSON.stringify([owner.actorId, entry.id]);
    if (read.current.has(key)) return;
    read.current.add(key); props.onReadEntries(owner.actorId, [entry.id]);
  }, [shown, entry, owner, props.onReadEntries]);
  if (!entry || !owner) return <><p className="cm-empty">{entryId || props.reader ? 'This entry is no longer available.' : 'No history for this character yet.'}</p>{opened && <button className="cm-reader-back" onClick={props.onCloseEntry}>Back to history</button>}</>;
  const selectedSectionId = sectionId ?? (entry.kind === 'report' ? 'section:findings' : 'full');
  const structured = reportFirstSections(entry).map(item => ({ ...item, id: `section:${item.id}` }));
  const notice = { id: 'full', label: entry.kind === 'report' ? 'Delivery notice' : 'Full message', text: entry.text };
  const sections = [...(entry.kind === 'report' ? [...structured, notice] : [notice, ...structured]), ...(entry.proposals ?? []).filter(item => item.reason).map(item => ({ id: `proposal:${item.id}`, label: `${item.assignedName} action result`, text: `${item.label}\n${item.status}\n${item.reason}` }))];
  const section = sections.find(item => item.id === selectedSectionId);
  const proposals = entry.proposals ?? [], proposal = proposalId === null ? proposals[0] : proposals.find(item => item.id === proposalId);
  return <>
    <p className="cm-meta">{owner.name} · {kindNames[entry.kind]} · <time>{time(entry.at)}</time></p>
    {opened ? <>
      <div className="cm-row"><button className="cm-reader-back" onClick={props.onCloseEntry}>Back to entry</button>{(sections.length > 1 || !section) && <select aria-label="Reader section" value={selectedSectionId} onChange={event => setSectionId(event.target.value)}>{!section && <option value={selectedSectionId}>Section no longer available</option>}{sections.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}</div>
      <ReaderText key={selectedSectionId} text={section?.text ?? 'This section is no longer available. Choose another section.'} label="Message text" />
    </> : <>
      <div className="cm-entry-preview">
        <div ref={measure} className="cm-text-measure" aria-hidden="true">{entry.text}</div>
        {long ? <><p>{entry.summary && entry.summary.length <= 100 ? entry.summary : 'A longer message is available.'}</p><button className="cm-open-entry" onClick={() => props.onOpenEntry(owner.actorId, entry.id)}>{entry.kind === 'report' ? 'Read report' : 'Read full message'}</button></> : <p className="cm-direct-text">{entry.text}</p>}
      </div>
      {!!proposals.length && <div className="cm-proposals">
        {(proposals.length > 1 || !proposal) && <select aria-label="Proposed action" value={proposal?.id ?? ''} onChange={event => setProposalId(event.target.value)}><option value="" disabled>Choose an action</option>{proposals.map(item => <option key={item.id} value={item.id}>{item.label} · {item.assignedName}</option>)}</select>}
        {proposal ? <div className="cm-row"><button className="cm-primary" disabled={props.busy || proposal.status !== 'ready'} onClick={() => { if (!props.busy && proposal.status === 'ready') props.onExecuteProposal(proposal.id); }}>{proposal.label} · {proposal.assignedName}</button><span className="cm-meta">{proposal.status === 'ready' ? 'Awaiting your order' : proposal.status}</span>{proposal.reason && <button onClick={() => props.onOpenEntry(owner.actorId, entry.id)}>Read action result</button>}</div> : <p>This action is no longer available.</p>}
      </div>}
    </>}
  </>;
}

export function ConversationMenu(props: ConversationMenuProps) {
  const [view, setView] = useState<View>(props.reader ? 'history' : 'home');
  const [actorId, setActorId] = useState(props.reader?.actorId ?? props.selectedActorId);
  const [entries, setEntries] = useState<Record<string, string | null>>(() => Object.fromEntries(props.conversations.map(thread => [thread.actorId, thread.entries.at(-1)?.id ?? null])));
  const [saveId, setSaveId] = useState<string | null>(props.savedRuns[0]?.runId ?? null);
  const [helpSection, setHelpSection] = useState(0);
  const [compact, setCompact] = useState(false), [homePage, setHomePage] = useState(0);
  const panel = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null), back = useRef<HTMLButtonElement>(null);
  const returnAction = useRef<string | null>(null), navigating = useRef(false), latest = useRef(props);
  const readerNavigation = useRef<'open' | 'close' | null>(null);
  latest.current = props;
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); latest.current.onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') ?? [])].filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[inert],[aria-hidden="true"]'));
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); panel.current?.focus(); }
      else if (!panel.current?.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); if (opener?.isConnected) opener.focus(); };
  }, []);
  useLayoutEffect(() => {
    const element = panel.current; if (!element) return;
    const update = () => setCompact(window.innerHeight / parseFloat(getComputedStyle(element).fontSize) < 32);
    update(); const observer = new ResizeObserver(update); observer.observe(element);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  useLayoutEffect(() => {
    if (!navigating.current) return;
    navigating.current = false;
    if (view === 'home') ([...(panel.current?.querySelectorAll<HTMLButtonElement>('[data-menu-action]') ?? [])].find(element => element.dataset.menuAction === returnAction.current) ?? close.current)?.focus();
    else back.current?.focus();
  }, [view]);
  useLayoutEffect(() => {
    if (!readerNavigation.current) return;
    (panel.current?.querySelector<HTMLButtonElement>(readerNavigation.current === 'open' ? '.cm-reader-back' : '.cm-open-entry') ?? back.current)?.focus();
    readerNavigation.current = null;
  }, [props.reader?.actorId, props.reader?.entryId]);
  const navigate = (next: View, source?: HTMLButtonElement) => { if (source) returnAction.current = source.dataset.menuAction ?? null; navigating.current = true; setView(next); };
  const thread = props.conversations.find(item => item.actorId === actorId);
  const entryId = entries[actorId] ?? null;
  const index = thread?.entries.findIndex(entry => entry.id === entryId) ?? -1;
  const save = props.savedRuns.find(item => item.runId === saveId);
  const historyProps: ConversationMenuProps = { ...props,
    onOpenEntry: (actor, entry) => { readerNavigation.current = 'open'; props.onOpenEntry(actor, entry); },
    onCloseEntry: () => { readerNavigation.current = 'close'; props.onCloseEntry(); },
  };
  const selectActor = (next: string) => {
    setActorId(next);
    setEntries(previous => next in previous ? previous : { ...previous, [next]: props.conversations.find(item => item.actorId === next)?.entries.at(-1)?.id ?? null });
    if (props.reader) props.onCloseEntry();
  };
  const moveEntry = (next: number) => {
    const entry = thread?.entries[next]; if (!entry) return;
    setEntries(previous => ({ ...previous, [actorId]: entry.id }));
  };
  const homes: { label: string; view?: View; run?: () => void }[] = [
    { label: 'Save game', run: props.onSave }, { label: 'History', view: 'history' }, { label: 'Saved games', view: 'saves' },
    { label: 'Replay and results', view: 'replay' }, { label: 'How to play', view: 'help' }, { label: 'Game options', view: 'options' },
  ];
  const help = [
    { label: 'Direct your team', text: 'Choose Alex for cooling, Jules for power, or Sam for IT. Suggested orders send a validated task. Characters travel and work automatically.' },
    { label: 'Read the evidence', text: 'Reports describe what the team observed and when. History keeps earlier messages for each character. Open a report to read its full text and evidence.' },
    { label: 'Authorize an order', text: 'A coworker can suggest work in a reply. The labeled action button authorizes that exact proposal. Sending a message alone does not execute it.' },
    { label: 'Guidance and practice', text: 'Guidance explains important mission moments. Use Game options for speed, a mission restart, or healthy practice. The game controls when work completes.' },
  ];
  return <div className="cm-overlay"><section ref={panel} className="cm-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-view={view} data-compact={compact}>
    <header className="cm-heading">{view !== 'home' && <button ref={back} onClick={() => navigate('home')}>Back</button>}<h2 id={titleId}>{titles[view]}</h2><button ref={close} aria-label="Close menu" onClick={props.onClose}>Close</button></header>
    {view !== 'notice' && view !== 'error' && (props.notice || props.error || props.busy) && <div className="cm-messages">{props.busy && <p role="status">Working…</p>}{(['notice', 'error'] as const).map(kind => props[kind] && (props[kind].length <= 100 ? <p key={kind} role={kind === 'error' ? 'alert' : 'status'} className={kind === 'error' ? 'cm-error' : ''}>{props[kind]}</p> : <button key={kind} onClick={event => navigate(kind, event.currentTarget)}>Read {kind}</button>))}</div>}
    <div className="cm-body">
      {view === 'home' && <div className="cm-home"><nav className="cm-home-actions" aria-label="Menu actions">{homes.slice(compact ? homePage * 3 : 0, compact ? homePage * 3 + 3 : homes.length).map(item => <button key={item.label} data-menu-action={item.label} disabled={!!item.run && props.busy} onClick={event => item.view ? navigate(item.view, event.currentTarget) : item.run?.()}>{item.label}</button>)}</nav>{compact && <button className="cm-more" onClick={() => setHomePage(previous => previous ? 0 : 1)}>{homePage ? 'First menu actions' : 'More menu actions'}</button>}<label className="cm-guidance"><input type="checkbox" checked={props.guidanceEnabled} disabled={props.busy} onChange={event => props.onGuidanceChange(event.target.checked)} />Guidance</label></div>}
      {view === 'history' && <div className="cm-focus">
        {!props.reader && <div className="cm-row cm-history-nav"><select aria-label="History character" value={actorId} onChange={event => selectActor(event.target.value)}>{!thread && <option value={actorId}>Character unavailable</option>}{props.conversations.map(item => <option key={item.actorId} value={item.actorId}>{item.name} · {item.role}</option>)}</select><button aria-label="Previous entry" disabled={index <= 0} onClick={() => moveEntry(index - 1)}>Previous</button><button aria-label="Next entry" disabled={index < 0 || index >= (thread?.entries.length ?? 0) - 1} onClick={() => moveEntry(index + 1)}>Next</button></div>}
        <HistoryEntry key={JSON.stringify(props.reader ?? { actorId, entryId })} props={historyProps} thread={thread} entryId={entryId} />
        {!props.reader && index < 0 && !!thread?.entries.length && <button onClick={() => moveEntry(thread.entries.length - 1)}>Latest entry</button>}
      </div>}
      {view === 'saves' && <div className="cm-focus">
        {!!props.savedRuns.length && <select aria-label="Saved game" value={save?.runId ?? ''} onChange={event => setSaveId(event.target.value)}><option value="" disabled>Choose a saved game</option>{props.savedRuns.map(item => <option key={item.runId} value={item.runId}>{item.scenarioId} · {time(item.simTime)} · {item.runId}</option>)}</select>}
        {save ? <ReaderText key={save.runId} label="Saved game details" text={`${save.scenarioId}\n${save.runId}\n${time(save.simTime)}${save.unavailableReason ? `\nUnavailable: ${save.unavailableReason}\nOriginal bytes remain exportable.` : ''}`} /> : <p className="cm-empty">{props.savedRuns.length ? 'This saved game is no longer listed. Choose a saved game or refresh.' : 'No saved games listed. Save the current game or refresh the list.'}</p>}
        <div className="cm-row cm-save-actions"><button disabled={props.busy || !save || !!save.unavailableReason} onClick={() => save && !save.unavailableReason && props.onResumeSave(save.runId)}>Resume save</button><button disabled={props.busy || !save || !!save.unavailableReason} onClick={() => save && !save.unavailableReason && props.onReplaySave(save.runId)}>Replay save</button><button disabled={props.busy || !save} onClick={() => save && props.onExportSave(save.runId)}>Export original</button></div>
        <div className="cm-row"><button disabled={props.busy} onClick={props.onSave}>Save game</button><button disabled={props.busy} onClick={props.onRefreshSaves}>Refresh saves</button></div>
      </div>}
      {view === 'replay' && <div className="cm-focus cm-advanced">{props.afterActionContent ?? <p>No replay or results are open. Choose a saved game to replay its recorded run.</p>}</div>}
      {view === 'help' && <div className="cm-focus"><select aria-label="Help topic" value={helpSection} onChange={event => setHelpSection(Number(event.target.value))}>{help.map((item, i) => <option key={item.label} value={i}>{item.label}</option>)}</select><p className="cm-help-copy">{help[helpSection].text}</p></div>}
      {view === 'options' && <div className="cm-options"><fieldset><legend>Game speed</legend><div className="cm-row">{([1, 2, 4] as const).map(speed => <button key={speed} disabled={props.busy} aria-pressed={props.speed === speed} onClick={() => props.onSpeed(speed)}>{speed}×</button>)}</div></fieldset><button disabled={props.busy} onClick={props.onRestart}>Restart mission</button><button disabled={props.busy} onClick={props.onStartPractice}>Start practice</button></div>}
      {(view === 'notice' || view === 'error') && <div className="cm-focus"><ReaderText text={props[view]} label={`${titles[view]} details`} /></div>}
    </div>
  </section></div>;
}
