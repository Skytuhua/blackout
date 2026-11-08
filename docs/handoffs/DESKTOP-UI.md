# DESKTOP-UI implementation handoff

Ready for coordinator integration and independent review. This is UI/fixture proof; it does not establish a completed integrated mission, model integration, replay acceptance, laptop rehearsal, or user visual acceptance.

## Custody and commits

- Pinned base: `8b1f4242bbdf38db0633f8fca39bf555bc2d20da`.
- Branch: `t3/desktop-ui-rebuild`; prepared worktree: `C:/Users/user/.t3/worktrees/Blackout/t3-2ddf3074`.
- First runnable fullscreen fixture: `830ef34e719ddf5a15b5e6a211252017172565d7`. Sent to parent immediately after commit with fixture path and observed results.
- Safe partial-atlas frames: `1b562a3337947ab9a807d3c41585030271cb41cb`. Parent reported integrating this as `2380138`.
- Complete desktop UI: `1ec6fdaec13ea5e80317dfeb8b1d6d0de83c824c`. Cherry-pick after the milestone; the fallback commit is already in the parent's branch.
- This handoff is a subsequent documentation-only commit; its hash is supplied in the final delivery.
- No PR, push, nested agent, paid request, branch switch/reset, or self-archive. Parent owns integration, review, PRs and recoverable archive after acknowledging the delivered result and confirming completed/result_available/no pending children.
- `git diff --name-only <base> -- public/assets src/shared src/App.tsx src/main.tsx src/workers src/content src/styles.css src/ui/debrief package.json package-lock.json` returned no paths. The transferred debrief lease was respected.

## Produced paths

- `src/game/DesktopMap.tsx`, `DesktopPortrait.tsx`, `DesktopScene.ts`, `atlas-frame.ts`, `desktop-world.ts`.
- `src/ui/DesktopGame.tsx`, `DesktopGame.css`, `DesktopIntroduction.tsx`, `DesktopPaging.tsx`, `DesktopPanels.tsx`, `desktop-copy.ts`, `paging.ts`.
- `src/ui/desktop-fixture.html`, `desktop-fixture.tsx`, `desktop-fixture-data.ts`.
- `src/ui/presentation.ts`: fresh explicit-running animation guard; future-received evidence is unknown.
- `tests/ui/desktop-world.test.ts`, `desktop-atlas.test.ts`, `desktop-paging.test.ts`, `desktop-browser-check.mjs`, `desktop-vite.config.ts`; additive checks in `presentation.test.ts`.
- `docs/handoffs/DESKTOP-UI.md`.

Existing OperationalView and its fixture remain present. No imported UI03/debrief files were edited.

## Integration contract and behavior

`DesktopGame` exports from `src/ui/DesktopGame.tsx` with the exact shared `DesktopGameProps`; no substitute shared interfaces or contract changes. Root owns session, selection, panel, pause/speed, command validation/receipts, radio requests, coach progression and rendered replay content. UI owns drafts, pages, focus and local avatar pose.

