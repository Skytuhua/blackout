# UI-01 specification excerpt

Read AGENTS.md and frozen src/shared and src/workers/protocol.ts contracts. Copied from the supplied master plan, which remains authoritative.

## Global constraints

- The confirmed art direction is **flat, overhead 2D with large, visible pixels**. The proposed implementation starts with a 16 × 16 tile grid and a 320 × 192 logical world viewport; verify readability with actual native-size assets. Earlier isometric concepts and their asset dimensions are superseded.
- The simulation owns physical state, task completion, timing, and scores. An LLM cannot assign temperatures, restore equipment, invent spare resources, or award points.
- Every consequential action has prerequisites, a duration, an equipment target, resource requirements, and explicit results.
- Truth, player observations, and each coworker's knowledge remain separate.
- Every shipped scenario has a known feasible response under its declared objectives. Damage-limitation scenarios must say that complete service preservation is impossible.
- The core mission remains playable when the model endpoint is slow, unavailable, or returns invalid output.
- API keys remain on the server. The first release has no live facility connections.
- Use high-level fictional maintenance actions. This is an educational systems model with disclosed assumptions; facility-calibrated prediction is a later capability.
- Prefer one complete, explainable incident over adding unfinished systems before the release gates pass.
- Run one coordinator and at most three workers. Assign exclusive writable paths, a pinned base commit, explicit contracts, and a concrete acceptance gate before dispatch. The coordinator owns integration and shared files.
- The public repository contains source, documentation, provenance, and synthetic fixtures. Credentials and local run data stay outside commits. A public repository does not require a publicly hosted game.

## Review focus

Review the units and accounting in the thermal and electrical models; algebraic dependencies between available power and cooling; simultaneous-event ordering; observations that could reveal hidden faults; delayed model responses after a reset; whether alternative replays preserve the same external disturbances; and whether low-resolution sprites remain recognizable at their actual runtime size.

## 2. The first complete mission

### 2.1 Facility

Build one compact site with eight racks in three labeled bays inside one hall. Add two aggregate cooling trains, two UPS units and distribution paths, a generator-backed cooling branch, two technicians, and a remote IT operator. The map can represent the generator as a connected yard panel if it does not fit the initial room.

The three bays are organizational and visual groupings. They are not three independent engineered data halls. Cooling allocation, airflow paths, and shared dependencies are explicit configuration data.

### 2.2 Flagship incident: Hot Restart

A short power disturbance ends. The racks remain powered through their UPS paths, but cooling fails to resume because a declared controller or circulation prerequisite is unavailable. Inlet-proxy temperatures rise, while the electricity dashboard appears mostly recovered.

The player can inspect the cooling state, dispatch a technician, reduce noncritical workload, check a second temperature source, and stage the eventual recovery. Repeatedly issuing restart commands does not bypass a missing prerequisite. A completed repair does not instantly remove stored heat.

Hot Restart must place critical, interactive, and deferrable work together on each endangered rack. Pausing unrelated batch racks does not reduce a critical rack's heat when the thermal nodes have no coupling and cooling is unavailable. The dedicated batch-rack placement in Last Feed is a separate scenario configuration. Validate the first mission's mitigation claim against its exact workload placement.

The first recovery lesson is verification before restoring workload. The current identical cooling trains and common capacity pool do not establish a meaningful load-aware chiller restoration order. A later scenario must add explicitly different loads or staggered readiness before claiming to teach that decision.

The opening mission uses a simple control or circulation fault. A water-temperature restart lockout belongs in a later scenario with an explicit water-loop state; the first model must not claim to simulate that mechanism using only room temperature.

### 2.3 Eight to twelve minutes of play

| Phase | Experience | What it teaches |
|---|---|---|
| Briefing, about 45 seconds | See the service objective, two crew members, and current equipment status. | Understand priorities before acting. |
| Initial disturbance, about 1 minute | Power returns but cooling output remains low. | Power availability and equipment readiness are different. |
| Diagnosis, about 2 minutes | Inspect trends and ask a coworker to check a prerequisite. | Separate evidence, inference, and missing information. |
| Intervention, about 3 minutes | Dispatch repair and choose a workload mitigation. | Repair time and thermal headroom create a real tradeoff. |
| Recovery, about 2 minutes | Restore cooling and manage a declared workload pulse. | Recovery needs sequencing and verification. |
| Debrief, about 2 minutes | Review the event chain and a simulated alternative. | Connect the decision to an operational principle. |

