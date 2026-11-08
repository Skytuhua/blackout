# CONV-POLICY handoff (corrected after independent review)

## Custody and task ledger

- Prepared isolated worktree: `C:/Users/user/.t3/worktrees/Blackout/t3-f66d85ae`, branch `t3/conversation-policy`.
- Verified clean initial HEAD before editing: `fc789644e162ca05a416aacc8b4fc402738fb036` (the assigned pinned base).
- Ordered implementation commit: `d88c6f1f431426a3ea749a05c698af13771a9cd8` — policy and behavioral tests. The subsequent handoff-only commit is identified by full SHA in the final delivery; its own hash cannot be embedded in its contents.
- Only new deliverable paths: `src/llm/conversation-policy.ts`, `tests/llm/conversation-policy.test.ts`, this handoff. No existing source/configuration/dependency/art files changed; no integration hooks installed.
- Implementation Git blob: `88daf610fa6f957d04a652f62e3f731d7b8f8046`. Test Git blob: `dcf5e5a7d81a7e97ea8b429785146d64aa455e12`.
- Read AGENTS, master plan sections 5/6/10 and observation boundaries, conversation game/integration plans, existing context/validation/interaction/tools, provider adapter/gateway/client, procedures, shared DTOs/schemas, engine task/evidence production, and relevant LLM tests.
- Applied Superpowers TDD and Ponytail. Added tests first with minimal pass-through stubs; observed behavioral RED; implemented the standalone policy; checked real offline engine/report and tool paths; performed local self-inspection. Coordinator owns fresh independent review.
- No paid calls, provider probes, credential access, dependency installation, pushes, PRs, watches, nested agents, branch switching, worktree setup or self-archiving.

## Frozen API and behavior

```ts
projectCoworkerContext(start: GatewayStart): GatewayStart
conciseCoworkerResponse(start: GatewayStart, response: AgentResponse): AgentResponse | null
coworkerReplyVocabulary(start: GatewayStart): { inference: string[]; uncertainty: string[] }
```

Imports the existing shared DTOs and validators; no copied shared interfaces or new host contracts. The coordinator explicitly approved the third export before the parent correction. Use its choices in the advisory provider's strict response enums as well as the final gate; duplicating or guessing private accepted wording is not a viable integration.

Absent `interactionMode` preserves the original value, including absent property, full procedure/affordance content, and existing `validateResponse` acceptance behavior. Projection returns a deep clone. Advisory projection changes only procedures and affordances: all observations, reports/messages, task records, topology, times, identities, viewHash, promptVersion, and the exact observed version vector remain unchanged. It does not invent observations, update versions or remove delivered reports.

Advisory policy narrows to enabled known-target, own-role work. Generic help or ambiguous wording exposes no proposal affordances; supported explicit work requests can offer work for later confirmation. Busy actors retain only an existing permitted own-task cancellation affordance. Cooling repair requires an actual delivered system report referencing current, non-unknown `prerequisite_ready=false` evidence; completed work or player claims alone do not unlock it. Power checks remain power checks; a delivered inspection plus an already enabled reset affordance can expose an electrical reset. Inspection remains available after diagnosis. Manual movement and the redundant cooling restart are excluded. IT keeps all engine-permitted own-role workload operations, including a requested healthy-practice pause or adjustment of already running jobs. Procedure excerpts do not publish the future mission sequence or a magic ceiling, and never assert cooling is running from missing observations. No tutorial phase replaces engine command validation.

Only the declared, permitted `hot-restart-v1` procedure is exposed, with a canonical role/stage excerpt. Its ID and the existing allowedProcedureIds are preserved. Unknown procedure bodies are omitted conservatively. Reprojection ignores supplied procedure prose, so injecting or reusing the original full walkthrough cannot restore it. `executeToolIntent(read_procedure)` reads the projected excerpt using its existing machinery.

The final gate:

- Reuses schema/identity/evidence/action validation, then checks the projected role/stage affordances and at most one proposal. Physical work requires this actor as technician; cancellation requires the exact active own task; task/ceiling/destination arguments cannot be smuggled into unrelated actions.
- Requires real delivered, non-unknown observations. Unknown IDs, future receipts and ambiguous duplicate IDs reject. Superseded same-source observations require the exact historical qualification below; they remain present, with original metadata. No guessed freshness expiry or ETA is added.
- Accepts a shared vocabulary of short natural English phrases, exported for provider enums, with evidence predicates for report availability and busy assignment, or explicit confirmation language for one valid requested proposal. It never changes state or treats proposal acceptance as player authorization.
- Counts prose plus selected fact values and a 32-character per-selector presentation reserve against 260 characters. Oversized output or long report values reject as a whole; nothing is sliced, rewritten, or silently dropped.
- Returns the **same response object** on acceptance, preserving every fact, proposal, identity and source mode. Malformed, unsupported, ungrounded, multi-step, clock/jargon, heading-formatted or overlong advisory narrative returns `null`. A scripted/recorded AgentResponse is rejected under the existing live-response validator; the leaf never changes its mode to live. Gateway fallbacks remain a separate root-owned union variant.

