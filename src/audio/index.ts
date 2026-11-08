import type { KnowledgeView } from '../shared/contracts';
import { SOUND_CUES, isLoop, isPhysical, priority, type LoopCue, type SoundCue } from './cues';
import { CueSampler } from './sampler';
export { SOUND_CUES } from './cues';
export type { SoundCue } from './cues';
export type AudioView = Pick<KnowledgeView, 'runId' | 'actorId' | 'simTime' | 'crew' | 'tasks' | 'messages' | 'observations' | 'knownTopology' | 'mission'>;
export interface GameAudio {
  unlock(): Promise<void>;
  play(cue: SoundCue, eventKey?: string): void;
  update(view: AudioView, options: { paused: boolean; replay?: boolean }): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  getPreferences(): { muted: boolean; volume: number };
  reset(runId: string): void;
  destroy(): void;
}

const PREFERENCE_KEY = 'blackout.audio.preferences.v1';
const MAX_VOICES = 8; // one-shots; two separately bounded physical loops
const MAX_LOADS = 4;
const MAX_BYTES = 1_000_000;
const EVENT_LIFETIME_MS = 350;
type Request = { cue: SoundCue; generation: number; at: number };
type Voice = { cue: SoundCue; source: AudioBufferSourceNode; gain: GainNode; timer?: ReturnType<typeof setTimeout> };

