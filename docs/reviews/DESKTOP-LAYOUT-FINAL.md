# DESKTOP-LAYOUT-FINAL independent review

Reviewed `feat/desktop-host` at HEAD `d2ab5dd1862209d0bf940c07572df4e217d592dd` plus coordinator dirty changes. Scope: `src/ui/debrief/DesktopReplayView.tsx`, its CSS, `src/game/DesktopMap.tsx`, and the change in `src/ui/DesktopPanels.tsx`, with their presentation/paging callers and the desktop/master specifications. No source or production tests were edited; no subagents were started. Reviewed replay source copies and SHA-256 receipts are in `.local/review-desktop-layout-final/`.

## Findings

### [HIGH] Remaining replay states overflow the panel and hide essential controls

File: `src/ui/debrief/DesktopReplayView.tsx:31`; related fixed-height chart and comparison paths at lines 32 and 38–42/51, styled by `src/ui/debrief/DesktopReplayView.css:1`.

Invariant: the desktop specification requires no panel/report scrolling, lossless paging for long records/IDs, and reachable essential controls through all panels at 1280×720, 1366×768, 1920×1080 and enlarged text. The revised metrics/result paging fixes the previously reported ordinary desktop Outcome/Comparison result overflow, but Runs still stacks unpaged metadata and actions. Temperature and comparison setup also retain a fixed minimum height that exceeds the available zoom-equivalent stage.

Reproductions and observed evidence:

1. At **all three desktop sizes**, render a saved summary with schema-valid 120-character `runId` and `scenarioId`, plus the ordinary unavailable-save reason. With **no replay error button**, Runs needs **557px** in a **432px** content area. Export, record paging, Replay current record, and Return to mission escape the panel. With the error button present, content grows to 601px. This is not a malformed or arbitrarily long reason: the fixture uses the ordinary unavailable-save message and the schema's declared ID maximum.
2. On the **actual host**, use **640×360**, Skip practice, Pause, switch the dock to Menu, open Replay, and Save current mission. The ordinary generated UUID save needs **295px** in **175px**. Replay current record and Return to mission end at **y=389.67**, below the 360px viewport; paging/export overlap the dock.
3. On that same actual record, choose Outcome → Temperature. The chart/control stack needs **265px** in **175px**; View recorded run ends at **y=360.38**. The real component fixtures also reproduce comparison setup overflow (290px), comparison temperature overflow (223px), and event paging overflow at this size. Enlarging the panel keeps the same short stage height.

Smallest fix: put saved metadata/reasons into measured paging and split Runs actions into bounded sections; likewise provide bounded chart/setup pages or a short-stage layout that reserves navigation space. Include error-button space and long metadata in the height budget. Preserve every character and control rather than clipping or shrinking text.

Evidence: `.local/review-desktop-layout-final/host-replay-results.json`, `host-replay-640-{runs,temperature}.png`, `1280-720-long-runs-no-error.png`, `layout-results.json`, and the corresponding size/state screenshots. Reproduce with `node .local/review-desktop-layout-final/host-replay.mjs` and `node .local/review-desktop-layout-final/layout.mjs` while the existing Vite host serves port 4180. These scripts record the defect; they are not passing layout acceptance tests. The exhaustive state walk uses programmatic button activation after measuring clipped controls so one failure cannot prevent inspection of later sections.

## Verified fixes and bounded checks

- **Pointer mapping:** `node .local/review-desktop-layout-final/pointer.mjs` passed on the actual host at all four requested sizes. Cooling 01 → Generator → UPS A → Rack A1 selected the intended equipment after the context panel repositioned the canvas. Closing the panel, selecting Facilities and clicking floor then produced an authoritative `move crew accepted` receipt. Evidence: `pointer-results.json` and `host-pointer-*.png`. The added `game?.scale.refresh()` at `src/game/DesktopMap.tsx:22` addresses the reviewed coordinate defect.
- **Replay coverage:** `layout.mjs` completed 184 measured/reassembled state entries across ordinary, long/error, and unsupported variants at all four sizes, with no browser page errors. Runs, Playback, Outcome metrics/temperature/lesson, Events, Radio, Provenance, comparison setup/result/temperature/evidence, and the error screen were inspected. Ordinary desktop Outcome and computed-result states fit the reviewed panel. Unsupported results displayed the supported-prefix heading and prefix chart; algorithm correctness was outside this layout review.
- **Lossless text:** all 24 size/variant reconstruction checks retained exactly 1,536 radio characters and 1,435 transcript characters, including the final text and 120-character evidence IDs. This proves text retention for those measured samples, while the overflow finding separately prevents declaring every paging control reachable.
- **Source scope:** the `InformationPanel` change adds the existing retry callback to nonterminal mission instructions; no concrete defect was found in that line during this bounded review.

## Declined to judge

Full-suite/build acceptance; engine/replay accounting and comparison algorithm correctness; provider/model behavior or spending; complete native race behavior; every saved-record compatibility variant; production packaging; physical laptop DPI/browser zoom; user visual acceptance; first-time walkthrough. 640×360 is the requested 200% viewport equivalent, not an observed physical browser zoom. No paid provider calls were made. Fixture rendering proves this component's layout, not a completed mission or native persistence integration; the saved-run and temperature failures additionally have actual-host reproductions.

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | pass |
| HIGH | 1 | warn |
| MEDIUM | 0 | info |
| LOW | 0 | note |

Verdict: **WARNING — pointer targeting is fixed and ordinary desktop metrics/results fit; remaining replay overflow must be resolved before desktop acceptance.**
