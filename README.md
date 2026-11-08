# Blackout

A 2D pixel-art incident-command game for the NMC² challenge, **Keep the World Running**.

The player directs a data-center team through a cooling failure. Power, heat, workload, technician travel, and delayed observations determine the outcome. OpenAI coworkers use their own permitted evidence and ordinary inspection tasks. The remaining delivery work adds an engine-computed replay, debrief and one alternative response.

## Status

Playable offline Hot Restart: the production React/Phaser interface uses the deterministic simulation worker, qualified dispatch, travel/work, delayed reports, workload mitigation and recovery verification. Browser controls complete recovery at t331 and an idle run fails at t505. Playback stops at the exact terminal tick; retry creates a fresh run.

Coworker requests now use the bounded local gateway, with factual selectors rendered from records and inference/uncertainty labeled separately. Inspections go through the real worker; repairs and workload proposals await player confirmation. A live OpenAI cycle accepted inspection at t10, completed work at t47 and delivered its report at t49 before a grounded follow-up. Default scripted mode and provider outages leave the complete mission usable.

Replay, persistence, comparison, the final timing sample and release rehearsal remain unfinished application work. The replay/storage library is undergoing independent review.

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

Open `http://127.0.0.1:4173`, read the briefing and start the mission. Pause or step time to review evidence before dispatch. Use the equipment list with a keyboard, select a qualified technician, and wait for task completion and the delayed report before choosing a repair. Workload controls preserve deferred batch work.

`npm run dev` starts client and local service together. `npm run verify` checks types, unit tests, the production build and Chromium mission tests (first install: `npx playwright install chromium`). `npm run test:sim`, `npm run test:contracts` and `npm run test:llm` run focused suites.

## Stack

TypeScript, React, Phaser, Vite, a deterministic simulation Web Worker, a small local Node service, OpenAI Responses API, Vitest and Playwright. IndexedDB persistence is planned. Dependencies are pinned in the lockfile.

The production command serves client and API from one stable loopback origin, fails if its port is occupied, and defaults to scripted mode. Health checks never make paid provider calls.

For live coworkers, provide `OPENAI_API_KEY` only in the local server environment and set `LLM_MODE=live`; optional local overrides load from `.env.local`. Never put a key in a `VITE_` variable. Routine tests use synthetic transports, while live acceptance checks are run separately with bounded calls.

## Development model

One human builder supervises one coordinating agent and up to three parallel workers. The initial workers own simulation, game/interface, and OpenAI integration respectively. The coordinator owns shared contracts, content, package configuration, integration, and release evidence. Workers deliver small commits against a pinned base and do not merge themselves.

## Model boundaries

Blackout uses fictional equipment profiles and reduced-order models. It is an educational prototype, not a calibrated facility predictor or operational certification system. Provider failure switches the dialogue to labeled authored responses; the simulation continues independently.

Keep API keys in the local environment. Do not commit secrets, personal run logs, or credentials. Runtime inference budgets are separate from development-agent and image-generation costs.
