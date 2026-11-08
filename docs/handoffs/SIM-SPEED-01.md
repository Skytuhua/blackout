# SIM-SPEED-01 handoff

Implemented the visible simulation speed selector beside time and Pause/Menu. Parent owns independent review, publication, merge into **only `fix/plain-status-copy`**, and adoption into the actual 4173 preview.

## Source custody and commits

- Prepared base verified clean: `9edaf6acd140bc98626a129ed463352891166125`.
- Task branch: `t3/ef02262d`; no branch switches or resets.
- Implementation and browser tests: `abc009a2dcf9560c1367c4789e8cc1b750912b22` (`feat(ui): expose simulation speed in the conversation header`).
- The subsequent documentation-only commit contains this handoff; the final task result supplies its full SHA and immutable HEAD.
- Exact changed files: `src/ui/conversation/ConversationGame.tsx`, `src/ui/conversation/ConversationGame.css`, new `tests/e2e/simulation-speed.spec.ts`, and this file.
- No nested workers, installs, dependency changes, paid/provider requests, PRs, pushes, merges, or watches.

## Change and API assumptions

- A controlled native select has visible **Speed** text, accessible name **Simulation speed**, and **1× / 2× / 4×** options. Both desktop header and compact conversation toolbar use the same existing `speed` and `onSpeed` props. Menu continues consuming the host's existing speed state.
- The handler only calls `onSpeed`; it does not call pause/resume or create clock state. Existing `SimulationClient.setSpeed` preserves its paused state and changes the interval between unchanged one-second worker steps when running.
- Scoped CSS reuses the incumbent Pixelify select, palette and focus styling. Header/compact toolbar may wrap; essential header items do not shrink. No font reductions or hidden essential controls were added.
- Actor selection, drafts, history, proposals, replay, reset, host/gateway, simulation and persistence source were untouched.
- Production-source diff is 8 inserted / 4 removed lines across the two UI files. The new browser spec has 158 lines.

## Verification environment

This prepared worktree had no `node_modules`. The initial workspace `npm run build` invocation failed to locate `vite`; no installation was attempted. Verification instead used an evidence-only source snapshot under `.local/sim-speed/source`, extracted from the pinned base with only the three changed code/test files overlaid. Its `node_modules` junction points to the existing `C:/Users/user/Documents/Blackout/node_modules` installation. `receipts.json` verifies byte equality between the three tested files and the task checkout and records their SHA-256 hashes.

All checks below ran in that snapshot using committed scripts/configuration. `.local/sim-speed/serve.mjs` served the production build on **5197**, with a private ephemeral backend and a local origin bridge for the committed server's 4173 origin guard. `LLM_MODE=scripted`, the server API key was explicitly empty, and the new browser fixtures abort model routes except for one locally fulfilled, gated guidance-pause fallback. No worker or production-source instrumentation, fake clock, checkpoint injection or fabricated completion was used by the new tests.

## Observed RED and GREEN

Commands below ran from `.local/sim-speed/source`; logs/artifacts are relative to `.local/sim-speed/`.

1. Baseline production build: `npm run build` — exit 0; `baseline-build.log`.
2. With `BLACKOUT_REVIEW_ORIGIN=http://127.0.0.1:5197`:
   `node node_modules/@playwright/test/cli.js test tests/e2e/simulation-speed.spec.ts --grep 'persistent header' --workers=1 --output=../red-artifacts`
   — **observed RED**, one failure at the visible Simulation speed control assertion: element not found. The real practice game, public time, Pause and Menu were present. See `red.log` and `red-artifacts/simulation-speed-persisten-d4f22-ed-simulation-speed-control/error-context.md`. This was run before the UI edit.
3. After the minimal UI patch, `npm run build` — exit 0; `green-build.log`. Existing Zod annotation warnings remain in the build log.
4. `npm run typecheck` — exit 0; `typecheck.log`.
5. `npm test` — exit 0; **49 files / 340 tests passed**; `unit.log`.
6. With the review origin above and `PLAYWRIGHT_JSON_OUTPUT_NAME=../green-results.json`:
   `node node_modules/@playwright/test/cli.js test tests/e2e/simulation-speed.spec.ts --workers=1 --output=../green-artifacts --reporter=list,json`
   — exit 0; **13 passed**, no skips/retries/flaky results, 36.9 seconds; `green.log`, `green-results.json`.
