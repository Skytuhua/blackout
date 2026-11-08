# Blackout build status

Updated: 7 November 2026.

The real playable host is merged at PR8 (`70f5ab0`) with successful hosted checks: offline recovery t331, idle failure t505, exact terminal stopping and fresh retry. The actual production worker/OpenAI inspection cycle now passes locally (accepted t10, completed t47, report t49); its integration PR is next. Public repository: https://github.com/Skytuhua/blackout. Replay/storage library integration, debrief/comparison, complete transcript capture, timing sample and release rehearsal remain unfinished.

## Task queue

| Task | Owner | Dependency | Status | Required evidence |
|---|---|---|---|---|
| PLAN-01: solo/parallel master revision | Coordinator | User decisions and planning reviews | Prepared | Master plan, ownership, contracts, gates, and task packets. |
| REPO-00: public repository seed | Coordinator | Authorized repository-creation capability | Integrated: 6cf1bac | Actual public URL and initial commit; verify public read access. |
| CORE-00: foundation and contract version 1 | Coordinator | Plan | Integrated: fb8e798 (PR1) | Lockfile, scripts, schema-valid fixtures, production shell build, worker round trip. |
| CONTENT-01: Hot Restart data | Coordinator | CORE-00 | Feasible public-evidence response verified | Profile, topology, procedures, one declared seed, objectives, permitted-knowledge policy. |
| SIM-01: physical reference cases | Simulation worker | CORE-00 | Merged PR4: 04603bf | Equilibrium, cooling-loss, recovery, battery-energy, and capacity checks. |
| SIM-02: full mission behavior | Simulation worker | SIM-01 and CONTENT-01 | Merged PR6: 770fff3 | Crew/task timing, observations, protection, success/failure/timeout/reset traces. |
| UI-01: runtime masters and fixture UI | Game/UI worker, coordinator corrections | CORE-00 | Merged PR2: be52b64 | Native/3× sprite review, selection/dispatch flow, accessible controls. |
| AI-01: gateway and mock tool cycle | OpenAI worker | CORE-00 | Merged PR5: 49cb850 | Strict schemas, bounded transport, fallback, usage/race checks. |
| UI-02: real mission and radio integration | Coordinator host; UI worker mobile follow-up | SIM-02 and UI-01 | Host merged PR8; mobile drawer/targets separately leased | Complete offline mission using actual worker and projected views. |
| AI-02: real coworker tool cycle | Coordinator integration | G1 and available API credentials | Local real cycle passed; integration PR pending | Authenticated request, valid inspection receipt, completed observation, grounded response. |
| REPLAY-01: saved run and earlier-cap comparison | Replay worker with transferred path lease | G1 and frozen snapshot contract | Delivered; independent HIGH mapping correction pending | Deterministic hash, saved-run reload, valid and unsupported continuation cases. |
| UI-03: factual debrief and comparison view | Game/UI worker | REPLAY-01 ledger contracts | Queued | Engine-derived chart/timeline and correct supported-horizon labeling. |
| AI-03: grounded debrief and timing sample | OpenAI worker | Outcome ledger and AI-02 | Queued | Grounded explanation, ten representative interaction measurements, fallback evidence. |
| CONTENT-02: extra Hot Restart presets | Coordinator | G2 and time remaining | Optional, queued | Each preset passes its own observation-based response policy. |
| REVIEW-01: independent release review | Fresh reviewer in a freed slot | G2 candidate commit | Queued | Concrete findings or explicit checked invariants at an immutable commit. |
| RELEASE-01: production rehearsal and package | Coordinator and human builder | G2 and resolved REVIEW-01 findings | Queued | Clean install, production launch, live/offline demo, saved checkpoint, actual laptop rehearsal; passing this produces G3. |

G1 is reached only when `SIM-02`, `CONTENT-01`, and `UI-02` produce a real offline mission. `AI-01` can pass independently. G2 adds the live tool cycle, factual debrief, replay/comparison, and complete provider-disconnected flow. G3 is the reviewed, verified production candidate.

Repository publication is not a prerequisite for local foundation work. Keep repository staging project-only while publishing access is resolved.

## Evidence ledger

The coordinator appends the task ID, integrated commit, exact command or manual check, observed result, evidence path, and reviewer. A planned or written test is not a passing test. Replace this section's empty state only after observing real execution.

PRs 1–7 contain reviewed foundation, UI, CI, physical/mission simulation and gateway changes. Review dispositions are in `docs/reviews/`; implementation receipts are in `docs/handoffs/`. Current playable-host checks use actual production Chromium controls and a real simulation worker, with authored scripted coworkers. See `docs/reviews/CORE-01.md` for the scope and limits.

## Time checkpoints

The public event schedule reviewed during planning listed an initial deadline at 05:00 UTC November 8, 2026 and final submissions at 18:00 UTC November 8. Recheck current instructions. Prepare and verify the initial-entry requirements by 04:30 UTC. Reserve the final two hours for packaging/rehearsal, and rebase productive time on the actual start and remaining personal availability.

## Foundation execution evidence

- Original plan and ZIP hashes match supplied attachments; see asset provenance. Documentation seed committed unchanged.
- Shared contract validation: meaningful RED then GREEN; actor projections and comparison discrimination covered.
- Browser check: production React/Phaser shell renders and completes a typed worker round trip. This is fixture/G0 evidence only.
- OpenAI: one authenticated strict structured response succeeded against the selected model. Full worker tool cycle remains pending AI-02. No credentials in Git.
- Dependency audit: zero known vulnerabilities after updating the test runner.
- Kickoff schedule recheck: official event page still lists initial entry 23:00 CT Nov 7 and final submissions noon CT Nov 8. Its Devpost link points to the generic site; full initial-entry, AI/provenance and eligibility rules remain unverified. No submission performed. Keep the plan's 22:30 CT entry-preparation checkpoint.

## CI and UI review evidence

- CI-only PR3 merged at `21a4b5881a88595c638b6c1c069bb2b4286a8932`; independent review approved and hosted verify passed. This covers the foundation gate, not mission acceptance.
- UI-01 delivered four authored runtime masters and observation-only fixture controls. Coordinator independently ran typecheck and 18 tests, inspected desktop/native captures and accepted four fresh-review findings. All four now have failing-before/passing-after browser checks; see `docs/reviews/UI-01.md`.
- User confirmed no additional event requirements; supplied master plan remains the delivery requirements.
