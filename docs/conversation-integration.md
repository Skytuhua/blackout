# Conversation game integration contract5

Approved experience: docs/conversation-game-plan.md, copied verbatim from the user's approved replacement in the main thread. This replaces all normal WASD/E/click-travel/proximity UX. No further design approval is required.

## Reconciliation and retained data

Root implementation starts from verified pre-WASD `b1bcee913c59b9a3c3064e8e88aa676e4698645d` on `feat/conversation-sidebar`. Existing `feat/desktop-host` remains at `77348435742576ca99ee75f8e70c409f73075488`, preserving completed simulation/WASD contract commits. SIM implementation eb1272c/handoff8899e8b and UI9a8031f/3be6069/71abfe2 stay in their original clean worktrees/branches. The replaced UI task was canceled, but cancellation returned completed; both final results were received/acknowledged, status checked completed/result_available/nochildren and recoverably archived. No deletion, reset or migration occurred. Mobile remains deferred.

Retain automatic route/travel/work, engine identity sim-desktop-v2,content hot-restart-layout-v2/practice-layout-v2,engine/checkpoint/worker schema1 and saved-host2. Keep raw export/independent unavailable-save summaries,source lineage/exact wire receipts,replay/debrief,111-frame atlas and source custody. WASD proof recordings remain on preserved branches and incompatible bytes remain exportable. No new clock or physical integration work.

## Shared presentation

New `ConversationGameProps` in shared/contracts is separate from the preserved legacy desktop component. Host supplies all scoped views,selected actor/equipment,per-character threads/drafts/busy/unread/suggestions,guide/alerts,reader selection and Menu content. Three visible identity tabs are Alex·Cooling,Jules·Power,Sam·IT. 360px chat at required desktop sizes; map left. Only equipment/context selection is allowed on the normal map. No movement listeners,commander cursor or proximity gate.

Each thread entry has actor identity,stable ID,time,kind,full text,optional short complete summary,sections and presentation-only proposals. Message kinds distinguish player/order/system/live/fallback/report. Full history is host-owned and independent of last-eight render windows. UI pages whole entries Older/Newer; detailed/oversized entries open a sectioned reader with Back and lossless measured text. Drafts belong to actors and expand into a lossless paged editor when long. Composer,suggestions andessentialcontrols stay fixed. Normal replies/notifications/guidance are short complete messages,not prose split across tiny pages.

`onExecuteProposal(id)` is distinct from `onSuggestedOrder(id)`. UI never submits an arbitrary ActionIntent as authorization. Root registers ProposalAuthorization tokens against run/actor/request/exact originating view versions,using the exact original intent. Selected tab/visible panel never selects the version vector. Accepted tokens cannot execute twice; stale proposals reject instead of refreshing versions. Root captures actor at send time and routes late replies to that actor without selecting its tab.

GatewayStart adds optional interactionMode:'advisory'. Absence preserves old transcript semantics. New normal host always opts into advisory; no free-text parser. `CoworkerResult.authorizations` contains host-only original intent/version snapshots from the actual originating wire turn. Suggested commands use current eligible worker/known engine affordance and current versions,with zero provider calls. Free-text work requests only propose. Legacy inspect_asset must never call simulation.command in advisory mode. Keep old tool schemas/transcripts readable and old accepted acknowledgments intact.

## Delivery and exclusive leases

PR1: persistent sidebar/conversation/identity,actor-captured drafts/history/late replies,advisory safety seam and explicit proposal tokens. PR2: validated suggestions/authorization,automatic travel,clear assignment/report state,busy Wait/Stop. PR3: full-win host-owned guide,public notifications,complete history/practice. Each concrete slice receives independent review and relevant integrated checks before progressing to merge. Preserve existing draft PR12 as a predecessor reference until final branch/base reconciliation; do not silently publish it as the new feature.

Coordinator owns root/shared/App/content/workers,persistence,debrief/menu,tests/contracts/records/e2e,guide/alerts/history models and integration. CONV-UI owns only new src/ui/conversation/**,new src/game/ConversationMap.tsx,minimal read-only-display option in src/game/DesktopScene.ts,tests/ui/conversation/**,its handoff. CONV-LLM owns server/**,src/llm/**,tests/llm/** and its handoff. No public-art/dependency/globalstyle changes by workers. Prior owners stopped before these leases. At most3activeworkers project-wide,no nested workers; main-thread coordinator owns read-only independent CONV-01 review seam with only docs/reviews/CONV-01-independent.md and .local/conv-01-independent/** writable.

Root will validate all saved-record authorization history against retained transcripts and test mixed old/new saves. No checkpoint/forensic state in normal UI/coworker context. New public site announcements must be explicitly permitted engine messages; use scoped observations for derived status and never infer latent faults before delivered evidence.

## Guide and acceptance

Default Start guided game; healthy practice is a short select/order/report exercise. Host guide must cover actual full win: public stopped cooling,Sam pause jobs,Alex inspect controller plus exact delayed report,repair (includes existing restart delay),observed running/cooling below26C headroom,Sam sustainable ceiling30,public stability hold,deterministic verify,exact fresh report and engine success. Leave engine27C threshold unchanged. Pause once on initial failure,diagnosis and repair/recovery explanation; guided model waits also pause. Explicit manual Pause overrides all guide resumes. Guide state uses accepted commands/task IDs/public observations/report evidence,never guessed times or text.

Required focused checks include cross-character late/draft/unread behavior,>8history,no hidden execution,stale/duplicate/cancel/reset,busy/report delays,offline full browser win,native persistence/replay and no clipping/scroll at1280×720,1366×768,1920×1080 plus enlarged text. Routine tests are synthetic. Human novice/visual acceptance remains separately observed.
