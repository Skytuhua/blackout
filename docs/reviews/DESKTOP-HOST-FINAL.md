# DESKTOP-HOST-FINAL independent review

Reviewed `feat/desktop-host` at committed HEAD `d2ab5dd1862209d0bf940c07572df4e217d592dd` plus the coordinator's current uncommitted host/replay/worker changes on 2026-11-07. No production source or tests were edited. The only review writes are this document and uniquely prefixed `.local/review-desktop-host-final/` evidence. Other workers' concurrent source edits were preserved.

Scope: `src/App.tsx`, `src/ui/debrief/DesktopReplayView.tsx`, its CSS, and `src/workers/{SimulationClient,protocol,simulation.worker}.ts`, with surrounding persistence/replay validation and the desktop/master specifications. Specification and standards checks were performed in this single read-only reviewer; no nested agents were started.

## Findings

### [HIGH] Outcome and comparison content escapes the bounded replay panel

File: `src/ui/debrief/DesktopReplayView.tsx:34` and `src/ui/debrief/DesktopReplayView.tsx:46` (shared playback at line 57; corresponding fixed-layout styles in `src/ui/debrief/DesktopReplayView.css:1`).

Invariant: `docs/desktop-rebuild-plan.md` requires no panel/report scrolling, preservation of long content through paging, and visible essential controls at 1280×720, 1366×768, and 1920×1080. Outcome and comparison currently stack metrics, chart, prose, buttons, and playback without paging or measuring the available panel height. The host's regular side panel is capped at 480px, leaving 432px for content.

Reproduction on the actual host, with no provider or mocked simulation:

1. Open `/` at 1280×720, choose **Skip practice**.
2. Open **Replay**, choose **Replay current record**, then **Outcome**.
3. The panel ends at y=536, but **View recorded run** ends at y=610.61 and **Play replay** ends at y=665.70, overlapping the navigation dock. Content has `scrollHeight=575` and `clientHeight=432`; the recorder cursor extends to y=674.80. The fixed document does not scroll to expose a coherent panel.

The actual component with a computed comparison also has `scrollHeight=540` versus 432px and puts **Choose another cap** and playback outside the panel. The same overflow was measured at all three required desktop sizes because the side-panel height remains capped.

Smallest fix: page the outcome and comparison result into bounded sections, reserving space for shared playback, or measure and choose a bounded presentation that fits the host. Preserve all prose, metrics, and controls. Hiding overflow or shrinking text would not satisfy the specification. Verify the actual active replay, outcome, and computed-result states at the three required viewports after the fix.

Evidence:

- Actual-host reproduction: `.local/review-desktop-host-final/host-layout.mjs`; result `host-layout-results.json`; screenshot `host-outcome-1280.png`.
- Real component/computed-ledger fixture: `layout.mjs`, `replay.tsx`, `layout-results.json`, and `layout-{1280,1366,1920}-{Outcome,Compare}.png` in the same directory.

## Previously reported lifecycle defects

All three targeted regressions pass `.local/review-desktop-host-final/lifecycle.mjs`, which exercises the current App callbacks with controllable deferred storage/worker dependencies. This is focused host-control evidence, not a native browser/worker race proof.

- Delayed saved-load completion after a new session: the current generation/source checks at `src/App.tsx:156-167` retain the replacement session and client.
- Return during replay activation: `closeReplay` at lines 48-51 clears pending/busy and invalidates the activation token; the late completion does not reactivate replay or leave the host busy.
- Resume while replay initialization is pending: `onPause` at line 210 checks `hostPending`; the live worker remains paused throughout activation.

Results are recorded in `.local/review-desktop-host-final/lifecycle-results.json`.

## Boundary and terminal checks

- Worker caller correlation/run identity is validated before publication; the client rejects old envelopes and does not publish coworker views to player subscribers. Replay projection is generated for the independent worker identity, while source engine/content identity is checked by `validateRunRecord`/`validateCheckpoint`.
- Normal `DesktopGame` receives a projected `KnowledgeView`; `DesktopReplayView` receives summaries, ledger/comparison, dialogue and the recorded wire transcript. No checkpoint or full run record is passed in these normal UI props. The host alone retains the full source and supplies it to internal worker replay/comparison requests.
- Existing real-worker tests confirm interactive advancement stops on the first mission-ending tick (idle failure at 505) and stays there. Replay recorder tests preserve the separate physical-accounting horizon beyond an ending tick.

Command actually run:

`npm exec vitest run tests/contracts/client.test.ts tests/contracts/worker-engine.test.ts tests/contracts/desktop-replay-protocol.test.ts tests/replay/view-at.test.ts`

Observed result: **4 files passed, 13 tests passed**. The lifecycle harness also passed all three cases. Both Playwright review scripts completed and recorded the layout defect; they are evidence scripts, not passing layout acceptance tests.

## Declined to judge

Full-suite/build acceptance, live provider/model behavior, API budget correctness beyond the inspected host boundary, independent engine/comparison algorithm correctness, non-replay UI, production packaging, actual-laptop DPI/zoom, user visual acceptance, and novice walkthrough. No paid API requests were made by this review. No approval of other reviewers' or authors' implementations is implied.

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | pass |
| HIGH | 1 | warn |
| MEDIUM | 0 | info |
| LOW | 0 | note |

Verdict: **WARNING — the three lifecycle defects are resolved in the reviewed snapshot; the remaining HIGH replay-layout defect must be resolved before claiming desktop acceptance.**
