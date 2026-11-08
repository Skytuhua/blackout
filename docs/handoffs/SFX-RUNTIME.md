# SFX-RUNTIME handoff

## Custody and scope

- Required and observed clean initial HEAD: `54558c39ad500361d0d5fe243862b0f6767d7d60`, branch `t3/11652ce9`.
- Frozen contract anchor: `b0a72aa40d63bba8ffd9b05c660f7b5485211abc`; approved compatible implementation base: `54558c39ad500361d0d5fe243862b0f6767d7d60`.
- Read the external `SFX-01-packet.md` and master-plan task, knowledge isolation, architecture, and accessibility sections before editing.
- Ordered implementation commits: `2d7a604e645da36581a214e1513dde66004b6fc0` (runtime, tests, fixtures and external sketch), then `6756650d1217d47ef93e3993643bffb3a63156f9` (terminal notifications through host auto-pause). The next commit adds only this handoff; its hash is in the final delivery.
- No existing source, shared DTO, App/Menu/UI, configuration, dependency, lock, persistence, gateway or public asset edits. No nested agents, installs, paid calls, push, PR, merge, watches, destructive cleanup or self-archiving.
- New files: `src/audio/{index,cues,sampler}.ts`, `tests/audio/{runtime.test,integration-example,audition}.ts`, `tests/audio/audition.html`, and this handoff.
- Local evidence and verification helpers live only in this worker's ignored `.local/sfx-runtime/`.

## Exact public API

`src/audio/index.ts` exports `SOUND_CUES`, `SoundCue`, `AudioView`, `GameAudio`, and `createGameAudio`:

```ts
import type { KnowledgeView } from '../shared/contracts';
type AudioView = Pick<KnowledgeView,
  'runId' | 'actorId' | 'simTime' | 'crew' | 'tasks' | 'messages' |
  'observations' | 'knownTopology' | 'mission'>;
interface GameAudio {
  unlock(): Promise<void>;
  play(cue: SoundCue, eventKey?: string): void;
  update(view: AudioView, options: { paused: boolean; replay?: boolean }): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  getPreferences(): { muted: boolean; volume: number };
  reset(runId: string): void;
  destroy(): void;
}
declare function createGameAudio(options?: {
  assetBaseUrl?: string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}): GameAudio;
```

`AudioView` is the existing type's Pick, with actor/run identity and **no schemaVersion requirement**. A facility schema-2 object can structurally satisfy it without changing or relabeling its version. There is no parallel UI/physical/shared DTO definition or runtime import of the contracts/schema implementation.

All 22 IDs resolve to `${assetBaseUrl}/${cue}.wav`; default base `/audio/retro-v1`:

`ui-select`, `ui-open`, `ui-close`, `message-sent`, `message-received`, `order-accepted`, `order-rejected`, `crew-step`, `task-start`, `task-complete`, `task-cancel`, `report-arrived`, `incident-warning`, `incident-critical`, `cooling-recovered`, `mission-success`, `mission-failure`, `save-complete`, `simulation-pause`, `simulation-resume`, `work-loop`, `facility-loop`.

## State rules and bounds

