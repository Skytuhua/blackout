# REPLAY-01: saved deterministic runs and earlier batch cap

Ready for coordinator review and integration. This is a replay/persistence library with headless engine evidence and an isolated native-browser IndexedDB check. The application replay route, debrief UI, model cycle and release acceptance remain coordinator integration work.

## Custody

- Verified clean exact base before editing: `2cf2c351fec184268481bf3e364e3879b052ba8b` (playable Hot Restart / PR8).
- Prepared checkout: `C:/Users/user/.t3/worktrees/Blackout/t3-88c8363d`; branch: `t3/replay-persistence-comparison`. No checkout creation, branch switch, reset, push, PR or merge.
- Read repository instructions, master-plan replay/snapshot/contracts/Task 6/gates, `docs/reviews/CORE-01.md` and `docs/handoffs/SIM-02.md` before edits. Applied requested Ponytail, Superpowers TDD and verification instructions.
- Exclusive transferred paths only: `src/sim/replay/**`, `src/persistence/**`, `tests/replay/**`, this handoff. No nested agents. Parent owns fresh independent review; this implementer does not approve its own patch.
- Frozen shared contract 1, engine `sim-02-v1`, content `hot-restart-v1`, procedure `procedures-v1`, seed 20261107. No shared schema or physics edits and no parallel interfaces replacing shared contracts.
- Checkout lacked dependencies. The coordinator authorized the ignored `node_modules` junction under the existing verification scope, with verified target `C:/Users/user/Documents/Blackout/node_modules`. Reused pinned dependencies; no installs, dependency edits, package/lock edits or target removal. The junction remains for coordinator checks.

Apply these commits in order:

1. `f3c5d5aeeb010b7813d400cee6927be85d7ddd4f` — tests plus intentionally unimplemented API skeletons; RED by design.
2. `d286e46502dd28a46071e3220ba15e40bfc90de7` — replay validation, canonical proof, real ledgers, earlier-cap comparison and headless evidence.
3. `89116e8d5e490df40bf42e5c4ab0267995434838` — native IndexedDB, serialization and headed browser proof.
4. The final returned HEAD is the evidence/handoff commit containing this document only; its SHA is returned with the final result.

## Files and API

- `src/sim/replay/index.ts`: compact public exports.
- `validation.ts`: `validateRunRecord(unknown): RunRecord`, `validateCheckpoint(unknown): Checkpoint`, `ReplayDataError`.
- `canonical.ts`: `canonicalCheckpoint(Checkpoint): string`, `deterministicHash(Checkpoint): string`.
- `recorder.ts`: `replayRun(record, newRunId)` and `verifyReplay(record, newRunId)`.
- `ledger.ts`: `buildOutcomeLedger(record): OutcomeLedger` from engine truth and telemetry.
- `comparison.ts`: `compareEarlierCap(record, change): ComparisonResult`; exports `EarlierCapChange` and the exact policy label.
- `src/persistence/runs.ts`: JSON serialization/deserialization, `openRunStore`, `RunStore`, `StorageError` and local-list summary type.
- `tests/replay/fixtures.ts`, `replay.test.ts`, `comparison.test.ts`, `persistence.test.ts`: real engine histories and meaningful failure boundaries.
- `tests/replay/trace.ts`, `replay-evidence.json`: reproducible full-engine and comparison evidence.
- `tests/replay/browser-check.mjs`, `browser-entry.ts`, `browser-evidence.json`: standalone native IndexedDB proof; not wired into global CI/config.

```ts
import {
  validateRunRecord, validateCheckpoint, verifyReplay,
  buildOutcomeLedger, compareEarlierCap,
} from './sim/replay';
import { openRunStore } from './persistence/runs';
import { restore } from './sim/engine';

// Recorder-only data obtained from the existing worker snapshot/export boundary.
const record = validateRunRecord(exportedEngineRecord);
const verified = verifyReplay(record, 'replay-unique-id');
if (!verified.matches) throw new Error('Deterministic state mismatch');
const ledger = buildOutcomeLedger(record);
const cap = record.commands.find(c =>
  c.receipt.status === 'accepted' && c.intent.action === 'pause_batch');
if (!cap) throw new Error('No existing accepted cap');
const comparison = compareEarlierCap(record, {
  commandSequence: cap.sequence, earlierAt: 0, branchRunId: 'alternative-unique-id',
});

const store = await openRunStore(); // blackout-local-runs, current browser origin/profile
try {
  await store.saveRun(record); // atomically saves the record including both checkpoints
  await store.saveCheckpoint(record.finalCheckpoint); // optional separate latest checkpoint
  const summaries = await store.listRuns();
  const loaded = await store.loadRun(record.runId); // null when absent
  const checkpoint = await store.loadCheckpoint(record.runId);
  if (checkpoint) {
    const resumed = restore(validateCheckpoint(checkpoint), 'resume-unique-id');
    // Coordinator can instead pass the validated checkpoint to the existing worker restore.
  }
  // listCheckpoints(), removeRun(id), removeCheckpoint(id) are also available.
} finally { store.close(); }
```

