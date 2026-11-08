import { createGameAudio, SOUND_CUES, type AudioView } from '../../src/audio';

const audio = createGameAudio({ storage: { getItem: () => null, setItem() {} } });
const status = document.querySelector<HTMLElement>('#status')!;
let time = 0;
const publicFixture = (): AudioView => ({
  runId: 'isolated-audition', actorId: 'player', simTime: time,
  knownTopology: { width: 3, height: 3, tileMeters: 1, walkable: [], assets: [{
    id: 'cooling', label: 'Fixture cooling', kind: 'cooling', x: 1, y: 0, width: 1, height: 1,
    serviceTile: { x: 1, y: 1 }, dependencies: [],
  }] },
  crew: [{ id: 'fixture-crew', name: 'Fixture crew', role: 'facilities', x: 1, y: 1, speed: 1, taskId: null }],
  tasks: [], observations: [], messages: [],
  mission: { status: 'practice', reason: null, stabilitySeconds: null, windowSeconds: 600 },
});
audio.reset('isolated-audition');
audio.update(publicFixture(), { paused: false });
document.querySelector('#unlock')!.addEventListener('click', async () => {
  await audio.unlock(); audio.update(publicFixture(), { paused: false });
  status.textContent = 'Unlock requested. Choose a cue; check asset/network and audio settings if silent.';
});
document.querySelector<HTMLInputElement>('#muted')!.addEventListener('change', event => {
  audio.setMuted((event.currentTarget as HTMLInputElement).checked);
});
document.querySelector<HTMLInputElement>('#volume')!.addEventListener('input', event => {
  audio.setVolume(Number((event.currentTarget as HTMLInputElement).value));
});
for (const cue of SOUND_CUES) {
  const button = document.createElement('button'); button.textContent = cue;
  button.addEventListener('click', () => {
    if (cue === 'work-loop' || cue === 'facility-loop') {
      const fixture = publicFixture(); fixture.simTime = ++time;
      if (cue === 'work-loop') {
        fixture.crew[0].taskId = 'fixture-task';
        fixture.tasks = [{ id: 'fixture-task', actorId: 'fixture-crew', targetId: 'cooling', action: 'repair_cooling',
          status: 'working', startedAt: time, arrivalAt: time, completesAt: time + 60, progress: 0,
          path: [{ x: 1, y: 1 }], reason: null }];
      } else fixture.observations = [{ id: `fixture-observation-${time}`, assetId: 'cooling', source: 'fixture',
        field: 'running', value: true, units: '', observedAt: time, receivedAt: time, quality: 'reported' }];
      audio.update(fixture, { paused: false });
      audio.update(fixture, { paused: false });
    } else {
      // Direct sampler-owned one-shots are exposed here for audition only.
      // Application integration must follow the handoff's one-owner map.
      audio.play(cue);
    }
    status.textContent = `Requested ${cue}. Loop evidence on this page is synthetic public fixture state.`;
  });
  document.querySelector('#cues')!.append(button);
}
document.querySelector('#stop')!.addEventListener('click', () => {
  audio.reset('isolated-audition'); audio.update(publicFixture(), { paused: false });
  status.textContent = 'Fixture reset; pending audio and loops stopped.';
});
document.querySelector('#destroy')!.addEventListener('click', () => {
  audio.destroy(); status.textContent = 'Controller disposed. Reload to audition again.';
});
window.addEventListener('pagehide', () => audio.destroy(), { once: true });
