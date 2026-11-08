import { useEffect, useRef, useState } from 'react';
import { ConversationGame } from './ui/conversation/ConversationGame';
import { DesktopReplayView } from './ui/debrief/DesktopReplayView';
import { ConversationMenu } from './ui/conversation-menu';
import { savedConversations } from './ui/conversation/recorded-history';
import { fallbackCopy } from './ui/conversation/fallback-copy';
import { CONVERSATION_PROMPT_VERSION } from './llm/conversation-mode';
import { formatObservationFact } from './ui/presentation';
import { radioCitations, radioProvenance, radioReceipts, radioReport, observationText } from './ui/desktop-copy';
import { SimulationClient } from './workers/SimulationClient';
import { hotRestart, practiceScenario } from './content/scenarios/hot-restart';
import { latestObservations } from './llm/context';
import { runCoworker, type CoworkerResult } from './llm/interaction';
import { appendConversationEntry, authorizationMatchesOrigin, conversationPeople, createConversations, hydrateConversationReport, markConversationRead, ProposalBook, setConversationDraft, updateConversation, withConversationAssignments } from './shared/conversations';
import { conversationOrders } from './shared/conversation-orders';
import { openRunStore, type RunStore, type SavedRunSummary } from './persistence/runs';
import { HostArchive } from './persistence/host-archive';
import { engineRecordOf } from './persistence/saved-record';
import { buildOutcomeLedger } from './sim/replay/ledger';
import type { ActionIntent, CommandReceipt, ComparisonResult, ConversationEntry, ConversationGameProps, ConversationThread, KnowledgeView, OutcomeLedger, PublicMessage, SavedRunRecord } from './shared/contracts';

const words = (value: string) => value.toLowerCase().replaceAll('_', ' ');
const clock = (at: number) => `${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')}`;
const ended = (view: KnowledgeView) => ['success', 'failure'].includes(view.mission.status);
const person = (actorId: string) => conversationPeople.find(actor => actor.actorId === actorId);
const labelAction = (intent: ActionIntent) => intent.action === 'inspect' ? intent.targetId === 'controller' ? 'Check cooling controls' : intent.args.technicianId === 'jules' ? 'Check power equipment' : 'Check equipment' : intent.action === 'repair_cooling' ? 'Repair the controls' : intent.action === 'pause_batch' ? 'Pause background jobs' : intent.action === 'set_batch_ceiling' || intent.action === 'resume_batch' ? 'Resume background jobs' : intent.action === 'verify_recovery' ? 'Check recovery' : words(intent.action);
type RadioJob = { controller: AbortController; promise: Promise<CoworkerResult> };


