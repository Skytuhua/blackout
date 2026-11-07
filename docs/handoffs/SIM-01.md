# SIM-01 physical reference slice

Status: ready for coordinator review and integration. This is a headless physical slice, not an offline mission, live model integration, browser demonstration, or release gate.

## Custody

- Pinned base: `fb8e7988e39fb767954f59a2b504932680a002b1`.
- Contract version: `1`, post-G0 fixes. Engine identity: `sim-01-v1`.
- Worktree: `C:\Users\user\.t3\worktrees\Blackout\t3-30b447d8`.
- Branch: `t3/simulation-reference-slice`.
- Implementation commits, in order:
  1. `7511bd750d936ceebea16e8881587fa3b7c8dae7` — analytic heat, power, workload and protection kernels with 15 reference tests.
  2. `6d97fac24f6000ffd222a59c009a9152380c907c` — deterministic engine, segment resolution, snapshots/records, boundary cases and numeric receipts.
- This handoff is packaged in a following documentation-only commit; its hash is in the final delivery message and branch log.
- No push, merge, release, provider request, subagent dispatch, or archive operation was performed.
- Package/lock/configuration, master plan, content, shared contracts, worker bridge, host and UI were unchanged. The only dependency operation was `npm ci --ignore-scripts` using the committed lockfile in this worktree.

## Changed files

Production: `src/sim/engine.ts`, `src/sim/state.ts`, `src/sim/systems/physical.ts`, `src/sim/systems/power.ts`, `src/sim/systems/protection.ts`, `src/sim/systems/thermal.ts`, `src/sim/systems/workload.ts`.

Tests/evidence: `tests/sim/engine.test.ts`, `tests/sim/power.test.ts`, `tests/sim/protection.test.ts`, `tests/sim/thermal.test.ts`, `tests/sim/workload.test.ts`, `tests/sim/reference-evidence.json`.

Handoff: `docs/handoffs/SIM-01.md`.

## Implemented behavior

`initialize(spec, runId)` and `restore(checkpoint, newRunId)` are module exports from `src/sim/engine.ts`. The returned object implements the frozen `SimulationEngine` interface. Internal authoritative state is locally owned in `src/sim/state.ts`; no shared interface was duplicated or changed.

Advancement accepts 0–600 integer one-second ticks per call. Playback batching uses the same ticks. External events at time `t` apply before integration over `[t,t+1)`; events at the returned endpoint await the next tick. Events sort by time, then the following phase priority, then original input position: utility loss/restore (10), generator readiness (20), transfer completion (30), controller fault (40), workload pulse start/end (50). Protection and physical state changes receive stable sequence numbers in the same engine log.

Power resolves declared rack UPS feeds, shared upstream distribution, and utility/generator transfer. A/B rack load is shared across currently viable declared feeds. Hard UPS overload trips are immediate and latched; no proportional overload allowance is invented. Source allocation is IT conversion, cooling standby and bounded thermal output, then recharge. UPS losses are upstream, not rack-zone heat.

UPS energy is stored DC kWh. Discharge consumes `P_AC * seconds / (3600 * efficiency)`. The engine splits a tick at energy exhaustion, recomputes feed sharing, and finds the survivor's new exhaustion boundary. Other splits occur at boot completion, cooling restart completion, and batch backlog exhaustion. Resolution has a bound derived from UPS/rack/train counts, rather than an unbounded solver. Charging and discharging are exclusive per UPS, recharge stays within capacity, and healthy inputs can recharge even with zero output load.

The workload scheduler serves critical, interactive, then batch. Batch arrivals continue while paused or off, and completions conserve work. Catch-up uses actual spare compute and raises power/heat. Ready power depends on executed work; throttled capacity is half normal; off power is zero; boot power is the configured 4kW without useful work. Critical/interactive offered demand and delivered work remain separate totals. Batch delay integrates the backlog area.

Thermal allocation respects rack/train connections, per-train capacity, source electrical budget and COP. Connected zones share finite capacity proportionally for the common pool. Cooling uses segment-start temperatures, cannot cool a zero request, and is also bounded by available zone energy to prevent numerical undershoot below the reference. Stored heat persists across recovery. Initial state is balanced against the real coordinator-owned Hot Restart workload/topology/profile; infeasible initial equilibria are rejected.

Protection retains continuous threshold exposure, throttle/release hysteresis, latched thermal trips, cold dwell and a separate accepted-reset flag. A thermal reset additionally checks current temperature and valid power. Boot takes 20 seconds and is interrupted/restarted after power loss. Protection changes take effect at physical segment ends; endpoint service is recomputed while integrated accounting retains work already delivered. This is still a one-second engine; subsegments handle the declared physical boundaries.