Validation clones through frozen schemas and calls the real engine restore validator. It checks exact shipped scenario content/seed/procedure, engine identity, command/checkpoint/run identity, pristine declared initial state, complete integer telemetry horizon, resolved commands, conservation, and duplicated record histories against the final checkpoint. Engine reports must remain in recorded dialogue; additional schema-valid recorded radio messages are allowed. Dialogue identity/time is checked. Validation is structural/consistency validation, not authenticated anti-cheat: use `verifyReplay` for computed physical determinism.

Failures have explicit error codes: replay `VERSION_MISMATCH`, `IDENTITY_MISMATCH`, `CORRUPT`, `HISTORY_MISMATCH`; storage `UNAVAILABLE`, `BLOCKED`, `VERSION_MISMATCH`, `FAILED`. Missing saved keys return null. Corrupt list entries fail the list rather than disappearing. Unsupported versions are rejected, not migrated or silently replayed under new physics. Saves validate before opening their write transaction and resolve only after transaction commit. Failed validation cannot replace a previously saved record. Run and checkpoint collections are separate, keyed by run identity; saving the same key deliberately replaces that key.

## Deterministic proof scope and rejected attempts

`verifyReplay` compares **exact canonical JSON bytes**, and returns their FNV-1a/64 fingerprints (`replay-v1-*`) for concise evidence. The fingerprint is noncryptographic; equality is never inferred solely from its collision resistance. `deterministicHash` is a pure canonical fingerprint, not a substitute for boundary validation.

Canonical state includes:

- Checkpoint schema/engine/content versions and simulation time; the complete scenario, seed, initial configuration, topology, crew speeds, profile and future external schedule.
- All current and initial physical state: authoritative crew positions, fractional travel, paths, reservations, task work/progress/resources/intent, racks/protection latches and timers, temperatures, UPS stored energy/fault/trip state, cooling restart timers, source connectivity, pulse, service/energy/conservation totals and the last physical interval.
- Public entity versions, complete mission/private/evidence timers, external cursor and consumed boundary, observation counters and sensor cursor.
- Scoped delivered observations/messages, recipient lists, pending reports and delayed evidence, full telemetry, all accepted/applied domain commands and domain receipt fields.
- All non-transport events, payloads, visibility, recipients, causal references and chronological order. Object keys are normalized; events sort by actual simulation time then stable engine sequence. Array order otherwise remains checked.

Excluded/normalized fields are explicit: checkpoint/receipt run IDs and request IDs, command numeric sequence values after ordering, command.* transport/audit events, `nextSequence`, and the transport idempotency cache. Task/event IDs and task-derived report IDs are renamed by stable task/event order so omitting rejected audit attempts cannot create false physical divergence. Authoritative task references and event ordering still remain checked. Renderer/wall-time data are absent from the frozen engine schema. Record-only radio/provenance enrichment is persisted and returned, but is not physical-state hash input; duplicate observations/events/telemetry in the record must match the checkpoint.

Every accepted/applied intent is reissued with a new branch identity, `replay-N` request/idempotency IDs, current actor-visible versions, original action boundary/order and mapped task references, including cancellation. Replay never submits an originally rejected command. The frozen record does not contain its original transport envelope, so reconstructing stale-run/stale-version rejection validation would be dishonest. Original rejected commands/receipts are returned unchanged as `rejectedAttempts`; original dialogue is returned unchanged as `dialogue`. `result.record` describes the newly computed accepted-only engine run. Display source audit receipts from the source record, not as new branch acceptances. No model/provider/transport module is called.

This proves full authoritative physical/knowledge/task/event replay under the declared accepted domain stream, not the original transport deduplication cache or historical envelope rejection decisions. Tests deliberately change temperature, travel progress, mission time and evidence recipients and require changed hashes; a structurally valid altered final temperature produces `matches: false`. Snapshot/restore continuation matches at fractional travel and pending report boundaries through t600, protection trips and terminal continuation.

## Comparison evidence

Only moving one existing accepted `pause_batch` or `set_batch_ceiling` is implemented. Select by original engine command sequence; new time must be an earlier whole-second boundary. The original instance is removed. All other accepted/applied commands retain their time/order; rejected attempts remain source audit only. Branches restore the same declared initial checkpoint and external schedule/keyed noise. The baseline uses the source ledger identity; the isolated alternative requires a distinct run identity. Both obtain fresh request IDs and current observed versions. Task references use receipt mappings, not numeric ID coincidence.

Exact label: **Earlier batch cap, with the same subsequent accepted commands and external disturbances.**

`tests/replay/replay-evidence.json` is generated from the actual successful public-evidence mission. Both complete ledgers continue through t600 even though mission success is t331. Baseline: 96,000/96,000 critical, 52,800/52,800 interactive, 144,000 batch arrivals, 85,200 completed, 58,800 backlog, 27,312,600 batch delay unit-seconds, peak 28.62 C. Moving the t10 pause to t0: 82,800 completed, 61,200 backlog, 28,733,400 delay unit-seconds, peak 28.473098021860224 C. Conservation residual is zero in both. The earlier pause improves peak temperature while retaining the real additional batch delay; no benefit is invented.