- 48px status bar, 80px crew/navigation dock and 304px context width. No default Your shift panel. Closing context gives the world the full stage. Context is bounded and anchored at the upper right; enlarged reading mode has World navigation.
- Pixelify Sans 600/700 for short headings/HUD/controls, 24px wordmark, 16–18px controls; IBM Plex Sans 16px detailed copy. Product main font imports remain coordinator-owned. Fixture imports the installed `@fontsource/pixelify-sans/latin-600.css` and `latin-700.css`; root dependency is the coordinator's installed 5.3.0.
- Persistent Phaser scene; terrain rebuilds only on topology changes. Equipment, crew, graphics and the single pointer handler are retained through view updates. Integer nearest-neighbor world scaling considers width AND height.
- Commander starts at public walkable cell 10,6; cardinal movement at two tiles per presentation second at 1x, no corner cutting, public-cell collision, WASD/arrows/E and accessible movement buttons. E opens only already permitted information. Movement generates no knowledge or repair power. Focus/blur/visibility/pause/reset/terminal guards clear held input.
- Selected field crew + walkable floor emits the offered `move_crew` intent. Busy crew cannot be replaced implicitly. Command includes keyboard destination controls. Technician pose follows only its `crew.taskId`, accepted route and travel timestamps; work frames require arrival and a working/inspecting task.
- Equipment summary table, detailed evidence and observed/received times, explicit **Read timestamps**, dependencies, action timing, eligible technician choice, inspection/work dispatch and site workload/recovery actions. Empty ceilings cannot become zero-percent commands. Cancellation selects a stable public task ID; an obsolete selection cannot cancel its replacement.
- Radio separates facts, inference, uncertainty, citations, proposals, tool/command receipts, provider provenance and delivered log messages. It uses the exchange's scoped view for fact resolution. Confirmation passes the exact original proposal object, original `atSimTime`, and original args to `onAction`; the host must use the original exchange versions. It never restamps a proposal.
- Every long record/ID is losslessly paged using actual DOM measurements. Font and viewport changes repaginate. Editable drafts retain the complete 1600-character message across pages, panel changes and recipients. No truncation of retained report content.
- Welcome labels: **Start practice**, **Skip practice**. Practice ready control: **Start timed incident**. Coach uses the host's title/text/step. UI emits only commander_moved/equipment_opened/crew_selected/timestamp_read. Steps 3 arrival, 5 technical inspection and 6 delivered report remain host/public-engine gates; UI never synthesizes those milestones. Ready is step 7 of 8.
- `replayContent` is rendered as supplied; no checkpoint or recorder state enters the scene or normal panel props. Its internal controls/paging remain coordinator/debrief ownership.

## Artwork integration

Inspected the three original references and the user's additional reference/current screenshots. Implemented the requested larger pixel typography, compact table and plain Command/Radio/Replay footer. Portrait cropping uses each native 32px portrait's JSON frame coordinates.

No artwork was copied, changed or staged. Browser/build verification used `DESKTOP_ART_DIRECTORY` to serve the completed artwork worktree's public directory read-only. Source dependency: art commit `0371928b78e6620df85ce264065f94be754093da` (parent reported integration `8997353`). The fixture observed all 111 frames.

Observed runtime SHA-256:

- `facility-v2.json`: `6570dc23aaaf3c9dd0d5ee872aa2199277651a485de92e318adf9251907cc5fe`.
- `facility-v2.png`: `b0e844a4db73a2bea7e8af3985c68d1cc1a6f37b831d5dcecdeec30001c9ad35`.

Missing floor variants use floor_0; missing commander poses use commander_s_idle; other absent crew use the clearly labeled legacy development fallback; absent badges are skipped. No missing request may use Phaser's whole-atlas __BASE frame. Manifest anchors are native pixels: Phaser interprets anchor as a normalized pivot, so every texture/frame change explicitly restores origin zero. This fixes invisible characters without altering source art.

State apertures/indicators use permitted fresh observations; stale/unknown remain distinct. Fan/generator animation requires a fresh explicit running observation, never inspection_complete, prerequisite_ready or another unrelated true field. Signs/cart are placed on already solid public cells; the upper fans/pipes are noncolliding subparts of the two cooling trains.

## Commands actually run and results

