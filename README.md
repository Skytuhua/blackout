# Blackout

A 2D pixel-art incident-command game for the NMC² challenge, **Keep the World Running**.

The player directs a data-center team through a cooling failure. Power, heat, workload, technician travel, and delayed observations determine the outcome. OpenAI coworkers inspect the same evidence the player can access, and the debrief explains an engine-computed replay and one alternative response.

## Status

Foundation shell: strict schemas, authored scenario inputs, React/Phaser host, typed worker bridge, local production server and contract/browser checks. The displayed world and readings are labeled development fixtures. The mission engine, final artwork, model gateway and replay are not integrated yet.

The delivery target is a local laptop-browser demonstration for judges. [Public source repository](https://github.com/Skytuhua/blackout). No public game hosting is required for the initial release.

## Start here

- [Master plan](docs/blackout-master-plan.md): product, simulation, visual direction, architecture, implementation tasks, and acceptance gates.
- [Agent instructions](AGENTS.md): ownership, isolated worktrees, integration, review, and handoffs.
- [Build status](docs/build-status.md): task dependencies and current evidence.
- [Task packet template](docs/task-packet-template.md): the complete brief given to each development worker.
- [Initial agent packets](docs/agent-task-packets.md): foundation, simulation, game/interface, OpenAI, and reviewer briefs.
- [Asset provenance](docs/asset-provenance.md): how shipped assets and template code will be attributed.

## Run the foundation

Requires Node.js 24 and npm. All runtime fonts are local.

```sh
npm ci
npm run build
npm run demo
```

Open `http://127.0.0.1:4173`. `npm run dev` starts client and local service together. `npm run verify` checks types, unit tests, the production build and Chromium tests (first install: `npx playwright install chromium`). Focused simulation, gateway and replay scripts are reserved for their upcoming packages.

## Stack

TypeScript, React, Phaser, Vite, a deterministic simulation Web Worker, a small local Node service, OpenAI Responses API, IndexedDB, Vitest, and Playwright. The foundation task pins a compatible dependency set and adds the runnable commands.

The production command serves client and API from one stable loopback origin, fails if its port is occupied, and defaults to scripted mode. Health checks never make paid provider calls.

## Development model

One human builder supervises one coordinating agent and up to three parallel workers. The initial workers own simulation, game/interface, and OpenAI integration respectively. The coordinator owns shared contracts, content, package configuration, integration, and release evidence. Workers deliver small commits against a pinned base and do not merge themselves.

## Model boundaries

Blackout uses fictional equipment profiles and reduced-order models. It is an educational prototype, not a calibrated facility predictor or operational certification system. Provider failure switches the dialogue to labeled authored responses; the simulation continues independently.

Keep API keys in the local environment. Do not commit secrets, personal run logs, or credentials. Runtime inference budgets are separate from development-agent and image-generation costs.
