# SIM-02 independent review and corrections

Read-only review of `04603bf..8c00e73` confirmed the public-evidence policy reaches success at t331 and a restored successful run continues physical accounting to t600 without changing its terminal result. The reviewer ran 63 simulation tests, 81 total tests and typecheck; no browser/provider acceptance was claimed.

One HIGH restoration finding blocked integration: saved tasks could omit a required batch ceiling and later write undefined into physical state; a task could also claim completion before its declared arrival/work end.

The coordinator reproduced missing/changed ceiling, missing technician and premature-completion snapshots as four failing rejection tests. Restore now checks shared action-argument requirements, consistency with the accepted command, selected technician identity and completed-task time/progress. Five focused restoration regressions cover those cases and mismatched selected worker. Existing successful, canceled, delayed-report and terminal snapshots remain required positive cases.

No shared schema or authored content changed. Map field-name adaptation and the actual worker/host remain coordinator integration work. No hidden-truth oracle was demonstrated in the policy, live countdown or action affordances. This review establishes headless engine behavior only; G1, replay and live tools remain separate gates.