1. RED: `node node_modules/vitest/vitest.mjs run tests/ui/desktop-world.test.ts` failed before implementation, missing desktop-world module. The tests specify cardinal movement/speed, wall/equipment collision, offered movement only, terminal/busy/remote rejection and accepted-route corners.
2. GREEN: same command passed 5 tests. `node node_modules/vitest/vitest.mjs run tests/ui/desktop-paging.test.ts` likewise failed RED before paging/copy modules, then passed 4 tests for lossless whitespace/Unicode/long IDs, draft limit, original proposal identity and scoped facts.
3. `npm run typecheck`: PASS at final implementation.
4. `node node_modules/vitest/vitest.mjs run tests/ui`: PASS, 4 files / 15 tests.
5. `node tests/ui/desktop-browser-check.mjs`: PASS, 9 groups / zero failures. Chromium tested 1280x720, 1366x768, 1920x1080 and 640x360 CSS viewport (200% geometry equivalent of 1280x720). Every panel, technical/site dispatch, ceiling, crew/movement controls, page text and editor were checked for document/descendant overflow and offscreen buttons. Also checked original proposal identity/time, full report/citation/receipt/provenance reconstruction, 1600-character message reconstruction/send/retention/resize, E without engine command, timestamp event, busy replacement and obsolete cancellation, terminal, reduced motion, welcome/ready labels and absence of API calls.
6. Scene browser proof: object count 276 before/after 100 updates in the earlier complete scene, one pointer listener, retained objects and zero __BASE frames. Final scene adds the fixed topology decorations; final browser receipt records its matching before/after count. Actual opaque source pixels at the rendered actor positions matched with zero mismatches: Facilities 153, Electrical 150, Commander 149.
7. `DESKTOP_ART_DIRECTORY=<art-worktree>/public node node_modules/vite/bin/vite.js build --config tests/ui/desktop-vite.config.ts`: PASS. Production fixture emitted under `.local/desktop-ui/build`; local Pixelify 600/700 and IBM Plex font files emitted. This is a fixture build, not root application/release acceptance.
8. Impeccable `detect --json` over the changed UI/CSS returned `[]`; receipt `.local/desktop-ui/impeccable-report.json`. `git diff --check`: PASS.

The browser run first exposed real overflow and pixel-pivot defects. These were corrected and the same gates rerun; `.local/desktop-ui/red-browser-results.json` retains the early failure receipt. T3 preview snapshot/evaluate each timed out once at 15000ms; standalone Playwright was the effective browser verification path. The worker's preview tab was closed.

## Offline reproduction and evidence

The fixture is explicitly a presentation fixture; no engine/provider is attached and no paid request is made.

```powershell
# Reuse the installed node_modules; no dependency version changes.
$env:DESKTOP_ART_DIRECTORY = 'C:/Users/user/.t3/worktrees/Blackout/t3-fc7f1132/public'
node node_modules/vite/bin/vite.js --config tests/ui/desktop-vite.config.ts
# http://127.0.0.1:5176/src/ui/desktop-fixture.html
# ?welcome opens the introduction.
# In another shell:
node tests/ui/desktop-browser-check.mjs
```

After asset integration, omit the override to use this checkout's public directory. `DESKTOP_FIXTURE_ORIGIN` overrides the browser script's origin. The temporary worker fixture server runs on 5176; the coordinator owns the persistent demo on 4173.

Evidence in this worktree (ignored, not committed):

- `.local/desktop-ui/browser-results.json` and `red-browser-results.json`.
- `.local/desktop-ui/world-{width}x{height}.png`, `equipment-{width}x{height}.png`, `viewport-{width}x{height}.png` for the four viewports.
- `.local/desktop-ui/milestone-*.png` for the first fixture milestone.
- `.local/desktop-ui/impeccable-report.json` and production fixture output `build/`.

## Remaining integration and proof boundaries

No UI contract blocker remains. Coordinator must wire DesktopGame in root App, import product fonts, supply the real session/practice/radio/replay host, and rerun integration checks at the integrated revision. Keep original exchange versions when confirming a proposal. `replayContent` must provide bounded/paged debrief controls; this worker did not alter the transferred debrief files.

The fixture does not prove real technician arrival/work/report delivery, a safe practice-to-fresh-mission transition, real mission success/failure/retry, deterministic saves/replay, model outage/reset/proposals against the real adapter, or the complete first-time walkthrough. Those remain root integration gates. No full repository verify, native physical-DPI/browser-zoom acceptance, demo-laptop rehearsal, live provider check, hosted check, repository publication or user visual acceptance is claimed. Mobile remains deferred.
