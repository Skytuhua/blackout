# Desktop pixel-game rebuild

User-approved implementation specification, 7 November 2026. Supersedes the dashboard composition and mobile work in the master plan. Read the original master plan for simulation, knowledge, replay, and budget invariants.

## Experience
Full-window desktop 8-bit game matching the three user references: 48px top status/playback bar, dominant overhead facility, 80px crew/navigation dock, one 304px right context panel. No document, panel, report, picker or editor scrolling. Page long content without discarding it; repaginate after resize/font changes. Enlarged text may use a full-stage focus panel with World navigation. Mobile deferred.

WASD/arrows move a distinct commander, E views nearby already-permitted equipment information. Commander is a collision-aware presentation avatar, 2 tiles/second at1x; no extra observations, resources or repair power. Select Alex/Jules and click floor for an authoritative move_crew; select equipment to review and dispatch work. Busy workers require explicit cancellation. Clear held input on blur/pause/focus/reset/terminal.

20x12/320x192 world: upper rack bays A/B/C (3/3/2), lower UPS/control, cooling, generator utility rooms; actual geometry lives in hot-restart.ts. All solid art must match walkability. Fans above are visual subparts of existing cooling trains. Persistent sprites, route-aware interpolation, observed equipment states only. Walk/fan6fps;work/generator4fps; pause freezes and speed scales mission animation.

512x512 nearest-neighbor RGBA atlas,111frames,32worldcolors, no trimming/rotating frames. Environment29frames (floor3/walls10/infrastructure10/fixtures6), equipment/fans13, three characters20frames each, portraits4,badges5. Sprite names and manifest in ART packet. First review: floor/wall, rack, cooling/fan, commander/portrait in actual map. Provenance, editable sources and hashes required.

## Safe introduction
Welcome explains role/service/crew/objective; real safe practice teaches commander movement,E,crew selection/floor movement,timestamps,technical inspection,travel/work/delivered report,pause/speed and workload tradeoffs. No repair rehearsal or solution spoilers. Practice uses healthy scenario, no scheduled disturbances or mission ending; physical/task time still advances. Guidance is authored offline. Start timed incident disposes practice, aborts callbacks and creates new run at0 with no carried state. Skip Practice and reusable instructions available.

## Contract ruling
Integration contract2 is published by INTEGRATION_CONTRACT_VERSION and this specification. Preserve existing engine/checkpoint/worker wire schema1 and saved hostformat2 from RECORD-02; do not conflate those independently versioned layers. Scenario content identity becomes hot-restart-layout-v2; practice-layout-v2 is explicit mode practice. Engine identity must change for new movement/practice semantics. Older saves remain stored/exportable but cannot resume against incompatible content/engine.

move_crew intent: targetId=field technician ID, args.destination={x,y} integer walkable cell, player-only. Use regular ActionRequest/CommandReceipt. Needs actual route, technician version/availability, zero work duration, no evidence. Explicit cancellation before replacement. Snapshot/replay validate destination endpoints separately from equipment service endpoints. Gateway must not offer/authorize movement for model actors.

DesktopGameProps in shared/contracts.ts is the frozen host/presentation boundary. Export DesktopGame from src/ui/DesktopGame.tsx. Root owns session, selection, panel, pause/speed, receipts, radio, coach and replay integration. UI owns drafts/paging/focus/avatar pose. onTutorialEvent is presentation-only; task arrival and report gates must use accepted public tasks/evidence. replayContent receives rendered ledger UI, never checkpoint/record state.

## Ownership and delivery
Previous coordinator released root at d4f97c9, clean; PR11 storage/transcripts is the dependency. Mobile stopped; retain its interrupted worktree. UI03 debrief commits23a440c,3ce03d9,ce5eeb9 are preserved for selective integration.
Coordinator owns root/config/shared/workers/content/App/globalstyles/globaldocs/contracts/e2e plus explicit compatibility leases src/sim/replay/**,src/persistence/**,src/llm/**,server/** and related tests. Simulation worker owns src/sim/** EXCEPT replay and tests/sim/**. Game/UI worker owns src/game/**,src/ui/**,tests/ui/** and component styles. Asset worker exclusively owns public/assets/**; old Game/UI asset lease transferred. Each worker owns only its named handoff doc. At most3 active workers across entire tree, no nested workers. All use separate prepared worktrees and focused branches/PRs. Coordinator resolves conflicts and integrates one patch at a time.

First visual review follows shell+fourmasters. Then integrate controls/practice/radio/save/replay/debrief; reuse freed slots for independent reviews. Keep coordinator responsive. Stop optional expansion once acceptance passes.

## Acceptance
No scroll at1280x720,1366x768,1920x1080 through all panels,longrecords,longIDs,pastedmessage,zoom. Entire facility and essential controls visible. Responsive collision-aware commander creates no evidence/provider calls. Real technician travel/work/report/cancel/reset. Practice no deadline and clean mission transition. New map mission success/failure/retry; deterministic saves/replay; model success/outage/reset/proposals. Interactive terminal stops first endingtick; preserve equal-horizon replay comparison semantics. Run standard verify and viewport browser checks. User visual acceptance and first-time walkthrough remain separate from automated proof. Dedicated persistent demo at stable4173 after tests finish.

## Integration contract3: recorder worker operations
Coordinator reviewed additive internal replay_to(record,at) and compare(record,change) requests with bounded integer cursor and comparison reply. Normal UI receives scoped views or ledgers only, never records/checkpoints. DesktopGameProps unchanged. Engine/checkpoint wire1 and savedhost2 retained. Contract3 fixture: tests/fixtures/worker-contract-v3.json. DESKTOP-RECORD completed its compatibility lease; coordinator nowowns persistence and replayrecorder again.
