# Initial development-agent packets

These are ready-to-complete briefs for the first implementation wave. The coordinator must insert the actual base commit, contract version, worktree path, and deadline before dispatch. No worker can start against an unspecified moving base. Use a fresh agent context for each independent task.

## CORE-00: coordinating agent

Establish Blackout's shared foundation before fan-out. Read the master plan's global constraints, Sections 10, 12–15, and the repository `AGENTS.md`. The project is one complete local laptop-browser mission, assisted by OpenAI and presented as flat coarse-pixel art.

Own all root dependencies/configuration, shared contracts, worker protocol, application host, scenario content, and integration. Pin the compatible template and lockfile. Add the scripts in Section 10.4. Publish contract version 1 and fixtures for an undiagnosed cooling alarm, inspection receipt, completed inspection, fallback, and debrief/comparison.

Pass G0: production shell builds, typed worker round trip succeeds, mock view renders, and all shared fixtures parse. Create three task worktrees from that exact commit. Record exclusive path leases. Do not implement every subsystem sequentially before dispatching the workers. Do not launch dependent replay work before the checkpoint contract and actual mission are stable.

Continue authoring content and integration while workers build. Review each small handoff, run checks at the integrated revision, and retain a passing rollback point. Resolve contract changes centrally. Track blockers and the initial submission checkpoint in `docs/build-status.md`.

## SIM-01: simulation worker

Build the first headless physical reference slice. Base commit: coordinator supplied. Contract version: coordinator supplied. Writable paths: `src/sim/**`, `tests/sim/**`, and `docs/handoffs/SIM-01.md`. Shared contracts and scenario content are read-only. Relevant specification: Sections 3–4, 10.1/10.3, and Task 2.

Implement deterministic one-second advancement, stable event ordering, bounded power allocation, battery energy, workload scheduling and batch conservation, heat accumulation, cooling allocation, and the required protection states. Use declared units and engine inputs. Import no React, Phaser, DOM, network, or provider code.

Deliver a small commit covering baseline equilibrium, cooling-loss slope, cooling recovery, UPS interval energy, and capacity bounds. Include a meaningful reference trace and actual focused-test results. Keep the future task/observation hooks compatible with the frozen schema. Do not add migration, network quorum, a water loop, or unrelated failure mechanics.

If the interface is insufficient, propose the smallest change with an example payload; do not create a duplicate type. Return commit hashes, changed paths, command results, assumptions, and a ready-for-review or blocked status.

## UI-01: game and interface worker

Build the approved flat coarse-pixel facility presentation against the shared fixtures. Base commit: coordinator supplied. Contract version: coordinator supplied. Writable paths: `src/game/**`, `src/ui/**`, component-scoped styles, `public/assets/**`, `tests/ui/**`, and `docs/handoffs/UI-01.md`. Root host files, global configuration, shared types, and worker protocol are read-only. Relevant specification: Sections 2, 4, 9–12 and Task 4.

Export the agreed `OperationalView` component and typed callbacks. Implement the 16×16 orthogonal grid, integer-scaled world, readable DOM inspector, asset selection, dispatch controls, crew progress, radio/debrief presentation, and first-time guidance. Show unknown and stale readings honestly. Consume `KnowledgeView`, never hidden truth.

Timebox the first floor/wall, rack, technician, and cooling masters to 90 minutes. Inspect native and 3× sizes, anchors, frame alignment, and alpha. Use simple grid-aligned placeholders to keep the control loop usable while art is normalized. Preserve pixel style; cut cosmetic variants first.

Demonstrate the alarm-to-inspection-fixture flow, keyboard access, reduced motion, and the planned callbacks. Return screenshots and actual checks. A fixture demonstration is not a completed mission; the next UI packet connects the real worker.

## AI-01: OpenAI and local gateway worker

Build the bounded local OpenAI adapter and scripted fallback against mocked worker results. Base commit: coordinator supplied. Contract version: coordinator supplied. Writable paths: `server/**`, `src/llm/**`, `tests/llm/**`, and `docs/handoffs/AI-01.md`. UI components, engine, shared schemas, root packages, and lockfile are read-only. Relevant specification: Section 6, 10.3/10.4 and Task 5.

Use the Responses API and the configured low-cost model, with strict function schemas and a strict final-response schema. Return tool intentions to the browser adapter; execute them only through the engine's action path. Respect role projections, record/field selectors, call IDs, request/run identity, entity-version checks, and idempotency.

Implement scripted default mode, deadline/abort handling, disabled automatic SDK retries, one global request at a time, three calls per interaction, 24 calls per mission, bounded context/output, and persistent local budget accounting. Keys stay in the server environment. Do not change account billing or add public hosting.

Pass mocked malformed-output, unknown-tool, invalid-evidence, duplicate-call, reset, timeout, and quota cases. Supply a mock inspection receipt round trip with a grounded response. A paid live readiness check is a separate bounded step when API credentials are available; no mock test may be reported as proving account access.

## Review packet after integration

Use a fresh agent and an immutable candidate commit. Assign one focus: simulation accounting/replay, observation/action boundary, or production UI/fallback. Source files are read-only. The only writable path is the assigned `docs/reviews/<task-id>.md`.

Check the specification and actual code. Report concrete findings with the invariant, affected file, reproduction/evidence, severity, and smallest required correction. Do not rewrite the feature or approve work you implemented. If no blocking issue is found, state the exact behaviors checked and remaining unverified cases. The coordinator owns integration and release decisions.
