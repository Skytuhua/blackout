# ANIM-01 implementation ledger and handoff

Plan: `C:/Users/user/Documents/Blackout/.local/conv-01-independent/ANIM-01-plan.md`.
Pinned base: `3fee4832f495f137e4294e1fcd3d7f0b889a7131`.
Initial HEAD matched; `git status --short --branch` showed clean `t3/crew-ambient-animation`.

## Execution ledger

- [x] Read root instructions, master-plan section 9, conversation game/integration plans, exact task plan, scene/helpers/contracts, and existing atlas contact sheet.
- [x] Observe meaningful RED: `node_modules/.bin/vitest.cmd run tests/game-animation` exited 1; 12 failed / 22 passed against empty API stub. Full receipt: reserved QA `red.txt`.
- [x] Implement sampler and persistent overlay; observe GREEN and typecheck.
- [x] Inspect synthetic native/3x/pause/reduced-motion fixture in one bounded pass, then one palette correction confirmation; no further visual iteration.
- [x] Commit only leased paths and supply the external integration hook.
- [ ] Parent independent review, focused PR and actual scene integration (parent-owned).

Pre-flight: Task 1 exports scoped samples/layer; Task 2 consumes those exports in an external scene hook. No shared schema changes are needed.

Ruling: Use this leased handoff as the execution ledger and the explicitly reserved parent QA directory for command receipts, rather than skill-created scratch paths outside the writable lease. This preserves task ownership; no product behavior changes.

Ruling: The coordinator performs fresh independent review after delivery. No nested reviewer is spawned because this task explicitly prohibits nested agents; author verification is not independent approval.

Motion thesis: arrival into actual owned inspection/work is the focal moment, depicted by a tiny tool accent. Quiet support is an occasional one-pixel idle posture, two short cooling strokes, and sparse rack pixels. Existing atlas walk/work/fan/generator frames remain host-owned. One persistent Graphics object, bounded plain data, no autonomous clock/listeners/timers.

Initial implementation: focused suite 33/34 passed; the remaining test counted the legitimate initial automatic reset's `clear()` as an update leak. Warm up the run before the 2,000-update allocation measurement; reset and update clearing remain separately exercised. Initial `npm run typecheck` exited 0.

Publication update: coordinator confirmed `origin/feat/conversation-sidebar` at `d73e0e8`; keep the prepared pinned base unchanged. Parent owns exact-head review and any focused PR targeting that branch. No worker push, merge, rebase, PR or watch.

Author review tightened the negative observation tests: the replacement reading is now at the current simulation time (older positive at 74, new evidence at 75), so stopped/unknown/zero gates cannot pass merely because all replacements were future-dated. Explicit future-observation/delivery cases remain separate.

Final author-review correction: effect colors initially used the master-plan UI seed anchors rather than the actual restricted sprite palette. Added a palette-custody test; observed RED (1 failed / 29 passed, `red-palette.txt`), then switched the four effect colors to existing sprite swatches. This uses the one correction/confirmation allowance; no art is modified.

## Produced revisions and scope

- Pinned base: `3fee4832f495f137e4294e1fcd3d7f0b889a7131`.
- Implementation: `accf4c6ff786d339d32f637a3ff3991215522c6f`.
- Palette regression/fix and final source/test head: `e0581cdb0d8a287b817f7b46ffe83eb53680f344`.
- This handoff is committed separately; the final delivery reports its exact HEAD and records it in the ignored QA `delivery.json`. No push or PR was created; there is no PR URL.

Changed paths, all within the exclusive lease:

```text
src/game/ambient/index.ts
src/game/ambient/layer.ts
src/game/ambient/sampling.ts
tests/game-animation/browser-check.mjs
tests/game-animation/fixture.html
tests/game-animation/fixture.ts
tests/game-animation/fixtures.ts
tests/game-animation/layer.test.ts
tests/game-animation/sampling.test.ts
tests/game-animation/vite.config.ts
docs/handoffs/ANIM-01.md
```

No edits to DesktopScene, ConversationMap, desktop-world, host/sidebar/App, shared contracts, engine, LLM, persistence, configuration, dependencies, lockfiles, global styles, atlas, or other documentation. The ignored `node_modules` junction targets the explicitly permitted `C:/Users/user/Documents/Blackout/node_modules`; versions were not changed.

