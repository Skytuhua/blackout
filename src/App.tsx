import { useEffect, useRef, useState } from 'react';
import { DesktopGame } from './ui/DesktopGame';
import { DesktopReplayView } from './ui/debrief/DesktopReplayView';
import { SimulationClient } from './workers/SimulationClient';
import { hotRestart, practiceScenario } from './content/scenarios/hot-restart';
import { latestObservations } from './llm/context';
import { runCoworker, type CoworkerResult } from './llm/interaction';
import { beginTraining, trainingInput, trainingReceipt, trainingSteps, trainingView, type TrainingProgress } from './shared/training';
import { openRunStore, type RunStore, type SavedRunSummary } from './persistence/runs';
import { HostArchive } from './persistence/host-archive';
import { engineRecordOf } from './persistence/saved-record';
import { buildOutcomeLedger } from './sim/replay/ledger';
import type { ActionIntent, ComparisonResult, DesktopPanel, DesktopRadioExchange, KnowledgeView, OutcomeLedger, PublicMessage, SavedRunRecord, TutorialEvent } from './shared/contracts';

const words = (value: string) => value.toLowerCase().replaceAll('_', ' ');
const clock = (at: number) => `${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')}`;
const ended = (view: KnowledgeView) => ['success', 'failure'].includes(view.mission.status);
const sameIntent = (a: ActionIntent, b: ActionIntent) => a.action === b.action && a.targetId === b.targetId && JSON.stringify(a.args) === JSON.stringify(b.args);

