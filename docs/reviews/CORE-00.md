# CORE-00 foundation review

Reviewed immutable `6cf1bac..ab48f33` with a fresh code-reviewer agent. No source edits by reviewer.

| Finding | Disposition | Regression |
|---|---|---|
| Coworker observe response published to player subscriber | Actor-scoped subscriptions; other actor views return directly | Player subscriber sees only player while tool caller receives coworker view |
| Restore destination used as active source envelope | Keep source run until successful destination acknowledgment; cancel earlier callbacks; retain source on rejection | Source/destination transition, rejected-restore recovery, old callback invalidation |
| Unsupported comparison missing branch-prefix evidence | Require both valid-prefix ledgers at the supported equal horizon | Missing prefix and mixed horizons rejected; complete-horizon alternative remains excluded |

All three findings reproduced as failing tests before corrections. Coordinator verified the corrected behavior with focused tests and typecheck. The initial proxy concern was disproved: production and Vite `/api/health` both returned 200, so no routing change was made.

Review held G0 until these corrections. This review covers the fixture foundation and shared contracts. Real simulation, artwork, provider budgets/tool execution, replay and final release remain later gates.
