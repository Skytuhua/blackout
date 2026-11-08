# CI-ROUTE-01 handoff

Status: **migration delivered; CI is blocked by a product reset defect outside this lease**. Final full verification: typecheck PASS, 340/340 unit tests PASS, production build PASS, browser 37/38 PASS (10/11 migrated and 27/27 unchanged current cases). No skipped or excluded tests. This is not green shared CI.

Coordinator follow-up: independent review reproduced the restart blocker and identified an empty inference in the future conversation-v3 order fixture. The fixture now supplies a short nonempty acknowledgment. Typecheck passed after this change; the fixture still requires an integrated v3 browser run. Existing v2 behavior remains unchanged.

## Custody and commits

- Clean initial branch: `t3/1aac6ca5`.
- Exact base observed before edits: `9edaf6acd140bc98626a129ed463352891166125`; initial status was empty.
- Test/helper commit: `7859c41648adf101f79202ebbc4899c8ecd34fe3`.
- This handoff is the subsequent documentation commit; its SHA/final clean head are supplied in final delivery.
- Changed files: `tests/e2e/desktop-helpers.ts`, `desktop-host.spec.ts`, `coworker.spec.ts`, `foundation.spec.ts`, `mission.spec.ts`, and this handoff.
- No nested agents, branch switches, resets, cherry-picks, Root source imports, pushes, PRs, merges, watches, installs, credentials, or paid model calls.
- A private ignored copy initially matched SHA-256 for all 293 tracked files. All 288 unleased tracked files in both checkout and private copy were later rechecked against that manifest. Source, configuration, assets, dependencies, lockfile, and other seven browser specs are unchanged.
- Receipts and the verification copy are under `.local/ci-route/**`. Existing dependencies are reused through a junction only inside `snapshot/node_modules`.

## Blocking product defect

Reproduction on the pinned source:

1. Start guided game, pause, select cooling context, and send an inspection request with the external HTTP reply held.
2. Open Menu, then Game options.
3. Restart mission is disabled while that reply is pending.

The preserved regression is `coworker.spec.ts:115`, failing at line 129's enabled assertion. Its own mocked HTTP gate is released for teardown. Subsequent cancel/late-reply assertions therefore remain **unverified**, rather than being claimed as passing.

Read-only source trace: `src/App.tsx:146` opens Menu and launches `capture(false)`; line 152 sets global busy; line 154 awaits `cancelCoworkers(false)` without aborting the request. `src/ui/conversation-menu/index.tsx:196` disables Restart while busy. The automatic snapshot prevents resetting the outstanding interaction.

Smallest proposed Root correction: avoid starting the automatic Menu snapshot while a coworker request is active, keeping Restart available. The existing reset must still abort the old generation and ignore its late tool reply. Preserve explicit save/replay custody and generation fences. No product fix or manufactured reset was made here. Parent must review/correct product code under its own lease and rerun the reset regression plus full verification before a green merge.

Root separately owns the reported reader-default problem. On frozen 9ed, these tests explicitly select **Evidence**, assert real field values/timestamps and exact report/evidence identity, and do not accept the generic delivery notice as a diagnosis. This delivery does not claim the reader default is fixed.

## Original coverage mapping

All eleven original cases retain meaningful behavior through the conversation route.