Useful accepted examples (with matching current evidence/affordances):

| Purpose | inference | Other required data |
|---|---|---|
| Clarification | `Which equipment should I check?` | No proposals |
| Evidence nudge | `Please check the latest readings.` | Any selected facts must be permitted |
| Local cooling nudge | `A cooling inspection would help.` | Current cooling inspection affordance |
| Inspection proposal | `I can inspect that equipment if you confirm.` | One valid own-worker `inspect` proposal |
| Repair proposal | `I can repair the controls if you confirm.` | Delivered diagnosis and current repair affordance |
| Workload proposal | `I can pause background jobs if you confirm.` | One current permitted own-role pause proposal |
| Generic work confirmation | `Please confirm the proposed work.` | One valid own-role proposal |
| Delivered report | `The inspection report is available.` | A fact from delivered inspection/prerequisite evidence |
| Historical facts | `Please check the latest readings.` | uncertainty: `These are earlier readings; please check the latest report.` |

Other accepted work phrases are declared together in `workText`; accepted uncertainty phrases are declared in `uncertainties`. `coworkerReplyVocabulary` returns fresh arrays for the supplied advisory snapshot, including applicable work choices only for a supported explicit request. Some choices require matching facts or a proposal in the final response; the gate validates those associations. Novel model prose still conservatively rejects, even if a human would consider it safe, but generation must now use the same supplied enums. This is deliberate rather than a claim of general natural-language understanding.

## Tiny root hooks and fallback obligations

1. Project the actual advisory start **before** sending it or creating its tool context. Generic help then has no proposal affordances on the original wire, so a prior `propose_action` tool cannot retain a token before final text is rejected. Keep that projected procedure body in the bounded interaction on both client and gateway so `validResult` sees the exact text returned by `read_procedure`. Merely projecting provider prose while leaving the tool context on the full original procedure reopens the disclosure.
2. Apply affordance projection whenever refreshing a continuation view/tool context; never restore full original procedure text. The existing gateway compares procedure results against its retained start: keep the per-interaction procedure text synchronized/frozen on both sides. A fresh interaction can obtain a new stage excerpt. Supply `coworkerReplyVocabulary` choices to both strict provider inference/uncertainty enums, only in advisory mode. Empty arrays mean an unsupported start, not a permissive schema. Legacy provider schemas remain unchanged. This leaf installs no continuation, provider or gateway hooks.
3. After retaining the exact raw reply/wire/provider receipts, and before presenting a final reply or registering its final proposals, call the gate using the final **originating wire** identity/time/version snapshot, not the latest host view or selected tab:

```ts
const policyStart = projectCoworkerContext(originalStart);
// ... existing request, tool loop and exact raw capture ...
const originatingStart = { ...policyStart, view: originatingWire.view };
const accepted = conciseCoworkerResponse(originatingStart, rawFinal.response);
// accepted === rawFinal.response, or null. No changed intent/version snapshot.
```

The input snapshot must contain the actor's actual permitted evidence. Target scoping that removed cooling/workload readings or a report can cause a conservative refusal; do not replace missing evidence with player assertions. Older facts no longer supplied to the gate also reject; keep their real report/transcript available separately. Preserve original exact raw capture and prior valid tool proposals/tokens, even when later narrative is rejected. Do not register proposals from a rejected final response or refresh an existing token's authority.

4. For every `null` (including malformed shape, unavailable evidence, novel wording or excess length), root supplies a bounded authored fallback with an honest **scripted fallback** label and a known policy-rejection reason. Example in-world text: `I need clearer evidence. Please check the latest report or choose a task for me.` Do not claim a provider outage merely because this gate rejected its response. Preserve actual delivered reports and original evidence/metadata outside the rejected narration; do not replace or hide them. Retain original provider/wire provenance in diagnostics/records.
5. Render accepted ordinary prose complete inline, without diagnostic sections or a reader button. Render selected factual values using their original evidence/provenance. Actual long reports can still use the existing lossless report route. The 260-character estimate is not a DOM measurement or a guarantee at enlarged text; root owns layout and complete-inline acceptance.

