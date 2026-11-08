# DESKTOP-SIM handoff

Pinned base: `8b1f4242bbdf38db0633f8fca39bf555bc2d20da`.
Branch: `t3/desktop-sim-practice-travel`.
Implementation commit: `5474c95b8849a4295319bd0a091aeca3d1417e29`.
The following evidence/handoff commit is identified in the final delivery; it changes no implementation.

## Delivered behavior

- Explicit `practiceScenario` now starts with mission status `practice`. Physics, sensors, field travel/work, remote controls, and delayed reports use the ordinary engine. No mission success, loss, stability countdown, or deadline is evaluated. Public practice views expose `windowSeconds: 0`, `stabilitySeconds: null`, and no incident objectives. Initialization and restore reject practice content with external disturbances. Healthy practice has no repair to rehearse.
- Player-only `move_crew` targets the field technician and requires an integer walkable `args.destination`. It uses the existing deterministic route, declared walking speed, worker reservation/version, zero work duration, and explicit cancellation. Busy replacement, remote workers, model actors (including the target technician), mismatched optional technician IDs, solid/out-of-bounds cells, unreachable destinations, and missing/stale target-worker versions are rejected. Invalid negative/fractional coordinates fail the existing shared schema before domain validation.
- Moving neither changes equipment nor creates observations/reports or repair prerequisites. Moving onto a service tile still requires a full inspection and delivered report before repair. Arrival emits `task.completed` with `action: move_crew`, rather than an equipment `task.applied` event; command/task history remains recorded.
- Movement affordances appear only in the player's view, for Alex/Jules. `travelSeconds` is null until an actual destination is supplied; work duration is zero. Busy and terminal states disable them.
- Restore validates move target/requester qualification, destination endpoints separately from equipment service endpoints, normal route timing/reservations, and fractional travel progress. Completed/canceled moves round-trip. In-flight zero-work tasks now correctly retain zero work progress before arrival.
- `ENGINE_VERSION` is `sim-desktop-v2`. Engine, checkpoint, run-record and worker wire schemas remain 1. Shared schemas were not edited; saved host format 2 remains coordinator-owned and unchanged.
- The three inherited simulation fixture failures now derive rack occupancy, technician spawn, controller service location, and same-boundary inspection ETA from actual content/public affordances.
- Engine `step()` continues physical integration after terminal mission status for equal-horizon comparisons. No interactive stopping behavior was added to this API; the coordinator's worker/host driver owns stopping at the first terminal tick.

## Changed paths

Implementation commit:

- `src/sim/engine.ts`
- `src/sim/state.ts`
- `src/sim/tasks.ts`
- `tests/sim/desktop.test.ts`
- `tests/sim/boundaries.test.ts`
- `tests/sim/mission.test.ts`

Evidence/handoff commit:

- `tests/sim/trace.ts`
- `tests/sim/mission-evidence.json`
- `docs/handoffs/DESKTOP-SIM.md`

## Tests and commands actually run

- Initial `npm run test:sim` could not find Vitest because this prepared worktree had no dependency link. Created an ignored `node_modules` directory junction to the existing `C:/Users/user/Documents/Blackout/node_modules`; no install, version, package, or lock changes.
- Baseline `npm run test:sim`: **65 passed / 3 failed**, exactly the packet's old in-rack location, fixed 31-second boundary, and old crew-spawn tests.
- RED `npm exec -- vitest run tests/sim/desktop.test.ts --reporter=dot`: **14 failed**, for missing movement acceptance/authority/version behavior, practice lifecycle, and desktop engine identity. Corrected the test helper to send only `{x,y}` before retaining this RED result.
- Additional RED `npm exec -- vitest run tests/sim/desktop.test.ts -t 'rejects an incident schedule'`: **1 failed / 14 skipped**, because practice initially accepted external disturbances.
- Final `npm run test:sim`: **83 passed across 8 files**, exit 0. Covers real movement, cancellation, fractional repositioning, in-flight/completed/canceled/same-cell restore, qualifications/authority/versions/invalid endpoints, no evidence or repair credit, real practice tasks/verification beyond 600 seconds, failure suppression, clean new-engine mission initialization, and the public-evidence mission policy.
- `npm run typecheck`: **passed**, exit 0.
- `npm test`: **188 passed / 2 failed across 28 files** (190 tests). Both failures are outside the lease and reported to the coordinator:
  - `tests/contracts/worker-engine.test.ts`, `runs the real engine and publishes a command reservation without advancing paused time`: fixture expects old engine string `sim-02-v1`; actual is required `sim-desktop-v2`.
  - `tests/llm/real-context.test.ts`, `real mission t331 completes bounded calls with newer sensor readings: false`: old fixed action schedule issues an invalid request on layout-v2. The trace below supplies the real new timing.