## Contract and lifecycle

Exports from `src/game/ambient/index.ts`:

```ts
sampleAmbient(view: KnowledgeView, animationClockSeconds: number, reducedMotion?: boolean): AmbientSample
new AmbientLayer(scene: Phaser.Scene)
layer.update(view: KnowledgeView, animationClockSeconds: number, paused: boolean, reducedMotion: boolean): AmbientSample
layer.reset(runId: string): void
layer.destroy(): void
```

`AmbientSample` contains small `pixels` rectangles in integer native pixels and `idleOffsets` keyed by actor ID. It is fresh plain data, with at most 64 rectangles and 8 offsets. Processing considers at most 8 distinct crew and 32 distinct known assets; this exceeds the incumbent 3-crew/15-asset layout. Extra entries remain quiet. Pixel output is clipped to the known world and the 320x192 presentation viewport. Equipment effects stay inside the known equipment footprint. No previous samples or views are retained.

Idle offsets are `(0, 0)` or `(0, -1)`, active for approximately 0.6 seconds per six-second actor-staggered cycle, only for field crew with `taskId === null`. Busy, traveling, working, remote and reduced-motion actors have no idle offset. The layer never draws a crew sprite or changes a route/crew position. Apply offsets after each host positioning pass so they cannot accumulate.

Tool accents require an existing owned task (`task.actorId === crew.id` and `crew.taskId === task.id`), inspecting/working status, a known target, started and arrived at `view.simTime`, and unfinished work. Presentation time never decides arrival. Canceled/blocked/completed/mismatched/future work has no accent. No fabricated progress, completion, sparks, smoke, recovery or celebration is emitted.

Cooling accepts the latest `running` boolean or `state === 'running'`. Racks require both the latest `power_state === 'running'` and a numeric positive `batch_processing_rate`. Select by observation time first, received time second, then use existing `readingStatus` for the received/fresh gate (10 seconds inclusive). Simultaneous contradictory evidence resolves quietly in either array order. A newer unknown, future, stopped/off or zero reading suppresses older positive evidence. Batch ceilings, summaries, other assets and unavailable assets never substitute for current evidence.

The host supplies its existing scaled/frozen presentation clock. The pure sampler has no pause state; passing the same clock gives the same phases. The optional layer additionally holds its exact last supplied nonzero phase while `paused` is true, including host visibility-as-pause, while resampling public evidence so cancellations/staleness still remove effects. Reduced motion produces stable readable equipment/tool marks and no idle shift; toggling it while paused preserves the held phase for restoration. Large/non-finite clock inputs produce finite geometry.

Construction allocates exactly one Graphics object at depth 16, above existing crew depth 15; update allocates bounded plain data only. It adds no Phaser objects, tweens, emitters, timers, listeners, browser visibility handler, autonomous clock or command callback. Phaser imports are type-only in the production layer; node tests import the public barrel successfully without a browser. Reset clears graphics/phase and is safe repeatedly. A changed `view.runId` also resets automatically. Destroy releases the object and retained run/clock; repeated destroy/reset/update after destroy are safe and cannot recreate it. The host owns its single shutdown callback and visibility pause policy.

## Commands actually run and results

Commands ran from the isolated checkout. Full receipts are under `C:/Users/user/Documents/Blackout/.local/conv-01-independent/ANIM-01/`.

| Command | Observed result |
|---|---|
| `git rev-parse HEAD` and `git status --short --branch` before editing | Exact pinned base; clean `t3/crew-ambient-animation`. |
| `node_modules/.bin/vitest.cmd run tests/game-animation` against skeletal empty API | Exit 1; 12 behavioral failures / 22 passes, `red.txt`. |
| Same focused suite after implementation | 33/34 first, then 34/34 after correcting allocation-test warmup. |
| `node_modules/.bin/vitest.cmd run tests/game-animation/sampling.test.ts` after adding palette regression | Exit 1; 1 failed / 29 passed, `red-palette.txt`. |
| `node_modules/.bin/vitest.cmd run tests/game-animation tests/ui/presentation.test.ts tests/ui/desktop-world.test.ts` after palette fix | Exit 0; 45/45 (35 animation tests plus 10 incumbent helper tests), `green.txt`. |
| `npm run typecheck` | Exit 0 after final source/test change, `typecheck.txt`. |
| `node node_modules/vite/bin/vite.js --config tests/game-animation/vite.config.ts` | Strict localhost port 5191 started successfully for fixture only. |
| `node tests/game-animation/browser-check.mjs` | Exit 0 at native and 3x, both initial batch and sole correction confirmation, `browser-check.txt` and `browser-evidence.json`. |
| `impeccable.cmd detect --json src/game/ambient tests/game-animation` | Exit 0, findings `[]`, `impeccable.json`. |
| `git apply --check <QA>/scene-hook.patch` | Exit 0 against the pinned DesktopScene; patch never applied. |
| `git diff --cached --check` before source commits | Exit 0. |

