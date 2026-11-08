// External, typechecked integration sketch. Nothing in the release route imports
// this file. The coordinator applies these calls inside existing host callbacks.
import { createGameAudio, type AudioView, type GameAudio, type SoundCue } from '../../src/audio';
import type { CommandReceipt } from '../../src/shared/contracts';

type RootCue = Extract<SoundCue,
  'ui-select' | 'ui-open' | 'ui-close' | 'message-sent' | 'message-received' |
  'order-accepted' | 'order-rejected' | 'incident-warning' | 'incident-critical' |
  'save-complete' | 'simulation-pause' | 'simulation-resume'>;
type Flags = Parameters<GameAudio['update']>[1];

export function externalAudioBindings(initialView: AudioView, flags: Flags) {
  const audio = createGameAudio();
  let runId = initialView.runId;
  let generation = 0;
  let replay = !!flags.replay;
  audio.reset(runId); audio.update(initialView, flags);
  const publish = (cue: RootCue, eventRunId: string, eventId: string, token: number) => {
    if (generation === token && runId === eventRunId && !replay) audio.play(cue, `${cue}:${eventId}`);
  };
  return {
    audio,
    // Capture before an async save, provider turn or worker command; check both
    // this token and the existing host gate before publishing its actual result.
    capture: () => generation,
    publish,
    receipt(receipt: CommandReceipt, token: number) {
      if (receipt.status === 'rejected') publish('order-rejected', receipt.runId, receipt.requestId, token);
      else if (receipt.status === 'accepted' || receipt.status === 'applied') publish('order-accepted', receipt.runId, receipt.requestId, token);
    },
    // Invoke directly inside trusted pointer/keyboard handlers, before any await.
    async gesture(cue: RootCue, eventId: string) {
      const token = generation, eventRunId = runId;
      await audio.unlock(); publish(cue, eventRunId, eventId, token);
    },
    update(view: AudioView, next: Flags) {
      if (view.runId !== runId) return;
      replay = !!next.replay; audio.update(view, next);
    },
    // Fresh start, restore (including same run ID), seek, entering/leaving replay:
    // replace the baseline and invalidate all captured async tickets silently.
    rebase(view: AudioView, next: Flags) {
      generation++; runId = view.runId; replay = !!next.replay;
      audio.reset(runId); audio.update(view, next);
    },
    destroy() { generation++; audio.destroy(); },
  };
}
