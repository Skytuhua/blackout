# Replay and native storage review

Independent read-only review of `2cf2c35..6d2adce` passed 14 focused replay tests and typecheck, plus 30 generated mixed histories and eight additional boundary histories. The reviewer checked authoritative canonical coverage, rejected-attempt audit exclusion, task cancellation mapping, earlier-cap removal and external schedule identity, terminal physical continuation, equal-horizon unsupported prefixes, protection metrics, conservation and IndexedDB validation before atomic writes. It did not independently rerun the author's headed browser check.

One HIGH defect blocked integration: replay treated an ignored non-cancel `args.taskId` as a required task reference. The engine legitimately accepts that argument on remote workload actions, so replay could reject a valid history or invent an unsupported branch.

Two coordinator cases ran RED: an unmapped ignored task ID, and ignored arguments coinciding with a real task ID after an earlier rejected attempt. Reissue now maps task references only for `cancel_task`. After that first fix, the second case still failed canonical comparison; canonicalization now preserves literal action arguments and renames only the actual cancellation reference. Existing cancellation and full-state checks remain passing. The focused suite has 16 tests.

The native storage harness now writes repeat-run evidence under ignored `.local/replay-01/`, preserving the committed author receipt. Local headed verification remains distinct from CI's explicitly headless check; both use disposable profiles, an owned loopback listener and zero provider calls. Application save/resume/replay/debrief integration remains coordinator work.

The frozen engine RunRecord has no independent tool-result slot. An additive versioned host transcript is planned; this library does not smuggle tool JSON into dialogue or claim model receipt persistence. Engine/checkpoint hashes remain independent of transport provenance.

Native reviewers supplied no T3 task/thread IDs for status-backed archival; results were received and retained. The completed implementation task was acknowledged, confirmed completed/result_available/no pending children, then recoverably archived.

Final coordinator checks: standard `npm run verify` passed typecheck, 160 unit/contract tests, build and eight production Chromium cases. Both headed and headless native IndexedDB restart/resume checks passed with matching continued hash `replay-v1-723ff3a7e236d64f`, zero page errors and zero provider calls. Hosted checks and application integration remain separate gates.
