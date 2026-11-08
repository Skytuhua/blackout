import { expect, it, vi } from 'vitest';
import { createAudioHost } from '../../src/audio/host';
import type { GameAudio } from '../../src/audio';
import { alarmFixture } from '../../src/shared/fixtures';

function fake() {
  const audio: GameAudio = { unlock: vi.fn(async () => {}), play: vi.fn(), update: vi.fn(), reset: vi.fn(), destroy: vi.fn(), setMuted: vi.fn(), setVolume: vi.fn(), getPreferences: () => ({ muted: false, volume: 0.35 }) };
  return { audio, host: createAudioHost(audio) };
}
it('drops late command/chat/save cues after reset, including restore of the same run', () => {
  const { audio, host } = fake(); host.reset(alarmFixture.runId); const ticket = host.capture();
  host.reset(alarmFixture.runId); host.emit('message-received', 'old-reply', ticket); expect(audio.play).not.toHaveBeenCalled();
  host.emit('save-complete', 'new-save', host.capture()); expect(audio.play).toHaveBeenCalledWith('save-complete', 'save-complete:new-save');
});
it('does not let a delayed gesture unlock publish into a replacement run', async () => {
  const { audio, host } = fake(); let release!: () => void;
  audio.unlock = () => new Promise<void>(resolve => { release = resolve; });
  host.reset('old'); const gesture = host.gesture('ui-open', 'menu'); host.reset('new'); release(); await gesture;
  expect(audio.play).not.toHaveBeenCalled();
});
it('uses only the pinned player public view and suppresses root cues during replay', () => {
  const { audio, host } = fake(); host.reset(alarmFixture.runId);
  host.update({ ...alarmFixture, actorId: 'alex' }, { paused: false }); expect(audio.update).not.toHaveBeenCalled();
  host.update(alarmFixture, { paused: true, replay: true }); host.emit('message-received', 'history', host.capture()); expect(audio.play).not.toHaveBeenCalled();
  host.reset(alarmFixture.runId); host.update(alarmFixture, { paused: true });
  expect(audio.update).toHaveBeenLastCalledWith(alarmFixture, { paused: true });
});