- Master defaults to 0.35. Finite volume values clamp to [0, 1]; nonfinite input is ignored. Audio preferences use only `blackout.audio.preferences.v1`, never save keys. Corrupt/blocked storage is optional and harmless.
- No context is constructed until `unlock()`. Call it directly in a trusted pointer/keyboard event. In browsers exposing userActivation, inactive calls do nothing; native autoplay policy is retained. No autoplay override, silent unlock oscillator, synthetic gesture or global gesture listener exists. `unlock()` resolving does not assert that a device produced sound.
- Eight simultaneous one-shots plus at most one work and one facility loop. Per-cue burst coalescing, priority ordering/voice replacement, and minimum gaps (UI 70 ms, steps 180 ms, other shots 250 ms) bound repeated playback. No playback backlog: cold one-shots older than 350 ms are dropped while a successfully decoded asset may still be cached.
- At most four fetch/decode jobs across all generations, 22 buffer/failure/queue entries, 256 recent event keys, one visibility listener, and bounded 512-entry sampler histories. Responses over 1,000,000 bytes and decoded audio outside (0, 20] seconds or above two channels are rejected. Requests abort after five seconds. Uncancelable decoding retains its slot until settlement, preventing repeated resets from accumulating new decoder jobs. Invalidating a load clears its timeout immediately; destroy clears all audio-owned timers.
- Event keys are local to the active run/actor and bounded, so use stable receipt/message/save/alert IDs plus the cue. Keys are consumed even when inaudible. They are presentation deduplication, not durable command IDs or authorization.
- `reset(runId)` pins subsequent updates to that run, cancels old generations, and establishes a silent baseline. Call it on every fresh start, restore (even the same run ID), seek and replay-mode change. `update()` also rebases on an implicit run/actor change or rewind. Retired runs/actors cannot immediately reclaim the current scope; intentional revisits should reset explicitly.
- Before unlock, while muted/zero-volume/hidden, and during replay updates, state is consumed silently. Paused updates silently consume physical transitions; a new public mission terminal notification may still sound immediately. Physical loops and pending physical cues stop at pause, hidden/reveal, replay, rewind, reset, cancellation/reassignment or destroy. Visible UI one-shots and current terminal notifications may work while paused; pause does not abort their already pending asset loads. These requests keep their original 350 ms expiry and never cross reset/rewind/replay/hidden/mute barriers. Unmute/unlock/resume do not replay suppressed transitions. A subsequent current active view may restart a presently valid loop.
- Steps require displacement between public crew positions on the active public route, not elapsed time alone. Final displacement observed with completed travel in a 4x batch produces one step, never synthesized intermediate footfalls.
- A start/work loop requires a current assigned worker, public working/inspecting status, arrival time reached, completion time not reached, and the actual service tile. Remote work can produce a start cue but no physical work loop. Queued/blocked/completed/canceled/report-pending and stale work produce no work loop. Cancellation also invalidates a task-start asset still decoding.
- Completion is a task transition. A report cue requires a newly delivered public message at/before simTime, identified by `conversationKind: 'report'` or the existing exact `report-${task.id}` convention. Task completion alone never implies report arrival. Refreshes and batched completions/reports coalesce without a history flood.
- Cooling uses only known topology assets of kind `cooling`, exact public `running` boolean readings, delivery/observation times at/before simTime, nonunknown quality, and age <=10 simulated seconds. The age cap follows the master-plan fresh verification window, not a fault threshold. Latest unknown/false readings mask older true readings. Fresh known false -> fresh known true yields recovered; first knowledge or unknown -> true does not claim a recovery. No text parsing, hidden faults, forensic events, commands or checkpoints are consumed.
- Mission cues require an actual active/practice -> success/failure public transition. Terminal/loaded initial views are silent. A terminal notification survives automatic ended-state pause, including when the final public view and paused=true are published together. Pending notification decoding retains the original event expiry; it is still invalidated by reset, seek/rewind, hidden, mute, replay or disposal. Physical loops stop at the same time. This accommodates App's `ended(raw)` callback ordering without making root a second mission-cue owner.

## One-owner callback map

| Owner | Cue(s) | Existing host seam / evidence |
| --- | --- | --- |
| Root play | ui-select | Valid `chooseActor` / `chooseAsset` selection |
| Root play | ui-open / ui-close | Actual menu/reader open/close, not every render |
| Root play | message-sent | Accepted local send in `askCoworker`, after validation |
| Root play | message-received | Newly appended actual live/fallback response, once per request; not task-report ingestion or restored history |
| Root play | order-accepted / order-rejected | Actual `applyOrder` worker receipt; queued/proposed intent is silent |
| Root play | incident-warning / incident-critical | Newly published permitted public alert; no audio-owned fault thresholds |
| Root play | save-complete | Successful awaited `capture(true)` save after existing generation/source checks; not capture(false), failed save or refresh |
| Root play | simulation-pause / simulation-resume | Manual user clock change only, not `syncClock` internal/menu/visibility/ended pauses |
| update only | crew-step; task-start/complete/cancel; report-arrived | Raw player-permitted live view, including messages; not UI assignment text or hydrated chat history |
| update only | cooling-recovered; facility-loop; work-loop | Scoped public evidence and actual arrived work |
| update only | mission-success / mission-failure | Public live terminal transition, including automatic mission-end pause |

Never call `play()` again from root for an update-owned event. In particular `ingestReports` must not also publish message-received/report-arrived. The isolated audition deliberately calls sampler one-shots directly for listening access; it is not the application integration pattern.

Keep all textual alerts, task states, delivered reports and completion notices authoritative and readable with audio disabled. Menu mute/volume controls, visual captions, App lifecycle and any server WAV MIME adjustment remain coordinator-owned.

## External integration sketch

`tests/audio/integration-example.ts` is a standalone, typechecked hook sketch. Nothing in the application imports it. Its root-only cue type prevents a host wrapper from assigning the sampler's cues a second owner. It includes generation tickets because `play(cue, eventKey)` itself cannot determine the run/restore incarnation of an arbitrary future async callback.

```ts
// Inside the coordinator's existing App callbacks; not applied by this worker.
const binding = externalAudioBindings(firstPlayerView, { paused: manualPaused });

// Call synchronously inside a real click/keyboard handler; unlock starts before await.
void binding.gesture('ui-open', actualMenuTransitionId);

const token = binding.capture(); // capture BEFORE the asynchronous operation
const receipt = await client.command(existingValidatedEnvelope);
if (existingRunAndGenerationGuardsStillPass) binding.receipt(receipt, token);

// Inside the current public-view callback or effect, with actual host clock state:
binding.update(rawPlayerView, { paused: clockIsPaused, replay: false });
// A final view may arrive with paused=true; the terminal notification still works.

const saveToken = binding.capture();
await store.saveRun(record);
if (existingSaveGuardsStillPass) {
  binding.publish('save-complete', engineRecordOf(record).runId, actualSaveOperationId, saveToken);
}

// Fresh run, restore, seek, entering/leaving replay: never play historical events.
binding.rebase(restoredPlayerView, { paused: true, replay: false });
binding.rebase(replayPlayerView, { paused: true, replay: true });

// Root-owned controls and unmount:
binding.audio.setMuted(nextMuted);
binding.audio.setVolume(nextVolume);
binding.destroy();
```