Snapshots preserve scenario/seed, physical state, energy, temperatures, backlog/admission, all protection/boot/restart timers, the external event cursor, log sequence, commands/idempotency, initial physical state and forensic telemetry. Restore validates the envelope, engine/scenario identity, finite internal values, entity identities, energy bounds, event cursor and sequence counter. New run envelopes reject old commands. Snapshot, observation and record results are detached copies.

## Explicit slice limits and SIM-02 hooks

Every valid current-run action returns a rejected `SIM01_ACTION_UNAVAILABLE` receipt. No action is queued, accepted, applied or represented as a completed task. Repeated identical idempotency keys do not duplicate command records; changed intent under the same key is rejected. Crew qualification, travel, inspections, repairs, remote-control delays, reset tasks, reports, mission feasibility and lifecycle remain SIM-02.

`observe` returns schema-valid public topology/crew, disabled affordances, no observations or tasks, unknown numeric summary values, and a labeled `briefing` mission state. It does not project physical state, battery energy, latent faults, future events, checkpoints or causal parents. Sensors/noise/role-specific delivery are not implemented; the scenario seed is preserved but no random draws occur in this slice. Forensic telemetry and complete state are confined to snapshot/record APIs and are not suitable UI props or gateway inputs.

For later task effects, the authoritative state already retains per-rack `batchCeiling`, `backlog`, `thermalLatched`, `resetRequested`, protection timers and boot state; UPS `tripped` and `faulted` states are separate; cooling retains readiness/restart time and the shared controller prerequisite. Clearing `controllerFault` permits the configured restart delay, without overwriting temperatures. These are internal integration points, not alternate public action executors. No replay/persistence module was added.

Normal browser worker wiring remains the coordinator's G0 fixture adapter and was not edited. Do not route SIM-01 to a release screen as a completed mission. No browser/native/production, mission feasibility, actor observation, comparison or live-provider acceptance is claimed.

## Contract assumptions and reported gaps

No shared contract change is needed to integrate this physical slice.

- Contract v1 has no utility rating. Utility is treated as unrated, while generator demand is bounded by `generatorKw`. Internal working budgets are finite; `sourceCapacityKw: null` identifies the unrated utility. No utility headroom estimate is projected to actors.
- Contract v1 has one UPS efficiency; it is applied independently for conversion/discharge and charging. A separate charge-efficiency field is not invented.
- Hot Restart's declared uncoupled zones are used. Neighbor exchange remains zero; no arbitrary coupling or added thermal inputs are claimed.
- The supplied first-mission topology is utility/generator → distribution → separate UPS and cooling branches; rack dependencies identify UPS feeds and cooling connections. The slice does not claim a general electrical-network solver, arbitrary nested plant layouts, targeted branch disturbances, or Last Feed scenario support.
- A workload pulse's nonnegative `value` is interpreted as additional **interactive units per second per rack** until the pulse ends. In the supplied content, that is +10 at t=300 through t=360. This interpretation should be confirmed with the content coordinator before mission acceptance; it is not a new schema.
- Reported immediately: the action catalog lacks thermal rack reset. The smallest future contract addition is `reset_rack` in `ActionSchema`; example intent: `{ "action": "reset_rack", "targetId": "rack-1", "atSimTime": 120, "args": {} }`. Affected consumers: engine validator/task handler, UI affordances, gateway proposal allowlist, command fixtures and replay. SIM-01 never accepts this absent action; protection tests use explicit internal reference configurations.
- V1 also lacks authored neighbor-conductance and targeted UPS-output fault events. Those are future family/configuration extensions, not blockers for the uncoupled physical reference slice. Faulted/surviving-feed tests use explicit internal reference configurations, without claiming a playable additional family.

## Executed RED/GREEN checks

All times below are local America/Chicago on 2026-11-07. These are actual runs, not planned checks.