| Original | Replacement | Coverage and observed result |
| --- | --- | --- |
| Foundation paused dispatch/instructions | `foundation.spec.ts:4` | Real accepted receipt, travel ETA, Walking at public T+0 with zero progress, current team/evidence instructions. PASS. |
| Complete offline mission | `mission.spec.ts:4` | Sam actually pauses batch at 13 and reports ceiling 0 at 15. Alex inspects at 47; report is absent before delivery at 49 and exposes the real false prerequisite. Repair completes at 169; cooling remains stopped at 195 and runs at 200; stored temperature declines by 260. Sustainable ceiling 30 completes at 263; the real 60-second hold is recorded at 324; fresh verification completes at 334 and delivers real success at 336. Exact final evidence IDs/readings are retained, readings are within ten seconds, and durable prerequisite evidence is separately checked. Terminal time freezes, no thermal trip, zero model HTTP calls. PASS. Original independent-probe action remains in the coworker case below because offline suggestions do not offer it. |
| Exact idle failure/freeze/retry | `mission.spec.ts:74` | Actual failure at 505, frozen clock, terminal orders disabled, current Restart returns a clean paused T+0 run, all actors ready/no inherited tasks or reports, new order accepted without provider. PASS. |
| Safe practice/no scroll | `desktop-host.spec.ts:6` | Healthy Practice entry, current world/actor controls, actual ten seconds without incident alarm, critical service 100%, 1280x720 bounds, zero model calls. PASS. |
| Guided practice travel/report/clean incident | `desktop-host.spec.ts:21` | Context selection alone leaves Alex ready. Accepted task walks with increasing public progress; inspection completes at 37 and delivers at 39 with true prerequisite, actual evidence ID/source/timestamps. Healthy physics continues beyond 600 to 610 without a deadline/outcome. Restart creates a clean paused incident with no prior tasks/history. Replaces obsolete WASD/E/proximity teaching with approved automatic travel. PASS. |
| Native save/resume/scoped replay/comparison | `desktop-host.spec.ts:54` | Native IndexedDB string equals original downloaded bytes; exact accepted cap retained. Resume reaches saved T+20 and stays paused. Scoped replay starts at zero, seeks to 20, and shows real metrics. Equal-horizon earlier-cap computation retains batch accounting and evidence JSON. Export is byte-identical after resume/replay/comparison. Menu/document bounds at three desktop sizes. Zero provider calls. PASS. |
| Coworker bounded worker/evidence/proposal | `coworker.spec.ts:30` | Only model HTTP mocked. Real worker observation tool continuation with exact IDs; original History contains tool result/call IDs/mock provenance. V2 leaves Alex Ready until confirmation, then actual inspection/travel/diagnosis and repair execute. Original independent probe is retained through an authorized rack proposal delivering an actual independent temperature report. Four bounded fixture turns, no extra report model call. PASS. |
| Stale original versions after cancel | `coworker.spec.ts:95` | Hold original wire reply, accept/cancel real direct work, release/authorize the original proposal. Worker rejects STALE_ENTITY_VERSION although Alex is available; no active progress remains. PASS. |
| Reset aborts/ignores late request | `coworker.spec.ts:115` | Pending request, real Restart, cancel observation, late tool release, and clean new run assertions remain intact. BLOCKED at disabled Restart, with no weakened assertion. |
| Timestamp metadata | `coworker.spec.ts:141` | Real observedAt selector renders metadata instead of a numeric running reading; original evidence ID/time stays readable; question starts no work. PASS. |
| Outage/direct orders | `coworker.spec.ts:157` | Abort only model HTTP; original reply is labeled SCRIPTED FALLBACK; real direct order is accepted and starts walking. PASS. |

## Contracts and fixture limits