These are pacing targets. Default playback is 1× simulation speed. Offer pause and explicit 2× or 4× controls; display simulation time separately from wall time. The short judging demonstration can use a prepared checkpoint and faster playback.

### 2.4 Interaction loop

Select an asset, inspect its readings and timestamps, choose an intervention, select an eligible technician if required, review travel and work time, then dispatch. Show queued, traveling, inspecting, working, blocked, completed, and canceled states. A worker begins physical work only after arrival at the equipment's service tile.

Remote workload changes and field maintenance are different task types. A remote cap can take effect after its configured control delay; a physical repair consumes a technician and travel time. A canceled repair records any completed work and releases the worker according to that task's explicit cancellation rule.

### 2.5 Objectives and mission ending

Define the first mission's success in scenario data: the failed cooling prerequisite is restored; critical demand is fully served; no active overload remains; every modeled inlet proxy is below the profile's 27°C warning threshold; and batch processing has resumed at a sustainable rate. Hold those conditions for 60 simulated seconds and require a final fresh verification report before declaring success. The debrief still reports any earlier service loss and remaining batch delay.

Proposed failure conditions are 60 consecutive simulated seconds with no critical service, or failure to stabilize within a 600-second mission window. These are authored exercise limits, not real operational standards. Ending a mission stops new gameplay actions and closes pending model requests. Provide a clear result, debrief, retry, and checkpoint-retry path. Any continued practice occurs in an explicitly resumed practice branch.

The mandatory tutorial explains the first selection, timestamp check, inspection, and dispatch through short contextual prompts. Display objective progress throughout the mission. This authored first-time flow ships even if the adaptive LLM coach is cut.

Internal success evaluation can inspect truth, but live objective checkmarks and recovery countdowns must wait for permitted evidence. Show "awaiting verification" instead of disclosing a hidden correction. The initial verification rule uses authorized readings taken within 10 simulated seconds, with an independent probe required when the ordinary sensor is under investigation. Define separate objectives for the other families; Hot Restart's cooling-repair requirement does not apply to a sensor-only incident.


## 4. Observations, uncertainty, and communication

Maintain three layers:

| Layer | Contains | Who can use it |
|---|---|---|
| World truth | Actual energy, heat, connectivity, latent faults, pending failures, and equipment readiness. | Engine and post-mission forensic analysis. |
| Player observation view | Sensor samples, timestamps, delivered reports, visible indicators, and permitted topology. | HUD, world presentation, player-facing coach. |
| Actor knowledge view | Only observations and reports available to that coworker. | That coworker's model prompt and tools. |

Every observation has an ID, source, value, units, observation time, receipt time, and known freshness or quality metadata. Do not automatically mark a covertly faulty sensor as faulty. The player may need to compare it with an independent source.

The art also consumes an observation-based presentation view. A hidden fault must not appear as a red cabinet simply because the engine knows about it. A stopped, visible fan can be an observation. An invisible internal control failure cannot. The thermal overlay displays measured or explicitly estimated values; unknown cells remain unknown and stale readings are marked.

Handoffs contain affected assets, current status, supporting observations and their times, actions completed, work in progress, unresolved risks, next owner, and acknowledgment. The communication score concerns correct information and delivery, not eloquence or message count. HSE's handover guidance supports preparation, communication, and incoming cross-checking as distinct parts of the process. [S6]


## 9. Flat 2D pixel-art specification

### 9.1 Committed visual identity

Use an orthogonal top-down map, horizontal and vertical walls, chunky square pixels, compact equipment silhouettes, and limited shading. The cyberpunk character comes from dark industrial rooms, cyan indicator pixels, restrained purple trim, amber work lights, and character portraits.

