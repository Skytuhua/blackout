# CONV-01 host code review

Reviewed immutable commit `bc172b0c8dc1a6c503ad042d9ac2921afab5c3ad` on `feat/conversation-sidebar`. The tracked worktree was clean at review start; `tests/e2e/conversation.spec.ts` was untracked and excluded. No implementation source was edited and no provider calls were made.

Read the master plan, approved conversation plan, integration contract 5 including subsequent user overrides, relevant CONV task packets, the assigned host/shared/interaction/persistence files, and their surrounding worker, engine, validation, UI-reader, and test code. Compared changed host/persistence paths against the documented pre-conversation base `b1bcee913c59b9a3c3064e8e88aa676e4698645d`.

## Findings

### [HIGH] Resuming a saved report permanently drops its evidence section

File: `src/App.tsx:30` (reconstruction); related `src/App.tsx:79` and `src/shared/conversations.ts:18` (duplicate-ID handling).

Invariant: the conversation plan requires complete permitted report history and reading the exact delivered inspection report. The integration contract retains report evidence and original source data across saved-run reload. A report's generic message sentence is insufficient to communicate its diagnosis.

Issue: `savedConversations()` creates each archived engine report with `reportId` and generic `text`, but omits its evidence section. On resume, the restored worker view reaches `ingestReports()`, which does construct the evidence section. However, `appendConversationEntry()` returns immediately because that exact report ID already exists. Consequently the resumed reader never receives the readings even though their IDs, values, observation/receipt times and source remain available in the saved data. The same incomplete reconstruction is also used for replay conversation presentation.

Concrete reproduction:

1. Start Hot Restart, step to T+10, issue Alex's ordinary controller inspection and wait for delivery.
2. Open its report before saving: the Evidence section contains `inspection_complete: true` and `prerequisite_ready: false`, both observed at T+47 and received at T+49 in the reproduced run.
3. Save through `HostArchive`, reconstruct with the exact pinned `savedConversations()` and feed the restored public view through the exact pinned `ingestReports()`.
4. The same report ID now has no sections and only `Inspection complete. Timestamped field report delivered.` Its required diagnosis/readings are absent from the conversation report reader.

Evidence: `.local/conv-01-host-code/report-resume.ts` extracts both host functions from the immutable commit and exercises them with a real engine-produced report and validated archive; `.local/conv-01-host-code/report-resume-output.json` records `readingCount: 2`, populated live sections, `resumedSections: null`, and `reproduced: true`.

Smallest fix: reconstruct saved report sections from the report's retained `evidenceIds` and matching saved observations, using the same evidence presentation as live delivery. Alternatively enrich an existing report with restored metadata while preserving its identity, order and read state. Avoid duplicating it or resetting acknowledged unread state.

Regression: save and resume after a real delivered controller inspection; assert the identical report ID retains both exact readings and observation/receipt times, remains readable, and is not duplicated or made unread again. Cover replay reconstruction if it shares the same helper.

## Verification observed

- `git diff --staged` and `git diff`: no tracked changes at review start.
- `npx vitest run tests/contracts/conversations.test.ts tests/contracts/conversation-v5.test.ts tests/records/conversation-archive.test.ts tests/records/saved-record.test.ts tests/llm/advisory.test.ts tests/replay/host-archive.test.ts`: **6 files, 37 tests passed** at the reviewed commit.
- `npx tsx .local/conv-01-host-code/report-resume.ts`: exited 0 and reproduced the report-evidence defect against exact pinned host functions and actual simulation/archive data.
- `git rev-parse HEAD` before/after the focused checks: `bc172b0c8dc1a6c503ad042d9ac2921afab5c3ad`.

The existing focused tests pass because none exercise saved conversation report reconstruction. The reproduction establishes host reconstruction behavior; it is not a native/browser save-restore acceptance claim.

No additional confident defects found in actor capture, original wire intent/version binding, single-use tokens, stale engine revalidation, advisory inspect nonexecution, reset/late-reply fencing, concurrent archive ordering, actor drafts, or normal-map no-movement wiring within the reviewed scope.

## Declined to judge

- Compact Menu/History implementation and its integration, which belong to the separate active worker.
- Full-win guidance and its upcoming host integration; missing future guide stages are not findings for this slice.
- Untracked e2e changes, later commits, full-suite/typecheck/build results supplied by the coordinator, paid live capability, native persistence acceptance, laptop/novice/visual acceptance, and repository publication.
- Unrelated unchanged engine/replay/security behavior and broad optional test expansion.

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | pass |
| HIGH | 1 | warn |
| MEDIUM | 0 | info |
| LOW | 0 | note |

Verdict: **WARNING — resolve the HIGH report-history defect before release.** The project's report/evidence correctness gate remains blocked for saved-run resume/replay until fixed and verified.

Produced commits: none. Changed files: this review and the uniquely assigned `.local/conv-01-host-code/` evidence artifacts only. No nested agents were launched.
