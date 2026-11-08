# PR 12 core review and repair

Reviewed base: `8b1f4242bbdf38db0633f8fca39bf555bc2d20da` on `feat/desktop-contracts`.

## Confirmed defects

The desktop contract exposed `move_crew`, but the engine rejected every movement with `INVALID_TARGET_ACTION`. The published practice scenario initialized as an active incident, reached the normal deadline, and the interactive worker did not support a practice status. Checkpoint validation assumed every field task ended at equipment, while replay validation accepted only the incident scenario. The engine identity had not changed for the new semantics.

Four existing tests also failed after the layout changed: a supposedly blocked coordinate was now walkable, an inspection completion boundary used the old travel distance, a canceled worker was compared with its old start and destination, and the bounded gateway context fixture replayed the old mission schedule.

## Changes

- Movement targets the selected field technician and is player-only. It uses the existing route, speed, busy-worker, entity-version, reservation and explicit-cancellation machinery. Its work duration is zero. Completion emits movement rather than an applied equipment operation, and creates no observation or report.
- Restore validates movement endpoints against the declared destination, preserves fractional canceled positions, and accepts active zero-work travel with zero progress. A same-position move completes at the paused boundary and can be restored immediately.
- Practice uses a distinct status, rejects scheduled disturbances, advances physical accounting, sensors and tasks, and has no incident objectives, deadline or terminal transition. It publishes an authored practice briefing and does not expose incident procedures. Practice mode and outcome counters are validated on restore.
- The interactive worker advances practice while retaining the existing first-terminal-tick behavior for incidents. A new incident receives a fresh run and rejects old practice callbacks.
- Replay supports the exact shipped incident and practice scenarios, requires the record and both checkpoints to agree on scenario identity, and rejects older engine versions. The new engine identity is `sim-desktop-v2`; wire schema 1 and saved host format 2 are unchanged.
- Existing geometry tests now derive blocked positions, initial positions, service endpoints and boundary timing from scenario data. The gateway fixture reaches recovery through the public-evidence policy instead of a stale fixed schedule.

## Verification observed

| Check | Result |
| --- | --- |
| Original PR baseline | 175 tests, 171 passed, 4 failed |
| New desktop tests before implementation | 17 tests, 3 passed, 14 failed |
| New desktop tests after implementation | 17 passed |
| `npm run typecheck` | Passed |
| `npm test -- --maxWorkers=2 --reporter=dot` | 193 passed in 28 files, 27.48 seconds |
| `npm run build` | Passed |
| `git diff --check` | Passed |
| `npm run test:e2e -- --workers=1` | All 8 cases blocked before application assertions because the Chromium executable is unavailable |

The new regressions cover real travel speed, no physical/evidence side effects, fractional cancellation and replacement, busy/remote/other-actor rejection, required and stale worker versions, invalid destinations, zero-distance paused movement, completed/canceled/active restore endpoints, movement replay, practice after 610 seconds, practice replay and a fresh incident. Existing incident success, idle failure, terminal worker stepping and common-horizon replay tests remain passing.

No physics constants or mission parameters changed. The public-evidence recovery policy now succeeds at simulation second 336 on the new map; the unchanged idle failure remains second 505. The separate E2E timing owner updated the browser fixture for these observed times.

## Remaining integration work

The core patch is ready for independent review. Browser E2E needs a runner with Chromium. The coordinator assigned old-save listing and raw export compatibility to a separate owner because the engine version transition must leave incompatible stored data exportable. That persistence patch is outside this commit.

This repair does not claim to complete the desktop UI rebuild or its practice onboarding host. No push, merge, deployment or provider call was performed.
