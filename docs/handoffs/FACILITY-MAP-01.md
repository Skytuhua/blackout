# FACILITY-MAP-01 implementation handoff

Implementation is ready for the parent's independent review and integration. This is synthetic public-view fixture proof, not a new engine, playable mission, complete offline win, laptop rehearsal, or human acceptance.

## Source custody and commits

- Prepared isolated worktree: `C:/Users/user/.t3/worktrees/Blackout/t3-b9518b69`.
- Branch: `t3/b9518b69`.
- Exact base: `d927fca67a01cdf16d5df77cc21946c074dfd1aa` (published facility contract7 / PR25).
- Implementation commit: `6d0d4a1d440308e2195363cbf3263a3169c26509` (`feat(map): add controlled public facility overview and room views`).
- This handoff is a following documentation-only commit; its exact SHA is reported in the worker's final delivery and local `delivery-receipt.json`.
- The implementation commit adds eleven files. All pre-existing tracked files remain unchanged against the pinned base. This handoff adds only the twelfth authorized file. No nested agents, paid calls, credentials, pushes, PRs, watches, or merges were used. Parent retains independent review, PR/integration, and completed-child cleanup.

## Changed paths

Runtime additions:

- `src/game/facility-map/index.tsx`: named `FacilityMap` export; controlled room/asset callbacks, readable keyboard navigation, equipment pages, public crew assignment legend, explicit shared supply, persistent renderer ownership and lifecycle cleanup.
- `src/game/facility-map/renderer.ts`: one canvas and cached terrain; existing atlas frames at JSON coordinates; known room walls, doors, footprints, hall-specific connections, public accepted travel/work, selected actor/asset outlines, bounded clock and cancellable animation.
- `src/game/facility-map/model.ts`: camera bounds, two-dimensional integer fit with below-native fallback, public evidence formatting, bounded presentation clock.
- `src/game/facility-map/map.css`: component-scoped styling; readable inherited rem text, visible focus, 44px minimum controls, compact navigation and numbered equipment labels at enlarged text.

Verification additions:

- `tests/ui/facility-map/map.test.tsx`
- `tests/ui/facility-map/model.test.ts`
- `tests/ui/facility-map/browser-check.mjs`
- `tests/ui/facility-map/fixture.tsx`
- `tests/ui/facility-map/fixture.html`
- `tests/ui/facility-map/fixture.css`
- `tests/ui/facility-map/vite.config.ts`

Documentation: `docs/handoffs/FACILITY-MAP-01.md`.

## Contract and integration assumptions

Import `FacilityMap` from `src/game/facility-map/index.tsx` and pass the canonical `FacilityMapProps` from `src/shared/facility-map.ts`. There are no local shared DTO copies. The fixture starts with `createFacilityMapFixture()` from the canonical fixture module. No mock fixture is imported by the runtime component.

The host owns `view`, all three selected IDs, pause, speed, reduced motion, and both selection callbacks. `selectedRoomId: null` is overview. A room/asset gesture emits only the original public ID; it never updates an authoritative task, cancels a task, dispatches a command, moves crew, or changes simulation time. Invalid selected room IDs display overview without emitting an unsolicited callback. The selected asset can remain outside the current room.

The host must allocate a sized stage; the component fills both dimensions. A room camera uses known bounds plus one tile of context. Geometry comes from topology, never sprite collision art. The existing 111-frame `/assets/facility-v2.png` is required; JSON positions come directly from the existing atlas import. Loading and unavailable-art messages retain keyboard room/equipment controls. Atlas/source/config/dependency/global styles and existing App/UI/scene files are unchanged.

Connections show one selected topology layer: power, control, cooling supply, or cooling return. They are static and explicitly labeled flow unconfirmed. Room filtering uses declared membership, with selected-asset filtering when supplied. The upstream marker uses the explicit upstream ID's first connection point; its full canonical label remains visible in the footer. Equipment names are paged, never shrunk. Compact navigation uses a native room select and an Overview button; full names remain in navigation/equipment controls. Compact spatial labels use room initials and equipment numbers. Public crew names and tasks remain in the legend; compact mode removes overlapping floating crew labels, while selected-actor outlines remain on the map. Sam is remote and has no floor sprite.

Crew rendering reuses `routePosition()` from `src/game/desktop-world.ts`, including its public walkability/cardinality checks. It consumes only public crew/tasks/topology. Travel selection continuity uses one retained presentation clock, bounded at `view.simTime + 1`; a stalled supplied view stops animation at that bound. New run IDs and backward simulation time reset the clock/poses. Pause stops outstanding animation requests and preserves the current visual pose/frame. Either the controlled reduced-motion prop or browser preference stops cycles and shows supplied crew positions. Work loops require a public arrived task and public progress strictly between zero and one; progress itself is never invented. No independent outcomes or progress bar are implemented.