export default function App() {
  const simulation = useRef<SimulationClient | null>(null), unsubscribe = useRef<(() => void) | null>(null), known = useRef<KnowledgeView | null>(null);
  const generation = useRef(0), transitioning = useRef(false), commandPending = useRef(false), radioController = useRef<AbortController | null>(null);
  const sourceGeneration = useRef(0), hostPending = useRef(false), listGeneration = useRef(0);
  const radioJob = useRef<Promise<CoworkerResult> | null>(null), archive = useRef<HostArchive | null>(null), store = useRef<Promise<RunStore> | null>(null);
  const replayClient = useRef<SimulationClient | null>(null), replayGeneration = useRef(0), replayAt = useRef(0), replayPending = useRef(false);
  const sessionRef = useRef<'welcome' | 'practice' | 'mission'>('welcome'), selected = useRef<string | null>(null), selectedCrew = useRef<string | null>(null);
  const [view, setView] = useState<KnowledgeView | null>(null), [session, setSession] = useState<typeof sessionRef.current>('welcome');
  const [paused, setPaused] = useState(true), [speed, setSpeed] = useState<1 | 2 | 4>(1), [busy, setBusy] = useState(false), [radioBusy, setRadioBusy] = useState(false);
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [assetId, setAssetId] = useState<string | null>(null), [crewId, setCrewId] = useState<string | null>(null), [panel, setPanel] = useState<DesktopPanel>(null);
  const [training, setTraining] = useState<TrainingProgress | null>(null), [exchange, setExchange] = useState<DesktopRadioExchange | null>(null), [radio, setRadio] = useState<PublicMessage[]>([]);
  const [saved, setSaved] = useState<SavedRunSummary[]>([]), [source, setSource] = useState<SavedRunRecord | null>(null), [ledger, setLedger] = useState<OutcomeLedger | null>(null), [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [replayView, setReplayView] = useState<KnowledgeView | null>(null), [replayActive, setReplayActive] = useState(false), [replayPlaying, setReplayPlaying] = useState(false), [cursor, setCursor] = useState(0);

  function chooseAsset(id: string) { selected.current = id; setAssetId(id); }
  function chooseCrew(id: string | null) { selectedCrew.current = id; setCrewId(id); }
  function tutorial(event: TutorialEvent) {
    if (sessionRef.current !== 'practice' || replayActive) return;
    if (event === 'crew_selected' && !known.current?.crew.some(c => c.id === selectedCrew.current && c.role !== 'remote')) return;
    setTraining(previous => previous ? trainingInput(previous, event) : previous);
  }
  function getStore() { return store.current ??= openRunStore().catch(problem => { store.current = null; throw problem; }); }
  async function refreshSaves() {
    const request = ++listGeneration.current, token = generation.current;
    try { const rows = await (await getStore()).listRuns(); if (request === listGeneration.current && token === generation.current) setSaved(rows); }
    catch { if (request === listGeneration.current && token === generation.current) setError('Local saves are unavailable. The mission remains playable; browser storage may be blocked.'); }
  }
  function pauseLive() { simulation.current?.pause(); setPaused(true); }
  function closeReplay() {
    sourceGeneration.current++; hostPending.current = false; setBusy(false);
    replayGeneration.current++; replayClient.current?.dispose(); replayClient.current = null; replayAt.current = 0; replayPending.current = false;
    setReplayActive(false); setReplayPlaying(false); setReplayView(null); setCursor(0);
  }
  async function begin(next: typeof sessionRef.current, previous?: SavedRunRecord, runImmediately = true) {
    if (transitioning.current) return;
    transitioning.current = true; const token = ++generation.current;
    radioController.current?.abort(); simulation.current?.pause(); closeReplay(); setBusy(true); setPaused(true); setError('');
    try {
      await radioJob.current?.catch(() => undefined);
      if (token !== generation.current) return;
      unsubscribe.current?.(); simulation.current?.dispose(); known.current = null;
      selected.current = null; selectedCrew.current = null; commandPending.current = false; radioJob.current = null; radioController.current = null;
      setView(null); setAssetId(null); setCrewId(null); setPanel(null); setNotice(''); setRadio([]); setExchange(null); setRadioBusy(false); setSpeed(1); setSource(null); setLedger(null); setComparison(null);
      sessionRef.current = next; setSession(next);
      const client = new SimulationClient(), runId = crypto.randomUUID(); simulation.current = client;
      archive.current = new HostArchive(runId, previous);
      setTraining(next === 'practice' ? beginTraining(runId) : null);
      unsubscribe.current = client.subscribe(raw => {
        if (token !== generation.current || simulation.current !== client) return;
        known.current = raw; setView({ ...raw, observations: latestObservations(raw.observations), messages: raw.messages.slice(-8) });
        if (next === 'practice') setTraining(current => current ? trainingView(current, raw) : current);
        if (ended(raw)) { setPaused(true); radioController.current?.abort(); }
      });
      await client.initialize(next === 'mission' ? hotRestart : practiceScenario, runId);
      if (previous) await client.restore(previous.finalCheckpoint, runId);
      if (token !== generation.current) return;
      if (previous) setNotice('Saved mission resumed paused. Continue when ready.');
      if (next !== 'welcome' && runImmediately && known.current && !ended(known.current)) { client.resume(); setPaused(false); }
    } catch { if (token === generation.current) setError('Could not open this session. Retry with a fresh mission; incompatible saves remain preserved.'); }
    finally { if (token === generation.current) { transitioning.current = false; setBusy(false); } }
  }

  useEffect(() => {
    void begin('welcome');
    const visibility = () => { if (document.hidden) { simulation.current?.pause(); setPaused(true); setReplayPlaying(false); } };
    document.addEventListener('visibilitychange', visibility);
    return () => { generation.current++; sourceGeneration.current++; listGeneration.current++; transitioning.current = false; radioController.current?.abort(); unsubscribe.current?.(); simulation.current?.dispose(); replayClient.current?.dispose(); void store.current?.then(storage => storage.close()).catch(() => {}); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  async function dispatch(intent: ActionIntent) {
    const client = simulation.current, current = known.current;
    if (!client || !current || replayActive || transitioning.current || hostPending.current || commandPending.current || !['active', 'practice'].includes(current.mission.status)) return;
    const token = generation.current; commandPending.current = true; setBusy(true); setError('');
    const proposal = panel === 'radio' && exchange?.reply.kind === 'final' && exchange.reply.response.proposals.some(candidate => sameIntent(candidate, intent));
    try {
      const receipt = await client.command({ schemaVersion: 1, runId: current.runId, requestId: crypto.randomUUID(), actorId: 'player', intent: { ...intent, atSimTime: current.simTime }, expectedEntityVersions: proposal ? exchange!.start.view.observedEntityVersions : current.observedEntityVersions, idempotencyKey: crypto.randomUUID() });
      if (token !== generation.current) return;
      if (sessionRef.current === 'practice') setTraining(previous => previous ? trainingReceipt(previous, intent, receipt) : previous);
      await client.observe('player'); if (token !== generation.current) return;
      setNotice(receipt.status === 'rejected' ? `${words(intent.action)} unavailable: ${words(receipt.reason)}. Check current evidence and the crew assignment.` : `${words(intent.action)} accepted${receipt.eta === null ? '' : ` · completes ${clock(receipt.eta)}`}. ${intent.action === 'move_crew' ? 'Watch the route to arrival.' : 'A report follows the completed work.'}`);
    } catch { if (token === generation.current) setError('Could not confirm the order. Refresh the equipment evidence before trying again.'); }
    finally { if (token === generation.current) { commandPending.current = false; setBusy(false); } }
  }

  async function askCoworker(actorId: string, message: string) {
    const client = simulation.current, current = known.current, recorder = archive.current;
    if (!client || !current || !recorder || radioJob.current || replayActive || transitioning.current || hostPending.current || ended(current)) return;
    if (sessionRef.current !== 'mission') { setNotice('Practice radio: check timestamps, choose a qualified technician, and wait for the delivered inspection report. No model call was made.'); return; }
    const token = generation.current, controller = new AbortController(), targetId = selected.current;
    radioController.current = controller; setRadioBusy(true); setError('');
    const job = runCoworker({ simulation: client, runId: current.runId, actorId, targetId, message, signal: controller.signal, getSimTime: () => known.current?.runId === current.runId ? known.current.simTime : current.simTime, onTool: async (_intent, result) => {
      if (token !== generation.current || controller.signal.aborted) return;
      await client.observe('player'); if (token === generation.current && result.receipt) setNotice(`Inspection ${result.receipt.status}${result.receipt.eta === null ? '' : ` · completes ${clock(result.receipt.eta)}`}. Work and reporting take time.`);
    } });
    radioJob.current = job;
    try {
      const result = await job; recorder.capture(result.recording);
      if (token !== generation.current || controller.signal.aborted) return;
      const { recording: _recording, ...presentation } = result;
      setExchange(presentation); setPanel('radio');
      const answer = result.reply.kind === 'final' ? result.reply.response : null;
      const response: PublicMessage = { id: crypto.randomUUID(), at: result.view.simTime, speaker: actorId, mode: answer ? 'live' : 'scripted', text: answer ? `Inference: ${answer.inference} Uncertainty: ${answer.uncertainty}` : result.reply.kind === 'fallback' ? result.reply.message : 'Check the delivered evidence.', evidenceIds: answer ? answer.facts.flatMap(f => 'observationId' in f ? [f.observationId] : []) : [] };
      recorder.message(response); setRadio(previous => [...previous, response]);
    } catch { if (token === generation.current) setError('Coworker evidence is unavailable. Direct orders still work.'); }
    finally { if (radioJob.current === job) radioJob.current = null; if (token === generation.current) { setRadioBusy(false); radioController.current = null; } }
  }

  async function capture(save: boolean) {
    const client = simulation.current, recorder = archive.current, token = generation.current;
    if (!client || !recorder || sessionRef.current !== 'mission' || replayActive || commandPending.current || transitioning.current) return;
    const request = ++sourceGeneration.current; hostPending.current = true;
    pauseLive(); setBusy(true); radioController.current?.abort();
    try {
      await radioJob.current?.catch(() => undefined); if (token !== generation.current || request !== sourceGeneration.current) return;
      const record = recorder.build(await client.record()); if (token !== generation.current || request !== sourceGeneration.current) return;
      if (save) { await (await getStore()).saveRun(record); if (token !== generation.current || request !== sourceGeneration.current) return; setNotice('Mission saved locally with its original observations, orders and radio transcript.'); }
      setSource(record); setLedger(buildOutcomeLedger(engineRecordOf(record))); setComparison(null);
      if (save) await refreshSaves();
    } catch (problem) { if (token === generation.current && request === sourceGeneration.current) setError(`Could not save or review this run: ${problem instanceof Error ? problem.message : 'storage unavailable'}`); }
    finally { if (token === generation.current && request === sourceGeneration.current) { hostPending.current = false; setBusy(false); } }
  }
  function changePanel(next: DesktopPanel) { setPanel(next); if (next === 'replay') { pauseLive(); void refreshSaves(); if (!replayActive && sessionRef.current === 'mission') void capture(false); } }
  async function activateReplay(record: SavedRunRecord) {
    pauseLive(); closeReplay(); const token = ++replayGeneration.current, sessionToken = generation.current; hostPending.current = true; setBusy(true); setError(''); radioController.current?.abort();
    try {
      await radioJob.current?.catch(() => undefined);
      if (token !== replayGeneration.current || sessionToken !== generation.current) return;
      const client = new SimulationClient(); replayClient.current = client;
      await client.initialize(record.scenario, crypto.randomUUID());
      if (token !== replayGeneration.current || sessionToken !== generation.current) return;
      const projected = await client.replayTo(engineRecordOf(record), 0);
      if (token !== replayGeneration.current || sessionToken !== generation.current) return;
      pauseLive();
      setSource(record); setLedger(buildOutcomeLedger(engineRecordOf(record))); setComparison(null); setReplayView(projected); setReplayActive(true); setCursor(0); replayAt.current = 0; chooseAsset(''); chooseCrew(null); setPanel('replay');
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
  const step = trainingSteps[Math.min(training?.step ?? 0, trainingSteps.length - 1)];
  const replayContent = <DesktopReplayView saved={saved} ledger={ledger} comparison={comparison} cursor={cursor} playing={replayPlaying} busy={busy} active={replayActive} canSave={session === 'mission'} notice={notice} error={error}
    caps={source?.commands.filter(c => ['accepted', 'applied'].includes(c.receipt.status) && ['pause_batch', 'set_batch_ceiling'].includes(c.intent.action)).map(c => ({ sequence: c.sequence, at: c.at, label: words(c.intent.action) })) ?? []}
    dialogue={source?.dialogue ?? []} transcript={source ? JSON.stringify(source.interactions, null, 2) : ''}
    onSave={() => void capture(true)} onRefresh={() => void refreshSaves()} onReview={id => void reviewSaved(id, false)} onResume={id => void reviewSaved(id, true)} onExport={id => void exportSaved(id)}
    onReplay={() => { if (source) void activateReplay(source); }} onReturn={() => { closeReplay(); setPanel(null); }} onSeek={at => void seek(at)} onToggle={() => setReplayPlaying(value => !value)} onCompare={(sequence, at) => void compare(sequence, at)} />;
  return <DesktopGame view={{ ...shown, messages: replayActive ? shown.messages : [...shown.messages, ...radio].slice(-8) }} session={session} selectedAssetId={assetId || null} selectedCrewId={crewId} panel={panel}
    paused={replayActive ? !replayPlaying : paused} speed={speed} busy={busy || replayActive} radioBusy={radioBusy} notice={replayActive ? `Recorded replay · ${clock(cursor)} · source ${source?.runId}` : notice} error={error}
    coach={session === 'practice' && training ? { step: training.step, total: trainingSteps.length, ...step } : null} exchange={exchange} replayContent={replayContent}
    onSelectAsset={chooseAsset} onSelectCrew={chooseCrew} onPanelChange={changePanel} onAction={intent => void dispatch(intent)} onAskCoworker={(actor, message) => void askCoworker(actor, message)}
    onCancelCoworker={() => { radioController.current?.abort(); setNotice('Radio canceled. Any order already accepted by the engine still appears in crew assignments.'); }}
    onPause={() => { if (transitioning.current || hostPending.current || commandPending.current) return; if (replayActive) setReplayPlaying(value => !value); else if (paused) { simulation.current?.resume(); setPaused(false); } else pauseLive(); }}
    onSpeed={next => { if (transitioning.current || hostPending.current) return; setSpeed(next); simulation.current?.setSpeed(next); }} onRetry={() => void begin('mission', undefined, false)} onStartPractice={() => void begin('practice')}
    onStartMission={() => void begin('mission')} onTutorialEvent={tutorial} />;
}