The latest generated flat, coarse-pixel direction board is the approved visual reference. Approval settles the direction; it does not establish a finished tile atlas, a playable interface, or exact native-grid consistency. Produce actual game assets on the declared grid and inspect them at runtime scale. Do not reopen the earlier isometric direction.

### 9.2 Pixel rules

| Rule | Specification |
|---|---|
| Logical viewport | 320 × 192 pixels, equivalent to 20 × 12 floor tiles. |
| Tile grid | 16 × 16 pixels, orthogonal. |
| Desktop scale | 3× gives 960 × 576; 4× gives 1280 × 768 when the layout fits. |
| Palette | 24–32 world colors, about three shades per material. |
| Sampling | Nearest neighbor; disable smoothing for world textures. |
| Coordinates | Continuous simulation positions; integer-snapped render and camera positions. |
| Zoom | Discrete integer scales; preserve aspect ratio and center spare space. |
| World text | Minimal short labels; detailed values and explanations live in the DOM. |
| Effects | Pixel frames and grid-aligned shapes; restrained animation driven by observed state. |

Integer scaling and explicit image-rendering behavior preserve hard pixel edges. Verify browser zoom and device-pixel-ratio behavior on the actual demo display rather than assuming CSS alone guarantees consistent pixels. [S11]

### 9.3 Palette and interface

Start with navy `#07111B`, panel blue `#102332`, light text `#DCEAF2`, muted text `#92A8B7`, cyan `#45D5E8`, purple `#CA70EA`, amber `#F4B860`, and critical red `#F06B79`. These are proposed anchors; derive the restricted sprite palette from them and verify final contrast.

The top bar shows delivered service, hottest observed inlet temperature with freshness, power headroom, and simulation time. The right panel shows the selected asset's observations, trend, dependencies, recent events, and actions. The bottom strip shows crew assignments and progress. Show one map overlay at a time: temperature, power, or service dependencies.

Use ordinary readable UI fonts for dense information. A blocky pixel heading can establish the theme without forcing a novice to read an explanation through a tiny pixel font.

### 9.4 Asset manifest

Dimensions are native logical pixels. Anchors are measured from the untrimmed frame's top-left. Preserve source dimensions and atlas metadata.

| Priority | Asset family | Frame | Anchor | Initial content |
|---|---|---:|---:|---|
| P0 | Floor | 16 × 16 | 8,8 | One base; two variants after the core gate. |
| P0 | Walls and corners | 16 × 16 | 8,8 | Horizontal, vertical, corners, doorway. |
| P0 | Rack | 16 × 32 | 8,16 | One recognizable base; separate status pixels; extra appearances later. |
| P0 | Cooling train | 32 × 32 | 16,16 | One base, four fan frames. |
| P0 | UPS | 16 × 32 | 8,16 | One base, charge/discharge/off overlays. |
| P0 | Distribution cabinet | 16 × 16 | 8,8 | One base, observed-state indicator. |
| P0 | Technician | 12 × 16 | 6,8 | Four directions, one idle and two walk frames each. |
| P1 | Technician work | 12 × 16 | 6,8 | Two work frames per direction; a readable static work state is sufficient initially. |
| P1 | Tool cart | 16 × 16 | 8,8 | One base. |
| P1 | Portrait | 32 × 32 | Center | Three characters; text identity works before portrait polish. |
| P0 | Path, selection, flow, heat | Grid primitives | Grid | Drawn from view state. |
| P1 | Generator | 32 × 32 | 16,16 | Standby/running frames. |
| P1 | Network cabinet | 16 × 16 | 8,8 | Base and observed link-state pixels. |
| P1 | Signs and props | 8 × 8 or 16 × 16 | Center | Small shared set. |

The polished target is roughly 15–20 approved base tiles and objects, 20 technician frames, four cooling frames, and three portraits. It is not the first-release asset floor. Start with the floor/wall set, rack, technician, and cooling masters; use simple grid-aligned symbols for power cabinets and state overlays until their final sprites exist. Reuse animation geometry with character color variants. A 512 × 512 RGBA atlas has a 1 MiB uncompressed base level and is a reasonable ceiling. Use padding to prevent adjacent sprite bleed.