7. With the review origin above and `PLAYWRIGHT_JSON_OUTPUT_NAME=../regression-results.json`:
   `node node_modules/@playwright/test/cli.js test tests/e2e/conversation.spec.ts tests/e2e/conversation-controls.spec.ts tests/e2e/conversation-ui.spec.ts tests/e2e/conversation-menu.spec.ts tests/e2e/task-progress.spec.ts tests/e2e/nearby-equipment.spec.ts tests/e2e/replay-report.spec.ts --workers=1 --output=../regression-artifacts --reporter=list,json`
   — exit 0; **27 passed**, 24.2 seconds; `regression.log`, `regression-results.json`.
8. Impeccable mechanical detector on the two UI files — exit 0, `[]`; `impeccable.json`. `git diff --check` also passed.

The real-worker rate receipts show a 30-simulated-second inspection progressing after genuine travel: at 1×, 3 simulated seconds and 10 percentage points during 3.210 wall seconds; at 2×, 7 seconds and 23 points during 3.220 wall seconds; at 4×, 13 seconds and 43 points during 3.212 wall seconds. Integer-tick phase explains the sampling boundary differences. Assertions compare measured wall time and public simulation time (within 1.25 ticks), then independently check inspection progress against its authored 30-second duration (within 4 percentage points). See `receipts.json` and the `real-worker-rate` JSON attachments.

The other new cases verify native keyboard selection/focus/Tab order, Menu-to-header and header-to-Menu sync, preserved Alex/Sam drafts and selected actor, manual pause, a real host guidance pause while a model fixture is pending, and operable time/Pause/Menu/composer. Layout cases cover 1280×720, 1366×768 and 1920×1080 at normal text and enlarged 20px controls/body text with the maximum keyboard-resized sidebar; 640×360 checks both conversation and world controls. They assert bounded header controls, no header/document overflow, full composer/Send visibility and actual control operation.

The committed regressions additionally cover IME/Enter behavior, late actor replies, proposal version retention, native save/export/history and replay, task cancellation, nearby equipment, reduced motion and compact Menu bounds. Older unrelated legacy desktop-route browser specs were not run.

## Evidence and cleanup

- `receipts.json`: rate readings, source hashes, screenshot names and Playwright summary.
- Seven PNGs under `.local/sim-speed/screenshots/`, including `speed-and-essential-controls-fit-1280x720.png`, `speed-and-essential-controls-fit-1280x720-with-enlarged-text-and-widest-sidebar.png`, and `speed-and-essential-controls-fit-640x360.png`. Those three were visually inspected; no clipping or composer loss was observed. The enlarged narrow world header wraps Menu onto a second row.
- Shared-preview baseline was inspected. Final shared-preview capture timed out with `Preview automation snapshot timed out after 15000ms`; the owned tab was closed. Final visual inspection used the passing production Playwright captures.
- The owned origin bridge/server was PID **72216**. Its exact PID and `node ../serve.mjs` command were checked before stopping it. `cleanup.json` confirms it is stopped, port 5197 has zero listening sockets, and Root's PID **51932** remains running. Root's 4173 server was not restarted or replaced.

## Remaining gates and limits

No implementation blockers or forbidden-file fixes were found. Evidence covers the local production browser route and real worker using healthy practice, plus synthetic model fallback fixtures. It does not establish a full guided playthrough, paid/live-model behavior, physical device/DPI behavior, human visual acceptance, or adoption into Root's preview. Parent must perform a fresh independent review, integrate/check this exact patch on `fix/plain-status-copy`, create the focused PR and merge when its gates allow. No predecessor stack or main merge is authorized here.

Parent cleanup: receive/acknowledge the result, confirm task status `completed`, work state `result_available`, and `hasPendingChildRuns: false`, then recoverably archive the returned child thread. This worker has no child runs and has not archived itself.
