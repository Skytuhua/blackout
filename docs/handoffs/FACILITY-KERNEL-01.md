# FACILITY-KERNEL-01 handoff

Status: ready for the parent's independent review and integration. Implementation and all required local checks are complete. No independent approval or integrated facility mission is claimed.

## Custody and revisions

- Prepared isolated worktree: `C:/Users/user/.t3/worktrees/Blackout/t3-eb13f1e8`.
- Task branch: `t3/eb13f1e8`; clean at dispatch and after the implementation commit.
- Approved production pin: `54558c39ad500361d0d5fe243862b0f6767d7d60`.
- Exact prepared base: `9edaf6acd140bc98626a129ed463352891166125`.
- Produced implementation commit: `8f6bd8b752ae6852d4f6e4256c00a203ae3f27c3`.
- This handoff is a separate documentation commit. Its exact SHA is returned in the final message and `.local/facility-kernel-01/final-receipt.json`; it is also resolved by `git log -1 --format=%H -- docs/handoffs/FACILITY-KERNEL-01.md`.

Observed the prepared base's immediate parent equals the approved pin. Its only intervening change is `tests/e2e/conversation-ui.spec.ts` (one insertion, one deletion). `git diff --exit-code <pin> <base> -- src server package.json package-lock.json` passed. The leased directories did not exist at dispatch. No branch switch, reset, root checkout mutation, or other agent's changes were made.

## Changed paths

All changes are new files within the packet lease:

- `src/sim/facility-kernels/cooling.ts`: two pure internal functions and private input validation.
- `tests/sim/facility-kernels/cooling.test.ts`: allocation, canonical order, purity, restart and rejection cases.
- `tests/sim/facility-kernels/thermal-reference.ts`: constructed sixteen-rack harness using the existing solver.
- `tests/sim/facility-kernels/thermal.test.ts`: real-solver isolation, recovery and energy accounting checks.
- `docs/handoffs/FACILITY-KERNEL-01.md`: this handoff.

Protected tracked paths outside the lease have no diff from the prepared base. Package and lockfile SHA-256 receipts match before and after installation. Integration contract 5, shared declarations, dependencies, legacy engine, scenarios, recordings, audio and UI remain unchanged.

## Frozen internal contract

The production module uses only type imports from existing declarations:

```ts
import type { ScenarioSpec } from '../../shared/contracts';
import type { PhysicalState } from '../state';

export function allocateCoolingCapacity(
  readyUnitIds: readonly string[],
  electricalBudgetKw: number,
  profile: Pick<ScenarioSpec['profile'], 'coolingAuxiliaryKw' | 'coolingTrainKw' | 'coolingCop'>,
): {
  standbyKw: number;
  allocations: { unitId: string; capacityKw: number }[];
};

export function restartCoolingUnits(
  units: readonly PhysicalState['cooling'][number][],
  targetUnitIds: readonly string[],
  restartSeconds: number,
): PhysicalState['cooling'];
```

Allocation applies the packet's shared-budget formula once to the combined eligible IDs. Each ready unit receives an equal capacity; output IDs use code-unit comparison and caller order is preserved. All numeric and ID validation runs even for empty lists. No units means zero standby and no division. Numeric rejections use `RangeError`; blank, duplicate and unknown IDs throw `Error`.

One numerical correction was required by the tiny-budget invariant: IEEE-754 rounding can make four equal shares overrun the computed capacity. With zero auxiliary demand, COP 3, and budget `1e-323`, naive division allocates `4e-323` thermal against `3e-323` available. When reconstructing equal shares exceeds the formula's total or electric budget, the module uses the preceding representable share. It adds no epsilon or generated resources and does not round consumed energy. The regression observed this failure before the correction.

Restart validates the entire request, clones state objects, and changes only selected existing IDs to `ready: false` with the full supplied duration. Zero seconds remains not ready. It does not tick timers, resolve faults or eligibility, perform work, change temperatures, or authorize repairs.

## Actual commands and results

Checks ran on the exact implementation bytes committed as `8f6bd8b752ae6852d4f6e4256c00a203ae3f27c3`.

| Command | Observed result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Exit 0; 101 packages installed from the committed lockfile. |
| `npm test -- tests/sim/facility-kernels/cooling.test.ts --reporter=dot` | Allocation RED: 1 behavioral assertion failed against callable no-op scaffolding; GREEN: 1 passed. No missing-module failure used as evidence. |
| Same focused command | Validation RED: 21 failed, 11 passed; GREEN: 32 passed. |
| Same focused command | Restart RED: 1 failed, 32 passed; GREEN: 33 passed. |
| Same focused command | Restart validation RED: 11 failed, 34 passed; GREEN: 45 passed. |
| `npm test -- tests/sim/facility-kernels --reporter=dot` | Initial thermal verification: 48 passed. Subnormal regression RED: 1 failed, 48 passed; final GREEN: 49 passed in 2 files. |
| `npm run typecheck` | Exit 0; no TypeScript errors. |
| `npm test` | Exit 0; 389 tests passed in 51 files. No failures; 36.24 seconds. |
| `node --import tsx .local/facility-kernel-01/capture-trace.ts` | Exit 0; generated the compact numeric trace below. |
| `git diff --check` and `git diff --cached --check` | Exit 0; no whitespace errors, including staged new files. |
| Protected-path diff against the prepared base | Exit 0; no changes outside the lease. |