### 9.5 Asset production and animation

First approve a rack, floor tile, technician, and cooling-unit reference at the exact intended native sizes. Generate modular transparent bases against the same reference, view, light direction, silhouette rules, and palette. Normalize every accepted base to its declared native frame size, restrict its palette, clean the pixel clusters and transparency, and align its anchor and collision footprint. Inspect the result at native size and at 3×. Review each sprite for recognizable equipment shape. Inspect every frame of a generated sheet; do not assume frame counts or alignment are correct.

The game/UI worker owns the first four master assets and their runtime integration in Wave 1. Verify them before producing variants. Timebox the first asset pass to 90 minutes; if it slips, cut extra cabinet appearances, directional work-frame polish, and portrait variants first. Preserve the floor, rack, cooling unit, technician, and essential state indicators. A later art-polish task can use a freed worker slot, with exclusive ownership of the asset directory for that task.

Keep labels, status indicators, paths, and progress graphics separate from base artwork. Name assets by role and state, for example `rack_standard`, `cooling_fan_0`, and `tech_walk_n_1`, and record frame duration, anchor, collision footprint, and license/provenance in the manifest.

Use sprite frames at approximately 4–8 frames per second for fans and walking. Rendering can still run at 60 frames per second. The engine's task progress determines location; animation merely depicts it. Pause freezes mission animation, and speed changes advance it consistently with simulation time.

| Visual behavior | Required cause |
|---|---|
| Fan spins or stops | Observed operating state. |
| Rack indicator activity | Observed power and workload state. |
| Technician walks | An accepted task and a valid route. |
| Work loop plays | Worker has arrived and the task is progressing. |
| Flow pixels move | A known active power or cooling path. |
| Migration progress appears | An actual migration task is pending. |
| Temperature overlay changes | A new measurement or explicitly labeled estimate. |

Use PNG sprite atlases in the game. Export GIF or video loops for the submission and promotional previews. Engine-controlled frames let pause, speed, state transitions, and reduced-motion settings stay coordinated; independent looping GIF elements would need additional synchronization. MDN documents the relevant image-format properties. [S12]

Do not add smoke, sparks, or arcing to ordinary temperature warnings. Those effects imply damage mechanisms the initial simulation does not contain.


### 10.3 Frozen integration surface

The coordinator owns contract version `1` and publishes the types, Zod runtime schemas, JSON examples, and adapter stubs before workers start. Interfaces below are the required public boundaries; implementation internals remain owned by their worker. Use stable string IDs and finite serialized numbers, explicit units, and simulation seconds. Wall-clock milliseconds belong only in transport/latency fields.

| Boundary | Required interface | Behavioral contract |
|---|---|---|
| Engine creation | `initialize(spec: ScenarioSpec, runId: string): SimulationEngine` | Creates a balanced, seeded state; performs no network or rendering work. |
| Fixed advancement | `engine.step(ticks: number): StepResult` | Advances an integer number of one-second ticks using the same event order at every playback speed. |
| Commands | `engine.applyCommand(request: ActionRequest): CommandReceipt` | Queues intent with a stable sequence and idempotency key; distinguishes queued from accepted/rejected/applied. Execution is resolved at the documented command boundary. |
| Projection | `engine.observe(actorId: string): KnowledgeView` | Returns permitted evidence, public task receipts, action affordances, and observed versions; excludes latent faults and hidden causal parents. |
| Checkpoint | `engine.snapshot(): Checkpoint` and `restore(checkpoint: Checkpoint, runId: string): SimulationEngine` | Restores all authoritative timers, pending work, knowledge, and RNG/event state; a new run envelope invalidates old provider callbacks. |
| Browser bridge | `SimulationClient.command`, `observe`, `subscribe`, `pause`, `setSpeed`, `snapshot`, `restore` | Typed request IDs and a single worker protocol; UI never reaches into worker memory. |
| UI root | `OperationalView({ view, onAction, onInspect, onAskCoworker })` | Reads one projected view and emits typed intentions. Visual state is not authoritative simulation state. |
| Gateway client | `startInteraction(input, signal)` and `continueInteraction(input, signal)` | Returns a discriminated union: scoped tool request, validated final response, or explicit fallback. |
| Tool runner | `executeToolIntent(intent, scopedContext): Promise<PublicToolResult>` | Uses the same worker validation path and role projection as direct player actions. |
| Outcomes | `buildOutcomeLedger(record): OutcomeLedger` | Computes numerical outcomes and factual timeline from the engine record; makes no model call. |
| Comparison | `compareEarlierCap(record, change): ComparisonResult` | Uses the recorded external schedule; returns completed or unsupported continuation with the valid common horizon. |

