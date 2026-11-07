# Blackout

A 2D pixel-art incident-command game for the NMC² challenge, **Keep the World Running**.

The player directs a data-center team through a cooling failure. Power, heat, workload, technician travel, and delayed observations determine the outcome. OpenAI coworkers inspect the same evidence the player can access, and the debrief explains an engine-computed replay and one alternative response.

## Status

Planning package. The application, runtime assets, and automated game tests have not been implemented. The master plan defines the intended behavior and release gates; it is not a claim that those gates have passed.

The delivery target is a local laptop-browser demonstration for judges. The repository is intended to be public. No public game hosting is required for the initial release.

## Start here

- [Master plan](docs/blackout-master-plan.md): product, simulation, visual direction, architecture, implementation tasks, and acceptance gates.
- [Agent instructions](AGENTS.md): ownership, isolated worktrees, integration, review, and handoffs.
- [Build status](docs/build-status.md): task dependencies and current evidence.
- [Task packet template](docs/task-packet-template.md): the complete brief given to each development worker.
- [Initial agent packets](docs/agent-task-packets.md): foundation, simulation, game/interface, OpenAI, and reviewer briefs.
- [Asset provenance](docs/asset-provenance.md): how shipped assets and template code will be attributed.

## Planned stack

TypeScript, React, Phaser, Vite, a deterministic simulation Web Worker, a small local Node service, OpenAI Responses API, IndexedDB, Vitest, and Playwright. The foundation task pins a compatible dependency set and adds the runnable commands.

The planned local production flow is dependency installation, production build, then a single demo command serving the client and API on a loopback address. These commands are release requirements and are not available in this documentation-only package.

## Development model

One human builder supervises one coordinating agent and up to three parallel workers. The initial workers own simulation, game/interface, and OpenAI integration respectively. The coordinator owns shared contracts, content, package configuration, integration, and release evidence. Workers deliver small commits against a pinned base and do not merge themselves.

## Model boundaries

Blackout uses fictional equipment profiles and reduced-order models. It is an educational prototype, not a calibrated facility predictor or operational certification system. Provider failure switches the dialogue to labeled authored responses; the simulation continues independently.

Keep API keys in the local environment. Do not commit secrets, personal run logs, or credentials. Runtime inference budgets are separate from development-agent and image-generation costs.
