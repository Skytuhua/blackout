# DESKTOP-RELEASE-CANDIDATE independent review

Reviewed `feat/desktop-host`, committed HEAD `d2ab5dd1862209d0bf940c07572df4e217d592dd` plus the coordinator's current uncommitted changes. Scope: revised `src/ui/debrief/DesktopReplayView.tsx`/CSS, `src/game/DesktopMap.tsx`, and `src/App.tsx` host fences, source capture, and recording/presentation separation. Read-only source review; writes are confined to this report and `.local/review-desktop-release-candidate/`. No nested reviewers, source changes, commits, dependency changes, new server, or paid provider calls.

The specification basis is `docs/desktop-rebuild-plan.md:6`, `:22`, `:31`, and `:34`, plus master-plan sections 8 and 10.1. Source copies and SHA-256 receipts are retained in `.local/review-desktop-release-candidate/source-receipts.json`.

## Findings

### [MEDIUM] Short-stage chart axes shrink below the surrounding readable text

File: `src/ui/debrief/DesktopReplayView.tsx:20`; corresponding shrinking SVG layout at `src/ui/debrief/DesktopReplayView.css:11` and font declaration at `:12`.

The chart now fits the short panel, but its axis labels scale with the SVG viewBox. At 640×360, the declared 14px SVG text has an observed effective font size of **7.6125 CSS px**, versus **13.6 CSS px** at all three ordinary desktop sizes. Temperature endpoints and elapsed-time labels become much smaller than the surrounding 16px caption and controls. This affects both outcome and comparison temperature charts. It is a readability regression in the requested enlarged-text viewport; it does not hide essential navigation or invalidate recorded metrics.

Reproduce: open the actual host at 640×360, skip practice, advance a few ticks, open Replay, choose the current record, then Outcome → Temperature. The actual-host screenshot is `.local/review-desktop-release-candidate/host-640-temperature.png`. The component fixture's exact SVG screen transform is recorded by `chart.mjs` in `chart-results.json`, with screenshots at every requested size.

Smallest fix: keep temperature/time range labels as readable DOM text outside the shrinking SVG and let the plotted lines use the remaining measured space. Avoid reintroducing a fixed chart minimum that overflows the panel. The numeric outcome metrics remain available in their existing paged DOM section, so this is non-blocking for the bounded functional review.

## Observed validation

- **Replay layout:** the actual component was exercised at 1280×720, 1366×768, 1920×1080, and the requested 640×360 equivalent. The final batch records **356 state/reconstruction entries and 76 lossless checks**, with zero harness failures or browser page errors. The walk covers every section, all seven Runs action choices, next saved/event items, outcome metrics/temperature/lesson, comparison setup/metrics/temperature/proof, Playback, Radio, Provenance, and errors. Regular, schema-valid 120-character IDs with a normal unavailable-save reason, long errors, and unsupported-prefix comparison variants were included. The measured samples show no content/panel/document overflow, clipped page copy, or obscured control centers. These are component/fixture measurements, not a claim about every possible record.
- **Lossless paging:** saved metadata, radio, original wire transcript, error text, and comparison JSON reconstruct exactly in the checked samples. Complete comparison evidence retains all **52,605 characters**, including **1,066 pages at 640×360**; unsupported evidence retains **47,104 characters over 960 pages** there. Ordinary desktop reconstruction used real Playwright button clicks. The final batched pass turns text pages through the same DOM click handlers and checks every visible copy for overflow; control positions are measured separately. No browser page errors were observed.
- **Actual host:** `host.mjs` uses the real browser host, worker, and local persistence at all four sizes. Save, replay, cursor seek to T+00:05, Playback, outcome metrics, temperature, and Return to mission succeed. Opening Replay after advancing the live mission from 5 to 8 seconds captures the new **T+0:08** horizon at every size. The measured panel content remains 432px high on ordinary desktop and 175px in the short stage, with no escaping controls. The intercepted provider-turn counter remains **zero**.
- **Pointer coordinates:** `pointer.mjs` passes all four sizes. Cooling 01 → Generator → UPS A → Rack A1 select correctly through panel-induced map repositioning; selecting Facilities and clicking floor after closing the panel produces an authoritative `move crew accepted` receipt. This independently reconfirms `game?.scale.refresh()`.
- **Host lifecycle:** `lifecycle.mjs` passes three focused controlled-dependency cases: delayed saved-load completion after session replacement; Return during replay initialization; and Resume while replay initialization is pending. This is host-callback seam evidence, separate from native worker/persistence races.
- **Source boundaries:** normal `DesktopGame` continues to receive a projected view; the replay component receives saved summaries, ledgers/comparison, recorded dialogue, and wire transcript rather than a full checkpoint/run record. `askCoworker` captures `result.recording` in the host archive, strips it from presentation, and applies generation/abort fences before publishing the response. No new consequential boundary defect was found in this scope.

