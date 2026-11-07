# Blackout development instructions

Read `docs/blackout-master-plan.md` and the assigned task packet before editing. This repository starts as a planning package. Do not report an application, a test result, a repository publication, or a model integration as complete without observing the corresponding result.

## Execution model

Use one coordinator and at most three active workers across the whole agent tree. Nested workers consume the same three-worker budget. Begin independent tasks with fresh, self-contained context, a pinned base commit, and the exact relevant specification sections. Do not launch another worker merely because a slot exists.

The coordinator owns the integration branch and global files. Each worker uses a separate git worktree and task branch. If worktrees are unavailable, the coordinator may use exclusive path assignments in a shared checkout, but no worker may switch branches, reset the checkout, or alter another worker's files.

Development agents build this software. In-game coworkers use the application's OpenAI adapter. Keep those roles and their cost accounting separate.

## Writable ownership

| Owner | Writable paths |
|---|---|
| Coordinator | Root package and lock files; TypeScript, Vite, and test configuration; `src/main.tsx`; `src/App.tsx`; global styles; `src/shared/**`; `src/workers/**`; `src/content/**`; `tests/contracts/**`; `tests/fixtures/**`; `tests/e2e/**`; global docs and build status. |
| Simulation worker | `src/sim/**`, `tests/sim/**` during its initial task. |
| Game/UI worker | `src/game/**`, `src/ui/**`, component-scoped styles, `public/assets/**`, `tests/ui/**`. |
| OpenAI worker | `server/**`, `src/llm/**`, `tests/llm/**`; no UI components or shared schemas. |
| Replay worker in a later wave | `src/sim/replay/**`, `src/persistence/**`, `tests/replay/**`, only after the coordinator explicitly transfers those paths out of the initial simulation lease. |
| Reviewer | Read-only source access and the uniquely named `docs/reviews/<task-id>.md` assigned in the packet. |

Each implementation worker can also write its own `docs/handoffs/<task-id>.md`. No two active task packets may grant the same writable path. A later task may change ownership only after the previous owner stops editing and the coordinator records the transfer.

Only the coordinator edits shared types, protocol schemas, dependency declarations, lockfiles, global CSS, and the integration branch. Workers may use the committed dependency installation without changing versions. Dependency or interface needs are reported as proposed changes with affected consumers and an example payload. Do not create local copies of shared interfaces to bypass a blocker.

## Required order

1. Coordinator establishes the shell, exact shared schemas, mock views, scripts, and a worker round trip.
2. Simulation, game/UI, and OpenAI workers build independent parts against the same contracts.
3. Coordinator integrates a real offline mission before allowing additional scenario families.
4. Replay, grounded model interaction, and debrief are connected to the real engine. Mock adapters are removed from the release route.
5. Reuse freed slots for independent review. Reviewers do not approve their own implementations.
6. Freeze features, run the required production and failure-path checks, rehearse on the demo laptop, and package the last verified build.

## Non-negotiable system boundaries

The deterministic simulation owns time, equipment truth, task completion, and outcomes. UI and LLM code consume scoped observations. An LLM cannot assign temperature, finish repairs, create resources, award scores, or bypass the shared action validator.

Checkpoint data belongs to recorder/replay internals and never enters normal UI props or the coworker gateway. Freeze worker request/reply unions, UI callbacks, gateway envelopes, and comparison variants at G0. An unsupported comparison returns the invalid retained action and valid-prefix evidence, without full-horizon metrics that imply completion.

Use fixed simulation steps, explicit units, stable event ordering, and deterministic external disturbances. Equipment protection, batch backlog, travel time, observation freshness, and partial-tick battery depletion must follow the master plan. Counterfactual replay preserves external disturbances and stops at an unsupported later action.

OpenAI keys stay in the local server environment. Missing credentials, timeouts, malformed responses, quota exhaustion, and reset races produce labeled fallback behavior. Local budget counters are independent of user-created run IDs. Do not make paid API requests as part of routine tests unless the task explicitly calls for the bounded live capability check.

The approved art direction is flat top-down, coarse 2D pixels. Use the declared grid, palette, nearest-neighbor scaling, and observation-driven state indicators. Detailed UI text remains readable DOM text.

## Handoff and integration

Finish each task with the base commit, produced commit hashes, changed files, contract assumptions, commands actually run and their results, evidence artifacts, known limitations, and remaining blockers. Include an offline or mock reproduction path when the feature normally calls a provider. Do not claim a test passed because it was written or planned.

The coordinator inspects the diff and integrates one small patch at a time. Run relevant checks at the integrated revision. Shared-contract changes require coordinator review, a new contract version and fixture update, and notification to every affected worker. Merge conflicts are resolved by the coordinator with the original owner; workers never use destructive resets to clear another task's work.

## Review and scope control

Review behavior against the specification, then implementation quality. Findings identify the exact invariant, affected path, reproduction or evidence, and severity. Correctness defects in accounting, observation isolation, action validation, replay, and mission completion block release. Extra incidents and cosmetic variants do not displace the first complete loop.

Use tests for the meaningful failure modes in the plan. Avoid assertion suites that merely restate implementation details. After the required gates pass, stop optional test expansion and finish integration.

Keep the public repository limited to project material. Track template and asset provenance. Do not add a license or claim event eligibility without an actual basis. Never commit keys, session credentials, local conversations, or unredacted provider logs.
