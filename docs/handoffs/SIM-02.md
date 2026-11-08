# SIM-02: complete headless Hot Restart

Ready for coordinator review and integration. This is engine proof, not G1, browser, replay/comparison, persistence, provider, or release acceptance.

## Custody and commits

- Task packet: `C:/Users/user/Documents/Blackout/.local/tasks/SIM-02.md`.
- Pinned base: `04603bfd1283aaed8f523f71cc7ce01264a50aa8`.
- Checkout: `C:/Users/user/.t3/worktrees/Blackout/t3-2f397888`.
- Branch: `t3/sim-02-headless-mission`.
- Contract: 1, unchanged. Engine identity: `sim-02-v1`; old `sim-01-v1` checkpoints are explicitly rejected. Content remains `hot-restart-v1`, seed 20261107, procedure version `procedures-v1`.
- Tests: `9945105164d0f56c4f7583a52c4839f3269a4580` (`test(sim): specify headless mission and boundary behavior`).
- Implementation: `83e5258ffbe25c061c0313f279cef402aa25c474` (`feat(sim): run complete observed Hot Restart mission`).
- The subsequent evidence/handoff commit is the final returned HEAD; it contains only this document, the trace runner, and generated trace evidence. Apply the commits in order; the tests commit intentionally specifies behavior absent from its parent.
- No subagents, provider calls, pushes, merges, branch switches, or changes outside the assigned paths. The original physical kernels and standalone analytic/protection tests are unchanged. Content, shared contracts, package files, and lockfile are unchanged.

## Changed files

- `src/sim/engine.ts`: command boundaries, mission lifecycle, public projection, finite checkpoint validation, restore, complete records, engine identity.
- `src/sim/state.ts`: private crew/task/resource, observation/message, boundary, mission, and idempotency state schemas.
- `src/sim/navigation.ts`: stable grid routing, continuous edge positions, travel distance, path validation.
- `src/sim/tasks.ts`: qualifications, reservations, travel/work/cancel, remote delays, inspections, repair/restart/reset, scoped delayed reports, existing v1 affordances.
- `src/sim/knowledge.ts`: keyed bounded noise, sampled dashboard evidence, scoped knowledge, public summaries, evidence conditions.
- `tests/sim/engine.test.ts`: retain all 19 cases and all numerical assertions; replace two SIM-01 stub expectations (empty observations, universally unavailable actions) with evidence/dispatch expectations.
- `tests/sim/mission-policy.ts`, `tests/sim/mission.test.ts`, `tests/sim/boundaries.test.ts`: public-only successful policy and 26 new behavior cases.
- `tests/sim/trace.ts`, `tests/sim/mission-evidence.json`: reproducible mission and equal-horizon accounting evidence.
- `docs/handoffs/SIM-02.md`: this handoff.

## Boundary and integration assumptions

The frozen API is unchanged: `initialize`, `step`, `applyCommand`, `observe`, `snapshot`, `restore`, `exportRecord`. No missing shared interface required a substitute envelope.

`initialize` exposes balanced t=0 readings; its initial event boundary is unconsumed. `step(0)` and commands can resolve that boundary without physical advancement. Each subsequent returned endpoint is consumed once: external events by time/phase/input sequence, tasks by insertion sequence, sensor sampling, then delayed report delivery. Commands resolve after those transitions. Physical integration then uses the corrected kernels over the next one-second interval. The consumed-boundary flag and external cursor are checkpointed and checked together. Compared with SIM-01, endpoint external events are now included in the returned boundary, without changing the physics of the interval ending there.

Each new command logs `command.boundary`, `command.queued`, its actual tick/global sequence in `RecordedCommand`, and accepted/rejected/applied resolution. Synchronous `applyCommand` returns the resolved receipt, rather than a transient queued receipt. Accepted means resources reserved, not work completed. Completion is a public task transition plus `task.applied`; cancellation returns an applied receipt. Future intentions are rejected as `FUTURE_INTENT`; clients must issue a new intention/key when their time arrives. Late intentions are revalidated using only relevant target/resource/worker versions, ignoring unrelated versions. Versions describe public reservations and action effects, never hidden physical changes. `site` is included in observed versions.

