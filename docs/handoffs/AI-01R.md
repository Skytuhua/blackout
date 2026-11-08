# AI-01R review-correction handoff

Status: implementation complete, ready for parent review. This is correction work for PR5; nothing was pushed or merged. Independent review and integration remain with the parent.

## Custody and scope

- Packet: `C:/Users/user/Documents/Blackout/.local/tasks/AI-01R.md`.
- Verified clean pinned base: `bd466277e76eb903de3a639e028183f74bcf1833`.
- Worktree: `C:/Users/user/.t3/worktrees/Blackout/t3-c8d4d4d4`; branch `t3/ai-interaction-expiry`.
- Implementation commit: `e0c8ceddd33c2c7a19200bed75ab8a4454fb83ff`.
- This handoff is a separate commit; obtain its hash with `git log -1 --format=%H -- docs/handoffs/AI-01R.md` (also returned to the parent).
- Read the task packet, AGENTS.md, master plan, AI-01 specification and handoff, and actual gateway/client/tools/adapter/accounting/contracts/tests. Applied Ponytail, Superpowers TDD/verification, and security-review guidance. No nested agents or independent review delegation: the packet explicitly assigns review to the parent and forbids nested agents.
- Wrote only the files listed below. Root/shared/config/UI/simulation/content, dependency declarations and lockfile are unchanged. No credential files were read, paid transport invoked, push/merge performed, or child archived/canceled.

## Produced files

| File | Change |
| --- | --- |
| `server/index.ts` | Supplies bounded remaining interaction lifetime through `X-Blackout-Deadline-Ms`. |
| `server/llm/gateway.ts` | Exposes remaining lifetime, adds fresh continuation context, evicts oldest eligible terminal/expired entries under capacity pressure. |
| `server/llm/adapter.ts` | Appends the fresh permitted view after the exact provider output and matching function result; replaces older continuation view messages to bound history. |
| `src/llm/lifecycle.ts` | Weakly held lifecycle shared by the original start and returned tool intentions; local monotonic deadline, terminal closure, caller cancellation. |
| `src/llm/client.ts` | Shares lifetime through start/continue/tools, conservatively honors server header, never renews deadline, closes terminal/failed interactions, bounds retained contexts. |
| `src/llm/tools.ts` | Checks shared expiry before work, after asynchronous observation and digest, immediately before command dispatch, and after the receipt. |
| `src/llm/validation.ts` | Resolves comparison facts exclusively from the complete pair or unsupported valid-prefix pair; ambiguous run selectors fail closed. |
| `tests/llm/corrections.test.ts` | Nine correction/edge-case regressions, including actual loopback HTTP/client/tools reproductions. |
| `tests/llm/gateway.test.ts` | Adjusts history positions for the appended view while still asserting exact output items/call IDs and final third call. |
| `docs/handoffs/AI-01R.md` | This custody and verification record. |

## Four accepted findings: actual RED and GREEN

All behavioral RED runs preceded implementation. On 2026-11-07, `npm run test:llm -- --reporter=verbose` first stopped because Vitest was absent in this prepared worktree. This was an environment failure, not RED. `npm ci --ignore-scripts` then installed 100 packages from the committed lockfile (audit: zero vulnerabilities); package/lock bytes were unchanged.

Two initial test-envelope mistakes were corrected before counting behavioral RED: the unsupported fixture inherited a complete-only property, and a continuation incorrectly spread tool-result fields into its top-level envelope. After correction, the base implementation produced the following observed failures. `npx vitest run tests/llm/corrections.test.ts --reporter=verbose` at 18:27:45 local runner time exited 1 with all four correction tests failing; the existing 22 focused tests had passed in the preceding combined run.

| Finding | Observed RED at pinned implementation | Observed GREEN |
| --- | --- | --- |
| Shared end-to-end expiry | Real HTTP server returned a valid inspection; asynchronous observation outlasted the server's 80ms interaction lifetime. Command count was **1**, expected **0**, with no caller signal. | Both asynchronous observation and delayed real SHA-256 digest variants dispatch **0** commands and reject; continuation returns `canceled_or_expired`. The timing margin uses 80ms/120ms instead of 15ms/30ms to reduce scheduler noise. |
| Equal-horizon unsupported comparison facts | Schema-valid unsupported comparison with supported/prefix horizon 50 and original horizon 400 rendered `[400, 64000, 31.2, 50, 456, 27]`, expected `[50, 123, 28, 50, 456, 27]`. | Horizon, delivered service and temperature selectors for both branches resolve from the prefix pair. Complete comparisons also use their pair; ordinary no-comparison horizon remains 400. |
| Fresh continuation context | After a valid procedure result and a view change from time75 to76, the final provider-history item was still the function result, with no fresh view content. Accessing that absent content failed JSON parsing; exact earlier provider items/result call ID had matched. | Next provider input retains exact reasoning/function items and `exact-call` output, then supplies time76/new hash/version2/empty affordances. Existing two-continuation/three-call regression passes with exact call IDs. |
| Bounded retention | First 128 synthetic completed interactions succeeded; the 129th returned fallback instead of final. | 129 completed interactions across distinct runs succeed, exact immediate duplicates consume no provider calls, and a separate test preserves/resumes an active facilities tool flow while 129 other runs complete. |