- Simulation workers and fixed one-second engine are real. Clock acceleration advances one scheduling interval and waits for exactly one public engine second. No checkpoint mutation or injection by migrated tests.
- Clock freezes the empty document before navigation using a future pause point, fixing an observed same-instant install/pause race under parallel load without increasing timeouts.
- Actor tabs, suggestions, Equipment context, actual Pause/Resume, Menu History/Saved games/Replay readers replace old panels and player movement. No hidden worker command access.
- Reports are addressed by the actual receipt's `report-<taskId>`. Explicit Evidence selection supplies findings. Full-message checks concern only authored workload/repair explanations.
- Baseline advisory/coworker-v2 retains manual proposal confirmation and does not execute an inspection tool. A real read-observations tool supplies the bounded round trip instead.
- Per the packet, only an actual start interactionMode of `conversation` selects future response requestKind (order for the fixture's explicit work scenario, question for metadata questions), with continuation mode inherited by request ID. That branch expects one automatic originating authorization. There is no player-prose parser.
- V3 and Root's pending source were **not imported or executed**. Parent must recheck that fixture branch against committed product schema; no v3 acceptance is claimed.
- Provider metadata is an HTTP fixture, not a live-provider receipt. Offline mission/practice and saved replay make no model calls.

## Observed checks and receipts

Working directory for npm/Playwright: `C:/Users/user/.t3/worktrees/Blackout/t3-1aac6ca5/.local/ci-route/snapshot`.

All receipt paths in this table are beneath the task checkout's ignored `.local/ci-route/`.

| Command/receipt | Observed result |
| --- | --- |
| Initial git status/base | Clean and exact required base. |
| SHA-256 copy/protected proof | 293 copied files matched; all 288 protected files later matched in both locations. `snapshot-sha256.txt`, `protected-byte-proof.txt`. |
| `npm run build` | PASS, `build-baseline.log`; also passes in final verify. |
| `node .local/ci-route/baseline-red.mjs` from task checkout | RED: first verifies the real current production welcome, then removed Start practice locator times out at 6000ms. `baseline-red-valid-origin.log`. |
| `npm run typecheck` | PASS, `typecheck-01.log`; latest test code also passes in final verify. |
| `npm test -- --maxWorkers=1` | PASS, 49 files/340 tests, `unit-single-worker.log`. |
| Focused migrated runs | Real mission/idle/practice/native storage/worker/probe/stale/metadata/outage passes observed; intermediate logs retained. No retries counted. |
| `$env:BLACKOUT_REVIEW_ORIGIN='http://127.0.0.1:4189'; npm run verify` | Final `verify-02.log`: typecheck PASS, 49 files/340 unit tests PASS, build PASS; normal 11-worker browser run executes all 38 cases: 37 PASS, 1 FAIL (reset), exit 1. All 27 unchanged current cases PASS. |
| `git diff --check` | PASS before test commit. |
| Owned shutdown | Exact command/PID verified before stopping; final PID 69900 absent and owned port 4189 ECONNREFUSED. `server-cleanup.json`. |

Final failure snapshot: `final-context/reset-error-context.md`; normal Playwright context also remains in `snapshot/test-results/`.

Intermediate errors are not counted as acceptance: initial private-port requests hit the service's stable-origin 403, so that RED attempt was discarded and repeated against the real welcome using the adapter below. Loading the unchanged old desktop spec after removing its helper export failed module discovery; the isolated baseline probe reproduced the intended missing-control failure. A wrong-cwd CLI attempt produced MODULE_NOT_FOUND; its own log was moved into `tooling-wrong-cwd.log`. Corrected test issues included timestamp formatting, restore initialization race, inverted backlog expectation, clock setup race, and applying live-reading freshness to durable prerequisite evidence. Final verify confirms those test issues corrected.

## Server and reproduction

Ignored runner `.local/ci-route/server.mjs` imports the unchanged built production service, binds only 127.0.0.1:4189, and adapts that private port's Host/Origin to the service's hard-coded stable loopback origin. This is verification infrastructure; product source and origin gates are unchanged.

Start the runner with working directory `.local/ci-route/snapshot` and LLM_MODE=scripted, then run full verification as above or the focused blocker:

```powershell
$env:BLACKOUT_REVIEW_ORIGIN = 'http://127.0.0.1:4189'
node node_modules/@playwright/test/cli.js test tests/e2e/coworker.spec.ts -g 'restart cancels' --workers=1 --retries=0
```

Initial owned PID 62072 was stopped when correcting the adapter. Replacement PID 69900 was the only later server stopped. Exact command line was checked before Stop-Process; final process absence and closed port were observed. No action against user/Root port 4173 or PID 51932.

Evidence is local built-production Chromium with native origin-local IndexedDB and real workers. It does not establish hosted CI, live-provider integration, native desktop acceptance, or user visual acceptance. No fresh dependency install. Parent owns independent review, product corrections, green checks, publication/merge into fix/plain-status-copy, and subsequent nonforce PR24 update/recheck/merge in the requested dependency order.

No child threads were created or self-archived. Parent owns acknowledgment/status checks and permitted recoverable archive; blocked work should remain visible.
