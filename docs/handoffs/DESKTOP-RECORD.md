# DESKTOP-RECORD handoff

Pinned parent base: `08616001e70c17f8bfdb2ec10cf552125b8e5cb2`.

Implementation commit: `02e66dcb0e404fcfe4182f4ba6e323f20b7ab606` on `t3/host-archive-save-listing`. This handoff is delivered in the following documentation commit; its hash is supplied in the final delivery. No PR or push was requested or performed.

## Ownership and delivered changes

The coordinator explicitly transferred `src/persistence/**`, `tests/replay/**`, and this handoff, then additionally transferred only `src/sim/replay/recorder.ts` and `src/sim/replay/index.ts` for the cursor helper. No nested workers were started. Other worktrees and all shared schemas, App/UI, worker protocol, engine implementation, LLM code, dependencies, lockfiles, and remaining replay files were left alone.

Changed files in the implementation commit:

- `src/persistence/host-archive.ts`
- `src/persistence/runs.ts`
- `src/sim/replay/recorder.ts`
- `src/sim/replay/index.ts`
- `tests/replay/host-archive.test.ts`
- `tests/replay/view-at.test.ts`
- `tests/replay/browser-entry.ts`
- `tests/replay/desktop-record-browser-evidence.json`

`HostArchive` now exposes the exact `constructor(runId, source?)`, `capture(interaction | null)`, `message(message)`, and `build(record)` API. It copies captured wire/provider data and messages, preserves inherited identities, appends source-final-checkpoint lineage, deduplicates identical requests/messages, and rejects conflicting identities. Build merges engine reports with host/source dialogue and validates saved host schema 2 without changing engine/checkpoint schema 1. New observed prompt/model metadata updates provenance; missing metadata retains original/null provenance. An inherited transcript alone does not overwrite original provenance during resume.

`RunStore.exportRun(runId): Promise<string | null>` returns the exact stored string, including whitespace and malformed/unsupported JSON, without invoking deserialization or rewriting storage. `listRuns` independently labels unavailable entries through optional `unavailableReason`, uses bounded primitive scenario/time display metadata or placeholders, and keeps compatible siblings available. `loadRun` retains strict identity/version/content checks. The database version, stores, transaction commit handling, explicit storage failures, and checkpoint-list behavior are unchanged. No migration, automatic deletion, or alternate backend was added.

## Host integration contracts

```ts
const archive = new HostArchive(newRunId, savedSource); // omit source for a fresh mission
archive.capture(result.recording);                     // actual runCoworker wire capture
archive.message(publicMessage);
const saved = archive.build(engineRecord);

// Re-exported by src/sim/replay/index.ts:
replayViewAt(input: RunRecord, runId: string, at: number, actorId = 'player'): KnowledgeView;

// A saved-host record must first be projected to engine schema 1:
const view = replayViewAt(engineRecordOf(saved), freshReplayRunId, cursor, selectedActorId);
```

The cursor helper validates the source, requires a distinct nonempty run ID and integer cursor in `0..finalCheckpoint.simTime`, restores the initial checkpoint internally, reissues accepted commands through the cursor using current actor-visible versions and task-reference mapping, checks status/reason/ETA, then advances to the cursor. It returns only the selected actor's `KnowledgeView`. It neither mutates the source nor calls a provider. Commands at the cursor are included; rejected audit attempts are not reissued. The existing domain clock may advance past a recorded mission ending to a recorded comparison horizon; the terminal mission state and closed tasks remain authoritative. Equal-horizon comparison code was not changed.

The coordinator still owns invoking this helper off the UI thread and all worker protocol/host wrappers. Resume should pair the source archive with restoration of that validated source's exact final checkpoint. Capture completed/canceled interactions before building the corresponding checkpoint record; future messages/interaction endings correctly fail the existing saved-record validator. Practice and older engine/map identities remain strictly rejected for persistence/replay. Checkpoints remain recorder/host internals.

## Observed RED/GREEN and verification