| Stage | Actual command/result |
|---|---|
| Dependency setup | `npm ci --ignore-scripts`: exit 0; 100 packages installed from lockfile. An initial `npm run test:sim` during installation exited 1 because `vitest` was not yet installed; this is environment evidence, not RED behavior evidence. |
| Workload/thermal RED, 17:33:00 | `npm run test:sim`: 8 failed assertions against inert kernel scaffolds. Failures included 0 vs 64kW cooling, unchanged 30C vs 26.196194C recovery, absent work service and a 5.985C trace error. |
| Power RED, 17:34:07 | `npm run test:sim`: 4 power failures, prior 8 passed. Missing conversion input, DC discharge, failed-feed redistribution and overload trip were observed. |
| Protection RED, 17:35:38 | `npm run test:sim`: 3 protection failures, prior 12 passed. Missing dwell transition, latch and within-tick exposure were observed. |
| First commit GREEN, 17:36 | `npm run test:sim`: 15/15 passed; `npm run typecheck`: exit 0; `npm test`: 29/29 passed. |
| Engine scaffold RED, 17:38:30 | `npm run test:sim`: 11 engine cases failed, prior 15 passed. Baseline cardinality, external ordering and integer-validation assertions were RED; other cases exposed unavailable construction/checkpoint/view scaffolding. |
| Engine GREEN, 17:41:50 | `npm run test:sim`: 26/26 passed; `npm run typecheck`: exit 0. |
| Boundary regression RED, 17:43:26 | `npm run test:sim`: 4 failed, 29 passed. Zero-output charging, current-temperature reset prerequisite, corrupt event cursor, and zero-heat/zero-conductance non-finite initialization were reproduced. |
| Final implementation GREEN, 17:43:57–17:44:01 | `npm run test:sim`: 33/33 passed; `npm run typecheck`: exit 0; `npm test`: 47/47 passed. |
| Delivery recheck, 17:48:05–17:48:09 | `npm run test:sim`: 33/33 passed; `npm run typecheck`: exit 0; `npm test`: 47/47 passed. |
| Custody/static checks | `git diff --check` and staged check: exit 0. Protected package/lock/config/shared/content/worker/host/master-plan diff against base: empty, exit 0. Imports inspected: only shared types/schemas, Zod and owned simulation modules. |

During the first GREEN cycle, an additional over-precise thermal trace expectation was corrected from an inaccurate hand estimate to the specified 0.1C acceptance bound. The observed maximum difference is retained below. A floating-point AC residual of approximately 7e-15kW was also fixed by deciding whether input fully covers required conversion before computing residual discharge; the existing utility-fed survivor test caught it.

## Numeric reference evidence

`tests/sim/reference-evidence.json` was generated by running the actual engine/kernels offline with `node --import tsx --input-type=module` on 2026-11-07. Its configurations are explicit headless references; the elevated-temperature and partial-energy cases use recorder checkpoints, not gameplay actions.

| Reference | Observed result |
|---|---|
| Healthy 600s | 24C; 64kW IT; 64kW thermal removal; 67.368421052632kW UPS input; 25.333333333333kW cooling electricity; total 92.701754385965kW source input; no recharge when full. |
| Cooling unavailable 75s | 26.999999999999936C from 24C; slope 0.03999999999999915C/s. |
| Recover from 30C for 100s | 26.196194047639377C; continuous analytic reference 26.207276647028653C (1s Euler error about 0.011083C). |
| 600s at 1s vs independent 0.5s Euler | Final 24.014430055747862C vs 24.014650354893146C; maximum trace difference 0.005552882717641C, below 0.1C. Thermal-only case: constant 8kW/rack, 200kJ/K, 2kW/K, common 160kW pool, initial 30C. |
| UPS ideal stored-DC runtime | 534.375s at 32kW per UPS (8.90625min); 267.1875s for one UPS at 64kW (4.453125min). The dual-battery engine test delivers exactly 9.5kWh AC before depletion with thermal protections explicitly raised for that reference. |
| Sub-tick two-feed depletion | First feed empties at 0.25s, survivor at 0.5s after redistribution; final DC energies [0,0]; 0.008888888888889kWh IT and 80 critical units delivered, versus 160 offered during the full second. |
| Paused cohosted batch for 75s | Every rack 25.875C; 18,000 batch units retained, zero completed; critical demand fully served. A subsequent 100s at 50 batch units/s/rack drains total backlog to 2,000 with 80kW IT. |
| One train / peak workload | Engine test reaches 96kW IT and exactly 80kW thermal removal; no duplicated cooling capacity. |
| Generator limited to 80kW | IT input is allocated first; steady cooling limit is 25.894736842105kW thermal after 4kW standby; recharge is zero at that bound. |

## Reproduction and integration

From this worktree, without credentials or provider transport:

```powershell
npm ci --ignore-scripts
npm run test:sim
npm run typecheck
npm test
```

The tests import coordinator-owned `hotRestart` directly and clone it for declared reference configurations. No mock/provider adapter is used by the simulation. Independent root review and integrated-revision checks remain required. Cherry-pick the two implementation commits in order, then this handoff commit; run at least `npm run test:sim` and `npm run typecheck` at the integrated revision. No production build, end-to-end, mission-policy, live, visual or release proof is supplied by SIM-01.
