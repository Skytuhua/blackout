# CONV-LLM handoff

Implemented the advisory coworker boundary and original-wire proposal authorization snapshots. Host integration, saved-record changes, and independent CONV-01 review remain with the coordinator.

## Base and commits

- Pinned base: `9be14e6074634fd7b5294f21d371e3e4b6c0325a`.
- Branch: `t3/advisory-proposal-auth` in the prepared `t3-8342dbbc` worktree. This worker did not switch/reset branches or create another worktree.
- `d31bb2f52adb33aa4cd3fc7cebf4995aac27a018`: advisory propagation, provider allowlist/prompt, server/client mutation guards, initial safety regressions. Sent to the parent immediately after the first coherent milestone with 62 passing LLM tests and passing typecheck; work continued afterward.
- `5d7fac55e0b0a6de088bbebea750a16502ed13cd`: original-wire authorization snapshots, duplicate handling, cancellation/reset/refresh/fallback fixtures, strict schema checks, explicit legacy assertions. Sent to the parent with 75 passing LLM tests and passing typecheck.
- The final documentation-only commit contains this handoff; its SHA is delivered in the final parent message.

## Changed paths

- `server/llm/adapter.ts`
- `server/llm/gateway.ts`
- `src/llm/interaction.ts`
- `src/llm/tools.ts`
- `tests/llm/adapter.test.ts`
- `tests/llm/advisory.test.ts` (new)
- `tests/llm/gateway.test.ts`
- `tests/llm/interaction.test.ts`
- `docs/handoffs/CONV-LLM.md` (new)

No shared, App, persistence, UI, simulation, content, dependency, lockfile, or configuration edits. No parser, paid provider calls, nested workers, PR, or push.

## Contract behavior and host assumptions

`CoworkerRequest.interactionMode: 'advisory'` is copied to the optional frozen `GatewayStart` field. Absence omits the field from serialized legacy wire inputs and retains the existing legacy prompt, tools, inspection dispatch, and recorded accepted acknowledgments. Legacy results return an empty authorization array.

Advisory provider tools exclude `inspect_asset`. `propose_action` includes permitted inspection targets as well as other enabled actions. The prompt requests short complete explanations, explicit proposals for work, and one short clarification without proposals for ambiguous requests. This is prompt configuration, not a free-text parser or measured model-quality result.

The gateway rejects an excluded inspection emitted by an injected provider output. The client executor independently rejects advisory `inspect_asset` before observing or dispatching; its result has reason `advisory_execution_forbidden`, no receipt, and no observations. `propose_action` retains its read/validation path and returns `player_confirmation_required` without calling `simulation.command` or fabricating work/evidence. Existing lifecycle, idempotency, and legacy accepted-ack-before-abort behavior remains in place.

`CoworkerResult.authorizations` is host-only. Every retained authorization contains the original intent plus the complete `observedEntityVersions` vector cloned from that proposal's actual captured post-projection wire input. Final proposals use the final wire. Successful `propose_action` tool proposals are captured before `onTool` or observation/context refresh. The recorder retains exact wire/reply/provider metadata/tool result; private authorization fields never enter that wire or recording.

IDs are deterministic within an originating request: `<requestId>:proposal:<1-based index>`. Duplicate operation/target/argument combinations across tool/final replies collapse to the first snapshot, even if later turns have different simulation times or versions. This deliberately leaves an older token stale rather than refreshing its authority. Different task, technician, or ceiling arguments remain different proposals. Host presentation must consume authorizations by ID and original intent, not by final-response proposal-array index.

Canceled or reset-to-`stale_run` interactions return no execution tokens. A previously validated tool proposal can remain available after a later labeled provider outage, carrying its original versions; the host must still reject stale execution. Host responsibilities remain: register against originating run/actor/request, route late replies to the original conversation, validate retained tokens against recorded originating turns, execute the exact intent only after explicit authorization, revalidate against the engine, prevent duplicate accepted execution, and invalidate on reset/cancel. Selected tabs and refreshed `result.start` must not supply token identity or versions.

