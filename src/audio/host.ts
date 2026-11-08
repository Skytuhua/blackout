import type { AudioView, GameAudio, SoundCue } from './index';

export type RootSoundCue = Extract<SoundCue, 'ui-select' | 'ui-open' | 'ui-close' | 'message-sent' | 'message-received' | 'order-accepted' | 'order-rejected' | 'incident-warning' | 'incident-critical' | 'save-complete' | 'simulation-pause' | 'simulation-resume'>;
type Ticket = Readonly<{ runId: string | null; generation: number }>;
/** Physical/task/report/mission cues belong solely to GameAudio.update. */
export function createAudioHost(audio: GameAudio) {
  let runId: string | null = null, generation = 0, replay = false, destroyed = false;
  const capture = (): Ticket => ({ runId, generation });
  const emit = (cue: RootSoundCue, id: string, ticket: Ticket = capture()) => {
    if (!destroyed && runId && (!replay || cue.startsWith('ui-')) && ticket.runId === runId && ticket.generation === generation) audio.play(cue, `${cue}:${id}`);
  };
  return {
    audio, capture, emit,
    reset(nextRunId: string) { if (destroyed) return; generation++; runId = nextRunId; replay = false; audio.reset(nextRunId); },
    update(view: AudioView, flags: Parameters<GameAudio['update']>[1]) { if (destroyed || view.actorId !== 'player' || view.runId !== runId) return; replay = !!flags.replay; audio.update(view, flags); },
    async gesture(cue: RootSoundCue, id: string) { const ticket = capture(); try { await audio.unlock(); emit(cue, id, ticket); } catch { /* Sound is optional. */ } },
    destroy() { if (destroyed) return; destroyed = true; generation++; runId = null; audio.destroy(); },
  };
}
export type AudioHost = ReturnType<typeof createAudioHost>;