Existing observation helpers supply the freshness/indicator policy. Only delivered, nonfuture readings can be formatted. Unknown/null-quality values stay unknown; stale readings say stale; temperature alone does not infer a fault. Fans/generator cycles require fresh explicit public running evidence.

## Actual checks and results

Commands were run personally in this worktree:

1. `npx vitest run tests/ui/facility-map/map.test.tsx --maxWorkers=1`: meaningful RED, 3 failed assertions against a deliberately empty map component (missing navigation, equipment, and shared upstream). Saved as `.local/facility-map-01/red.txt`. An earlier tooling attempt could not resolve Vitest because this prepared worktree lacked an install; that startup failure is not the RED proof.
2. `npx vitest run tests/ui/facility-map --maxWorkers=1`: GREEN, 2 files / 7 tests passed.
3. `npx vitest run tests/ui --maxWorkers=1`: GREEN, 10 files / 38 tests passed. `.local/facility-map-01/green-ui.txt`.
4. `npm run typecheck`: passed, including all added runtime/fixture code. `.local/facility-map-01/typecheck.txt`.
5. `npx vite build --config tests/ui/facility-map/vite.config.ts`: passed, 38 modules, isolated production fixture output under `.local/facility-map-01/build`. `.local/facility-map-01/build.txt`.
6. `node tests/ui/facility-map/browser-check.mjs`: 18 development-fixture checks passed. `.local/facility-map-01/browser-green.txt`.
7. `npx vite preview --config tests/ui/facility-map/vite.config.ts --host 127.0.0.1 --port 54194 --strictPort`, then `$env:FACILITY_FIXTURE_ORIGIN='http://127.0.0.1:54194'; node tests/ui/facility-map/browser-check.mjs`: the same 18 checks passed against the built production fixture. `.local/facility-map-01/browser-production.txt` and final `.local/facility-map-01/browser-results.json`. Port 5195 was occupied; its existing server was left untouched, and this task used 54194 instead.
8. Impeccable context loaded from existing PRODUCT/DESIGN; requested UI-UX-Pro-Max design-system search was run, with pinned art/geometry/typography taking priority over generic suggestions. `impeccable.cmd detect --json src/game/facility-map/index.tsx src/game/facility-map/map.css`: `[]`.
9. `git diff --cached --check`: passed before the implementation commit. Final path/custody receipt confirms only authorized new paths and no existing tracked-file modifications.

The worktree uses a local ignored `node_modules` junction to the existing committed dependency installation in `C:/Users/user/Documents/Blackout/node_modules`. Compared lockfile package versions and root dependency/devDependency declarations: zero version differences. No install, dependency declaration, or lockfile was changed. Fixture Vite cache/output are isolated under this worktree's ignored `.local/facility-map-01/`.

The 18 browser checks cover served atlas byte equality and 111 names; controlled room/asset selection and keyboard activation; known membership/footprint hits; inert bare-floor clicks and movement keys; hall-specific topology and upstream; ongoing accepted travel across selection; 1/2/4 playback; pause; reset; bounded extrapolation; prop/browser reduced motion; remote Sam; unknown/stale/future/undelivered evidence; stable renderer/resources over 32 room changes; and zero tracked frame requests/resize observers/media listeners after unmount. All checked pages had no page errors or `/api/` requests. These are fixture checks, not provider or engine calls.

## Layout and screenshot evidence

All overview + seven room views were checked at 1280x720, 1366x768, and 1920x1080, each at 16/24/32px root text (72 view/size combinations). Fixture host reserves a 320px sidebar plus top/bottom host space. Actual component boxes were 936x560, 1022x608, and 1576x920 respectively. Controls retained readable DOM text, visible focus, and at least 44px target height; no document scrolling or clipped navigation/equipment controls was observed.

At normal text, overview scales were approximately 0.73, 0.84, and 1.00; room scales were integers from 1 through 5. At 32px text in the shortest 936x560 box, overview was approximately 0.45 and Hall A/B approximately 0.95; the other rooms retained at least 1x. At 1022x608/32px, all rooms retained at least 1x. Below-native scaling is an explicit fit fallback, so physical pixel consistency at fractional scale is limited. A separate 460x400 component box at normal text remained contained, with readable controls and a smaller overview. Smaller boxes or larger text than these samples are not accepted by this evidence; the host must preserve enough stage area.

Final production-fixture captures: 48 PNGs, all eight views at each desktop size with 16px and 32px text. Naming: `.local/facility-map-01/<width>x<height>-<font>px-<room-id-or-overview>.png`. Six `contact-<size>-<font>px.png` sheets were opened for visual inspection; individual Hall A snapshots were also inspected through the shared preview. Final compact labels avoid the earlier equipment/crew label collisions. Representative files:

