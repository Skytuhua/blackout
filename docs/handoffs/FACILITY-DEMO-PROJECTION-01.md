# FACILITY-DEMO-PROJECTION-01

Base: `46fa56fee9933f363c0432f1b3aa00a9b7c33ee4` (reviewed map PR #30 merge head). This is a presentation adapter for the existing 20 x 12 mission, not the expanded engine, a new scenario, a training validation, or a playable host integration.

## Host API

Import `createFacilityDemoProjector`, `selectDemoAsset`, `selectDemoRoom`, and `demoToEnginePoint` from `src/game/facility-demo-projection`. Keep one projector instance per host and call it with the current, actor-scoped public `KnowledgeView` on each update. It returns an explicit unsupported variant or an available variant containing a contract-7 `FacilityMapView`, a display offset, the available room ID, a mandatory notice and four unavailable display-area rectangles. Feed only `result.view` to `FacilityMap`; pass the real view to the engine, chat, nearby-equipment controls, recorder and replay.

Display the returned notice prominently, and present the `unavailableAreas` as decorative/unavailable if drawing them. They are not selectable rooms or assets and are not part of `knownTopology`. The topology's single `Current simulated facility` outline is visual framing, not a claim about actual room boundaries or doors; its required openings are mapped from real walkable perimeter cells only. No separate operational rooms, new equipment, independent power paths, cooling groups, readings, or connections are invented. The existing controller is site-wide, not Hall A-specific.

At callback time, fetch the current public view and check the original run and host reset/generation token. Use `selectDemoAsset(current, expectedRunId, id)` and `selectDemoRoom(current, expectedRunId, id)` before updating UI context. These guards do not authorize or issue commands; keep the existing engine validator and host cancellation protections. In particular, do not dispatch actions for unavailable display areas or move crew by clicking the map.

The map positions, real equipment service tiles and accepted task paths are shifted by `{x:14,y:8}` for display only. `demoToEnginePoint` reverses the mapping for points inside the original grid; it is not an action authorization. IDs, observations, task times/durations, actual engine coordinates and stored records remain unchanged. Sam is remote and not drawn on the physical map. The cached display geometry is frozen and re-created on public topology change; never pass it into saved data.

If projection is unsupported, retain the existing map route and show a short unavailable message. An integration must verify no stale selection after reset, preserve actor isolation and avoid claiming the unmodeled spaces operate.

## Evidence and limits

The new focused Vitest cases cover an actual engine observation, accepted inspection route and interpolation, current-run selection guards, unmodified unknown evidence, unsupported topologies, geometry cache invalidation, restore, and a real headless offline mission plus replay. Typecheck, the project build, and a separate browser-targeted bundle of this leaf were run; the project build does not yet import this adapter. Exact commands and final results belong in the coordinator handoff/PR.

No shared DTO, App, worker, engine, legacy recordings or existing map files are edited. No provider calls or preview changes. The integrated conversation UI, actual map rendering of the notice/unavailable regions, browser mission, save/resume/replay through the host, and laptop/user demo have not been verified. Independent review and the focused PR are required before integration.

## Coordinator verification

At implementation commit `b613215a618e354b2f04894be02dbebd2662ac50`, `npx vitest run tests/ui/facility-demo-projection --maxWorkers=1` passed 9/9, `npm run typecheck` passed, `npm run build` passed, and `npx esbuild src/game/facility-demo-projection/index.ts --bundle --platform=browser --format=esm --outfile=.local/facility-demo-projection/projection.js` passed. `npm test -- --maxWorkers=1` passed all 364 tests in 54 files. The production application build does not import this new leaf; only the separate bundle covers its browser bundling. Existing build emitted the usual third-party annotation and chunk-size warnings.

The isolated worktree uses an ignored `node_modules` junction to the existing installation. Its lockfile bytes differ from the root checkout, but the recorded pinned package versions match for every package present in this worktree's lockfile. No dependencies or lockfile were modified.

## Independent review correction

Review of `4b9d546` found that a dangling source dependency could accidentally match the synthetic unavailable-diagram identifier. The exact case failed before the fix; source dependencies are now checked against original asset IDs before any display placeholder is introduced. The focused suite passes 10/10, including rejection through the projector and both selection guards, ordinary missing references, and a legitimately named source asset. Typecheck and the standalone browser bundle pass.

The reviewer also observed 44 cyan perimeter marks drawn by the existing map renderer for public boundary cells. They are not evidence of physical doors; host integration must visually review this presentation and prominently show the illustrative-map notice. The host must also render the unavailable-area indication and enforce its own reset/generation fence. A prior full suite passed 364/364 before this narrow correction; the new full suite is running separately.