Help never offers work proposals. A supported explicit work request can receive one offer requiring the existing confirmation/validator. The small English request-form guard distinguishes direct or polite work requests from help, walkthroughs and negative instructions; it neither parses ActionIntent arguments nor authorizes execution. Unrecognized or ambiguous forms keep clarification/read tools and suggested orders available. No optional `taskStatusText` export was added: a PublicTask alone cannot distinguish completed-but-report-pending from delivered. Root must combine exact task status with delivered report identity; walking progress 0 must never be presented as 0 percent of a whole assignment or an ETA.

## Structural and semantic limits

Structural guarantees here are explicit projection, a shared finite vocabulary, exact selector and action validation, length limits, role/evidence checks and unchanged accepted values. This is stronger than asking a model nicely or blacklisting a few spoiler words. It does **not** prove perfect semantic spoiler prevention, general intent recognition, truth of arbitrary prose, or correctness of data injected into an otherwise trusted actor view. The English request-form guard is deliberately bounded; unusual, multilingual or ambiguous work wording may need clarification or a suggested order. Root's guidance, report presentation and scoped observation production remain part of the boundary. Broadening the vocabulary or supporting other procedures needs reviewed evidence predicates and regressions.

No physical safety thresholds or gameplay rules were changed. An enabled affordance and a disclosure stage do not replace command-time engine validation, stale/version checks, cancellation/reset fences or user confirmation. Snapshot evidence has no universal age limit in GatewayStart; this leaf rejects future/unknown/superseded-unqualified records and preserves timestamps, while engine-specific freshness remains engine-owned.

## Observed verification and reproduction

The prepared worktree had no dependency installation. `npm test -- tests/llm/conversation-policy.test.ts` failed before tests with `vitest is not recognized`. Directly invoking the coordinator's runner first failed resolving vitest config, then zod. These are environment failures, **not RED**. No install, dependency version change, config edit or junction was used. Verification read the existing committed dependency installation at `C:/Users/user/Documents/Blackout/node_modules`, using programmatic runner aliases and compiler resolution fallback. Vitest generated ignored `.vite` and `.vitest-cache` directories under this worktree's new `node_modules` directory. Read-only verification confirmed these are the only entries and contain no reparse points. Automatic approval review rejected both guarded and literal-path PowerShell cache removal with `blocked by policy`; caches remain. No deletion workaround was attempted after the literal-path rejection.

| Check | Observed result |
|---|---|
| Behavioral RED against pass-through stubs | 30 tests executed: **20 failed, 10 passed**, exit 1. Failures included unsupported controller diagnosis, full procedure exposure, future repair affordance, missing-worker/busy/multiple proposals, unknown-quality evidence and overlong narration. No missing-import-only RED claim. |
| Initial GREEN | **30/30**, exit 0 |
| Final focused policy suite at implementation commit | **34/34**, exit 0 |
| Final existing LLM suite including policy | **12 files, 114/114**, exit 0 |
| Entire unit suite on working implementation candidate | **46 files, 316/316**, exit 0; before the final equivalent max-reduction refactor and commit. Final focused/LLM checks were rerun after that refactor. |
| Policy/test TypeScript roots with their imported dependencies | **0 diagnostics**, 2 root files |
| Full project TypeScript | **1 diagnostic**, `tests/e2e/replay-report.spec.ts:16:23`, TS2589: Type instantiation is excessively deep and possibly infinite. Exit 1. |
| Pinned baseline check excluding both new files | The **same TS2589**, 142 root files; demonstrates the observed existing error independently of this leaf. No out-of-scope fix. |
| Git diff checks | `git diff --cached --check` and `git diff fc789644e162ca05a416aacc8b4fc402738fb036 HEAD --check`: exit 0 |

Exact test runner used from this isolated worktree (PowerShell):

```powershell
@'
import { startVitest } from 'file:///C:/Users/user/Documents/Blackout/node_modules/vitest/dist/node.js';
const modules = 'C:/Users/user/Documents/Blackout/node_modules/';
const ctx = await startVitest('test', ['tests/llm'], { config: 'C:/Users/user/Documents/Blackout/vitest.config.ts', watch: false }, { resolve: { alias: { zod: modules + 'zod', openai: modules + 'openai' } } });
await ctx?.close();
'@ | node --input-type=module
```

Focused filter: `['tests/llm/conversation-policy.test.ts']`. Initial behavioral RED and initial GREEN used `config: false, watch: false, maxWorkers: 2` with the zod alias. Full suite used `[]` with the committed config and additionally aliases `react`, `react-dom`, `phaser`, `lucide-react` to the same installation. Ordinary corresponding commands on a checkout with the committed dependencies available are `npm test -- tests/llm/conversation-policy.test.ts`, `npm run test:llm`, `npm test`.

Exact final compiler command used (PowerShell), preserving committed compiler options:

```powershell
@'
import ts from 'file:///C:/Users/user/Documents/Blackout/node_modules/typescript/lib/typescript.js';
const shared = 'C:/Users/user/Documents/Blackout/__policy_resolution__.ts';
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
function check(files, label) {
  const host = ts.createCompilerHost(parsed.options);
  host.resolveModuleNames = (names, containingFile) => names.map(name => ts.resolveModuleName(name, containingFile, parsed.options, ts.sys).resolvedModule ?? ts.resolveModuleName(name, shared, parsed.options, ts.sys).resolvedModule);
  host.resolveTypeReferenceDirectives = (names, containingFile) => names.map(ref => { const name = typeof ref === 'string' ? ref : ref.fileName; return ts.resolveTypeReferenceDirective(name, containingFile, parsed.options, ts.sys).resolvedTypeReferenceDirective ?? ts.resolveTypeReferenceDirective(name, shared, parsed.options, ts.sys).resolvedTypeReferenceDirective; });
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(ts.createProgram(files, parsed.options, host))];
  console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics.slice(0, 10), { getCanonicalFileName: f => f, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => '\n' }));
  console.log(`${label}: ${diagnostics.length} diagnostics; ${files.length} root files`);
  return diagnostics;
}
check(parsed.fileNames.filter(f => f.endsWith('/conversation-policy.ts') || f.endsWith('/conversation-policy.test.ts')), 'Policy and tests with imported dependencies');
const diagnostics = check(parsed.fileNames, 'Full project');
process.exitCode = diagnostics.length ? 1 : 0;
'@ | node --input-type=module
```

The baseline compiler check used only `parsed.fileNames.filter(f => !f.endsWith('/conversation-policy.ts') && !f.endsWith('/conversation-policy.test.ts'))` as roots with the same host/options. The virtual `__policy_resolution__.ts` path is only a module-resolution anchor; no such file was created. An earlier attempted baseUrl/paths workaround produced 1439 resolution/cascading diagnostics; it was replaced by the host fallback above and is not a code result.

The tests cover paraphrased/adversarial help, procedure injection, nonexistent prior evidence, unobserved cause, sequence/jargon, own-role versus cross-worker work, stale action clocks/unknown targets/missing versions, busy cancellation, unchanged valid inspection/repair/workload proposals, exact delivered reports, unknown/future/historical evidence, immutable identity/version projection, absent-mode compatibility, excessive/malformed/source-mode responses, offline procedure reads and an actual delayed engine inspection report. Synthetic transport only; no live/browser/native/full-mission/user visual acceptance is claimed. No build or e2e browser run was performed for this unhooked leaf.

## Parent correction after independent review

Fresh read-only review of `9647895` independently passed 34 tests but requested changes on three HIGH findings: generic-help proposal offers, tutorial-stage rejection of legal workload orders (proven against the real healthy-practice engine), and private vocabulary unavailable to generation. The coordinator approved shared vocabulary export, request-kind separation and retaining engine-enabled own-role orders.

The parent added seven regression cases first: five help/non-order cases, a real-engine healthy pause/workload adjustment, and usable shared provider vocabulary. Help and vocabulary cases failed behaviorally on the old implementation/stub. The initial real-engine test had swapped initialize arguments; after correcting that test setup, it independently failed because the legal response returned null. All seven then passed after the fixes. Two additional walkthrough paraphrases containing `take me through` failed before the request guard correction and passed afterward. Two diagnosed/busy help reprojection cases then failed because narrowed affordances changed procedure bodies on a second client/gateway projection; procedure selection now uses unchanged permitted reports and task state, and both pass. The corrected focused suite is 45 tests. Earlier tests that assumed generic help exposed proposals or IT followed a fixed tutorial sequence were updated to the explicit replacement requirements; actual evidence, legacy and identity checks were retained.

Parent verification of the corrected leaf: 45 focused tests and all 327 unit tests across 46 files passed using the runner/dependency aliases documented above. The policy and test compiler roots have zero diagnostics with the committed compiler options and documented module-resolution host. Diff whitespace checks passed. No build/browser/live claim is implied; the unchanged pinned full-project TS2589 remains separate from the leaf and is owned by the coordinator's later branch.

Initial worker verification below remains separate from parent correction verification and fresh review. No root hooks, paid calls or browser/live proof are included in this leaf.

## Remaining gates

Coordinator integration, fresh independent review, root fallback/rendering/token hooks, integrated production/browser/full-mission checks, and the pre-existing full-project TS2589 remain outstanding. Parent must receive and acknowledge final delivery, confirm completed/result_available/no pending children with task_status, then recoverably archive this child using the returned childThreadId. This child does not archive itself.