No subagents, reviewers, paid calls, credential reads, pushes, PRs, watches or merges were performed. Parent owns independent review, publication/integration and completed-child archiving.

## Trace and conservation evidence

These are headless constructed kernel fixtures, with eight racks per hall, 8 kW IT heat per rack, 200 kJ/K heat capacity, 2 kW/K conductance, a 20°C reference, two 80 kW trains per hall, COP 3, and 2 kW auxiliary demand per ready train. The profile comes from existing `hotRestart` content without changing that scenario.

The trace begins with one balanced second, excludes only A IDs for 75 seconds, schedules A's 30-second restart, then explicitly restores eligibility at the test boundary and advances 100 recovery seconds. It does not implement or verify an engine clock/controller transition.

| Elapsed seconds | Phase | A °C | B °C | Actual heat removed kW | Actual cooling electric kW |
| --- | --- | --- | --- | --- | --- |
| 1 | Balanced | 24 | 24 | 128 | 50.6666666667 |
| 76 | A outage, 75 seconds | 27 | 24 | 64 | 25.3333333333 |
| 106 | Full restart delay elapsed | 28.2 | 24 | 64 | 25.3333333333 |
| 107 | First restored interval | 28.158 | 24 | 195.2 | 73.0666666667 |
| 206 | 100 recovery seconds | 25.5373358333 | 24 | 152.8458316501 | 58.9486105500 |

Scheduling restart preserves all rack temperatures and original cooling-state objects. A's returned restart delays remain the full 30 seconds; B's values remain unchanged. The recovery follows `24 + 4.2 * 0.99 ** 100`, preserving stored heat rather than resetting it. A separate one-A-unit restoration removes only 80 kW from A plus B's actual 64 kW, yielding A = 28.19°C and B = 24°C; unused B capacity cannot cross hall connections.

At a 48 kW shared budget and a quarter-second interval, the actual solver removes 120 kW, consumes exactly 48 kW cooling electricity including 8 kW standby, and increases stored heat by approximately 2 kJ: `(128 - 120) * 0.25`. Both halls reach 24.000625°C under that upstream shortage. At adequate power, allocated capacity is 320 kW but baseline actual removal is 128 kW; electricity is based on actual removal, not unused capacity.

Every trace step checks `delta stored heat = (IT heat - removed heat) * elapsed seconds`. Maximum absolute per-step residual was `2.7569058147491887e-12 kJ`. Integrated stored heat was `2459.7373333560354 kJ` versus `2459.7373333561895 kJ` net heat, within floating-point error.

Ignored evidence lives under this worktree's `.local/facility-kernel-01/`: `base.txt`, `dependencies-before.txt`, `dependencies-after.txt`, `npm-ci.log`, each `red-*.log` / `green-*.log`, `typecheck.log`, `npm-test.log`, `diff-check.log`, `worktree-diff-check.log`, `capture-trace.ts`, `trace-command.log`, `thermal-trace.json`, and `final-receipt.json`. Numeric traces and the capture script are local evidence, not committed application data. Offline reproduction: `npm test -- tests/sim/facility-kernels`; regenerate the compact trace in this worktree with the command above. The committed `runCoolingTrace()` harness also allows the parent to reproduce its samples after cherry-picking.

## Integration example and remaining gates

After the coordinator resolves controller/group membership, prerequisites, action validation and the finite remaining upstream electrical budget, call allocation once across both halls:

```ts
const cooling = allocateCoolingCapacity(eligibleUnitIds, electricalBudgetKw, profile);
const trains = cooling.allocations.map(({ unitId, capacityKw }) => ({
  capacityKw,
  rackIds: validatedConnectionsByUnit[unitId],
}));
const thermal = advanceThermal(zones, trains, profile, segmentSeconds);
const coolingElectricKw = cooling.standbyKw + thermal.removedKw / profile.coolingCop;
```

The caller applies solver results and accounts for actual electricity over the segment. It must not repeat the full upstream budget independently per hall. Pass exact selected eligible IDs to `restartCoolingUnits` after the existing action/prerequisite checks, and let the engine's existing timing boundary handle readiness.

No integration prerequisite was missing. There is deliberately no new wire contract, DTO, clock, thermal solver, facility graph or production call site. Parent must still review the immutable implementation, resolve the pending facility contracts and integrate it. This evidence does not establish an expanded mission, UI behavior, persistence/replay compatibility, five-minute rehearsal, independent approval or user acceptance. The worktree is left clean after both task commits; ignored evidence remains available locally.