The sketch's actual compiled methods use existing `CommandReceipt` and `AudioView` types. Names such as `existingSaveGuardsStillPass` above denote existing coordinator checks, not new authorization logic. Do not use selected-tab identity to attribute an asynchronous callback. Rebase increments the ticket generation even if the run ID is unchanged.

## Observed verification

No dependency installation or config edit was needed. The prepared worktree has no local node_modules. Calling the shared Vitest executable with the local config initially failed to resolve vitest. Passing the unchanged coordinator config let focused tests run; the wider direct run still failed at import resolution for zod/react/openai (39 suites did not execute). A Node resolver experiment did not fix those wider imports. These were environment-resolution results, not passing application tests.

For standard full checks, `.local/sfx-runtime/snapshot.mjs` copied project files byte-for-byte into `.local/sfx-runtime/verification/`, recorded each SHA-256 in `snapshot-receipt.json`, and made its only dependency junction inside that ignored verification directory to the existing `C:/Users/user/Documents/Blackout/node_modules`. It did not modify the prepared worktree's config, install packages, or alter the coordinator installation. Full-project results below apply to this byte-identical source copy, not a separately integrated application.

Commands actually run:

1. `git status --short`, `git rev-parse HEAD`, `git branch --show-current`: clean exact initial base/branch above.
2. Shared runner: `C:/Users/user/Documents/Blackout/node_modules/.bin/vitest.cmd run --config C:/Users/user/Documents/Blackout/vitest.config.ts --root C:/Users/user/.t3/worktrees/Blackout/t3-11652ce9 tests/audio/runtime.test.ts`: initial no-op API RED 13/21 failed; final GREEN **38/38 passed**.
3. Race RED: rewind played a late cue, cancel played a late task start, and final batched movement missed its step (**3 failed / 33 passed**), then all green. Cleanup RED additionally caught **4 pending timers instead of 0**. Host auto-pause RED caught suppressed/aborted real terminal notifications (**3 failed / 35 passed**), then all green. Logs: `red-races.txt`, `red-pending-cleanup.txt`, `red-terminal-autopause.txt`, `focused-final.txt`.
4. From the verification copy: `npm run typecheck`: exit 0. A separate compiler-host lookup bridge also observed 160 project files and zero diagnostics before the final integration sketch was added; the standard snapshot typecheck includes that sketch.
5. From the verification copy: `npm test`: **50 files / 378 tests passed**, including all 38 audio cases. No paid/provider request was made. Log: `full-tests-final.txt`.
6. From the verification copy: `npm run build`: exit 0; Zod/Rollup comment-annotation warnings were emitted. Audio is deliberately not wired into the root release route. The separate browser-fixture bundle exercises the audio import graph.
7. `node .local/sfx-runtime/browser-check.mjs`: native Chromium **158.0.8127.18**, default launch/autoplay settings, one context created during an actual browser click, three real native mono PCM decodes (0.1s each, browser-resampled to 48kHz), native source/loop starts and three stops, master gain approximately 0.35, one close and zero page errors. Muted requests did not start sources. The first fixture assertion used exact 0.35 equality and failed on native Float32 rounding; it was corrected to a 1e-6 tolerance, without changing runtime volume. Final receipt: `browser-receipt.json`.
8. `git diff --cached --check` and protected-path diff inspection: no whitespace defect or modification outside the new-path lease.

Absolute local evidence root: `C:/Users/user/.t3/worktrees/Blackout/t3-11652ce9/.local/sfx-runtime/`. Snapshot build log: `build-snapshot.txt`; compiler log: `typecheck-final.txt`; byte custody: `snapshot-receipt.json`. These local artifacts are intentionally ignored and not added to the public repository.

## Audition and acceptance limits

The isolated `tests/audio/audition.html` / `audition.ts` page has explicit gesture enable, all 22 cue controls, mute/volume, synthetic permitted-state loop controls, stop/reset and destroy. With the existing dev server in an integrated checkout, open `/tests/audio/audition.html`; it requests the exact versioned asset URLs. It does not run a mission or contact a model. No root config/entry/UI change is necessary to use it. Preferences on this page use a no-op storage adapter.

The automated native browser check used intercepted **explicitly silent synthetic PCM fixture bytes**, never substitute Freesound release assets. Fake-device unit tests and native PCM decoding do not establish audible output, sound quality, license/source custody, demo-laptop/device behavior, integrated host lifecycle, UI captions, full production browser behavior, mission acceptance or user acceptance. No Freesound assets are present in this worker's patch. Asset-worker integration, direct listening, root hook application and independent coordinator review remain external gates. No source-access or API-contract blocker remains for the standalone implementation.