/** Audio is optional presentation. This controller never sends a game command. */
export function createGameAudio(options: { assetBaseUrl?: string; storage?: Pick<Storage, 'getItem' | 'setItem'> } = {}): GameAudio {
  let storage = options.storage;
  try { storage ??= globalThis.localStorage; } catch { /* Browser privacy settings. */ }
  let preferences = { muted: false, volume: 0.35 };
  try {
    const stored: unknown = JSON.parse(storage?.getItem(PREFERENCE_KEY) ?? 'null');
    if (stored && typeof stored === 'object') {
      const value = stored as Record<string, unknown>;
      if (typeof value.muted === 'boolean') preferences.muted = value.muted;
      if (typeof value.volume === 'number' && Number.isFinite(value.volume)) preferences.volume = Math.max(0, Math.min(1, value.volume));
    }
  } catch { /* Corrupt/blocked audio preferences do not affect game saves. */ }
  const persist = () => { try { storage?.setItem(PREFERENCE_KEY, JSON.stringify(preferences)); } catch { /* Optional. */ } };
  const sampler = new CueSampler();
  const base = (options.assetBaseUrl ?? '/audio/retro-v1').replace(/\/+$/, '');
  const page = typeof document === 'undefined' ? undefined : document;
  const hidden = () => page?.hidden === true;
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let unlocking: Promise<void> | undefined;
  let unlocked = false;
  let destroyed = false;
  let paused = false;
  let replay = false;
  let generation = 0;
  let silentNext = true;
  let runId: string | undefined;
  let actorId: string | undefined;
  let lastSimTime: number | undefined;
  let work = '';
  let pinnedRun = false;
  const retiredRuns = new Set<string>();
  const retiredActors = new Set<string>();
  const buffers = new Map<SoundCue, AudioBuffer>(); // at most the 22 declared cues
  const failures = new Set<SoundCue>(); // one missing-asset attempt per generation
  const waiting = new Map<SoundCue, Request>();
  const loading = new Map<SoundCue, { request: Request; abort: AbortController; timer?: ReturnType<typeof setTimeout> }>();
  const voices = new Set<Voice>();
  const loops = new Map<LoopCue, Voice>();
  let wantedLoops = new Set<LoopCue>();
  const lastPlayed = new Map<SoundCue, number>();
  const keys = new Set<string>();
  let scheduled = false;
  const now = () => performance.now();
  const audible = () => !destroyed && unlocked && context?.state === 'running' && !hidden() && !preferences.muted && preferences.volume > 0;
  const permitted = (cue: SoundCue) => audible() && (!isPhysical(cue) || !paused && !replay);
  const valid = (request: Request) => request.generation === generation && permitted(request.cue)
    && (isLoop(request.cue) ? wantedLoops.has(request.cue) : now() - request.at <= EVENT_LIFETIME_MS);
  const remember = (set: Set<string>, value: string, limit: number) => {
    set.add(value); if (set.size > limit) set.delete(set.values().next().value!);
  };
  function stop(voice: Voice) {
    voices.delete(voice);
    if (isLoop(voice.cue) && loops.get(voice.cue) === voice) loops.delete(voice.cue);
    voice.source.onended = null;
    clearTimeout(voice.timer);
    try { voice.source.stop(); } catch { /* Already ended. */ }
    voice.source.disconnect(); voice.gain.disconnect();
  }
  function invalidate(all: boolean) {
    const previousGeneration = generation++;
    silentNext = true; wantedLoops.clear(); failures.clear();
    const preserve = (request: Request) => !all && request.generation === previousGeneration && !isPhysical(request.cue);
    for (const [cue, request] of waiting) {
      if (preserve(request)) request.generation = generation;
      else waiting.delete(cue);
    }
    for (const job of loading.values()) {
      if (!job.abort.signal.aborted && preserve(job.request)) job.request.generation = generation;
      else { clearTimeout(job.timer); job.abort.abort(); }
    }
    for (const voice of [...voices]) if (all || isPhysical(voice.cue)) stop(voice);
  }
  function start(request: Request, buffer: AudioBuffer) {
    if (!valid(request) || !context || !master) return;
    const cue = request.cue;
    if (isLoop(cue) && loops.has(cue)) return;
    if (!isLoop(cue)) {
      const gap = cue === 'crew-step' ? 180 : cue.startsWith('ui-') ? 70 : 250;
      if (now() - (lastPlayed.get(cue) ?? -Infinity) < gap) return;
      const shots = [...voices].filter(voice => !isLoop(voice.cue));
      if (shots.length >= MAX_VOICES) {
        const lowest = shots.reduce((a, b) => priority(a.cue) <= priority(b.cue) ? a : b);
        if (priority(lowest.cue) > priority(cue)) return;
        stop(lowest);
      }
    }
    let voice: Voice | undefined;
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      voice = { cue, source, gain };
      source.buffer = buffer; source.loop = isLoop(cue);
      gain.gain.value = cue === 'facility-loop' ? 0.16 : cue === 'work-loop' ? 0.25 : cue === 'crew-step' ? 0.4 : 0.8;
      source.connect(gain); gain.connect(master);
      source.onended = () => { if (voice) stop(voice); };
      voices.add(voice);
      if (isLoop(cue)) loops.set(cue, voice);
      else {
        lastPlayed.set(cue, now());
        voice.timer = setTimeout(() => { if (voice) stop(voice); }, (buffer.duration + 0.2) * 1000);
      }
      source.start();
    } catch { if (voice) stop(voice); }
  }
  async function load(request: Request, abort: AbortController) {
    const timeout = setTimeout(() => abort.abort(), 5000);
    loading.get(request.cue)!.timer = timeout;
    try {
      const response = await fetch(`${base}/${request.cue}.wav`, { signal: abort.signal });
      if (!response.ok || abort.signal.aborted) return;
      const size = Number(response.headers?.get('content-length'));
      if (size > MAX_BYTES) return;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_BYTES || abort.signal.aborted || request.generation !== generation || !context) return;
      const buffer = await context.decodeAudioData(bytes);
      if (abort.signal.aborted || request.generation !== generation || destroyed) return;
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 20 || buffer.numberOfChannels > 2) return;
      buffers.set(request.cue, buffer);
      start(request, buffer);
    } catch { /* Missing assets, cancellation and decoder failure are silent. */ }
    finally {
      clearTimeout(timeout);
      if (!buffers.has(request.cue) && request.generation === generation) failures.add(request.cue);
      loading.delete(request.cue);
      // A stuck native decoder keeps its slot until it settles; resets cannot
      // accumulate unlimited uncancelable decoding work.
      schedule();
    }
  }
  function flush() {
    scheduled = false;
    const ordered = [...waiting.values()].sort((a, b) => priority(b.cue) - priority(a.cue));
    for (const request of ordered) {
      if (!valid(request) || failures.has(request.cue)) { waiting.delete(request.cue); continue; }
      if (loading.has(request.cue)) continue;
      const buffer = buffers.get(request.cue);
      if (buffer) { waiting.delete(request.cue); start(request, buffer); continue; }
      if (loading.size >= MAX_LOADS) continue;
      waiting.delete(request.cue);
      const abort = new AbortController();
      loading.set(request.cue, { request, abort });
      void load(request, abort);
    }
  }
  function schedule() {
    if (scheduled || destroyed) return;
    scheduled = true; void Promise.resolve().then(flush);
  }
  function request(cue: SoundCue) {
    if (!permitted(cue) || failures.has(cue)) return;
    if (isLoop(cue) && (loops.has(cue) || !wantedLoops.has(cue))) return;
    if (loading.get(cue)?.request.generation === generation) return;
    if (!waiting.has(cue)) waiting.set(cue, { cue, generation, at: now() });
    schedule();
  }
  const visibility = () => { invalidate(true); };
  page?.addEventListener('visibilitychange', visibility);
  return {
    async unlock() {
      if (destroyed || hidden() || typeof navigator !== 'undefined' && navigator.userActivation?.isActive === false) return;
      if (unlocking) return unlocking;
      // Called directly from the host's gesture handler. Native autoplay policy
      // is preserved, including browsers without userActivation support.
      unlocking = (async () => {
        try {
          if (!context) {
            const Constructor = globalThis.AudioContext;
            if (!Constructor) return;
            context = new Constructor(); master = context.createGain();
            master.gain.value = preferences.volume; master.connect(context.destination);
          }
          if (context.state !== 'running') await context.resume();
          if (destroyed) return;
          if (!unlocked && context.state === 'running') { invalidate(true); unlocked = true; }
        } catch { unlocked = false; }
      })();
      try { await unlocking; } finally { unlocking = undefined; }
    },
    play(cue, eventKey) {
      if (destroyed || !SOUND_CUES.includes(cue)) return;
      if (eventKey !== undefined) {
        if (keys.has(eventKey)) return;
        remember(keys, eventKey, 256);
      }
      request(cue);
    },
    update(view, options) {
      if (destroyed || !Number.isFinite(view.simTime)) return;
      if (runId !== view.runId) {
        if (pinnedRun || retiredRuns.has(view.runId)) return;
        if (runId) remember(retiredRuns, runId, 16);
        invalidate(true); sampler.clear(); keys.clear(); lastPlayed.clear(); retiredActors.clear();
        runId = view.runId; actorId = undefined;
        lastSimTime = undefined; work = '';
      }
      if (actorId !== view.actorId) {
        if (retiredActors.has(view.actorId)) return;
        if (actorId) remember(retiredActors, actorId, 16);
        invalidate(true); sampler.clear(); keys.clear(); lastPlayed.clear(); actorId = view.actorId;
        lastSimTime = undefined; work = '';
      }
      if (lastSimTime !== undefined && view.simTime < lastSimTime) invalidate(true);
      lastSimTime = view.simTime;
      if (replay !== !!options.replay) invalidate(true);
      if (paused !== options.paused) {
        const wasSilent = silentNext;
        invalidate(false);
        // A final worker view may be committed together with the automatic
        // mission-end pause. Its public terminal notification is still current.
        silentNext = options.paused ? wasSilent : true;
      }
      paused = options.paused; replay = !!options.replay;
      const sample = sampler.sample(view, silentNext || !audible() || replay, paused);
      // Cancellation/completion/reassignment must also cancel a cold task-start
      // sample that is still decoding, even while the run itself is unchanged.
      if (work && work !== sample.work) invalidate(false);
      work = sample.work;
      silentNext = false;
      wantedLoops = sample.loops;
      for (const [cue, voice] of loops) if (!wantedLoops.has(cue) || !permitted(cue)) stop(voice);
      for (const cue of sample.cues) request(cue);
      for (const cue of wantedLoops) request(cue);
    },
    setMuted(muted) {
      if (destroyed || preferences.muted === muted) return;
      preferences.muted = muted; invalidate(true); persist();
    },
    setVolume(volume) {
      if (destroyed || !Number.isFinite(volume)) return;
      const next = Math.max(0, Math.min(1, volume));
      if ((preferences.volume === 0) !== (next === 0)) invalidate(true);
      preferences.volume = next;
      if (master) master.gain.value = next;
      persist();
    },
    getPreferences: () => ({ ...preferences }),
    reset(nextRunId) {
      if (destroyed) return;
      if (runId && nextRunId !== runId) remember(retiredRuns, runId, 16);
      retiredRuns.delete(nextRunId); retiredActors.clear();
      invalidate(true); sampler.clear(); keys.clear(); lastPlayed.clear();
      runId = nextRunId; pinnedRun = true; actorId = undefined;
      lastSimTime = undefined; work = '';
    },
    destroy() {
      if (destroyed) return;
      invalidate(true); destroyed = true; sampler.clear(); buffers.clear(); keys.clear(); lastPlayed.clear();
      retiredRuns.clear(); retiredActors.clear(); page?.removeEventListener('visibilitychange', visibility);
      master?.disconnect();
      if (context) { try { void context.close().catch(() => {}); } catch { /* Already closed. */ } }
    },
  };
}
