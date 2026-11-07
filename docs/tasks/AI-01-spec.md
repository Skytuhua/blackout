# AI-01 specification excerpt

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

## 6. LLM design

### 6.1 Role allocation

| Role | Input | Permitted output | Priority |
|---|---|---|---|
| Field coworker | Role-scoped observations, task results, procedures, delivered messages. | Grounded reports, hypotheses, inspection requests, proposed allowed tasks. | P0. |
| Debrief writer | Engine-generated decision ledger and computed comparison results. | Explanation with evidence references. | P0. |
| Radio and handoff presentation | Structured factual event payloads. | Concise character-specific messages containing those facts. | P0 with templates; optional model phrasing within the same budget. |
| Adaptive coach | Player-visible evidence and objective progress. | Progressive hints without hidden answers. | P1. |
| Scenario author | Approved templates, bounded parameters, schema, design objectives. | Proposed specification for validation before a run. | P1, offline or pre-mission. |

One model adapter can serve these roles. Separate role prompts and knowledge projections are more important than running many autonomous services.

### 6.2 Coworkers

Use three recognizable characters: a facilities technician who inspects cooling, an electrical technician who reports power-path readiness, and a remote IT operator who handles workload priorities. Give them concise communication styles, not random personalities that manufacture mistakes.

A useful response structure is `observation`, `evidenceIds`, `inference`, `uncertainty`, and `proposedActions`. The coworker can say what remains unverified. Numeric readings, repair ETAs, and asset states must refer to available observations or engine results.

A valid evidence ID alone does not prove that the accompanying sentence agrees with the evidence. Return factual references as structured record-and-field selectors, and render readings, units, task status, and ETAs directly from those permitted records. Compose factual radio lines from templates and those fields. Display model-written interpretation separately as an inference. The same rule applies to debrief metrics: the engine supplies the values and factual timeline; model prose is an explanatory layer, not an authoritative numerical source.

When uncertain, the model can request an inspection. An inspection advances through the ordinary task system and produces a new observation on completion. It cannot return the hidden answer immediately.

### 6.3 Tool boundary and example

The allowlist starts with `get_observations`, `read_procedure`, `inspect_task_status`, `request_inspection`, and `propose_action`. Keep tool names and argument schemas fixed. `request_inspection` requires the appropriate delegated scope and an eligible worker; plant-changing proposals use the player's ordinary action confirmation.

Every tool result, action receipt, validation failure, fallback, and event reference passes through the same role-scoped projection. Keep internal diagnostic reasons and hidden causal-parent events in the engine log. A public rejection can state that an inspection is required; it must not reveal an unobserved component fault merely because a speculative action was rejected. Procedure access is based on known assets and role, not an undisclosed diagnosis. `propose_action` is not a hidden-state query API.

Example: the player asks the facilities technician to investigate Cooling-2. The initial context already includes that actor's recent permitted readings and the relevant short fictional procedure. The model requests a local inspection, receives the engine's acceptance and ETA, and returns a grounded acknowledgment. A later completion event supplies the inspection result in a new interaction. The read tools obtain missing permitted context when needed; the ordinary path does not spend three calls fetching data before it can dispatch.

The worker is in the browser. The server returns tool intentions to the client; the client executes approved tools through the worker and sends scoped results to the next model turn. The server must not pretend it can directly read browser-worker memory.

An accepted inspection returns a public task receipt, task ID, and ETA immediately. End that request normally. A terminal task event can start a new bounded model turn with the actor's delivered result and a fresh scoped view. Do not keep an HTTP request open for a multi-minute repair or inspection. The tool-turn limit applies to each bounded interaction, not the entire lifetime of the physical task.

Use OpenAI's Responses API. Declare the allowlisted function tools with `strict: true`, `additionalProperties: false` on each object, and all properties required; use nullable fields where an argument can be absent. Set `parallel_tool_calls: false`. Preserve the returned output items, then append the matching `function_call_output` by `call_id` when continuing the tool cycle. [S8]

Use `text.format` with a strict JSON schema for the final coworker response and debrief. Check refusals and incomplete responses before parsing. Schema adherence is a shape guarantee; the game still validates evidence, role, freshness, and action prerequisites. [S9] Keep SDK and provider encoding inside `server/llm/adapter.ts`; share domain schemas with the client instead of provider SDK objects.