The engine may receive commands while paused, but processing them must not advance physical time. At an explicit command boundary, reserve accepted work and return its receipt; travel, work duration, and heat resume only when time advances. Record that boundary's sequence so replay does not depend on Promise timing. A queued receipt is never presented as a completed inspection or accepted repair before the relevant validation occurs.

Freeze these minimum payloads in the schema pack:

| Payload | Fields required before fan-out |
|---|---|
| `KnowledgeView` | `schemaVersion`, `runId`, `actorId`, `simTime`, `viewHash`, permitted observations, known topology, public task summaries, allowed procedure IDs, action affordances, observed entity versions. |
| `ActionRequest` | `schemaVersion`, `runId`, `requestId`, `actorId`, `intent`, `expectedEntityVersions`, `idempotencyKey`. The worker assigns its simulation sequence. |
| `CommandReceipt` | Matching IDs, status, public reason code, permitted task ID/ETA or evidence references, and applicable observation time. Hidden diagnostics stay internal. |
| `GatewayStart` | Run/request/actor IDs, role, bounded user message or trigger, scoped `KnowledgeView`, permitted procedure excerpts, prompt version. |
| `GatewayContinue` | Matching run/request/interaction/actor IDs, expected call ID, current scoped view, validated public tool result. Provider history stays bounded and server-owned. |
| `AgentResponse` | Matching IDs, speaker, factual field selectors, clearly labeled inference/uncertainty, permitted action proposals, and mode (`live`, `scripted`, or `recorded`). |
| `OutcomeLedger` | Record/version identity, equal-horizon times, critical/interactive delivery and shortfall, batch backlog/delay, thermal and protection events, action/evidence timeline. |
| `ComparisonResult` | Base/branch identity, continuation policy, shared external-schedule identity, completion/unsupported status, supported horizon, outcome ledgers when valid, and public explanation of limitations. |

Freeze the worker request/reply discriminated unions as part of G0, not merely the names of domain types. Requests cover `initialize`, `advance`, `command`, `observe`, `snapshot`, and `restore`; replies cover initialized/advanced acknowledgments, command receipts, projected views, recorder-only checkpoints, and bounded errors. Every request/reply carries its correlation ID and run identity, with the explicit new-run identity on restore. The coordinator's protocol fixtures cover each variant, including stale-run rejection.

Freeze gateway responses with a `kind` discriminator for `tool_request`, `final`, and `fallback`, separate from the displayed `live`/`scripted`/`recorded` mode. The UI props and typed intent callbacks in this section are part of the same contract version. No worker supplies an alternate envelope to avoid an integration dependency.

A checkpoint can contain authoritative state for restoration, but it is restricted to the recorder/replay path. Do not pass it through normal React view props or the coworker gateway. `ComparisonResult` must distinguish `complete` from `unsupported`; the unsupported variant includes the first invalid retained action and valid-prefix evidence, and excludes full-horizon alternative metrics. A UI must not render an unsupported branch as a completed comparison.

The gateway can reject malformed or excessive payloads, but it does not become a second source of physical truth. A local-browser training game does not claim server-verified anti-cheat. Distinguish API response shape validation from the engine's domain validation and the UI's evidence rendering.

`GET /api/health` reports mode, configured model, and whether a key is configured, without revealing the key or making a paid probe. `POST /api/llm/turn` accepts the start/continuation union. Abort/reset closes the matching interaction, and any delayed reply must still fail the run/request check. Keep the first protocol ordinary JSON over local HTTP; streaming and WebSockets are not required.


