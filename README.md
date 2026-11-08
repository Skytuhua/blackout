# Blackout

A pixel-art incident-command game about keeping a data center running through a cooling failure.

Direct Alex, Jules, and Sam through conversation and suggested orders. The deterministic simulation controls power, heat, workload, travel, work completion, reports, and the mission outcome. OpenAI coworkers explain the evidence available to their character and can propose supported orders for validation.

[Source repository](https://github.com/Skytuhua/blackout) | [Build status and evidence](docs/build-status.md)

## Run locally

Requires Node.js 24 and npm. From the repository directory:

```sh
npm ci
npm run build
npm run demo
```

Open **http://127.0.0.1:4173/** and choose **Start guided game** or **Practice**. The production server uses this fixed local origin; stop an existing instance before launching another one.

The default is offline/scripted mode and needs no API key. Suggested orders remain usable when the model is unavailable. Fonts, pixel art, and sound assets are served locally.

## Play

- Select **Alex (Cooling)**, **Jules (Power)**, or **Sam (IT)** in the conversation sidebar. Each character keeps its own conversation and draft.
- Choose a suggested order to start a validated task, or type a question or supported work request. **Enter** sends; **Shift+Enter** inserts a newline. Characters travel automatically when accepted work requires it. Busy work requires an explicit stop request before replacement.
- Watch the assignment and task progress, then read the delivered report. Travel, work completion, and report arrival are separate events.
- Drag the map or focus it and use the arrow keys to pan. Use the mouse wheel or zoom buttons to zoom, and **Reset** to fit the map again. Selecting known equipment sets conversation context.
- Use **Pause/Resume** and the header **Speed** selector for 1x, 2x, or 4x simulation time. **Menu > Sound** controls sound effects and volume.
- **Menu** contains **History**, **Save game**, **Saved games**, and **Replay and results**. Compatible saves resume paused; replay and comparison use recorded simulation evidence. Saves belong to the browser profile and local origin. Use **Export original** to keep a copy outside browser storage.

The current demo simulates the original facility; the additional rooms are scenery. It targets desktop play, and mobile is deferred.

## Enable live coworkers

Copy [.env.example](.env.example) to `.env.local`, add your own server-side key, and set:

```dotenv
OPENAI_API_KEY=your_key_here
LLM_MODE=live
OPENAI_MODEL=gpt-6.1-terra
OPENAI_REASONING_EFFORT=low
```

Then run `npm run demo`. Keep `.env.local` private and never put a key in a `VITE_` variable. The gateway validates character identity, permitted evidence, proposed actions, and current simulation state. It applies persisted usage limits and returns a labeled fallback on unavailable or invalid replies. The configured limits are documented in [.env.example](.env.example); local accounting is not a provider-side billing cap.

## Verify

Install Chromium once for the browser tests:

```sh
npx playwright install chromium
npm run verify
```

`verify` runs type checking, unit tests, the production build, and browser checks. Routine tests use mocked or disconnected model transports and do not require an API key. `npm run dev` starts the development client and local service together.

The latest recorded checks include 473 unit tests and focused production-browser checks for map navigation, conversations, reports, saved runs, and replay. See the [current checkpoint](docs/build-status.md) for the exact scope; a human first-time-player walkthrough and physical sound check remain separate acceptance work.

## Source, assets, and boundaries

The stack is TypeScript, React, Phaser, Vite, a simulation Web Worker, a local Node service, OpenAI Responses API, IndexedDB, Vitest, and Playwright. Dependencies are pinned in `package-lock.json`.

- [Asset and template provenance](docs/asset-provenance.md) records the pixel-art production method and source custody.
- [Retro sound provenance](docs/assets/retro-audio-provenance.md) records the Freesound CC0 public previews, authors, transformations, and hashes used for the sound pack.
- Font notices are included under [public/licenses/fonts](public/licenses/fonts).
- [Master plan](docs/blackout-master-plan.md) preserves the original design baseline; [conversation plan](docs/conversation-game-plan.md) records the replacement interaction direction.

Blackout uses fictional equipment profiles and reduced-order models for an educational demo. It has no live facility connection and is not a calibrated operational predictor. Credentials, local run data, and personal logs are excluded from the repository.