Use the current view's `observedEntityVersions` on requests. Field dispatch requires the affordance's technician ID; site/rack workload actions and site verification automatically reserve Sam. Only Player can dispatch across roles; a coworker can command its own qualified actions. Alex handles controller/cooling/rack observations and cooling work. Jules handles UPS/distribution/generator inspections and UPS resets. Sam handles workload and verification. Unknown actors cannot observe, and their commands reject.

Walking uses the declared 1 m tiles and crew speed (1.25 m/s in the scenario). BFS ties are north/east/south/west. Travel is continuous; arrival/work is declared at the next integer boundary after walking finishes. Work is additional to travel. Canceling preserves the current fractional edge position, releases reservations, records completed work seconds, and applies no partial repair. A new physical task requires its full work duration.

Field and remote reports have an engine-versioned two-second delivery delay. A task's ETA is physical completion, not report delivery. Recipients are Player, the reporting worker, and Sam; another field technician does not receive the diagnostic report. All three roles receive the shared dashboard. Repairs require a delivered prerequisite inspection in the requesting actor's scope. Cooling repair clears the control prerequisite and starts the authored 30-second restart without changing temperature. UPS reset uses electrical inspection, 20 seconds of work, current supply/rating checks, and the existing downstream boot/protection kernel.

Dashboard samples occur every authored five seconds, with noise keyed by seed/asset/sample time, bounded by the authored +/-0.2 C. Query order does not consume RNG. Ordinary views contain observations, known topology, public task/crew state, scoped reports, affordances, and public versions; never a checkpoint, latent fault flag, pending report, true stored energy, future schedule, or forensic event. The evidence-isolation test changes an unobserved prerequisite while preserving evidence and requires all four views to remain identical.

Private success evaluates the restored prerequisite, fully served critical demand, no tripped/overloaded UPS, every true inlet below 27 C, and sustainable resumed batch. It requires at least 60 stable simulated seconds and a delivered Sam verification taken at/after the hold boundary, with its supporting readings no more than 10 seconds old. Public objective checks and hold counters use permitted evidence independently. Missing evidence shows awaiting verification; no hidden truth countdown is published.

Failure is 60 consecutive fully unserved fixed intervals, or the 600-second deadline. Terminal actions reject and active tasks are canceled; pending report work closes. `step` deliberately continues physical heat/service/backlog/external events after the terminal result for recorder-only equal-horizon accounting. The host must pause its interactive clock and close model interactions; this engine never makes model calls.

Checkpoints include crew paths and fractional progress, work timers and reservations, pending reports, delivered/scoped observations and messages, sample cursor/counters, mission/protection counters, event cursor/consumed boundary, command sequence, receipts and idempotency. Restore validates before returning a replacement engine and re-envelopes receipts for the new run; old-run requests reject. It rejects inconsistent locations, paths, work durations/status/progress, resource/worker leases, future/delivered report timing, sequence/cursor state, duplicate idempotency keys, and dangling accepted-task references.

## Checks actually observed

Initial `npm run test:sim` could not find Vitest because dependencies were absent. `npm ci --ignore-scripts` installed the pinned 100 packages, exited 0, reported zero audit vulnerabilities, and did not change the package files or lockfile.