export default function App() {
  const simulation = useRef<SimulationClient | null>(null), unsubscribe = useRef<(() => void) | null>(null), known = useRef<KnowledgeView | null>(null);
  const generation = useRef(0), transitioning = useRef(false), commandPending = useRef(false), jobs = useRef(new Map<string, RadioJob>());
  const sourceGeneration = useRef(0), hostPending = useRef(false), listGeneration = useRef(0);
  const deferredMenuCapture = useRef<{ generation: number; sourceGeneration: number } | null>(null);
  const archive = useRef<HostArchive | null>(null), store = useRef<Promise<RunStore> | null>(null), proposals = useRef<ProposalBook | null>(null);
  const replayClient = useRef<SimulationClient | null>(null), replayGeneration = useRef(0), replayAt = useRef(0), replayPending = useRef(false);
  const sessionRef = useRef<'welcome' | 'practice' | 'mission'>('welcome'), selected = useRef<string | null>(null);
  const threadState = useRef<ConversationThread[]>(createConversations()), selectedActor = useRef('alex'), manualPaused = useRef(true), guideEnabled = useRef(true), menuOpenRef = useRef(false);
  const menuOpener = useRef<HTMLElement | null>(null);
  const [view, setView] = useState<KnowledgeView | null>(null), [session, setSession] = useState<typeof sessionRef.current>('welcome');
  const [paused, setPaused] = useState(true), [speed, setSpeed] = useState<1 | 2 | 4>(1), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [assetId, setAssetId] = useState<string | null>(null), [actorId, setActorId] = useState('alex');
  const [threads, setThreads] = useState<ConversationThread[]>(threadState.current), [reader, setReader] = useState<ConversationGameProps['reader']>(null), [menuOpen, setMenuOpen] = useState(false), [guidanceEnabled, setGuidanceEnabled] = useState(true);
  const [saved, setSaved] = useState<SavedRunSummary[]>([]), [source, setSource] = useState<SavedRunRecord | null>(null), [ledger, setLedger] = useState<OutcomeLedger | null>(null), [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [replayView, setReplayView] = useState<KnowledgeView | null>(null), [replayActive, setReplayActive] = useState(false), [replayPlaying, setReplayPlaying] = useState(false), [cursor, setCursor] = useState(0);

  function updateThreads(update: (previous: ConversationThread[]) => ConversationThread[]) { const next = update(threadState.current); threadState.current = next; setThreads(next); }
  function chooseAsset(id: string) { if (id && !known.current?.knownTopology.assets.some(asset => asset.id === id)) return; selected.current = id || null; setAssetId(id || null); }
  function chooseActor(id: string) { if (!person(id)) return; selectedActor.current = id; setActorId(id); setReader(null); }
  function append(entry: ConversationEntry, evidenceIds: string[] = [], record = true) {
    updateThreads(previous => appendConversationEntry(previous, entry));
    if (record && archive.current) archive.current.message({ id: entry.id, at: entry.at, speaker: entry.kind === 'player' || entry.kind === 'order' ? 'player' : entry.actorId, text: entry.text.slice(0, 3000), evidenceIds, mode: entry.kind === 'live' ? 'live' : entry.kind === 'fallback' ? 'scripted' : 'system', conversationActorId: entry.actorId, conversationKind: entry.kind });
  }
  function syncClock() {
    if (!simulation.current || transitioning.current || replayClient.current && replayActive) return;
    const stop = manualPaused.current || menuOpenRef.current || sessionRef.current === 'welcome' || !!known.current && ended(known.current) || guideEnabled.current && jobs.current.size > 0;
    if (stop) simulation.current.pause(); else simulation.current.resume(); setPaused(stop);
  }
  async function cancelCoworkers(cancel = true) { const active = [...jobs.current.values()]; if (cancel) active.forEach(job => job.controller.abort()); await Promise.allSettled(active.map(job => job.promise)); }
  function getStore() { return store.current ??= openRunStore().catch(problem => { store.current = null; throw problem; }); }
  async function refreshSaves() {
    const request = ++listGeneration.current, token = generation.current;
    try { const rows = await (await getStore()).listRuns(); if (request === listGeneration.current && token === generation.current) setSaved(rows); }
    catch { if (request === listGeneration.current && token === generation.current) setError('Local saves are unavailable. You can still play.'); }
  }
  function pauseLive() { simulation.current?.pause(); setPaused(true); }
  function closeReplay() { sourceGeneration.current++; hostPending.current = false; setBusy(false); replayGeneration.current++; replayClient.current?.dispose(); replayClient.current = null; replayAt.current = 0; replayPending.current = false; setReplayActive(false); setReplayPlaying(false); setReplayView(null); setCursor(0); }
  function ingestReports(raw: KnowledgeView) {
    updateThreads(previous => {
      let next = previous;
      for (const message of raw.messages) if (person(message.speaker)) next = hydrateConversationReport(next, { id: message.id, actorId: message.speaker, at: message.at, kind: message.id.startsWith('report-') ? 'report' : 'system', text: message.text, summary: `${person(message.speaker)!.name} has sent a report.`, unread: true, reportId: message.id, sections: [{ id: 'evidence', label: 'Evidence', text: raw.observations.filter(observation => message.evidenceIds.includes(observation.id)).map(observation => observationText(observation, raw.simTime)).join('\n\n') || 'No new reading supplied.' }] });
      return withConversationAssignments(next, raw);
    });
  }
  async function begin(next: typeof sessionRef.current, previous?: SavedRunRecord, runImmediately = true) {
    if (transitioning.current) return;
    transitioning.current = true; const token = ++generation.current; simulation.current?.pause(); closeReplay(); setBusy(true); setPaused(true); setError('');
    try {
      await cancelCoworkers(); if (token !== generation.current) return;
      unsubscribe.current?.(); simulation.current?.dispose(); known.current = null; jobs.current.clear(); selected.current = null; commandPending.current = false;
      setView(null); setAssetId(null); setReader(null); setNotice(''); setSpeed(1); setSource(null); setLedger(null); setComparison(null); setMenuOpen(false); menuOpenRef.current = false;
      sessionRef.current = next; setSession(next); selectedActor.current = 'alex'; setActorId('alex'); manualPaused.current = !runImmediately || next === 'welcome' || !!previous;
      const client = new SimulationClient(), runId = crypto.randomUUID(); simulation.current = client; archive.current = new HostArchive(runId, previous); proposals.current = new ProposalBook(runId); updateThreads(() => savedConversations(previous));
      if (!previous) for (const actor of conversationPeople) append({ id: `intro:${runId}:${actor.actorId}`, actorId: actor.actorId, at: 0, kind: 'system', text: actor.actorId === 'alex' ? 'I handle cooling. Ask me a question or choose an order.' : actor.actorId === 'jules' ? 'I handle power. I’ll report back when my work is finished.' : 'I handle background jobs. Pausing them buys repair time.', unread: false });
      unsubscribe.current = client.subscribe(raw => {
        if (token !== generation.current || simulation.current !== client) return;
        known.current = raw; setView({ ...raw, observations: latestObservations(raw.observations) }); ingestReports(raw);
        if (ended(raw)) { setPaused(true); jobs.current.forEach(job => job.controller.abort()); }
      });
      await client.initialize(next === 'mission' ? hotRestart : practiceScenario, runId);
      if (previous) await client.restore(previous.finalCheckpoint, runId);
      if (token !== generation.current) return;
      if (previous) setNotice('Saved mission resumed paused.');
    } catch { if (token === generation.current) setError('Could not open this game. Retry a fresh mission; saved data stays preserved.'); }
    finally { if (token === generation.current) { transitioning.current = false; setBusy(false); syncClock(); } }
  }
  useEffect(() => {
    void begin('welcome');
    const visibility = () => { if (document.hidden) { manualPaused.current = true; pauseLive(); setReplayPlaying(false); } };
    document.addEventListener('visibilitychange', visibility);
    return () => { generation.current++; sourceGeneration.current++; listGeneration.current++; transitioning.current = false; jobs.current.forEach(job => job.controller.abort()); unsubscribe.current?.(); simulation.current?.dispose(); replayClient.current?.dispose(); void store.current?.then(storage => storage.close()).catch(() => {}); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  async function applyOrder(originActor: string, intent: ActionIntent, authority?: { requestId: string; idempotencyKey: string; expectedEntityVersions: Record<string, number> }) {
    const client = simulation.current, current = known.current;
    if (!client || !current || !person(originActor) || replayActive || transitioning.current || hostPending.current || commandPending.current || !['active', 'practice'].includes(current.mission.status) || intent.action === 'move_crew') return null;
    const token = generation.current; commandPending.current = true; setBusy(true); setError('');
    try {
      const receipt = await client.command({ schemaVersion: 1, runId: current.runId, requestId: authority?.requestId ?? crypto.randomUUID(), actorId: 'player', intent, expectedEntityVersions: authority?.expectedEntityVersions ?? current.observedEntityVersions, idempotencyKey: authority?.idempotencyKey ?? crypto.randomUUID() });
      if (token !== generation.current) return null;
      await client.observe('player'); if (token !== generation.current) return null;
      append({ id: crypto.randomUUID(), actorId: originActor, at: receipt.observedAt, kind: 'order', text: receipt.status === 'rejected' ? `That order could not start: ${words(receipt.reason)}.` : receipt.status === 'applied' && intent.action === 'cancel_task' ? 'Current task stopped.' : `${labelAction(intent)} accepted. ${person(originActor)!.name} will report back.`, unread: false, summary: `${labelAction(intent)} ${receipt.status === 'rejected' ? 'could not start' : 'accepted'}.`, sections: [{ id: 'receipt', label: 'Order receipt', text: JSON.stringify(receipt, null, 2) }] }, receipt.evidenceIds);
      return receipt;
    } catch { if (token === generation.current) setError('Could not confirm the order. Check the current assignment before retrying.'); return null; }
    finally { if (token === generation.current) { commandPending.current = false; setBusy(false); flushDeferredMenuCapture(); } }
  }
  async function executeProposal(id: string) {
    if (transitioning.current || commandPending.current || hostPending.current || replayActive || !known.current || ended(known.current)) return;
    const token = proposals.current?.take(id); if (!token) return;
    const originActor = token.authorization.actorId, generationAtStart = generation.current;
    const status = (value: 'sending' | 'accepted' | 'rejected', reason?: string) => updateThreads(previous => updateConversation(previous, originActor, thread => ({ ...thread, entries: thread.entries.map(entry => ({ ...entry, proposals: entry.proposals?.map(proposal => proposal.id === id ? { ...proposal, status: value, reason } : proposal) })) })));
    status('sending');
    const receipt = await applyOrder(originActor, token.authorization.intent, { requestId: token.requestId, idempotencyKey: token.idempotencyKey, expectedEntityVersions: token.authorization.expectedEntityVersions });
    if (generationAtStart === generation.current) status(receipt && receipt.status !== 'rejected' ? 'accepted' : 'rejected', receipt ? words(receipt.reason) : 'Not confirmed. Check the assignment.');
  }
  async function askCoworker(originActor: string) {
    const client = simulation.current, current = known.current, recorder = archive.current, message = threadState.current.find(thread => thread.actorId === originActor)?.draft.trim();
    if (!client || !current || !recorder || !person(originActor) || !message || jobs.current.has(originActor) || replayActive || transitioning.current || hostPending.current || ended(current)) return;
    const token = generation.current, controller = new AbortController(), requestId = crypto.randomUUID(), targetId = selected.current ?? (originActor === 'alex' ? 'controller' : originActor === 'jules' ? 'distribution' : null);
    append({ id: `question:${requestId}`, actorId: originActor, at: current.simTime, kind: 'player', text: message, unread: false });
    updateThreads(previous => updateConversation(setConversationDraft(previous, originActor, ''), originActor, thread => ({ ...thread, busy: true })));
    const job = runCoworker({ simulation: client, runId: current.runId, requestId, actorId: originActor, targetId, message, signal: controller.signal, interactionMode: 'advisory', promptVersion: CONVERSATION_PROMPT_VERSION, getSimTime: () => known.current?.runId === current.runId ? known.current.simTime : current.simTime });
    jobs.current.set(originActor, { controller, promise: job }); syncClock();
    try {
      const result = await job; recorder.capture(result.recording);
      if (token !== generation.current || controller.signal.aborted) return;
      const allowed = result.authorizations.filter(authorization => authorization.actorId === originActor && authorization.runId === current.runId && authorizationMatchesOrigin(authorization, result.recording));
      for (const authorization of allowed) proposals.current!.register(authorization);
      const answer = result.reply.kind === 'final' ? result.reply.response : null;
      const facts = answer?.facts.flatMap(fact => { if (!('observationId' in fact)) return []; const reading = result.view.observations.find(observation => observation.id === fact.observationId); return reading ? [formatObservationFact(reading, fact.field)] : []; }) ?? [];
      const text = answer ? [...facts, answer.inference, answer.uncertainty].filter(Boolean).join('\n') || 'I’ve included the available readings in History.' : fallbackCopy(result.reply.kind === 'fallback' ? result.reply.reason : 'unavailable');
      append({ id: crypto.randomUUID(), actorId: originActor, at: known.current?.simTime ?? current.simTime, kind: answer ? 'live' : 'fallback', text, summary: text.length <= 260 ? text : `${person(originActor)!.name} sent a detailed reply.`, unread: true, exchangeId: result.start.requestId, proposals: allowed.map(authorization => ({ id: authorization.id, label: labelAction(authorization.intent), assignedName: person(authorization.intent.args.technicianId ?? (['pause_batch', 'resume_batch', 'set_batch_ceiling', 'verify_recovery'].includes(authorization.intent.action) ? 'sam' : originActor))?.name ?? person(originActor)!.name, status: 'ready' })), sections: [{ id: 'reply', label: 'Facts and reply', text: radioReport(result) }, { id: 'citations', label: 'Evidence', text: radioCitations(result) }, { id: 'receipts', label: 'Tool receipts', text: radioReceipts(result) }, { id: 'provenance', label: 'Provenance', text: radioProvenance(result) }] }, answer?.facts.flatMap(fact => 'observationId' in fact ? [fact.observationId] : []) ?? []);
    } catch { if (token === generation.current) append({ id: crypto.randomUUID(), actorId: originActor, at: known.current?.simTime ?? current.simTime, kind: 'fallback', text: 'I couldn’t finish that reply. Suggested orders still work.', unread: true }); }
    finally { if (jobs.current.get(originActor)?.promise === job) jobs.current.delete(originActor); if (token === generation.current) { updateThreads(previous => updateConversation(previous, originActor, thread => ({ ...thread, busy: false }))); syncClock(); flushDeferredMenuCapture(); } }
  }
  useEffect(() => { if (!menuOpen && menuOpener.current?.isConnected) menuOpener.current.focus(); }, [menuOpen]);
  function flushDeferredMenuCapture() {
    const pending = deferredMenuCapture.current;
    if (!pending) return;
    if (!menuOpenRef.current || pending.generation !== generation.current || pending.sourceGeneration !== sourceGeneration.current || sessionRef.current !== 'mission') { deferredMenuCapture.current = null; return; }
    if (jobs.current.size || commandPending.current || transitioning.current || hostPending.current) return;
    deferredMenuCapture.current = null; void capture(false);
  }
  function toggleMenu() { const open = !menuOpenRef.current; if (open) menuOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; menuOpenRef.current = open; setMenuOpen(open); if (open) { manualPaused.current = true; pauseLive(); void refreshSaves(); if (!replayActive && sessionRef.current === 'mission') { if (jobs.current.size || commandPending.current) deferredMenuCapture.current = { generation: generation.current, sourceGeneration: sourceGeneration.current }; else void capture(false); } } else deferredMenuCapture.current = null; }
  // Existing save/replay lifecycle follows below; normal UI receives scoped views only.
  async function capture(save: boolean) {
    const client = simulation.current, recorder = archive.current, token = generation.current;
    if (!client || !recorder || sessionRef.current !== 'mission' || replayActive || commandPending.current || transitioning.current) return;
    const request = ++sourceGeneration.current; hostPending.current = true;
    pauseLive(); setBusy(true);
    try {
      await cancelCoworkers(false); if (token !== generation.current || request !== sourceGeneration.current) return;
      const record = recorder.build(await client.record()); if (token !== generation.current || request !== sourceGeneration.current) return;
      if (save) { await (await getStore()).saveRun(record); if (token !== generation.current || request !== sourceGeneration.current) return; setNotice('Mission saved locally with its original observations, orders and radio transcript.'); }
      setSource(record); setLedger(buildOutcomeLedger(engineRecordOf(record))); setComparison(null);
      if (save) await refreshSaves();
    } catch (problem) { if (token === generation.current && request === sourceGeneration.current) setError(`Could not save or review this run: ${problem instanceof Error ? problem.message : 'storage unavailable'}`); }
    finally { if (token === generation.current && request === sourceGeneration.current) { hostPending.current = false; setBusy(false); } }
  }
  async function activateReplay(record: SavedRunRecord) {
    pauseLive(); closeReplay(); const token = ++replayGeneration.current, sessionToken = generation.current; hostPending.current = true; setBusy(true); setError(''); await cancelCoworkers();
    try {
      await cancelCoworkers();
      if (token !== replayGeneration.current || sessionToken !== generation.current) return;
      const client = new SimulationClient(); replayClient.current = client;
      await client.initialize(record.scenario, crypto.randomUUID());
      if (token !== replayGeneration.current || sessionToken !== generation.current) return;
      const projected = await client.replayTo(engineRecordOf(record), 0);
      if (token !== replayGeneration.current || sessionToken !== generation.current) return;
      pauseLive();
      setSource(record); setLedger(buildOutcomeLedger(engineRecordOf(record))); setComparison(null); setReplayView(projected); setReplayActive(true); setCursor(0); replayAt.current = 0; chooseAsset(''); setMenuOpen(true); menuOpenRef.current = true;
    } catch { if (token === replayGeneration.current) setError('This recorded run cannot be replayed by the current version. Its stored bytes remain available for export.'); }
    finally { if (token === replayGeneration.current && sessionToken === generation.current) { hostPending.current = false; setBusy(false); } }
  }
  async function reviewSaved(id: string, resume: boolean) {
    const token = generation.current, request = ++sourceGeneration.current;
    hostPending.current = true; setBusy(true); setError('');
    try {
      const record = await (await getStore()).loadRun(id); if (!record) throw new Error('not_found');
      if (token !== generation.current || request !== sourceGeneration.current) return;
      if (resume) {
        if (record.events.some(event => ['mission.success', 'mission.failure'].includes(event.type))) { setNotice('This run has ended. Replay it, or retry a fresh mission.'); return; }
        await begin('mission', record, false);
      } else await activateReplay(record);
    } catch { if (token === generation.current && request === sourceGeneration.current) setError('This save is incompatible, corrupted, or unavailable. It remains preserved and can be exported.'); }
    finally { if (token === generation.current && request === sourceGeneration.current) { hostPending.current = false; setBusy(false); } }
  }
  async function exportSaved(id: string) {
    try {
      const text = await (await getStore()).exportRun(id); if (text === null) throw new Error('not_found');
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), link = document.createElement('a'); link.href = url; link.download = `blackout-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Could not export this local save. No stored data was changed.'); }
  }
  async function seek(at: number) {
    if (!source || !replayClient.current || replayPending.current || !replayActive) return;
    const token = replayGeneration.current; replayPending.current = true;
    try { const projected = await replayClient.current.replayTo(engineRecordOf(source), at); if (token === replayGeneration.current) { setReplayView(projected); setCursor(at); replayAt.current = at; } }
    catch { if (token === replayGeneration.current) { setReplayPlaying(false); setError('Replay could not advance. The saved source is unchanged.'); } }
    finally { if (token === replayGeneration.current) replayPending.current = false; }
  }
  useEffect(() => {
    if (!replayPlaying || !replayActive || !source) return;
    const timer = setInterval(() => { if (replayAt.current >= source.finalCheckpoint.simTime) setReplayPlaying(false); else void seek(Math.min(source.finalCheckpoint.simTime, replayAt.current + 1)); }, 1000 / speed);
    return () => clearInterval(timer);
  }, [replayPlaying, replayActive, source, speed]);
  async function compare(sequence: number, earlierAt: number) {
    if (!source || busy || hostPending.current) return; const token = generation.current, request = sourceGeneration.current; hostPending.current = true; setBusy(true); setError('');
    try {
      let client = replayClient.current;
      if (!client) { client = new SimulationClient(); replayClient.current = client; await client.initialize(source.scenario); }
      const result = await client.compare(engineRecordOf(source), { commandSequence: sequence, earlierAt, branchRunId: crypto.randomUUID() });
      if (token === generation.current && request === sourceGeneration.current) setComparison(result);
    } catch { if (token === generation.current && request === sourceGeneration.current) setError('The alternative could not be computed. Choose a recorded batch cap and an earlier whole second.'); }
    finally { if (token === generation.current && request === sourceGeneration.current) { hostPending.current = false; setBusy(false); } }
  }
  const shown = replayActive ? replayView : view;
  if (!shown) return <main className="host-loading"><h1>BLACKOUT</h1><p role={error ? 'alert' : 'status'}>{error || 'Opening your shift…'}</p>{error && <button onClick={() => { transitioning.current = false; void begin('welcome'); }}>Retry</button>}</main>;
  const options = conversationOrders(shown);
  const displayedThreads = withConversationAssignments(replayActive && source ? savedConversations(source, shown) : threads, shown).map(thread => ({ ...thread, suggestedOrders: options.filter(order => order.actorId === thread.actorId).map(({ intent: _intent, ...order }) => order) }));
  const coolingStopped = shown.observations.some(observation => observation.field === 'running' && observation.value === false && observation.quality !== 'unknown' && observation.observedAt <= shown.simTime && observation.receivedAt <= shown.simTime && shown.simTime - observation.observedAt <= 10 && shown.knownTopology.assets.some(asset => asset.id === observation.assetId && asset.kind === 'cooling'));
  const replayContent = <DesktopReplayView compactMenu saved={saved} ledger={ledger} comparison={comparison} cursor={cursor} playing={replayPlaying} busy={busy} active={replayActive} canSave={session === 'mission'} notice={notice} error={error}
    caps={source?.commands.filter(command => ['accepted', 'applied'].includes(command.receipt.status) && ['pause_batch', 'set_batch_ceiling'].includes(command.intent.action)).map(command => ({ sequence: command.sequence, at: command.at, label: words(command.intent.action) })) ?? []}
    dialogue={source?.dialogue ?? []} transcript={source ? JSON.stringify(source.interactions, null, 2) : ''}
    onSave={() => void capture(true)} onRefresh={() => void refreshSaves()} onReview={id => void reviewSaved(id, false)} onResume={id => void reviewSaved(id, true)} onExport={id => void exportSaved(id)}
    onReplay={() => { if (source) void activateReplay(source); }} onReturn={() => { closeReplay(); setMenuOpen(false); menuOpenRef.current = false; }} onSeek={at => void seek(at)} onToggle={() => setReplayPlaying(value => !value)} onCompare={(sequence, at) => void compare(sequence, at)} />;
  const readEntries = (id: string, ids: string[]) => { if (!replayActive) updateThreads(previous => markConversationRead(previous, id, ids)); };
  const openEntry = (id: string, entryId: string) => { if (!displayedThreads.find(thread => thread.actorId === id)?.entries.some(entry => entry.id === entryId)) return; setReader({ actorId: id, entryId }); readEntries(id, [entryId]); };
  const setGuidance = (enabled: boolean) => { guideEnabled.current = enabled; setGuidanceEnabled(enabled); syncClock(); };
  const setGameSpeed = (next: 1 | 2 | 4) => { setSpeed(next); simulation.current?.setSpeed(next); };
  const menuContent = <ConversationMenu key={shown.runId} conversations={displayedThreads} selectedActorId={actorId} reader={reader} savedRuns={saved} busy={busy}
    notice={notice} error={error} guidanceEnabled={guidanceEnabled} speed={speed} afterActionContent={replayContent}
    onClose={() => { setReader(null); toggleMenu(); }} onSave={() => { if (session !== 'mission' || replayActive) setNotice('Return to the live mission to save.'); else void capture(true); }} onRefreshSaves={() => void refreshSaves()}
    onResumeSave={id => void reviewSaved(id, true)} onReplaySave={id => void reviewSaved(id, false)} onExportSave={id => void exportSaved(id)}
    onOpenEntry={openEntry} onCloseEntry={() => setReader(null)} onReadEntries={readEntries} onExecuteProposal={id => void executeProposal(id)}
    onGuidanceChange={setGuidance} onSpeed={setGameSpeed} onRestart={() => void begin('mission', undefined, false)} onStartPractice={() => void begin('practice')} />;
  return <ConversationGame view={shown} session={session} selectedActorId={actorId} selectedAssetId={assetId} conversations={displayedThreads} paused={replayActive ? !replayPlaying : paused} speed={speed} busy={busy || replayActive}
    objective={replayActive ? 'Recorded run — use Menu to return to the game.' : ended(shown) ? `Mission ${shown.mission.status}` : session === 'practice' ? 'Practice: choose Alex and request a cooling check.' : coolingStopped ? 'Keep cooling and critical service running.' : 'Direct your team and watch for updates.'}
    alerts={[...(coolingStopped ? [{ id: 'cooling-stopped', level: 'warning' as const, text: 'Cooling has stopped. Ask Alex to check the controls.' }] : []), ...(error ? [{ id: 'host-error', level: 'info' as const, text: error }] : [])]}
    guidance={session !== 'welcome' && guidanceEnabled && !replayActive ? { enabled: guidanceEnabled, paused: false, text: 'Choose a character. Orders start work; messages ask the assistant.', canContinue: false } : null}
    reader={reader} menuOpen={menuOpen} menuContent={menuContent} onSelectActor={chooseActor} onSelectAsset={chooseAsset}
    onDraftChange={(id, draft) => { if (!replayActive) updateThreads(previous => setConversationDraft(previous, id, draft)); }} onSend={id => void askCoworker(id)}
    onReadEntries={readEntries} onOpenEntry={openEntry} onCloseEntry={() => setReader(null)}
    onExecuteProposal={id => void executeProposal(id)} onSuggestedOrder={id => { const current = known.current; if (!current) return; const order = conversationOrders(current).find(order => order.id === id && order.enabled); if (order) void applyOrder(order.actorId, order.intent); }}
    onStopTask={(id, taskId) => { const current = known.current; if (!current || current.crew.find(crew => crew.id === id)?.taskId !== taskId) return; const task = current.tasks.find(task => task.id === taskId); if (task) void applyOrder(id, { action: 'cancel_task', targetId: task.targetId, atSimTime: current.simTime, args: { taskId } }); }}
    onWait={() => syncClock()} onPause={() => { if (transitioning.current || hostPending.current || commandPending.current) return; if (replayActive) setReplayPlaying(value => !value); else { manualPaused.current = !paused; syncClock(); } }} onSpeed={next => { setSpeed(next); simulation.current?.setSpeed(next); }}
    onContinueGuide={() => syncClock()} onSetGuidance={enabled => { guideEnabled.current = enabled; setGuidanceEnabled(enabled); syncClock(); }} onMenuToggle={toggleMenu}
    onStartGuided={() => { guideEnabled.current = true; setGuidanceEnabled(true); void begin('mission'); }} onStartPractice={() => void begin('practice')} />;
}
