# Make Blackout easy to understand and demonstrate

## 1. Intended experience

Blackout becomes a game about **directing a team through an incident using conversation**.

Remove WASD, arrow-key movement, click-to-walk, E interactions, and the requirement for the player to stand beside equipment. Characters travel automatically when given work. The simulation still controls routes, eligibility, work duration, observations, and outcomes.

Preserve the agreed direction:

- Guide the first mission through a complete win.
- Use **chat plus suggested orders**.
- Keep everything without scrolling.
- Pause and explain major guided moments.
- Keep the existing pixel world and mission mechanics.

The player should always understand **what happened, who is handling it, what to do next, and whether the action worked**.

## 2. Interface and conversation controls

### Persistent right sidebar

Keep the facility map on the left and a **360px conversation sidebar** on the right at the supported desktop sizes.

At the top, show three directly selectable character tabs with portraits, names, and understandable roles:

- **Alex · Cooling**
- **Jules · Power**
- **Sam · IT**

Selecting a character opens that character’s conversation. Each conversation retains its own messages, draft, current assignment, and unread reports. Switching characters must not cancel work or misattribute a late reply.

The selected conversation contains:

1. Character name and current assignment.
2. Recent messages and delivered reports.
3. Contextual suggested orders.
4. An always-visible message box and **Send** button.

No separate Radio, Message, Dispatch, or Command screens are required for ordinary play.

### Orders inside the conversation

Suggested orders use short, specific labels:

- **Check cooling controls**
- **Repair the controls**
- **Pause background jobs**
- **Resume background jobs**
- **Check recovery**

Clicking a suggested order issues that validated command directly, without requiring an LLM request or an additional confirmation dialog.

Free-text messages go to the selected character’s grounded LLM conversation. Questions receive explanations; requests for work produce an inline action button identifying the task and assigned character. Clicking that button authorizes execution. Ambiguous requests receive a short clarification.

This keeps execution predictable without building a separate free-text command parser or granting unrestricted model authority.

### Visible work and readable feedback

Characters automatically walk to equipment, perform accepted work, and report back. The map shows their names and current assignments.

Use clear status messages:

- **Alex is walking to Cooling control.**
- **Alex is checking the controls.**
- **Check finished. Report arriving.**
- **The controls are repaired. Cooling is recovering.**

Busy characters offer **Wait** or an explicit **Stop current task** action. New messages never silently cancel work.

### Keep the screen simple

Above the map, show the current objective, important incident alert, service status, time, and Pause.

Map clicks may highlight known equipment and provide conversation context. They do not move characters or reveal undiscovered information.

Move save management, replay, detailed evidence, provider information, and technical diagnostics into Menu or the after-mission screen. Remove the redundant movement and dispatch interfaces from the normal route.

### Preserve the no-scrolling requirement

Keep the composer, suggested orders, and essential controls fixed.

Use **Older messages / Newer messages** to navigate complete conversation entries. Long reports open in a focused reader with clear section navigation and Back. Long drafts use an expanded composer with lossless measured pages.

Current objectives, ordinary replies, notifications, and suggested orders must remain short and complete without pagination. Never split mandatory instructions across numbered text fragments.

## 3. Notifications and the guided first win

Show important incidents prominently above the map, independent of the selected conversation. New reports also create an unread indicator on the relevant character tab.

Notifications explain **what changed and what the player can do**. Important unresolved warnings remain visible; routine progress goes into the appropriate conversation and History.

The first guided mission follows this sequence:

| Objective | Interaction |
|---|---|
| **Cooling stopped. Reduce the heat.** | Select Sam and choose **Pause background jobs**. |
| **Find out why cooling stopped.** | Select Alex and choose **Check cooling controls**. Alex travels automatically. |
| **Read Alex’s findings.** | Open the exact delivered inspection report. |
| **Repair the controls.** | Choose **Repair the controls** after inspection establishes the problem. |
| **Let cooling recover.** | Watch real cooling and temperature readings improve. |
| **Restore background jobs.** | Select Sam and resume the normal workload when recovery has sufficient headroom. |
| **Keep the facility stable.** | Follow the engine’s public stability progress. |
| **Check recovery.** | Ask Sam to verify; finish only when fresh verification arrives and the engine declares success. |

Repair already starts the cooling restart delay. Do not add an unnecessary restart order.

Pause once at the initial failure, delivered diagnosis, and repair/recovery explanation. During guided play, also pause while awaiting an LLM response so network latency does not consume the incident window. Explicit Continue or an authorized suggested order may release a guidance pause; a player’s manual Pause always takes precedence.

Guidance advances from actual accepted commands, completed tasks, delivered reports, and permitted observations—not message wording, animations, or elapsed-time guesses.

Keep healthy practice available as a short introduction to selecting a character, issuing an order, and reading the result.

## 4. Implementation and focused PRs

The current coordinator retains integration ownership. Preserve existing branches and completed simulation, transcript, replay, and debrief work. Reconcile pending movement work before implementing this replacement.

**PR 1 — Character conversation sidebar**

Replace movement-oriented navigation with the persistent sidebar, selectable character conversations, named map characters, fixed composer, and contextual suggested orders.

Extend the presentation contract with selected conversation, per-character history/draft/unread state, and suggested-order callbacks. Character selection no longer controls movement.

**PR 2 — Validated orders and automatic crew travel**

Connect suggested orders to existing action validation and task execution. Replace player-proximity requirements with eligible-worker and valid-route checks. Physical work still begins only after the assigned character arrives.

Keep free-text action proposals separate from execution. Revalidate proposals against current state, preserve idempotency, and retain reset/cancellation guards. Entering the new interface must clear any existing manual movement input.

Do not rewrite the simulation clock or delete compatibility code needed for retained recordings.

**PR 3 — Incident guidance, notifications, and history**

Extend the training controller to cover the full mission. Retain exact task/report IDs, per-run guidance state, and acknowledged pause moments.

Preserve full permitted conversation/report history independently of the compact display; remove reliance on the last eight messages. Reuse existing recording infrastructure and distinguish player orders, system updates, live model replies, and scripted fallback.

Generate alerts from permitted observations and reports. Any additional site announcements must be explicitly published by the engine; live UI must never inspect hidden faults or forensic events.

Each PR includes relevant tests and independent review. Use exclusive worker leases, small integration patches, and updated shared-contract fixtures where required.

## 5. Acceptance and boundaries

Verify:

- A complete guided win using only conversation, suggested orders, and automatic crew travel.
- No WASD, click-to-walk, E, or player-proximity requirement in normal play.
- Correct recipient, history, draft, unread state, and late-response handling when switching characters.
- Busy workers, ambiguous requests, stale proposals, duplicate clicks, canceled work, delayed reports, and reset races.
- Suggested orders remain usable without a model connection; fallback is clearly labeled.
- Important alerts and reports remain accessible after many newer messages.
- No scrolling, clipped controls, or fragmented essential instructions at the supported desktop sizes and enlarged text.
- Existing typecheck, unit, build, persistence, replay, and production browser checks.

Finally, have a first-time player complete the guided mission without verbal coaching. Automated completion does not establish understandable gameplay.

Excluded: new scenarios, mobile, a new art direction, and physics or difficulty changes. This is the replacement plan; no repository changes have been made. The main risks are excessive conversational text and model latency, addressed through short replies, direct suggested orders, and guided pauses.
