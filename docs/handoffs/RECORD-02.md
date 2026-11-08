# RECORD-02: saved interaction format

This slice adds host-owned `SavedRunRecord` version 2. The deterministic engine record, checkpoint, gateway envelopes and worker protocol remain version 1. Application capture, export/reset fencing and save/resume controls are the next integration slice.

`serializeRun` and native `RunStore.saveRun` accept valid engine v1 or saved v2 records. Loading v1 explicitly returns v2 with empty `lineage` and `interactions`; it does not reconstruct missing model history. Unsupported versions and inconsistent records fail before a storage transaction can replace accepted data.

Each interaction preserves up to three exact scoped gateway inputs, received domain responses, optional provider metadata and matching public tool results. An ending records simulation time, duration and final/fallback/canceled/reset/interrupted status. Null metadata means unobserved metadata. It does not establish that no provider call occurred or that its cost was zero. `receiptId` remains local correlation; `provider` and nullable `responseId` identify the returned OpenAI response when available. This change makes no new provider calls.

Validation checks nested actor/run/request/call identities, continuation correspondence, original actor-visible observation bytes and recipients, supplied procedure content, factual selectors, tool-specific result semantics, ordinary inspection command receipts and their request-to-result time bounds. Source debrief scalar ledgers are recomputed from the deterministic accepted-command prefix; bounded telemetry/event context must contain actual source rows. Original inference and uncertainty remain prose rather than authoritative readings.

Resume lineage preserves inherited gateway and provider transport identities. The engine may rewrite its own historical receipt run ID when restoring into a new run; saved original tool/model envelopes are preserved. The host must inherit a transcript only when restoring the exact final checkpoint of its validated source record. That host operation is not implemented by this storage-format PR.

```ts
const saved = deserializeRun(serializedV1OrV2); // SavedRunRecord v2
const physical = engineRecordOf(saved);        // detached engine v1
const replay = replaySavedRun(saved, 'new-replay-run');
// replay.record is newly computed physical history;
// replay.sourceTranscript is the unchanged original dialogue provenance.
```

`replaySavedRun` uses the existing physical executor and canonical comparison, returns original transcript separately and never invokes a model. The native browser proof now saves an explicit v2 scoped fallback turn, closes and restarts a fresh-profile Chromium process, reloads it and verifies exact physical resume hashes. Its legacy-save check verifies an empty-history upgrade before the v2 save. The database schema and object stores are unchanged.

This is structural/historical validation of local data, not a signature, provider billing audit or complete revalidation of every projected UI field. A recorded alternative-comparison context is preserved provenance; callers must independently generate/verify a comparison with `compareEarlierCap` before presenting it as computed branch evidence. This loader recomputes source ledgers, not an unspecified hypothetical branch. No new authentication or third-party messaging is introduced.

## Evidence

- Initial four saved-format tests failed against the v1-only implementation, then passed.
- Two provider identity/unknown-usage cases failed before the gateway captured returned response IDs, then passed.
- Additional provider-free replay, cross-asset payload and reviewer regressions were observed RED before corrections.
- Independent code review found two HIGH consistency issues; security review also identified the receipt issue and an unverified source scalar ledger. Coordinator corrections and regression coverage are recorded in `docs/reviews/RECORD-02.md`.
- Final command receipts and scope limits are recorded in that review document. No application saved-run, recorder fence, live debrief or G2 acceptance is claimed by this slice.