- `npm exec vitest run tests/replay/host-archive.test.ts`: initial **4 failures**, each asserting the missing HostArchive export. Repeated after implementation: **4 passed**. The added source-provenance regression then failed on inherited metadata overwriting original provenance; after correction the final combined command below passed all **8** new tests.
- `node node_modules/vitest/vitest.mjs run tests/replay/view-at.test.ts`: initial **3 failures** on the missing cursor export. The final focused command `node node_modules/vitest/vitest.mjs run tests/replay/host-archive.test.ts tests/replay/view-at.test.ts` passed **8/8** in **1.47s**. It covers exact three-turn post-projection wire/provider data, immutable messages/captures, engine reports, physical replay hash, multigeneration lineage, wrong/conflicting identities, unknown/original provenance, practice/incompatibility, pre/at/post command cursors, move/cancel mapping, source immutability, invalid cursors, and closed/post-terminal horizons.
- `$env:REPLAY_BROWSER_HEADLESS='1'; node tests/replay/browser-check.mjs`: initial **RED** at `listRuns` because the malformed sibling threw `CORRUPT`. Final **GREEN** on Chromium **158.0.8127.18**, fresh temporary persistent profile with actual process close/restart. Seven mixed compatible/incompatible/corrupt siblings were independently listed; strict loading rejected old/content/identity failures; raw malformed JSON and whitespace-bearing old JSON exported exactly; compatible sibling still loaded. No page errors or provider calls. Native restart/resume hashes: initial `replay-v1-afb291c48380a1b6`, continued `replay-v1-8b45ebd5505ec46c`. The committed evidence is `tests/replay/desktop-record-browser-evidence.json`; original generated evidence remains in ignored `.local/replay-01/browser-evidence.json`.
- `npm run test:replay`: **23/23 passed** before the final added provenance regression (the complete suite below includes that regression).
- `npm run typecheck`: **passed**, no diagnostics.
- `npm run build`: **passed** browser and local-server production builds. Existing upstream Zod PURE-annotation warnings remained.
- `npm test`: **215 passed, 1 timeout** in the unchanged five-second `tests/replay/replay.test.ts` case `restores fractional travel, delayed reports, reservations and continued protection exactly`, while build/tests ran concurrently. Its timeout was not relaxed. `npm test -- --maxWorkers=1`: **216/216 passed, 34/34 files**, **37.82s**.
- `git diff --check` and staged whitespace checks: **passed**.

The first new terminal cursor test exceeded Vitest's default five seconds because it repeatedly projected the full growing view while searching for the ending tick. It now stops on the real emitted ending event, avoiding that projection overhead; the focused final command above covers it. Its explicit bounded 20-second test allowance does not alter any engine or existing test timeout. The native content fixture initially expected VERSION_MISMATCH for a top-level-only content/identity discrepancy; the expectation was corrected to the existing strict IDENTITY_MISMATCH behavior.

## Limits and remaining work

These are real-engine, offline wire-recorder, native IndexedDB, typecheck, unit/contract, and production-build checks. They do not establish integrated desktop controls, worker wrappers, application save/reset/cancellation fences, viewport acceptance, E2E demo behavior, or live OpenAI capability. No paid requests were made; the HTTP boundary in the archive tests returns synthetic domain replies and provider-metadata headers.

Raw export applies to stored JSON **strings**. A corrupt non-string IndexedDB value has no original JSON string to return and explicitly rejects export with CORRUPT; it still receives an unavailable listing. Non-string storage keys are shown as invalid-key placeholders. Incompatible display metadata never authorizes resume. Local records remain historical data, not signed provider billing evidence.

No independent child review was launched because this task explicitly prohibited nested agents. The implementation received an author diff/spec review; coordinator review and integrated-revision verification remain required. No implementation blocker remains in this lease. Parent owns final acknowledgement and recoverable thread archiving after completed/result_available/no-pending-children status; this worker does not self-archive or cancel itself.