## 11. Performance and accessibility

Proposed performance gates: immediate input acknowledgment under 100 ms; 60 FPS on the demo laptop with a 30 FPS fallback; no main-thread stalls during a comparison; and an initial download under 5 MB excluding optional later content. Measure these after integration.

A one-second simulation step does not require one-second animation jumps. Interpolate technician presentation between known positions and round the rendered pixel coordinates. Sensor sampling remains five seconds unless the profile says otherwise. Do not invent fresh readings just to animate a chart smoothly.

Provide a keyboard-accessible equipment list, visible focus, textual states, and sufficient text contrast. A selectable object has at least a 16 × 16 logical hit area, which becomes 48 × 48 CSS pixels at 3×. On narrower displays, collapse the inspector into a drawer.

Honor reduced motion. Replace moving flow markers and decorative cycles with static state symbols and readable progress. Keep alarms understandable without sound or blinking. Show audio events as captions. Default to restrained effects so the game remains legible during a stressful incident.

## 12. Release scope and cut order

| Mandatory first release | Finish only after the required gates pass | Later |
|---|---|---|
| One compact room, eight racks, two technicians, and coherent coarse pixel art. | Three reviewed Hot Restart presets. | Multiple rooms and a campaign. |
| One complete cooling incident with briefing, intervention, recovery/failure, and retry. | One additional causal family, selected for remaining time. | A full incident library. |
| Thermal, power-capacity, workload, crew, and observation basics. | Extra state animations, portrait expressions, and sound polish. | Water-loop storage, network/quorum behavior, and restoration surges. |
| One live grounded coworker inspection tool cycle; three character roles share the same adapter. | A second live conversational role or a more nuanced handoff. | Adaptive coaching and validated scenario authoring. |
| Engine-generated outcome ledger with factual timeline and concise OpenAI explanation. | More explanatory detail and a novice playtest. | Instructor tools and measured learning studies. |
| Replay, checkpoint restore, and one valid computed earlier-cap comparison. | Extra alternatives if their continuation policies are valid. | General policy comparison. |
| Local laptop launch, bounded API cost, labeled model fallback, accessible essential controls. | Wider browser/device checks. | Public hosting, shared sessions, and facility integrations. |

Cut in this order: additional causal families; adaptive coach and scenario author; cosmetic variants and audio; secondary overlays; extra comparison options. Preserve the approved pixel direction, one complete causal mission, evidence-grounded coworker, outcome ledger, and the single valid comparison. A failed comparison is shown as unsupported rather than replaced with invented metrics. If the mandatory loop cannot pass before freeze, disclose the missing feature and ship the last working checkpoint; do not describe a partial release as meeting this plan's full acceptance definition.

Baseline accessibility, truthful fallback labeling, accounting correctness, and secret handling are release requirements. They are not polish to defer. Voice, dynamic image generation during play, multiplayer, procedural facility layouts, login, cloud hosting, and a vector database remain outside the initial scope.


### Task 4: Build the pixel world and operational UI

**Files:** `src/game/*`, `src/ui/*`, `public/assets/*`.

**Owner and dependency:** Game/UI worker. `UI-01` uses frozen fixtures in parallel with `SIM-01` and `AI-01`; `UI-02` consumes the integrated `SIM-02` worker to reach G1. It does not wait for G1 to start. The coordinator owns the host application entry and worker bridge, so the UI worker exports the agreed component and callbacks.

- [ ] Produce, normalize, and inspect the master tile, rack, cooling, and technician sprites at native size and 3×, including palette, alpha, anchors, and footprints.
- [ ] Add orthogonal placement, integer scaling, selection, keyboard list, and state-linked animation.
- [ ] Connect the actual `KnowledgeView`, actions, crew queue, and trends.
- [ ] Add observed thermal and power overlays with stale and unknown states.
- [ ] Add the authored first-inspection/dispatch guidance, objective progress, result screen, and retry path.
- [ ] Verify the entire first mission without a model connection.

**Gate:** A player can diagnose, act, and recover using the controls, while visuals reflect only permitted observations.
