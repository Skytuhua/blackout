# AI-01R independent correction review

Reviewed 2026-11-07. Range: `bd466277e76eb903de3a639e028183f74bcf1833..b960335634816a040864aa4d5701c2f8553e4b4a`; observed HEAD is exactly the latter. PR: https://github.com/Skytuhua/blackout/pull/5 (source review only; no remote PR operation).

Read AGENTS.md, master plan, AI-01 spec/handoff, AI-01R handoff and original local task packet, correction diff, and relevant gateway/adapter/client/tools/validation/accounting/worker/schema/tests. Source remained immutable. No commit, branch switch, push, merge, credentials, paid request, watch or child agent. This report is the only intentional repository edit.

## Verdicts

1. **Original four findings: CLOSED for their specified reproductions**, within the documented same-realm object lifecycle. Expired async tools no longer dispatch; comparison facts use the equal-horizon pair; continuation supplies the latest view; bounded retention permits new interactions while preserving active flows and recent duplicate responses.
2. **Code/security quality: REQUEST CHANGES**, for the medium cancellation objection below. No high/critical defect found in this correction range. This is a remaining gap in a touched lifecycle invariant, not a claim that the original four fixes failed or that this abort-forwarding behavior first appeared in the correction.

## Finding R1 — MEDIUM / P2: retained abort signal does not cancel an in-flight continuation

**Location:** `src/llm/client.ts:9`, `:13`, `:17`, `:38`.

**Invariant:** the original interaction cancellation source remains authoritative across continuation; reset/abort should close the originating request. The new shared lifecycle combines prior and new signals, but only uses that combined signal for before/after checks. Fetch, the `/cancel` listener, listener cleanup and catch classification still use the current optional `signal` argument.

**Reproduction observed with synthetic fetch, no source edit:** start with controller A, receive/execute a valid read tool, then call `continueInteraction(continuation)` without repeating A. Hold its fetch pending and abort A. The continuation fetch received `signal: undefined`, zero cancel requests were sent, and the promise remained pending until the synthetic response was explicitly released. Only then did it return fallback. Independently repeated with continuation controller B: B remained un-aborted, zero cancel requests, and promise still pending after A aborted. Both variants failed the cancellation assertion with filesystem transform caching disabled.

**Impact:** cancellation is enforced against late results/tools, but not against the current HTTP/provider operation. Reset can leave the client waiting and the provider working until normal completion/deadline, occupying the global provider slot and potentially spending more of the reserved allowance. This is not a late-command or quota bypass. The server must still hold its slot until actual transport settlement after a correctly delivered cancellation.

**Minimal fix:** after combining lifecycle signals, capture the effective signal and use it consistently for fetch, cancel-listener registration/removal and cancellation classification. Keep the existing post-await checks and conservative reservation/global-slot rules. Add regressions aborting A while a continuation is pending, both with no new signal and with a distinct live B; require prompt cancellation/fallback and no accepted late tools.

Essential reproduction body, suitable for the existing corrections test fixtures (executed by appending in memory through a Vite transform):

```ts
const input = { ...start, requestId: 'review-abort-gap' };
const controller = new AbortController();
const intent = {
  runId: input.runId, requestId: input.requestId, actorId: input.actorId,
  interactionId: 'review', callId: 'one', tool: 'read_observations',
  targetId: 'cooling-1', action: null,
};
vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
  kind: 'tool_request', runId: input.runId, requestId: input.requestId,
  actorId: input.actorId, interactionId: intent.interactionId, intent,
})));
const first = await startInteraction(input, controller.signal);
const result = await executeToolIntent(first.intent, { start: input });
let observedSignal, release;
let cancellations = 0;
vi.stubGlobal('fetch', (url, init) => {
  if (url.endsWith('/cancel')) {
    cancellations++; return Promise.resolve(new Response('{}'));
  }
  observedSignal = init.signal;
  return new Promise(resolve => { release = resolve; });
});
const pending = continueInteraction({
  kind: 'continue', runId: input.runId, requestId: input.requestId,
  actorId: input.actorId, interactionId: intent.interactionId,
  expectedCallId: intent.callId, view: input.view, result,
});
controller.abort();
const actuallyCanceled = observedSignal?.aborted || cancellations > 0;
release(new Response(JSON.stringify({
  kind: 'tool_request', runId: input.runId, requestId: input.requestId,
  actorId: input.actorId, interactionId: intent.interactionId,
  intent: { ...intent, callId: 'two' },
})));
expect((await pending).kind).toBe('fallback'); // passes
expect(actuallyCanceled).toBe(true); // FAILS: false
```

## Original closure and touched invariant assessment