Additional lifecycle RED/GREEN during implementation:

- `npx vitest run tests/llm/corrections.test.ts -t 'failed continuation'`: RED, previously delivered intention still returned `completed` after continuation network failure (expected `rejected`). Closing the shared lifecycle on every terminal/error path fixed it.
- `npx vitest run tests/llm/corrections.test.ts -t 'continuation retains'`: deadline variant passed; new continuation-signal abort variant failed (`observations`, expected `canceled_or_expired`). Retaining/combining caller signals in the lifecycle fixed it. Both variants now pass; a later header allowing 20 seconds cannot extend the original 100ms local deadline.
- During GREEN work, appending every full snapshot without removing superseded continuation snapshots reached the existing input cap on call three. Keeping only the latest continuation snapshot restored that test without changing the cap or deleting provider items/results. Existing history assertions were updated for the intentionally appended view position.

## Final observed checks

| Command | Actual result |
| --- | --- |
| `npm run test:llm` | Exit0; 7 files, **31/31** tests passed (original22 plus9). |
| `npm test` | Exit0; 16 files, **86/86** tests passed; final run at18:32:57. |
| `npm run typecheck` | Exit0; rerun alongside the final unit suite. |
| `npm run build` | Exit0; Vite browser bundle and esbuild local server produced. Existing Zod annotation and large browser-chunk warnings remain. |
| Built-server scripted HTTP smoke | Exit0; imported `dist-server/index.js`, started an ephemeral loopback listener with fixed permitted Host, checked health mode, static HTML and frozen-v1 start envelope returning scripted fallback; server closed afterward. Zero provider transport. |
| `git diff --check`, `git diff --cached --check` | Exit0 before implementation commit. |

Offline reproduction: `npm ci --ignore-scripts` if dependencies are absent, then `npm run test:llm`. For only the new cases: `npx vitest run tests/llm/corrections.test.ts --reporter=verbose`. All provider replies are synthetic, all budget files are temporary, and HTTP tests use the actual guarded local server with a Node HTTP bridge replacing only browser-relative fetch resolution. The simulated worker boundary in these regressions is a scoped fixture/command spy, not the native simulation worker.

## Contracts, accounting and limits

- Domain JSON schemas/envelopes remain v1, with no added fields. The transport-only header is an integer remaining lifetime in milliseconds, bounded0..20000. Clients clamp to the earlier local deadline and compute header expiry from request-send time, deliberately subtracting transport latency. Missing headers retain the local18s/20s bound; malformed/out-of-bound headers yield labeled fallback.
- Continue with the original start identity and execute the returned intention through the client/tool API in the same JS realm. Lifecycle bindings are local weak references, not serialized domain data; keep the original start/returned intention objects as in the AI-01 integration recipe. Cloning an intention still uses the original start's lifecycle. Cross-realm execution would require an explicit local lifecycle bridge and is not implemented.
- Caller signals remain additional cancellation sources; omission cannot bypass expiry. A continuation may supply another signal; both original and new signals remain authoritative. Tools use the existing action validator, observed versions and hashed idempotency key on the same command path.
- Server interaction map stays at most128 entries. At pressure, the oldest eligible nonbusy terminal/canceled/expired entry is removed; active unexpired pending tool flows are preserved. Duplicate receipts remain available until their entry is evicted, providing a bounded recent-entry window rather than indefinite tombstones. Client retention is likewise bounded and does not evict active lifecycles. Weak maps introduce no unbounded strong tombstone map.
- Persistent accounting and reservation code is unchanged. Eviction does not reset mission quotas, local allowance, command idempotency, or usage records. Existing budget/restart/quota tests pass. Provider slot acquisition/release code is unchanged: cancellation/timeout does not release the global slot before actual transport settlement, and unknown usage retains its conservative reservation.
- Every new view remains in the full serialized request size estimate, alongside history, instructions and schemas. Oversized inputs still fail before reservation/transport; no retries or extra provider calls were introduced.

## Remaining acceptance and limitations

No blockers to parent review. Parent must inspect/integrate these commits and perform independent review; this author does not approve its own work. No new scenario, UI feature, provenance endpoint, model capability check, real engine tool round trip, paid call, live latency/quality measurement, browser/native visual acceptance, demo-laptop rehearsal, or release is claimed. Playwright was not rerun for this correction; the packet's focused tests, full unit suite, typecheck, build and scripted HTTP smoke were run. Build warnings above are unchanged and outside this ownership.

Parent owns recoverable archival after receiving/acknowledging this result and confirming task status `completed`, work state `result_available`, and no pending child runs. No cleanup action was taken by this implementation child.
