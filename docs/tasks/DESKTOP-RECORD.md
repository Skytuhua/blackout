# DESKTOP-RECORD: host archive and incompatible-save listing

Read the approved desktop rebuild plan and RECORD-02 handoff. Base is supplied at launch. No nested workers. Exclusive writable lease transfers from coordinator to this worker: `src/persistence/**`, `tests/replay/**`, `docs/handoffs/DESKTOP-RECORD.md`. Do not edit shared schemas, root App, UI, workers, simulation/replay, LLM, dependencies, or other tests. Other workers remain active in separate worktrees; do not overwrite their work.

Keep engine/checkpoint schema1 and saved-host schema2. Use actual sim-desktop-v2/hot-restart-layout-v2. Practice is not saved or replayed; only timed mission runs use persistence.

## Exact API needed by the host

Export `HostArchive` from `src/persistence/host-archive.ts`:

- `constructor(runId: string, source?: SavedRunRecord)`. For a fresh run, empty host interactions/dialogue/lineage. For a resumed run, preserve source interactions and host dialogue exactly, and append `{runId: source.runId, throughSimTime: source.finalCheckpoint.simTime}` to its existing lineage; new ID must differ.
- `capture(interaction: RecordedInteraction | null): void`. Ignore null. Require first input's runId to match this current run. Capture an immutable copy, preserving exact wire/projection/provider data. Deduplicate identical request identity without duplicating receipts; reject conflicting duplicate or wrong-run inputs. Existing inherited interactions remain unchanged.
- `message(message: PublicMessage): void`. Retain immutable host messages and unique IDs.
- `build(record: RunRecord): SavedRunRecord`. Require current run match, project schemaVersion2, merge engine/host dialogue without losing engine reports or source messages, preserve lineage/interactions; provenance uses observed last model/prompt only when available, otherwise original/null. Run `validateSavedRun` before returning. No checkpoint exposure to UI and no provider/engine calls.

Extend existing `RunStore` with `exportRun(runId: string): Promise<string | null>` returning exact stored JSON bytes as a string, even when old version/content cannot resume. Do not change any stored bytes or delete records.

Extend `SavedRunSummary` with optional `unavailableReason: string`. `listRuns` must list compatible and incompatible/corrupt entries independently: one old save must not hide all current saves. Metadata in an incompatible summary is display-only (safe bounded primitive values or placeholders); loadRun remains strict and rejects bad identity/version/content. Raw export remains available. Use existing DB/stores/transaction commit behavior; no migration/backend fallback.

## Verification

RED/GREEN: real-engine record -> HostArchive build -> serialize/deserialize preserves physical hash, scoped original turns and dialogue; resume retains exact inherited source IDs and lineage; wrong-run/conflicting capture rejects; repeated capture does not duplicate; older/corrupt save remains listable/exportable while strict resume rejects, and valid sibling entry still loads. Extend existing bounded native IndexedDB harness if needed; no new dependency or paid calls. Preserve equal-horizon replay behavior. Commit only owned paths and report exact commands/results, base, hashes and limitations. No PR until coordinator asks.