| Item | Independent assessment |
| --- | --- |
| Shared expiry | Real loopback HTTP/client/tool regressions passed for delayed observation and SHA-256. Server remaining header is floored/clamped to 0..20000; client anchors it to monotonic request-send time and takes the minimum, conservatively subtracting transit time. JSON parsing and every async tool boundary are checked; continuation cannot renew the deadline. |
| Comparison facts | Unsupported selects only `validPrefix.baseline/alternative`; complete selects its pair; no comparison selects the ordinary ledger. Six horizon/metric values passed for both comparison variants, ordinary horizon remained 400. Multiple matching run IDs fail closed. Shared schema enforces the pair's common supported horizon. |
| Fresh model context | Exact provider output and matching function result precede the fresh scoped view. Both the two-call correction and existing three-call/two-continuation regression passed. Older continuation view messages are removed, preserving provider items/results. Full serialized parameters, including view/history/schema, still face the existing input cap before reservation/transport. |
| Retention | 129 completed synthetic interactions succeeded; immediate exact duplicates caused no extra transport. Active facilities tool flow survived pressure and resumed. Eviction removes oldest eligible nonbusy terminal/canceled/expired entries at capacity, not active unexpired flows. Duplicate receipts have a bounded recent-entry window, not permanent tombstones. |
| Object identity | Original start and returned intention bind to one weak lifecycle. Independently verified cloned intention + original start, and cloned start + original returned intention, still reject after expiry. Cloning both, serialization/cross-realm transfer and recreating an unbound start lose the weak binding; the handoff requires retaining original objects/same realm, so these are documented integration limits, not a supported bypass route. |
| Reset/action authority | Independently verified new-run observation rejects before command dispatch. Observe/command still go through the existing SimulationClient path, target-version checks and stable hashed idempotency key. No new engine mutation authority. Reset recipe still requires aborting old controllers and a new run identity. Abort forwarding during a pending continuation has R1 above. |
| Slot/accounting | Cancellation test retained the global provider slot until abort-ignoring synthetic transport settled. Provider-finally still releases it; late known usage reconciles. Durable unknown reservations, restart/global allowance, 24-call mission ceiling, input bounds and duplicate continuation tests passed. Eviction does not touch Budget or engine idempotency. No new provider retries/calls were added. |

## Checks actually observed

The prepared checkout had no node_modules. `npm run test:llm -- --reporter=verbose` exited 1 because Vitest was unavailable; this was an environment failure, not a failing behavior test. No installation or dependency change was made.

Used the existing installation at `C:/Users/user/Documents/Blackout/node_modules` via the Vitest `startVitest` API and in-memory resolver aliases for `vitest`, `zod`, `openai`. Source root remained this worktree. No config/source files were rewritten. Provider behavior was synthetic throughout; test allowance ledgers use temporary directories as in the existing tests.

- Focused LLM run: **7 files / 31 tests passed**, including the nine committed correction cases and actual loopback HTTP/client/tools paths.
- Additional reviewer-only in-memory tests: **8 passed** (clone-intent expiry, clone-start expiry, delayed JSON expiry, reset observation, transport-latency accounting, three malformed/out-of-bound deadline headers).
- Reviewer-only abort regression R1: **2 variants failed** (omitted and distinct continuation signal), expected cancellation forwarding true, observed false; late result still rejected. No permanent test file was added.
- Full unit run using repository include patterns: **16 files / 86 tests passed**. This is not a browser run.
- `git diff --check bd466277e76eb903de3a639e028183f74bcf1833 b960335634816a040864aa4d5701c2f8553e4b4a`: passed.
- Final `git diff --exit-code`: passed (tracked source unchanged); status lists only this untracked report. Report whitespace check passed, with Git's normal LF-to-CRLF warning.

Full unit runner command (PowerShell here-string piped to `node --input-type=module`):

```js
import { startVitest } from 'file:///C:/Users/user/Documents/Blackout/node_modules/vitest/dist/node.js';
const deps = 'C:/Users/user/Documents/Blackout/node_modules/';
const ctx = await startVitest('test', [], {
  root: process.cwd(), config: false, cache: false, fsModuleCache: false,
  include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], environment: 'node',
  reporters: ['default'],
}, { resolve: { alias: [
  { find: /^vitest$/, replacement: deps + 'vitest/dist/index.js' },
  { find: /^zod$/, replacement: deps + 'zod/index.js' },
  { find: /^openai$/, replacement: deps + 'openai/index.mjs' },
] } });
await ctx?.close();
```

Runner bookkeeping: an exploratory `config:false` full run initially collected the Playwright spec as a Vitest suite: 86 unit tests passed but that extra suite could not resolve Playwright. Explicitly matching repository `vitest.config.ts` include patterns yielded the clean 86/86 run above. An early reviewer-test rerun reused Vitest's filesystem transform cache despite `cache:false`; disabled the separate `fsModuleCache` before the eight additional checks and final full run. These runner failures are not source findings.

## Limits and custody

Did not independently rerun typecheck, production build, foundation Chromium, demo laptop/native/browser acceptance, or real model/worker integration. Parent's reported verification is separate evidence. No paid transport, real account/model capability, complete mission, latency/quality measurement, release approval or broad audit is established. Fix R1 and rerun its focused cancellation regression before clean correction approval.

No commit produced. Parent owns result acknowledgment, completed/result_available/no-pending-children status confirmation and recoverable archival; this reviewer did not self-archive or create children.

## Coordinator disposition of R1

The parent received and acknowledged the independent report. Both retained-signal cancellation variants were added as behavior tests and failed before correction. The client now captures the combined lifecycle signal and uses it consistently for fetch, cancel registration/removal and error classification, retaining the existing post-await expiry checks. Both variants now promptly abort HTTP, send one matching cancel request and return canceled fallback, including when a different continuation signal remains live. The 33 focused gateway tests and typecheck passed after the correction.

The HTTP/tool expiry regression initially exhausted its 80ms setup window under load before receiving a tool intention. Its setup window is now 500ms and intentional delayed work 750ms; it still uses the actual server/client boundary and asserts zero expired command dispatches. This is test timing tolerance, not a production deadline change.

This coordinator correction is verified by its reproductions; the independent review above remains tied to b960335. No new paid, live-worker, complete-mission or release claim is made.
