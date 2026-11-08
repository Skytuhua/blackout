# SIM-01 review and corrections

Independent read-only review of `fb8e798..d390c94` found one high and two medium state-transition defects. The coordinator accepted and reproduced them before correction.

| Finding | Correction | Regression evidence |
|---|---|---|
| Throttle release hysteresis forgotten by power/boot transitions | Persist a throttle latch, clearing it only after the declared cold dwell | Warm power cycle stays throttled; cold dwell releases it; mid-boot snapshot restores the same protection behavior |
| Off-state zero demand admitted an unpowered boot at reconciliation | Resolve prospective boot demand before committing transitions, including the endpoint | Eight off racks with empty UPS and a 10kW generator remain off, without boot/power-off event churn |
| Zero-time boot checkpoint restored but could not advance | Reject a booting rack without a positive remaining boot timer | Invalid snapshot rejected during restoration |

Four meaningful regression tests failed before correction. After correction: 37 simulation tests and typecheck passed. The original 33 analytic/accounting cases remain passing. The added throttle latch is private checkpoint state in this unreleased physical slice; no shared domain envelope changed.

The review found no additional demonstrated DC/AC, partial-tick feed-redistribution, backlog or common-pool cooling defect. That is scoped review evidence, not calibration against a facility. Mission actions, crew travel, observations, objective evaluation, browser integration, replay/comparison and live-provider behavior remain later gates.
