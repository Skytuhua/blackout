import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameAudio, type AudioView, type GameAudio } from '../../src/audio';

// Only the native device/network boundary is faked. These tests inspect the
// controller's actual source starts/stops and gain graph, not audible output.
class FakeSource {
  buffer: { url: string; duration: number } | null = null;
  loop = false;
  stopped = false;
  disconnected = false;
  onended: (() => void) | null = null;
  timer?: ReturnType<typeof setTimeout>;
  connect() {}
  disconnect() { this.disconnected = true; }
  start() {
    starts.push(this);
    if (!this.loop) this.timer = setTimeout(() => this.onended?.(), (this.buffer?.duration ?? 0.1) * 1000);
  }
  stop() { clearTimeout(this.timer); this.stopped = true; this.onended?.(); }
  get cue() { return this.buffer?.url.split('/').at(-1)?.replace('.wav', ''); }
}
class FakeGain {
  gain = { value: 1, setValueAtTime(value: number) { this.value = value; } };
  disconnected = false;
  connect() {}
  disconnect() { this.disconnected = true; }
}
class FakeContext {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  gains: FakeGain[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async (data: ArrayBuffer) => ({ url: new TextDecoder().decode(data), duration: 0.1, numberOfChannels: 1 }));
  constructor() { contexts.push(this); }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createBufferSource() { return new FakeSource(); }
}
const contexts: FakeContext[] = [];
const starts: FakeSource[] = [];
let page: EventTarget & { hidden: boolean };
let activation: { isActive: boolean };
let fetcher: ReturnType<typeof vi.fn>;
const controllers: GameAudio[] = [];
const cues = () => starts.map(source => source.cue);
const activeLoops = () => starts.filter(source => source.loop && !source.stopped).map(source => source.cue).sort();
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const view = (patch: Partial<AudioView> = {}): AudioView => ({
  runId: 'run-a', actorId: 'player', simTime: 0,
  knownTopology: { width: 4, height: 4, tileMeters: 1, walkable: [], assets: [
    { id: 'cooling', label: 'Cooling', kind: 'cooling', x: 2, y: 1, width: 1, height: 1, serviceTile: { x: 2, y: 2 }, dependencies: [] },
  ] },
  crew: [{ id: 'alex', name: 'Alex', role: 'facilities', x: 0, y: 2, taskId: null, speed: 1 }],
  tasks: [], observations: [], messages: [],
  mission: { status: 'active', reason: null, stabilitySeconds: null, windowSeconds: 600 }, ...patch,
});
const task = (patch: Partial<AudioView['tasks'][number]> = {}): AudioView['tasks'][number] => ({
  id: 'task-1', actorId: 'alex', targetId: 'cooling', action: 'repair_cooling', status: 'traveling',
  startedAt: 0, arrivalAt: 2, completesAt: 5, progress: 0, path: [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }], reason: null, ...patch,
});
const crew = (x: number, taskId: string | null = 'task-1'): AudioView['crew'] => [{ ...view().crew[0], x, taskId }];
const running = (value: boolean | null, at: number, patch: Partial<AudioView['observations'][number]> = {}): AudioView['observations'][number] => ({
  id: `obs-${at}`, assetId: 'cooling', source: 'dashboard', field: 'running', value, units: '', observedAt: at, receivedAt: at, quality: 'reported', ...patch,
});
const report = (id = 'report-task-1', at = 6): AudioView['messages'][number] => ({ id, at, speaker: 'alex', text: 'Delivered', evidenceIds: [], mode: 'system' });
function make(options?: Parameters<typeof createGameAudio>[0]) {
  const audio = createGameAudio(options); controllers.push(audio); return audio;
}
async function ready(initial = view()) {
  const audio = make(); audio.update(initial, { paused: false }); await audio.unlock();
  audio.update(initial, { paused: false }); return audio;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  contexts.length = 0; starts.length = 0;
  page = Object.assign(new EventTarget(), { hidden: false });
  activation = { isActive: true };
  vi.stubGlobal('document', page); vi.stubGlobal('navigator', { userActivation: activation });
  vi.stubGlobal('AudioContext', FakeContext);
  fetcher = vi.fn(async (url: string) => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  controllers.splice(0).forEach(audio => audio.destroy()); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('native playback lifecycle', () => {
  it('requires a gesture and drops pre-unlock events instead of replaying them', async () => {
    const audio = make(); audio.play('ui-open', 'old'); await settle(); expect(contexts).toHaveLength(0);
    activation.isActive = false; await audio.unlock(); expect(contexts).toHaveLength(0);
    activation.isActive = true; await audio.unlock(); await settle(); expect(cues()).toEqual([]);
    audio.play('ui-select', 'new'); await settle(); expect(cues()).toEqual(['ui-select']);
    expect(fetcher.mock.calls[0][0]).toBe('/audio/retro-v1/ui-select.wav');
    expect(contexts[0].gains[0].gain.value).toBe(0.35);
  });
  it('clamps and persists only audio preferences, tolerating unavailable storage', async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const audio = make({ storage }); audio.setVolume(9); audio.setMuted(true);
    expect(audio.getPreferences()).toEqual({ muted: true, volume: 1 });
    expect([...values.keys()]).toEqual(['blackout.audio.preferences.v1']);
    expect(make({ storage }).getPreferences()).toEqual({ muted: true, volume: 1 });
    audio.setVolume(-2); expect(audio.getPreferences().volume).toBe(0);
    audio.setVolume(NaN); expect(audio.getPreferences().volume).toBe(0);
    const blocked = make({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
    expect(() => { blocked.setVolume(0.7); blocked.setMuted(true); }).not.toThrow();
    expect(blocked.getPreferences()).toEqual({ muted: true, volume: 0.7 });
  });
  it('stops sound on mute/zero volume and never replays suppressed events', async () => {
    const audio = await ready(); audio.play('ui-open'); await settle(); audio.setMuted(true);
    expect(starts[0].stopped).toBe(true); audio.play('save-complete', 'suppressed'); audio.setMuted(false); await settle();
    expect(cues()).toEqual(['ui-open']); audio.setVolume(0); audio.play('ui-close'); audio.setVolume(0.6); await settle();
    expect(cues()).toEqual(['ui-open']); expect(contexts[0].gains[0].gain.value).toBe(0.6);
  });
  it('coalesces and prioritizes bursts, rate limits repeats and scopes event keys by run', async () => {
    const audio = await ready();
    for (let i = 0; i < 100; i++) audio.play('ui-select', `click-${i}`);
    audio.play('incident-critical', 'critical'); audio.play('mission-failure', 'terminal'); await settle();
    expect(cues()[0]).toBe('mission-failure'); expect(cues().filter(c => c === 'ui-select')).toHaveLength(1);
    for (let i = 0; i < 20; i++) audio.play('ui-select'); await settle(); expect(cues().filter(c => c === 'ui-select')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500); audio.play('save-complete', 'saved'); await settle();
    await vi.advanceTimersByTimeAsync(500); audio.play('save-complete', 'saved'); await settle(); expect(cues().filter(c => c === 'save-complete')).toHaveLength(1);
    audio.reset('run-b'); audio.play('save-complete', 'saved'); await settle(); expect(cues().filter(c => c === 'save-complete')).toHaveLength(2);
  });
  it('bounds overlapping voices and permits critical cues to replace lower priority sound', async () => {
    const audio = await ready();
    contexts[0].decodeAudioData.mockImplementation(async data => ({ url: new TextDecoder().decode(data), duration: 4, numberOfChannels: 1 }));
    for (const cue of ['ui-open', 'ui-close', 'ui-select', 'message-sent', 'message-received', 'order-accepted', 'save-complete', 'order-rejected'] as const) {
      audio.play(cue); await settle(); await vi.advanceTimersByTimeAsync(110);
    }
    audio.play('incident-critical'); await settle();
    expect(starts.filter(source => !source.stopped)).toHaveLength(8); expect(cues()).toContain('incident-critical');
  });
  it('tolerates missing assets, context absence, malformed preferences and failed resume', async () => {
    vi.stubGlobal('AudioContext', undefined); const absent = make(); await expect(absent.unlock()).resolves.toBeUndefined(); absent.play('ui-select');
    vi.stubGlobal('AudioContext', FakeContext); const audio = make({ storage: { getItem: () => '{bad', setItem() {} } });
    await audio.unlock(); fetcher.mockResolvedValue({ ok: false }); audio.play('ui-open'); await settle(); expect(cues()).toEqual([]);
    contexts[0].state = 'suspended'; contexts[0].resume.mockRejectedValue(Error('blocked'));
    await expect(audio.unlock()).resolves.toBeUndefined(); audio.play('ui-close'); await settle(); expect(cues()).toEqual([]);
  });
  it('invalidates queued and decoding playback on reset and disposal', async () => {
    const audio = await ready(); let decode!: (buffer: { url: string; duration: number; numberOfChannels: number }) => void;
    contexts[0].decodeAudioData.mockImplementation(() => new Promise(resolve => { decode = resolve; }));
    audio.play('ui-open'); await settle(); audio.reset('run-b');
    decode({ url: '/audio/retro-v1/ui-open.wav', duration: 0.1, numberOfChannels: 1 }); await settle(); expect(cues()).toEqual([]);
    audio.play('ui-close'); audio.destroy(); await settle(); expect(cues()).toEqual([]); expect(contexts[0].close).toHaveBeenCalledOnce();
    expect(() => { audio.reset('x'); audio.setMuted(false); audio.play('ui-select'); }).not.toThrow();
  });
  it('drops late cold-load one-shots but caches the decoded asset for a new event', async () => {
    const audio = await ready(); let finish!: (response: unknown) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    audio.play('ui-open', 'late'); await settle(); await vi.advanceTimersByTimeAsync(1000);
    finish({ ok: true, arrayBuffer: async () => new TextEncoder().encode('/audio/retro-v1/ui-open.wav').buffer });
    await settle(); expect(cues()).toEqual([]);
    audio.play('ui-open', 'new'); await settle(); expect(cues()).toEqual(['ui-open']); expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each(['mute', 'hidden', 'pause', 'replay', 'rewind'] as const)('fences pending physical decoding across %s', async barrier => {
    const audio = await ready(view({ simTime: 10 }));
    let finish!: (buffer: { url: string; duration: number; numberOfChannels: number }) => void;
    contexts[0].decodeAudioData.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    audio.update(view({ simTime: 11, mission: { ...view().mission, status: 'success' } }), { paused: false }); await settle();
    if (barrier === 'mute') audio.setMuted(true);
    else if (barrier === 'hidden') { page.hidden = true; page.dispatchEvent(new Event('visibilitychange')); }
    else audio.update(view({ simTime: barrier === 'rewind' ? 2 : 11 }), { paused: barrier === 'pause', replay: barrier === 'replay' });
    finish({ url: '/audio/retro-v1/mission-success.wav', duration: 0.1, numberOfChannels: 1 }); await settle(); expect(cues()).toEqual([]);
  });
  it('keeps at most four uncancelable loads across repeated resets and aborts on disposal', async () => {
    const audio = await ready(); const signals: AbortSignal[] = [];
    fetcher.mockImplementation((_url: string, options: { signal: AbortSignal }) => { signals.push(options.signal); return new Promise(() => {}); });
    for (let i = 0; i < 10; i++) {
      audio.reset(`run-${i}`);
      for (const cue of ['ui-open', 'ui-close', 'ui-select', 'save-complete', 'message-sent'] as const) audio.play(cue);
      await settle();
    }
    expect(signals).toHaveLength(4); audio.destroy(); expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('disposes voices, gains, listener and timers exactly once, even with pending unlock', async () => {
    const remove = vi.spyOn(page, 'removeEventListener'); const audio = await ready();
    audio.play('ui-open'); await settle(); const master = contexts[0].gains[0];
    audio.destroy(); audio.destroy(); await settle();
    expect(starts.every(source => source.stopped && source.disconnected && source.onended === null)).toBe(true);
    expect(master.disconnected).toBe(true); expect(remove).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    const pending = make(); let resume!: () => void;
    const operation = pending.unlock(); contexts[1].state = 'suspended';
    contexts[1].resume.mockImplementation(() => new Promise<void>(resolve => { resume = resolve; }));
    await operation; const retry = pending.unlock(); pending.destroy(); resume(); await retry;
    pending.play('ui-close'); await settle(); expect(cues()).toEqual(['ui-open']); expect(contexts[1].close).toHaveBeenCalledOnce();
  });
  it('does not repeatedly refetch a failed asset and supports an explicit asset base URL', async () => {
    const audio = make({ assetBaseUrl: '/test-audio/' }); await audio.unlock();
    fetcher.mockRejectedValue(Error('missing')); audio.play('ui-open'); await settle();
    await vi.advanceTimersByTimeAsync(1000); audio.play('ui-open'); await settle(); expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('/test-audio/ui-open.wav');
  });
});

describe('public state sampling', () => {
  it('sounds actual route displacement, then arrived work, but never stationary travel or remote work loops', async () => {
    const audio = await ready(view({ tasks: [task()], crew: crew(0) }));
    audio.update(view({ simTime: 1, tasks: [task()], crew: crew(0) }), { paused: false }); await settle(); expect(cues()).toEqual([]);
    audio.update(view({ simTime: 2, tasks: [task()], crew: crew(1) }), { paused: false }); await settle(); expect(cues()).toEqual(['crew-step']);
    await vi.advanceTimersByTimeAsync(400);
    audio.update(view({ simTime: 3, tasks: [task({ status: 'working' })], crew: crew(2) }), { paused: false }); await settle();
    expect(cues()).toContain('task-start'); expect(activeLoops()).toEqual(['work-loop']);
    audio.update(view({ simTime: 4, tasks: [task({ status: 'blocked' })], crew: crew(2) }), { paused: false }); expect(activeLoops()).toEqual([]);
  });
  it.each(['queued', 'blocked', 'completed', 'canceled'] as const)('never fabricates work for %s tasks', async status => {
    const audio = await ready(); audio.update(view({ simTime: 3, tasks: [task({ status })], crew: crew(2) }), { paused: false }); await settle();
    expect(cues()).not.toContain('task-start'); expect(activeLoops()).toEqual([]);
  });
  it('rejects working status before arrival, wrong service tile, idle assignment and off-route displacement', async () => {
    const audio = await ready(view({ tasks: [task()], crew: crew(0) }));
    audio.update(view({ simTime: 1, tasks: [task({ status: 'working' })], crew: crew(2) }), { paused: false }); await settle();
    audio.update(view({ simTime: 2, tasks: [task({ status: 'working' })], crew: crew(0) }), { paused: false }); await settle();
    audio.update(view({ simTime: 3, tasks: [task({ status: 'working' })], crew: crew(2, null) }), { paused: false }); await settle();
    audio.update(view({ simTime: 4, tasks: [task()], crew: crew(3) }), { paused: false }); await settle(); expect(cues()).toEqual([]);
  });
  it('separates completion from delivered reports and coalesces 4x batches without duplicate refresh cues', async () => {
    const audio = await ready(view({ tasks: [task({ status: 'working' })], crew: crew(2) }));
    const done = view({ simTime: 5, tasks: [task({ status: 'completed', progress: 1 })] });
    audio.update(done, { paused: false }); audio.update(done, { paused: false }); await settle(); expect(cues()).toEqual(['task-complete']);
    await vi.advanceTimersByTimeAsync(500);
    const delivered = view({ ...done, simTime: 9, messages: [report(), report('report-task-2', 7), report('report-task-3', 8)] });
    audio.update(delivered, { paused: false }); audio.update(delivered, { paused: false }); await settle();
    expect(cues().filter(c => c === 'report-arrived')).toHaveLength(1); expect(cues().filter(c => c === 'task-complete')).toHaveLength(1);
  });
  it('does not flood on first/loaded view or play old histories newly included in a refresh', async () => {
    const initial = view({ simTime: 100, tasks: [task({ status: 'completed' })], messages: [report()], observations: [running(true, 100)], mission: { ...view().mission, status: 'success' } });
    const audio = await ready(initial); await settle(); expect(cues()).toEqual([]);
    audio.update({ ...initial, simTime: 101, messages: [report(), report('report-old', 20)] }, { paused: false }); await settle();
    expect(cues().filter(c => c !== 'facility-loop')).toEqual([]);
  });
  it('requires fresh delivered nonunknown running evidence for a known cooling asset', async () => {
    const audio = await ready(view({ observations: [running(false, 0)] }));
    audio.update(view({ simTime: 1, observations: [running(true, 1, { quality: 'unknown' })] }), { paused: false }); await settle(); expect(cues()).toEqual([]);
    audio.update(view({ simTime: 2, observations: [running(true, 2, { receivedAt: 3 })] }), { paused: false }); await settle(); expect(cues()).toEqual([]);
    audio.update(view({ simTime: 30, observations: [running(true, 1)] }), { paused: false }); await settle(); expect(cues()).toEqual([]);
    audio.update(view({ simTime: 31, observations: [running(false, 31)] }), { paused: false });
    audio.update(view({ simTime: 32, observations: [running(true, 32)] }), { paused: false }); await settle();
    expect(cues()).toEqual(['cooling-recovered', 'facility-loop']);
    audio.update(view({ simTime: 43, observations: [running(true, 32)] }), { paused: false }); expect(activeLoops()).toEqual([]);
    audio.update(view({ simTime: 44, observations: [running(true, 44, { assetId: 'secret' })] }), { paused: false }); await settle(); expect(activeLoops()).toEqual([]);
  });
  it('does not revive older running evidence when the latest reading is unknown or false', async () => {
    const audio = await ready();
    audio.update(view({ simTime: 3, observations: [running(true, 1), running(null, 2, { quality: 'unknown' })] }), { paused: false }); await settle(); expect(activeLoops()).toEqual([]);
    audio.update(view({ simTime: 4, observations: [running(false, 3), running(true, 1)] }), { paused: false }); await settle(); expect(activeLoops()).toEqual([]);
  });
  it.each(['success', 'failure'] as const)('sounds only the real public %s transition once', async status => {
    const audio = await ready(); const end = view({ simTime: 4, mission: { ...view().mission, status } });
    audio.update(end, { paused: false }); audio.update(end, { paused: false }); await settle(); expect(cues()).toEqual([`mission-${status}`]);
  });
  it('stops physical loops on pause/hidden/replay/cancel but permits visible paused UI sound', async () => {
    const audio = await ready();
    const working = view({ simTime: 3, crew: crew(2), tasks: [task({ status: 'working' })], observations: [running(true, 3)] });
    audio.update(working, { paused: false }); await settle(); expect(activeLoops()).toEqual(['facility-loop', 'work-loop']);
    audio.update(working, { paused: true }); expect(activeLoops()).toEqual([]);
    audio.play('ui-open'); await settle(); expect(cues()).toContain('ui-open');
    page.hidden = true; page.dispatchEvent(new Event('visibilitychange')); audio.play('ui-close'); await settle(); expect(cues()).not.toContain('ui-close');
    page.hidden = false; page.dispatchEvent(new Event('visibilitychange'));
    audio.update({ ...working, simTime: 4 }, { paused: false, replay: true }); await settle(); expect(activeLoops()).toEqual([]);
    audio.update({ ...working, simTime: 5 }, { paused: false }); await settle(); expect(activeLoops()).toEqual([]);
    audio.update(view({ simTime: 6, tasks: [task({ status: 'canceled' })] }), { paused: false }); await settle(); expect(cues()).toContain('task-cancel'); expect(activeLoops()).toEqual([]);
  });
  it('rebases silently on rewind, actor switch and reset; rejects retired-run views', async () => {
    const audio = await ready();
    audio.update(view({ simTime: 10, messages: [report()] }), { paused: false }); await settle(); await vi.advanceTimersByTimeAsync(500); starts.length = 0;
    audio.update(view({ simTime: 1 }), { paused: false }); audio.update(view({ simTime: 6, messages: [report()] }), { paused: false, replay: true });
    audio.update(view({ simTime: 7, messages: [report()] }), { paused: false }); await settle(); expect(cues()).toEqual([]);
    audio.reset('run-b'); audio.update(view({ simTime: 8, mission: { ...view().mission, status: 'failure' } }), { paused: false });
    audio.update(view({ runId: 'run-b', simTime: 20, messages: [report()] }), { paused: false }); await settle(); expect(cues()).toEqual([]);
    audio.update(view({ runId: 'run-b', actorId: 'alex', simTime: 21, messages: [report('report-task-new', 21)] }), { paused: false }); await settle(); expect(cues()).toEqual([]);
  });
  it('does not start a late decoded work loop after cancellation or hide/reveal', async () => {
    const audio = await ready(); const finishes: (() => void)[] = [];
    contexts[0].decodeAudioData.mockImplementation(data => new Promise(resolve => { finishes.push(() => resolve({ url: new TextDecoder().decode(data), duration: 1, numberOfChannels: 1 })); }));
    audio.update(view({ simTime: 3, tasks: [task({ status: 'working' })], crew: crew(2) }), { paused: false }); await settle();
    audio.update(view({ simTime: 4, tasks: [task({ status: 'canceled' })] }), { paused: false });
    page.hidden = true; page.dispatchEvent(new Event('visibilitychange')); page.hidden = false; page.dispatchEvent(new Event('visibilitychange'));
    finishes.forEach(finish => finish()); await settle(); expect(cues()).toEqual([]);
  });
  it('cancels a pending work-start cue when the public task is canceled before decoding finishes', async () => {
    const audio = await ready(); const finishes: (() => void)[] = [];
    contexts[0].decodeAudioData.mockImplementation(data => new Promise(resolve => { finishes.push(() => resolve({ url: new TextDecoder().decode(data), duration: 1, numberOfChannels: 1 })); }));
    audio.update(view({ simTime: 3, tasks: [task({ status: 'working' })], crew: crew(2) }), { paused: false }); await settle();
    audio.update(view({ simTime: 4, tasks: [task({ status: 'canceled' })] }), { paused: false });
    finishes.forEach(finish => finish()); await settle(); expect(cues()).not.toContain('task-start'); expect(activeLoops()).toEqual([]);
  });
  it('coalesces final route displacement when a 4x batch finishes travel and work', async () => {
    const audio = await ready(view({ tasks: [task()], crew: crew(0) }));
    audio.update(view({ simTime: 6, tasks: [task({ status: 'completed', progress: 1 })], crew: crew(2, null) }), { paused: false }); await settle();
    expect(cues().sort()).toEqual(['crew-step', 'task-complete']); expect(activeLoops()).toEqual([]);
  });
  it('coalesces multiple completions/reports at 4x without inventing intermediate work', async () => {
    const audio = await ready();
    const tasks = [1, 2, 3].map(i => task({ id: `task-${i}`, actorId: `person-${i}`, startedAt: 1, arrivalAt: 1, completesAt: 3, status: 'completed' }));
    audio.update(view({ simTime: 4, tasks, messages: [1, 2, 3].map(i => report(`report-task-${i}`, 4)) }), { paused: false }); await settle();
    expect(cues().sort()).toEqual(['report-arrived', 'task-complete']);
  });
  it('permits remote task transitions without a physical work loop, and suppresses stale work', async () => {
    const audio = await ready();
    const remote = { ...view().crew[0], role: 'remote' as const, taskId: 'task-1' };
    audio.update(view({ simTime: 3, crew: [remote], tasks: [task({ status: 'working', path: [], action: 'pause_batch', targetId: 'site' })] }), { paused: false }); await settle();
    expect(cues()).toEqual(['task-start']); expect(activeLoops()).toEqual([]);
    audio.update(view({ simTime: 50, crew: crew(2), tasks: [task({ status: 'working' })] }), { paused: false }); await settle(); expect(activeLoops()).toEqual([]);
  });
  it('does not replay transitions seen during mute/unlock/pause or let old-run decoding contaminate a new run', async () => {
    const audio = await ready(); audio.setMuted(true);
    const done = view({ simTime: 6, tasks: [task({ status: 'completed' })], messages: [report()] });
    audio.update(done, { paused: false }); audio.setMuted(false); audio.update(done, { paused: false }); audio.update({ ...done, simTime: 7 }, { paused: false }); await settle(); expect(cues()).toEqual([]);
    audio.update({ ...done, simTime: 8, mission: { ...done.mission, status: 'success' } }, { paused: true });
    audio.update({ ...done, simTime: 9, mission: { ...done.mission, status: 'success' } }, { paused: false }); await settle(); expect(cues()).toEqual([]);
  });
});