- `node_modules/.bin/tsx.cmd tests/sim/trace.ts`: **passed**, exit 0; stdout regenerated `tests/sim/mission-evidence.json` as UTF-8 JSON. Re-run to reproduce all metrics offline, with no provider.
- `git diff --check`: **passed** (Git only reported the normal LF-to-CRLF checkout notice for generated JSON).
- `git diff --exit-code 8b1f4242bbdf38db0633f8fca39bf555bc2d20da -- src/shared src/content src/sim/replay src/workers src/persistence src/llm server public/assets package.json package-lock.json`: **passed**, protected paths unchanged.
- Content custody: both `git hash-object src/content/scenarios/hot-restart.ts` and the pinned-base blob resolve to `70e9a5e1242665af53517e03f4e94cb703bf8f10`.

## Observed evidence

`tests/sim/mission-evidence.json` records the pinned base, integration contract 2, engine schema 1, `sim-desktop-v2`, and `hot-restart-layout-v2`. No physical constants or content were changed to obtain success. The existing response policy still reads only public observations, tasks, and affordances; its decisions do not use a private checkpoint or an old fixed t331 schedule.

| Action | Dispatch | Completion |
|---|---:|---:|
| Pause batch | 10 | 13 |
| Inspect controller | 10 | 47 |
| Repair controller | 49 | 169 |
| Independent rack reading | 169 | 207 |
| Set sustainable batch ceiling | 260 | 263 |
| Final verification | 324 | 334 |

The final report arrives and the mission succeeds at **t336** after the real stability hold, with peak inlet proxy **28.77 C**, **53,760 / 53,760 critical units delivered**, zero thermal trips, **60,000 batch units retained**, and zero conservation residual. The artifact also advances the success branch's real physics to t600. The idle policy loses critical service at t505; the no-trip fixture times out at t600.

The practice artifact reaches **t720** with status `practice`, no terminal event, 24 C rack temperatures, **172,800 batch units completed**, no backlog, and full critical/interactive delivery. The test separately performs real inspection and final-report tasks, verifies no success occurs, then continues beyond the normal deadline and accepts further movement.

## Integration notes, limitations and remaining ownership

- No shared interface dependency or worker-scope blocker remains. Cherry-pick implementation first, then the evidence/handoff commit.
- Coordinator must update the two full-suite fixtures above and complete replay/storage/LLM compatibility, including retaining/exporting incompatible older saves without resuming them on this engine/content. Player-only movement is enforced in the engine; gateway exclusion remains coordinator-owned.
- Fresh `initialize(hotRestart, newRunId)` is proven to carry no practice positions, tasks, workload settings, observations or run envelope. Actual UI reset/callback abortion is host-owned and was not browser-tested here.
- Native browser visuals, interactive terminal stopping, host saved-format compatibility, replay comparison support for move/cancel histories, production build and browser/e2e acceptance were not claimed from these focused headless checks. The repository-wide Vitest run executed existing replay tests, but does not replace new coordinator integration coverage.
- No shared/dependency/asset/replay/host/LLM files were edited. No nested agents, PR, paid OpenAI requests, or self-archiving were used. Parent owns review, integration, PRs and recoverable thread cleanup after acknowledging this delivered result.