### 6.4 Validation and failure behavior

Validate syntax, schema, permitted tool name, target existence, role, bounds, prerequisites, available resources, and relevant entity versions. Model text cannot write arbitrary state fields. Evidence IDs must belong to the actor's view. A model saying "repair complete" does not complete the repair.

Every model request carries `runId`, `requestId`, the knowledge snapshot hash, and relevant observed entity versions. Discard replies from a previous run or reset. A late factual report can remain visible with its observation timestamp. Revalidate an action against current conditions before execution; do not reject every reply simply because a global revision advanced while the model was responding.

Make command application idempotent by request and tool-call ID: a duplicate returns its original receipt without reserving resources twice. A reset creates a new run instance even if the seed stays the same. Timeout and cancellation close the originating request; a late response cannot execute tools. Match every resumed tool result to its run, request, actor, and call ID. Cache keys include the run, actor, knowledge hash, prompt version, and model identity.

Use one active provider request globally for this single-player local demo, one active interaction per conversation, and coalesce related events. Cap an interaction at three model calls, including the final response. Force a final response without further tools on the last permitted call; if no valid final response arrives, render the permitted receipt and authored fallback. The 2–5 second short-response target remains unmeasured. Initial deadlines are 8 seconds per coworker provider call, 18 seconds for a complete coworker interaction, and 20 seconds for the single debrief call. Disable automatic SDK retries so hidden retries cannot evade the limits. Do not pause the simulation merely because a network request is outstanding.

On failure, display an authored response assembled from the same permitted observations. Mark scripted fallback and cached demonstrations honestly. Limit calls by meaningful events and explicit player interactions, not per frame or per tick. An interaction can contain multiple billable provider calls. Start with a server-enforced ceiling of 24 provider invocations per mission, counting tool rounds, completion messages, debrief, and any explicit retry. Also enforce a persistent local session allowance independent of client-created run IDs and server restarts. Exhausting an allowance invokes authored fallback. No ongoing public inference or paid hosting is part of this plan.

Bound context using the current permitted observations, relevant procedures, pending tasks, and a short recent conversation window. Measure actual request sizes and usage before estimating cost. Set supported provider parameters explicitly rather than inheriting expensive or incompatible defaults. Logs should normally contain request IDs, duration, usage, status, and validation outcomes rather than raw prompts.

Treat free-form player messages and scenario prose as data. They cannot expand the tool allowlist, access another actor's hidden observations, or change the rules. The browser has no provider secret. Add payload limits, timeouts, and rate limits to the server before sharing the demo.

### 6.5 OpenAI model, configuration, and cost

The initial candidate is `gpt-5.6-luna` for both coworker dialogue and the debrief, with `reasoning.effort: "none"`. Current official documentation describes a cost-sensitive model and lists Responses, function calling, and Structured Outputs support. Published text rates are $0.20 per million input tokens, $0.02 per million cached input tokens, and $1.20 per million output tokens; cache writes are listed at 1.25 times the ordinary input rate. Account access, quality on these tasks, and measured latency remain unverified. [S13]

| Setting | Initial implementation value |
|---|---|
| Provider and endpoint | OpenAI, `https://api.openai.com/v1`, Responses API. |
| Coworker and debrief model | `gpt-5.6-luna`; record the actual returned identity in provenance. |
| Reasoning | Explicit `none`, subject to the selected model's documented support. |
| Storage parameter | `store: false`; maintain only the bounded local interaction state needed for continuation. |
| Input allowance | At most 6,000 planned tokens including instructions, schemas, history, observations, and results. |
| Output allowance | 400 tokens per coworker call; 800 per debrief call. |
| Application default | `LLM_MODE=scripted`; switch the local config to `live` after the readiness check. |
| Proposed application API allowance | $5 for development/rehearsal/demo, enforced by the local gateway; an explicit configuration change can raise it. |

The $5 figure is a conservative configurable default chosen to interpret "keep it light," not a purchase, a provider-side billing cap, or permission to charge an account during planning. No paid request was made while preparing this plan. Development-assistant subscriptions/usage and image generation have separate costs and are not included in the per-mission estimate.

