# Blackout

A 2D pixel-art incident-command game for the NMC² challenge, **Keep the World Running**.

The player directs a data-center team through a cooling failure. Power, heat, workload, technician travel, and delayed observations determine the outcome. OpenAI coworkers use scoped evidence and ordinary inspection tasks. Recorded runs include a computed debrief and an earlier-workload alternative.

## Status

The desktop rebuild has a fixed, non-scrolling game window, 111-frame pixel atlas, commander movement, technician orders, animation and guided healthy practice. Real browser controls complete Hot Restart at t336; an idle run fails at t505. Interactive play stops at the exact terminal tick. Practice starts a separate mission at time zero.

Coworkers use the bounded local gateway. Facts, inference, uncertainty, tool receipts and provenance have paged views. Repairs and workload proposals await confirmation against the exchange's original versions. Provider outages leave direct orders usable. Earlier live capability evidence is retained in [AI-02](docs/reviews/AI-02.md); desktop runtime checks are recorded separately.

Native IndexedDB saves preserve original transcripts and incompatible bytes for export. Compatible saves resume paused; replay projects scoped views in a separate worker, and comparisons retain equal horizons or label their supported prefix. Actual laptop rehearsal, user visual acceptance and training effectiveness remain separate acceptance steps. Mobile is deferred.

The delivery target is a local laptop-browser demonstration for judges. [Public source repository](https://github.com/Skytuhua/blackout). No public game hosting is required for the initial release.

## Start here

- [Master plan](docs/blackout-master-plan.md): product, simulation, visual direction, architecture, implementation tasks, and acceptance gates.
- [Agent instructions](AGENTS.md): ownership, isolated worktrees, integration, review, and handoffs.
- [Build status](docs/build-status.md): task dependencies and current evidence.
- [Task packet template](docs/task-packet-template.md): the complete brief given to each development worker.
- [Initial agent packets](docs/agent-task-packets.md): foundation, simulation, game/interface, OpenAI, and reviewer briefs.
- [Asset provenance](docs/asset-provenance.md): how shipped assets and template code will be attributed.

## Run the mission

Requires Node.js 24 and npm. All runtime fonts are local.

```sh
npm ci
npm run build
npm run demo
```

Open `http://127.0.0.1:4173` and choose Start practice or Skip practice. Focus the facility and use WASD/arrows to walk, E to view nearby equipment, or select equipment on the map. Select Facilities/Electrical and click floor to request travel; Command → Movement provides a keyboard equivalent. Equipment → Work offers inspection and repair orders. Pause and 1x/2x/4x control time. Radio, Replay and More open paged panels; Replay → Runs contains save/export/resume actions. Help includes instructions and Restart mission. Wait for completed work and its delayed report before choosing a repair.

`npm run dev` starts client and local service together. `npm run verify` checks types, unit tests, the production build and Chromium mission tests (first install: `npx playwright install chromium`). `npm run test:sim`, `npm run test:contracts` and `npm run test:llm` run focused suites.

## Stack

TypeScript, React, Phaser, Vite, a deterministic simulation Web Worker, a small local Node service, OpenAI Responses API, IndexedDB, Vitest and Playwright. Dependencies are pinned in the lockfile.

The production command serves client and API from one stable loopback origin, fails if its port is occupied, and defaults to scripted mode. Health checks never make paid provider calls.

For live coworkers, provide `OPENAI_API_KEY` only in the local server environment and set `LLM_MODE=live`; optional local overrides load from `.env.local`. Never put a key in a `VITE_` variable. Routine tests use synthetic transports, while live acceptance checks are run separately with bounded calls.

## Development model

One human builder supervises one coordinating agent and up to three parallel workers. The initial workers own simulation, game/interface, and OpenAI integration respectively. The coordinator owns shared contracts, content, package configuration, integration, and release evidence. Workers deliver small commits against a pinned base and do not merge themselves.

## Model boundaries

Blackout uses fictional equipment profiles and reduced-order models. It is an educational prototype, not a calibrated facility predictor or operational certification system. Provider failure switches the dialogue to labeled authored responses; the simulation continues independently.

Keep API keys in the local environment. Do not commit secrets, personal run logs, or credentials. Runtime inference budgets are separate from development-agent and image-generation costs.