Commands actually executed: `node .local/review-desktop-release-candidate/layout.mjs`; a short-stage-only pass of that command with `SHORT_ONLY=1`; `node .local/review-desktop-release-candidate/host.mjs`; `node .local/review-desktop-release-candidate/pointer.mjs`; `node .local/review-desktop-release-candidate/lifecycle.mjs`; and `node .local/review-desktop-release-candidate/chart.mjs`. Results and screenshots are in the same directory. Initial review-harness attempts hit a 1,000-page bound and omitted a required short-stage dock switch; the corrected reruns supply the results reported above. No production-source change was needed for either harness correction.

## Judgment and declined scope

The HIGH overflow findings in `DESKTOP-HOST-FINAL.md` and `DESKTOP-LAYOUT-FINAL.md` are resolved for the measured states. No CRITICAL or HIGH issue remains in this bounded review. The medium chart-label concern is distinct from the observed control/layout fixes.

Declined to judge: full-suite/build status; independent engine/replay/comparison algorithm correctness; all saved-record compatibility variants; provider/model correctness or spending; exhaustive native races; production packaging and deployment; actual laptop/browser 200% zoom or physical DPI; user visual acceptance; and first-time walkthrough. 640×360 is the requested equivalent viewport, not physical zoom evidence. The coordinator's separately reported tests are not counted as independently observed results here.

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | pass |
| HIGH | 0 | pass |
| MEDIUM | 1 | info |
| LOW | 0 | note |

Verdict: **APPROVE within the stated scope — prior HIGH overflow and pointer defects are resolved in observed samples; one non-blocking chart-axis readability issue remains.**

## Final narrow disposition — 8 November 2026

The coordinator subsequently changed the chart range/time labels to a DOM caption and added the agreed observed-temperature status control and optional fullscreen menu action. This follow-up reviews only those changes in `src/ui/debrief/DesktopReplayView.tsx`/CSS and `src/ui/DesktopGame.tsx`/CSS. No implementation or production tests were edited by this reviewer; no nested agents were started. The earlier broad paging review was not repeated.

**The MEDIUM chart-label finding is closed.** The outcome and comparison charts at 640×360 now contain zero SVG text nodes and present their numeric temperature/time range in a measured **16px DOM figcaption**. Both retain `clientHeight = scrollHeight = 175` and `clientWidth = scrollWidth = 612`, including the comparison legend. Screenshots are `final-outcome-chart-640.png` and `final-compare-chart-640.png` under the evidence directory.

The targeted command `node .local/review-desktop-release-candidate/controls.mjs` completed **20 result entries with zero errors**:

- Recent, stale, null, and future-dated public summary readings were checked at all four requested viewport sizes. Visible desktop labels match `24.5 °C`, `24.5 °C stale`, or `Temp unknown` as appropriate; timestamp titles match the observation time. Clicking the visible temperature control opens Objectives. At 640×360 the compact layout hides that top-bar control as intended. No sampled header content overflows at any size.
- The More menu fits the viewport in all 16 reading/size cases. Actual browser Fullscreen API entry and exit succeed. A separately controlled request rejection produces the disabled `Use F11 for fullscreen` fallback and leaves Close menu functional. The source's `fullscreenchange` listener removes the exact registered callback on cleanup; the new controls consume only public view data and presentation state.
- Outcome and comparison chart captions independently pass the bounded measurements above. No hundreds-page reconstruction was rerun for this narrow change.

Evidence is `.local/review-desktop-release-candidate/final-controls-results.json`; the final four source snapshots and SHA-256 hashes are in `final-source-receipts.json`. Browser API success is headless-browser evidence, not physical laptop fullscreen or user visual acceptance. All earlier declined scope remains declined. No new correctness or cleanup finding was identified in this final diff.

## Final Review Summary

| Severity | Open count | Status |
|----------|------------|--------|
| CRITICAL | 0 | pass |
| HIGH | 0 | pass |
| MEDIUM | 0 | pass |
| LOW | 0 | pass |

Verdict: **APPROVE within the documented scope — all findings from this review are resolved.**