An unsupported example moves a t20 pause to t9. The originally accepted `verify_recovery` at t10 now conflicts with Sam's reserved work: exact original `RecordedCommand` returned, reason `WORKER_BUSY`, common supported horizon t10, baseline and alternative `validPrefix` ledgers only. The top-level baseline is also prefix-only. There is no top-level full-horizon alternative. Additional checks cover canceled-task references becoming `TASK_NOT_ACTIVE`, an earlier successful mission making a later retained action `MISSION_ENDED` at t319, and retaining earlier same-boundary actions in both prefix timelines. No invalid retained action is skipped, rescheduled or retargeted.

## Checks actually observed

- Initial `npm run test:replay -- --reporter=verbose`: **10 expected RED failures** against explicit unimplemented API skeletons, covering validation, replay identity/hash, restore continuation, real accounting, unsupported action and persistence boundaries.
- Review RED: missing real `thermal_throttle` events produced **1 failure / 3 passes**; corrected the event filter.
- Review RED: explicitly undefined optional command arguments produced a real history mismatch (**1 failure / 4 passes**); canonical JSON now follows JSON omission semantics.
- Review RED: earlier commands at the same invalid-action boundary were absent from the baseline prefix (**1 failure / 6 skipped**); corrected the stable boundary/sequence comparison.
- Final focused `npm run test:replay -- --reporter=verbose`: **14 passed in 3 files**, exit 0. This includes real success/idle histories, active/canceled travel, delayed reports, valid/invalid restores, conservation, terminal continuation and complete/unsupported comparisons.
- Final `npm run verify`: **exit 0**: typecheck; **149 unit/contract tests in 24 files**; production Vite/server build; **3 production Chromium tests, 32.8 seconds**. Existing adaptive test/config allowances were unchanged. Earlier full verify also passed 145 tests before added review cases.
- `node --import tsx tests/replay/trace.ts`: exit 0; successful t600 original/replay hash **`replay-v1-eaaed8d707d4f606`** matches exact canonical bytes. Travel t1 hash `replay-v1-49eb54cc997dfe5f`; pending report t43 hash `replay-v1-25b3bdf0a91012b1`.
- `node tests/replay/browser-check.mjs`: **exit 0**, run twice; final evidence in `tests/replay/browser-evidence.json`. **Headed native Chromium 158.0.8127.18**, fresh temporary persistent profile, unique bound loopback port. Saves run/checkpoint at t1, refreshes page, closes and reopens the actual browser, loads/resumes to t100 hash **`replay-v1-723ff3a7e236d64f`**, verifies list/remove, rejects malformed/nonserialized/versioned/key-mismatched storage, preserves prior bytes on invalid save, reports closed storage explicitly. Zero page errors, zero provider calls. Own browser/server closed and own verified temporary profile removed in finally. No user profiles, tabs or databases were touched.
- `git diff --check`: exit 0. Protected source/package/lock diff against base: exit 0. Normal Git LF/CRLF notices occurred. Build printed upstream Zod PURE-annotation warnings; browser runner printed ordinary NO_COLOR warnings and absence of `.env.local`. No credentials were supplied or needed.

## Coordinator integration and limits

Keep checkpoints and recorder truth outside normal UI props and coworker contexts. Integrate save/load at the existing recorder/worker boundary, add replay/debrief UI separately, and use shared unsupported-result selectors. Comparison/replay APIs are synchronous CPU work: invoke outside the React render path, with coordinator-owned worker integration if needed. No main-thread performance or laptop rehearsal gate is established here.

`RunRecord` has command receipts and dialogue, but **no independent gateway tool-result field**. Example: a recorded `read_observations` `PublicToolResult` with `interactionId`/`callId` cannot be placed in the strict current `RunRecordSchema`. Do not smuggle it into dialogue or invent a parallel record. If integration requires independent tool receipts, coordinator proposal: version the shared record contract, add `toolResults: z.array(PublicToolResultSchema)` (engine-only records emit `[]`), update schema/version fixtures and every recorder/export/storage/gateway consumer together. This package currently preserves all receipts that the actual frozen engine record contains; it makes no separate gateway-receipt capture claim. Radio/provenance enrichment through existing fields remains coordinator-owned and is preserved on save/replay return.

Only the exact shipped scenario content is accepted; no content migrations, arbitrary edits/scrubbing, alternate policies or extra scenarios. No credentials, paid calls, model transport, new dependencies, public deployment or remote repository actions. Structural validation is not an anti-cheat signature. The hash excludes transport caches as documented. The native IndexedDB harness is independent of the existing headless tests and application routes: it proves browser storage/restart/resume, not application replay UI, live model interaction, visual acceptance, hosted CI or release acceptance.

Author review found and fixed the three RED/GREEN issues above. Parent still owns independent review and integrated checks. Deliver this result first; parent then acknowledges, confirms task status completed / result_available / no pending child runs, and recoverably archives the returned child thread. This worker does not archive itself or cancel unfinished work for cleanup.