- `.local/facility-map-01/1280x720-16px-overview.png`
- `.local/facility-map-01/1280x720-32px-hall-a.png`
- `.local/facility-map-01/1366x768-32px-cooling-room.png`
- `.local/facility-map-01/1920x1080-16px-overview.png`
- `.local/facility-map-01/contact-1280x720-32px.png`

`.local/facility-map-01/evidence-receipt.json` seals exact base/implementation, changed paths, source/contract/atlas hashes, production bundle hashes, browser-report hash, and all 48 screenshot hashes. Final browser report SHA256: `8dc669886e5033cbe8d66873d10befce5233c5eabaa9715297c5b36930cadd94`.

Unchanged atlas SHA256: PNG `b0e844a4db73a2bea7e8af3985c68d1cc1a6f37b831d5dcecdeec30001c9ad35`; JSON `6570dc23aaaf3c9dd0d5ee872aa2199277651a485de92e318adf9251907cc5fe`.

## Offline reproduction and remaining work

Run `npx vite --config tests/ui/facility-map/vite.config.ts`, open `/tests/ui/facility-map/fixture.html` on port 5194, and use the room/equipment controls. Devtools `window.facilityFixture.travel()` adds a clearly synthetic accepted public travel task; `window.facilityFixture.patch(...)` supplies host-controlled updates/pause/speed/reset. This API exists only in the fixture. No provider endpoint or credential is needed. For the production fixture, use the build/preview commands above and the same fixture path.

No existing release route was changed, so this patch does not claim integrated App behavior. No full engine/mission/replay suite, actual demo-laptop/DPI rehearsal, novice walkthrough, or human visual acceptance is claimed. Physical scaling outside the measured CSS viewport/DPR environment remains unverified. Parent owns independent review and final host integration; this worker has not approved its own implementation. Completed-child cleanup must follow delivery/acknowledgement and the parent's completed/result_available/no-pending-children status check; the worker does not self-archive.

## Independent-review corrections

At reviewed head `45994529ca0617b31b0fc37e13bfc1c65c9149d8`, an independent reviewer found two P2 presentation issues and a P3 fallback issue. The map now derives equipment motion from the same latest delivered evidence as the badge, interpolates public practice travel while unpaused, and preserves overview connections when a room ID is unknown. The underlying engine and the review site's App remain unchanged.

Coordinator observed RED for four focused renderer regressions before correction, then GREEN: `npm test -- --run tests/ui/facility-map/renderer-review.test.ts` (4 passed); `npm test -- --run tests/ui/facility-map` (11 passed); `npm run typecheck` and `git diff --check` passed. The renderer cases use a controlled canvas/animation scheduler; they do not establish integrated gameplay or user acceptance. Independent re-review of these corrections is pending.

## User-requested map size and detail

The map now fits the available area without rounding its scale down to whole multiples. Nearest-neighbor image rendering is retained; fractional scaling may produce uneven pixel widths. The standalone sample preview no longer reserves empty sidebar/footer regions, and explicitly labels chat and mission as disconnected. The real host still controls its own sidebar layout.

Static atlas-based wall fittings and floor variations add detail without creating equipment, observations, route obstacles, or operating-state claims. Coordinator observed two meaningful RED cases before implementation, then 12 focused map tests and typecheck passed. The isolated production fixture build and 18 browser checks passed, including all eight views at three desktop sizes and three text sizes, room/equipment selection, travel, pause, reduced motion, and no document overflow. Impeccable detector returned `[]`. Art direction and actual integration remain subject to user review; new engine and mission are not connected.

## Host-constrained label correction

The independent review of `f48c3f0` found labels overlapping in simulated 640 x 500 and 908 x 500 host stages at 32px text. These overlaps were reproduced before the fix. Crowded map overlays now yield to the accessible room selector and equipment list; the large standalone preview remains unchanged. The fixture also supports `?layout=host` with a reserved chat sidebar and game-controls footer for integration-like checks.

The production fixture passed 24 browser checks, including the original 72 desktop views and five host-constrained label cases, plus the reserved-sidebar fixture. The focused 12 map tests and typecheck passed. These use synthetic dimensions and data; real host layout and new-engine integration still require verification. Full suite and independent review of this correction are pending.

Full suite at `d7cd20f` completed with 354/355 passing; one unrelated LLM retention test hit its 5-second timeout under concurrent load. Immediately rerunning `tests/llm/corrections.test.ts` by itself passed 11/11. No timeout or LLM code was changed. Independent host-label re-review remains pending.