- Baseline `npm run test:sim`: **37 passed**, before production edits.
- RED `npm run test:sim -- --reporter=verbose`: **13 new failures, 37 baseline passes**. Missing mission lifecycle, reservations, role checks, delayed controls/reports, travel, versions and restore behavior failed against the SIM-01 stub.
- RED `npx vitest run tests/sim/boundaries.test.ts`: **5 failures / 5 passes** after the first implementation. The failures caught impossible idle crew position, shortened work timer, forged progress, removed reservations, and a final report taken before the actual hold ended.
- RED final idempotency checks with the same command: **2 failures / 11 passes**, for duplicate restored keys and missing task references.
- Final `npm run typecheck`: **exit 0**.
- Final `npm test`: **81 passed in 11 files**, exit 0 (simulation, contract, and UI unit suites).
- Final focused `npm run test:sim`: **63 passed in 7 files**, exit 0.
- `npx tsx tests/sim/trace.ts | Set-Content -LiteralPath 'tests/sim/mission-evidence.json'`: exit 0, reproduced the same evidence hash twice.
- `git diff --check`: exit 0. Git emitted normal LF/CRLF conversion notices.
- `git diff --exit-code 04603bfd1283aaed8f523f71cc7ce01264a50aa8 -- src/sim/systems tests/sim/power.test.ts tests/sim/protection.test.ts tests/sim/thermal.test.ts tests/sim/workload.test.ts src/content src/shared package.json package-lock.json`: exit 0.

The 37 baseline cases remain; two stub-only assertions were updated as described above. All analytic, conservation, throttle-latch, prospective-boot, invalid-boot, and partial-tick battery assertions remain passing. No claim here treats headless tests as browser/G1 or live-provider proof.

## Trace evidence

Artifact: `tests/sim/mission-evidence.json`. SHA-256 of the generated Windows workspace bytes: `02FA154ED521F4173B35713D482A6944091CD9B5DDC56D561AEB4D7E18229801` (line-ending conversion on another checkout can change the byte hash).

The successful policy reads only public observations, task summaries, and published affordances for decisions. It dispatches pause and inspection at t=10; pause applies t=13; inspection completes t=41/report arrives t=43; repair completes t=163; cooling becomes ready t=193; the independent reading completes t=199/report arrives t=201; sustainable batch ceiling 30 applies t=258; the actual private 60-second hold is recorded t=319; final verification completes t=329/report arrives t=331; success is recorded t=331. The announced +10 interactive units/s/rack pulse still occurs at t=300.

At success, true peak inlet was 28.62 C, current inlet 24.942638915841343 C, thermal trips 0, and critical service delivered 52,960 of 52,960 offered units. Deferred batch backlog is explicitly retained: 79,440 arrivals - 20,640 completed = 58,800 outstanding units.

Continuing that already-successful engine to t=600 gives 96,000/96,000 critical units, 52,800/52,800 interactive units, 144,000 batch arrivals, 85,200 completed, 58,800 outstanding, conservation residual 0, and no thermal trips. The terminal outcome remains fixed while the physical ledger keeps advancing.

The idle policy fails at t=505 for lost critical service, produces eight thermal trips, and reaches t=600 with 71,200/96,000 critical units and conserved backlog. The separate no-trip fixture (trip threshold raised only in the test/trace fixture) preserves critical service but times out at exactly t=600. This fixture isolates the timeout rule; authored content is untouched.

## Limits and remaining work

- Coordinator review, integration, actual worker/browser wiring, browser interaction, production build, e2e, laptop rehearsal, replay/comparison, persistence and provider integration were not performed. Do not mark G1 from this handoff.
- This is only Hot Restart. No reset-rack action, sensor-fault family, water loop, alternate incidents, migration, provider dialogue, dependency or schema additions were made.
- v1 topology is immutable and its external-event union has no route-blocking mutation. Unreachable dispatch rejects `PATH_BLOCKED`; no authored runtime event can block an existing route in this mission. A later dynamic topology feature needs coordinator-owned contract/content work.
- Dashboard rates describe the interval just completed; a control completion changes admission at its boundary for subsequent integration. Hold counting conservatively requires stable conditions on both sides of each counted interval.
- Field report latency and safe UPS reset duration (20 seconds) are engine invariants because v1 has no separate fields for them. A configurable delivery delay/reset duration would require coordinator-owned content/schema changes; no alternate types were introduced.
- Snapshot validation enforces restoration consistency, not authenticated anti-cheat or calibrated facility predictions.
- Parent owns independent review and integration. Parent receives/acknowledges this result, verifies completed/result_available/no pending child runs through task status, then archives the returned child thread. This worker does not self-archive or cancel for cleanup.
