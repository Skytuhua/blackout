# CONV-UI handoff

Ready for coordinator integration and the retained independent CONV-01 review. This delivery establishes synthetic presentation behavior. It does not establish integrated engine/provider behavior, a guided mission win, native persistence/replay, laptop rehearsal, physical DPI/IME behavior, novice usability, or user visual acceptance.

## Source custody and commits

- Prepared pinned base: `9be14e6074634fd7b5294f21d371e3e4b6c0325a`.
- Branch: `t3/conversation-sidebar-ui`; worktree: `C:/Users/user/.t3/worktrees/Blackout/t3-be747a15`.
- First coherent milestone: `2f0a7a85b0d76c93c857203c7e368c903c981405`. Sent promptly through `t3_thread_send`, with 3 focused tests/typecheck green and the running synthetic fixture; browser acceptance was explicitly still pending. Coordinator reported integration as `2ade960`.
- Final implementation delta: `bf3987599a6637c99ebb23e079571c65fd5efc89`. Apply after the milestone. This includes the coordinator's follow-up requiring proposals to remain inline when evidence/provenance sections also make the full reader available.
- This handoff is a subsequent documentation-only commit; its hash is supplied in the final result.
- No nested worker, PR, push, paid provider request, branch switch/reset, self-archive, or edits outside the lease. The initially missing installation was resolved with an ignored `node_modules` junction to the existing `C:/Users/user/Documents/Blackout/node_modules`; versions and lockfiles were untouched.

## Produced paths

- `src/ui/conversation/ConversationGame.tsx`, `ConversationGame.css`, `index.ts`, `history.ts`.
- Synthetic-only `src/ui/conversation/fixture.html`, `fixture.tsx`.
- New `src/game/ConversationMap.tsx`.
- Minimal optional `displayOnly` flag and corresponding guards/diagnostics in `src/game/DesktopScene.ts`; the legacy default remains unchanged.
- `tests/ui/conversation/history.test.ts`, `browser-check.mjs`, `vite.config.ts`.
- `docs/handoffs/CONV-UI.md`.

The entire diff from the pinned base contains only these paths. No App/shared/global styles/assets/dependency/debrief/legacy panel changes were made.

## Contract and behavior

`ConversationGame` is independently exported from `src/ui/conversation/ConversationGame.tsx` and `src/ui/conversation/index.ts`, consuming the exact frozen `ConversationGameProps`. No local substitute shared interface was introduced. The coordinator's later optional durable PublicMessage metadata requires no UI prop change.

- 360px sidebar at 1280x720, 1366x768 and 1920x1080, three visible atlas portraits/name/role tabs, per-actor controlled draft/assignment/busy/unread/suggestions. Tabs support keyboard selection. A late prop update never selects its actor. Local history anchors and suggested-order pages belong to actors; run changes clear this local presentation state.
- Whole-entry Older/Newer pages retain every host entry, including history beyond eight messages. DOM measurement budgets complete entries; oversized entries retain a compact full-reader link and inline proposals. Hidden measurement trees are inert and contained so they create neither accessible duplicate actions nor document scrolling.
- Short ordinary message text stays complete. Long messages, reports, supplied sections and action-result reasons remain losslessly available through `DesktopPaging.PagedText`; Back returns to conversation. Opening an unread reader emits the exact entry/actor read callback. The UI never derives an unread counter from its render window.
- Draft text remains host-owned. A textarea preserves pasted newlines; overflow opens the expanded measured `DesktopPaging.DraftEditor`. All 1600 characters, whitespace and Unicode survive paging, resizing and recipient switches. Composition cannot submit or prematurely replace the editor; ordinary Enter inserts a newline. Explicit Send calls only `onSend(actorId)`; Ctrl/Command+Enter also sends from the compact composer after composition ends. Synthetic composition tests are not physical OS IME acceptance.
- Proposal buttons remain directly inline beside the optional full-reader link, including entries with sections/short summaries. Multiple proposals page directly in place, with the task and assigned name on each execution button; the same proposals also remain available in the reader. Only `onExecuteProposal(proposalId)` is emitted. No ActionIntent, inferred authorization, refreshed version vector, or tab-derived actor is submitted. Ready/sending/accepted/rejected states come from the host. The host owns atomic single use, cancellation/reset fencing and staleness validation; the UI does not mint authorization.
- Suggested orders call only `onSuggestedOrder(orderId)` without a modal or provider request. Host guidance can highlight the target actor/order. Busy assignment statuses are displayed as ready/walking/checking/working/report arriving/delivered. Wait and Stop emit the exact current actor/task IDs; a replacement task is never canceled using a stale local selection.
- Objective, public major alert, service freshness, time and Pause are above the map. Guidance, welcome Start guided game/Practice, and Menu contents use supplied props/callbacks. Menu and welcome make underlying controls inert. Caller-supplied Menu content retains its own evidence/save/replay behavior and remains coordinator-owned.
- Persistent `ConversationMap` reuses the atlas and `DesktopScene`; the display-only flag hides the commander and fences key/nudge/nearby/floor input even if called directly. No movement listeners, dpad, proximity gate, click orders or ordinary Radio/Dispatch/Command navigation are added. Known equipment clicks and the accessible equipment selector call only `onSelectAsset(id)`. Field names and assignments derive from scoped public props; sprite travel/work remains the scene's accepted-path presentation. No latent fault/equipment truth is inferred.
- The supported enlarged geometry, 640x360 CSS pixels (a 200% geometry equivalent of 1280x720), temporarily focuses conversation/reader/editor with reachable World navigation. World focus retains integer-scaled art, objective and guidance; compact view omits the map footer to reserve a full logical world. This is a desktop fallback, not mobile work.