## Observed verification

All test transports and credentials in these checks were synthetic. The existing suite also contains headless engine/HTTP fixtures; its passing result is not a demonstrated guided mission or live provider acceptance.

| Exact command | Observed result |
|---|---|
| `npx vitest run tests/llm/advisory.test.ts` | Initial startup failure: worktree lacked dependencies; `vitest/config` could not resolve. No application result established. |
| `New-Item -ItemType Junction -Path 'node_modules' -Target 'C:\Users\user\Documents\Blackout\node_modules'` | Reused the existing installation with a local ignored junction. No package/lock changes. Junction remains for reproduction. |
| `npm run test:llm -- --run tests/llm/advisory.test.ts` | Initial RED: 3 failures, 57 existing tests passed; advisory mode/guard missing. |
| `.\node_modules\.bin\vitest.cmd run tests/llm/advisory.test.ts` | After correcting the test action name to `repair_cooling`, meaningful RED remained: all 3 safety/wire tests failed. |
| `.\node_modules\.bin\vitest.cmd run tests/llm/advisory.test.ts tests/llm/interaction.test.ts tests/llm/tools.test.ts` | GREEN: 3 files, 14 tests passed after client guard/mode propagation. |
| `.\node_modules\.bin\vitest.cmd run tests/llm/adapter.test.ts tests/llm/gateway.test.ts` | RED: 2 new allowlist/gateway guard failures; 13 existing tests passed. |
| `npm run test:llm` | First milestone GREEN: 10 files, 62 tests passed. |
| `npm run typecheck` | First milestone passed. |
| `.\node_modules\.bin\vitest.cmd run tests/llm/advisory.test.ts` | Snapshot RED: 2 failures, 3 passed because authorization arrays were empty. After implementation: 5 passed. After failure-path coverage: 14 passed. |
| `npm run test:llm` | Final implementation GREEN: 10 files, 75 tests passed. |
| `npm run typecheck` | Found one test-helper union annotation error; corrected without changing production behavior. Final rerun passed. |
| `git diff --check` | Passed for both implementation slices. |
| `git diff --check 9be14e6074634fd7b5294f21d371e3e4b6c0325a HEAD` | Passed for the combined implementation. |

Evidence is retained in the tests: `advisory.test.ts` covers zero-command injected legacy tools, exact recording/wire equality, final and tool original vectors after refresh, mutation isolation, duplicate proposals, cancellation/reset, stale proposals, wrong actor/worker, grounded read/question fixtures, clarification fixtures, and outage fallback. `adapter.test.ts` covers advisory/legacy allowlists and recursively checks strict provider JSON schemas at startup. `gateway.test.ts` rejects an excluded advisory tool. Existing `interaction.test.ts` checks exact legacy wires, saved-record validation, and accepted acknowledgment preservation across cancellation, with new absence/empty-authorization assertions.

Offline reproduction: run `npm run test:llm` and `npm run typecheck` with the existing dependency installation. No configured provider, secret, or paid request is needed. No full repository suite, build, browser test, physical device, hosted CI, real provider, guided win, or user/novice acceptance was run by this lease.

## Coordinator follow-up

Read-only source concern sent to the parent: at this base `src/persistence/saved-record.ts:120-140` validates retained `inspect_asset` tool receipts against recorded engine commands but does not prohibit such accepted mutation histories when the start has `interactionMode: 'advisory'`. Reject advisory mutation histories while preserving absence-mode legacy histories. This is a static integration concern, not a persistence fix or independently validated finding from this worker.

Saved host proposal state also needs the coordinator's exact-origin validation across mixed legacy/advisory histories. Do not reconstruct tool tokens from refreshed `result.start`, final proposal-array indexes, or the selected conversation. No persistence files were changed here.

Self-inspected owned diffs and scope only. Independent main-thread CONV-01 review remains pending with the coordinator. No worker-local blocker remains for this lease. The completed task/worktree is retained; this worker did not archive itself. Parent receives and acknowledges the result, checks completed/result_available/no pending child runs, then owns recoverable archiving.