The final diff/scope/clean-tree verification is also recorded in `delivery.json` after the documentation commit. The fixture's own Vite sessions were stopped with Ctrl+C. Port 5191 was confirmed without a listener before handoff. Other ports/processes were untouched. No provider requests or paid calls occurred.

## Synthetic evidence and reproduction

Offline reproduction: start the Vite command above, run `node tests/game-animation/browser-check.mjs`, then stop that Vite session. It uses only committed public fixtures and the existing atlas. `ANIM_EVIDENCE_DIR` may select a caller-owned evidence directory. Native rendering is a 320x192 logical canvas; 3x is 960x576.

Final screenshots in the reserved QA folder:

- `active-1x.png`, `active-3x.png`: arrived Alex inspection accent, idle Jules, one fresh cooling unit, one fresh positive-work rack.
- `paused-1x.png`, `paused-3x.png`: SHA-256 identical to the corresponding active frame despite a different supplied clock.
- `reduced-1x.png`, `reduced-3x.png`, `reduced-later-1x.png`, `reduced-later-3x.png`: stable reduced-motion marks at widely separated clocks; paired frames hash identically.
- `later-1x.png`, `later-3x.png`: clock advancement changes the frame.

Both scales retained 258 display objects and exactly one Graphics object over 2,000 updates, with a maximum actual Phaser command buffer of 40 entries, unchanged input listeners, no page errors and no `/api/` requests. Cancellation removed tool marks; a new empty run removed all sampled effects; repeated destroy left zero Graphics objects. The browser receipt includes actual hashes and counts. One batched native/3x/paused/reduced visual inspection and one palette correction confirmation were performed; no further polish loop.

## Limits and remaining parent gates

No implementation blocker remains within this lease. Author tests and author visual inspection are not independent approval. Parent must independently review the exact delivered head, check the three-dot PR scope against the published `feat/conversation-sidebar` base, and adapt/apply the hook only after the existing scene owner releases that seam.

The scene is deliberately not wired here: normal/legacy/conversation renderers remain as they were until coordinator integration. Host visibility/manual/guidance pauses and speed scaling must feed the existing frozen clock and pause signal. Existing scene walk/work frames and equipment marks remain host-owned; this module does not certify or repair their independent observation gates.

No full mission, guided win, production build/E2E, live model, demo-laptop physical DPI/browser zoom, WebGL path, human novice test or human visual acceptance is claimed. Browser proof is a synthetic Canvas fixture using the actual Phaser layer and existing artwork. No PR, push, watch or merge was performed. No deferred minor findings.

## External scene hook (apply-checkable, not applied)

The following unified patch was generated from the exact pinned scene. Its separate copy is `<QA>/scene-hook.patch`; `git apply --check` succeeded. Creation is after scene graphics setup; update uses existing `this.clock` after its frozen/scaled advance and `!running` as host pause; run changes reset; shutdown destroys; idle offsets are applied after public crew positioning. It adds no clock driver or visibility listener. Reconcile this small seam with the coordinator's later scene before applying it.