## Commands actually run and observed results

1. Initial `node node_modules/vitest/vitest.mjs run tests/ui/conversation/history.test.ts` stopped with `MODULE_NOT_FOUND` for the absent installation. After the ignored junction was added, the same command failed RED because the history implementation module did not yet exist. After implementation it passed GREEN: 3 tests for whole-entry retention beyond eight, oversized/empty history and complete short messages/readers.
2. `npm run typecheck`: final PASS, exit 0.
3. `node node_modules/vitest/vitest.mjs run tests/ui tests/contracts/conversation-v5.test.ts`: final PASS, 6 files / 19 tests, exit 0. Includes preserved legacy UI tests plus the advisory-envelope contract check. An earlier `node node_modules/vitest/vitest.mjs run tests/ui` also passed 5 files / 18 tests.
4. `node tests/ui/conversation/browser-check.mjs`: final PASS, 10 groups / zero failures, exit 0. Chromium checked all three desktop sizes plus 640x360; fixed essential controls, reader/editor/busy layouts, no descendant/document overflow; 15 whole entries; exact full report/section reconstruction; exact 1600-character Unicode/newline drafts across geometry/recipients; actor drafts/history/late unread/busy behavior; exact proposal/order IDs with evidence sections and three inline proposals; rejected/accepted/sending disablement; synthetic composition and newline behavior; exact Wait/Stop task IDs, terminal/reset; no movement/floor commands; welcome/Menu; zero engine/provider API requests.
5. Scene browser evidence: atlas present; 285 object identities retained through 100 view updates; exactly 1 pointer listener; unchanged hidden commander position after key/nudge/floor attempts; known controller click produces only `selectAsset('controller')`. This is scene/fixture proof, not a real accepted engine task or route execution proof.
6. `node node_modules/vite/bin/vite.js build --config tests/ui/conversation/vite.config.ts`: final PASS, exit 0, production fixture under `.local/conversation-ui/build`. This is not the root release build.
7. `C:/Users/user/.agents/skills/impeccable/scripts/impeccable.cmd detect --json src/ui/conversation/ConversationGame.tsx src/ui/conversation/ConversationGame.css src/game/ConversationMap.tsx`: PASS, `[]`, saved to `.local/conversation-ui/impeccable-report.json`.
8. `git diff --check`: PASS. Final named-path audit from the pinned base contains only the lease plus this handoff.

Browser failures were corrected rather than waived: an uncontained measurement mirror contributed scroll height; a text input normalized multiline drafts; a textarea needed a measured caret-line reserve; compact world needed space for the native logical height; proposal status feedback needed a compact arrangement; and the fixture needed to wait for prop rendering/scene attachment rather than visible world canvas in chat focus. The first RED browser receipt remains preserved separately.

T3 preview opened the fixture and captured the first screenshot. Its animation-frame evaluations twice failed with `Preview automation evaluate timed out after 15000ms.` Standalone headless Chromium was used after those failures; the worker's preview tab was closed. No root development server was stopped or reused.

## Reproduction and evidence

```powershell
node node_modules/vite/bin/vite.js --config tests/ui/conversation/vite.config.ts
# http://127.0.0.1:5184/src/ui/conversation/fixture.html
# Add ?welcome for the welcome state. Fixture is explicitly synthetic.

# Another shell:
node tests/ui/conversation/browser-check.mjs
```

`CONVERSATION_FIXTURE_ORIGIN` optionally points the browser runner at another fixture origin. `CONV_CHECK_FILTER` optionally selects a named group for focused reproduction; final verification ran without a filter. The worker-owned 5184 process is stopped before final handoff.

Evidence retained locally (ignored, not added to the repository):

- `.local/conversation-ui/browser-results.json`: final 10-group receipt.
- `.local/conversation-ui/red-browser-results.json`: initial browser failure receipt.
- `.local/conversation-ui/layout-1280x720.png`, `layout-1366x768.png`, `layout-1920x1080.png`, `layout-640x360.png`.
- `.local/conversation-ui/impeccable-report.json` and `build/`.

Existing atlas custody verified read-only, 111 frames:

- `public/assets/facility-v2.json` SHA-256 `6570dc23aaaf3c9dd0d5ee872aa2199277651a485de92e318adf9251907cc5fe`.
- `public/assets/facility-v2.png` SHA-256 `b0e844a4db73a2bea7e8af3985c68d1cc1a6f37b831d5dcecdeec30001c9ad35`.

## Remaining integration and acceptance

The coordinator retains App/host integration, durable actor routing/history, command/token validation and single use, guide progression, engine-accepted automatic work, native persistence/replay/debrief, full offline mission browser win, production host/failure checks, independent CONV-01 review, demo laptop and novice/user acceptance. The fixture's callbacks log synthetic events and do not execute orders or contact a model. No full simulation, LLM, persistence/replay or production end-to-end suite was rerun by this UI lease.

The existing legacy UI remains present for compatibility. Menu content and normal entry/objective/guidance/order labels are host-supplied; normal instructions must remain short and complete as specified. Raw report/evidence/action reasons and long drafts have the explicit lossless reader/editor route.

Parent receives and acknowledges the final result first, then confirms task status `completed`, work state `result_available`, and no pending child runs before recoverable archive using the returned child thread ID. This worker does not self-archive. Preserve interrupted/unfinished work visibly; no deletion or history cleanup was performed.