At 24 calls, 6,000 input tokens per call, and the larger 800-output-token cap on every call, the planning envelope is 144,000 input and 19,200 output tokens. At ordinary uncached rates this computes to $0.05184 per mission. Conservatively pricing every input token at the documented cache-write rate gives $0.05904, approximately **$0.06 per mission or $3 for 50 missions** under those assumptions. Actual usage, price changes, account-specific terms, and other tools can change the bill. Do not assume cache discounts or enable billable hosted tools. [S13]

Before each attempt, reserve the maximum planned token cost against the local allowance. Reconcile reported usage afterward; retain a conservative reservation for a canceled request with unknown usage. Validate/truncate input before sending, include tool schemas in the estimate, and reject a request that exceeds the allowance. Cache factual responses only within the correct run/actor/view identity. A user resetting a mission must not reset the global allowance.

The readiness check is one authenticated structured response and one actual inspection tool round trip through the worker, followed by ten representative interactions measuring full rendered-response latency and usage. Verify the exact account's model access and limits. OpenAI access stated by the user does not itself establish API credentials or available credit; ChatGPT and API billing are separate. [S14] Configure credentials through the local environment, never through the public repository or a chat transcript. If this candidate is unavailable, keep the scripted path working while selecting another documented low-cost OpenAI model and updating the price table explicitly.


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

### 10.4 Local demo packaging

The production service binds to `127.0.0.1`, serves the built client and `/api` routes from one origin, and calls OpenAI over HTTPS only in live mode. The development command may use a Vite proxy, but rehearsal uses the production build. Vendor fonts, sprites, procedures, scenario data, and fallback text locally so networking can be disabled without breaking the mission.

The foundation task must provide these scripts. Their appearance in this document does not mean they already exist or passed.

| Command | Required purpose |
|---|---|
| `npm ci` | Install the committed dependency set on the demo laptop. |
| `npm run dev` | Start the development client and local gateway with one command. |
| `npm run typecheck` | Check browser, worker, shared, and server boundaries. |
| `npm run test:sim` | Reference cases, task/observation invariants, and authored mission policies. |
| `npm run test:llm` | Tool contracts, evidence boundaries, stale/canceled responses, quotas, and fallback with mocked provider transport. |
| `npm run test:replay` | Checkpoint identity, deterministic replay, and valid/unsupported comparisons. |
| `npm run test:e2e` | Integrated production mission and provider-failure flows. |
| `npm run build` | Build the browser bundle and local server artifacts. |
| `npm run demo` | Serve the production client and gateway at `http://127.0.0.1:4173`. |
| `npm run verify` | Run typecheck, focused test suites, production build, and the required end-to-end gates. |

The demo must have a visible mode indicator, a prepared checkpoint, clean reset, pause/speed controls, and a saved local run. Port `4173` is the proposed stable production origin; keep it stable because browser persistence is origin-specific. Fail clearly if it is occupied instead of silently choosing another port and appearing to lose saves.

Store `OPENAI_API_KEY` only in the server process environment or an ignored local configuration file. Never prefix it with `VITE_`. Commit a blank-key `.env.example`, not real credentials. Enforce local Host/Origin checks, JSON payload limits, deadlines, and usage bounds. Keep local allowance data and diagnostic logs under ignored `.local/` paths. The public repository and the judge-only local app are separate delivery choices.


### Task 5: Integrate the bounded coworker

**Files:** `server/llm/*`, `src/llm/*`, `tests/llm/*`; radio presentation is a separate UI-owned change in `src/ui/radio/*`.

**Owner and dependency:** OpenAI worker. `AI-01` builds the adapter and fallback against mocks after G0. `AI-02` completes a real worker tool cycle after G1, with `UI-02` consuming the shared response schema. No second command executor or private UI schema is permitted.

- [ ] Verify tools, schema support, authentication, and latency against the selected endpoint.
- [ ] Add the role-specific knowledge projection and tool allowlist.
- [ ] Project every tool result and rejection through that role; render factual fields from records rather than trusting prose with valid-looking evidence IDs.
- [ ] Complete one actual inspection tool cycle through the worker and back to the model.
- [ ] Add evidence links, timeouts, cancellation, reset handling, and deterministic fallback text.
- [ ] Test wrong asset IDs, unknown tools, invalid evidence IDs, stale actions, and requests to reveal hidden faults.

**Gate:** A model response cannot mutate truth outside the shared action path, and an outage does not prevent mission completion.