```diff
--- a/src/game/DesktopScene.ts
+++ b/src/game/DesktopScene.ts
@@ -3,6 +3,7 @@
 import { freshRunning, indicatorState, readingStatus } from '../ui/presentation';
 import { Commander, nearbyAsset, pointKey, routePosition, terminal, type Direction } from './desktop-world';
 import { atlasFrame } from './atlas-frame';
+import { AmbientLayer } from './ambient';

 export type DesktopSceneState = Pick<DesktopGameProps, 'view' | 'selectedAssetId' | 'selectedCrewId' | 'paused' | 'speed' | 'session'> & { reducedMotion: boolean; displayOnly?: boolean };
 export type DesktopSceneEvents = { asset: (id: string) => void; crew: (id: string) => void; floor: (point: Point) => void; moved: () => void; pose: (position: Point) => void; art: (ready: boolean) => void };
@@ -26,6 +27,7 @@
   private fans: Phaser.GameObjects.Image[] = [];
   private commanderSprite!: Phaser.GameObjects.Image;
   private marks!: Phaser.GameObjects.Graphics;
+  private ambient?: AmbientLayer;
   private hasAtlas = false;
   private availableFrames = new Set<string>();
   constructor(state: DesktopSceneState, events: DesktopSceneEvents, private atlasExpected = false) {
@@ -42,6 +44,8 @@
     if (this.hasAtlas) this.availableFrames = new Set(this.textures.get('facility-v2').getFrameNames());
     this.eventsOut.art(this.hasAtlas && this.availableFrames.size >= 111);
     this.marks = this.add.graphics().setDepth(8);
+    this.ambient = new AmbientLayer(this);
+    this.events.once('shutdown', () => { this.ambient?.destroy(); this.ambient = undefined; });
     this.commanderSprite = this.sprite(0, 0, 'commander_s_idle', 'technician').setDepth(20);
     this.commanderSprite.setVisible(!this.state.displayOnly);
     this.fans = [this.sprite(9 * 16, 16, 'fan_0', 'cooling'), this.sprite(12 * 16, 16, 'fan_0', 'cooling')];
@@ -53,6 +57,7 @@
   setView(state: DesktopSceneState) {
     const reset = state.view.runId !== this.state.view.runId;
     if (reset) { this.commander.clear(); this.commander = new Commander(state.view.knownTopology); this.clock = 0; this.workerPose.clear(); this.workerFacing.clear(); this.eventsOut.pose(this.commander.position); }
+    if (reset) this.ambient?.reset(state.view.runId);
     if (reset || state.view.simTime !== this.state.view.simTime) this.presentationTime = state.view.simTime;
     if (reset || state.displayOnly || state.paused || terminal(state.view) || state.session === 'welcome') this.clearKeys();
     this.state = state;
@@ -144,6 +149,7 @@
     const dt = Math.min(delta, 100) / 1000;
     if (running) { this.clock += dt * speed; this.presentationTime = Math.min(view.simTime + 1, this.presentationTime + dt * speed); }
     if (!this.state.displayOnly && running && this.worldFocused && this.commander.advance(dt, speed)) { this.eventsOut.moved(); this.eventsOut.pose(this.commander.position); }
+    const ambient = this.ambient?.update(view, this.clock, !running, reducedMotion);
     const walkFrame = Math.floor(this.clock * 6) % 2, workFrame = Math.floor(this.clock * 4) % 2;
     this.commanderSprite.setPosition(Math.round(this.commander.position.x * 16 + 2), Math.round(this.commander.position.y * 16));
     this.frame(this.commanderSprite, `commander_${this.commander.facing}_${this.commander.moving && !reducedMotion ? `walk${walkFrame}` : 'idle'}`);
@@ -168,6 +174,8 @@
       const working = task && ['working', 'inspecting'].includes(task.status) && crew.taskId === task.id && this.presentationTime >= task.arrivalAt;
       this.frame(image, `${crew.role}_${facing}_${reducedMotion ? 'idle' : moving ? `walk${walkFrame}` : working ? `work${workFrame}` : 'idle'}`);
       image.setPosition(Math.round(pose.x * 16 + 2), Math.round(pose.y * 16));
+      const idle = ambient?.idleOffsets.find(offset => offset.actorId === crew.id);
+      if (idle) image.setPosition(image.x + idle.x, image.y + idle.y);
       if (crew.id === this.state.selectedCrewId) {
         this.marks.lineStyle(1, 0xf4b860); this.marks.strokeRect(Math.round(pose.x * 16), Math.round(pose.y * 16), 16, 16);
         if (task?.status === 'traveling' && task.path.length > 1) { this.marks.lineStyle(1, 0x45d5e8, .8); this.marks.beginPath(); this.marks.moveTo(task.path[0].x * 16 + 8, task.path[0].y * 16 + 8); for (const p of task.path.slice(1)) this.marks.lineTo(p.x * 16 + 8, p.y * 16 + 8); this.marks.strokePath(); }
```
