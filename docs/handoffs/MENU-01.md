# MENU-01 implementation ledger

Plan: C:/Users/user/Documents/Blackout/.local/conv-01-independent/MENU-01-plan.md

Base: d73e0e8a7168b9208b20e895b8612fde9a904a0e. Exact HEAD and clean state observed before edits; prepared branch t3/conversation-menu. No nested workers.

Task 1: complete within the implementation lease. Frozen controlled props; no interface blocker. Task 2 belongs to parent (independent review/publication).

First runnable delivery: controlled leaf and synthetic fixture implemented. Unit RED: 3 assertions failed against the empty scaffold (home choices, modal semantics, missing-reader truth). Browser RED: 4 behavior groups failed against the scaffold. GREEN: focused 3 unit tests, all 4 browser behavior groups, TypeScript, isolated fixture production build observed passing. Visual batch and final verification remain pending at this first delivery.

API: `import { ConversationMenu, type ConversationMenuProps } from './ui/conversation-menu';` The Props export is `ConversationMenuProps`; all frozen inputs/callbacks are unchanged, and imported DTOs are reused.

External coordinator hook (example only; not applied here):

```tsx
{menuOpen && <ConversationMenu
  key={view.runId}
  conversations={conversations} selectedActorId={selectedActorId}
  reader={reader} savedRuns={savedRuns} busy={busy}
  notice={notice} error={error} guidanceEnabled={guidanceEnabled} speed={speed}
  afterActionContent={afterActionContent}
  onClose={() => setMenuOpen(false)} onSave={onSave} onRefreshSaves={onRefreshSaves}
  onResumeSave={onResumeSave} onReplaySave={onReplaySave} onExportSave={onExportSave}
  onOpenEntry={onOpenEntry} onCloseEntry={onCloseEntry} onReadEntries={onReadEntries}
  onExecuteProposal={onExecuteProposal} onGuidanceChange={onGuidanceChange}
  onSpeed={onSpeed} onRestart={onRestart} onStartPractice={onStartPractice}
/>}
```

Root owns the opener, menu-open state, background inertness, pause/guide priority, all persistence/engine/provider behavior and reset remount. Keep the actual opener connected until dismissal, and mount outside an inert background subtree. The leaf captures that actual focused opener at mount and returns focus at unmount. Report reader identity remains controlled; opening/closing it does not clear drafts or change the active character.

## Produced commits and changed files

- `157dbcea7cbf89ac9aa80b9112af8570645d9954` — first coherent runnable leaf, fixture, tests and initial handoff.
- `328a3b48a7b277bd9240f0cc457a54eadcbe3843` — bounded correction: contain hidden measurement overflow, restore focus through controlled reader navigation, expose busy host state, suppress single-page controls, expand verification receipts.
- The final documentation receipt commit follows these two commits; its full SHA is supplied in the final delivery message. No push, PR, merge, watch, ANIM-01 change, host wrapper or other source integration was performed.

Exactly eight added tracked files:

```text
docs/handoffs/MENU-01.md
src/ui/conversation-menu/ConversationMenu.css
src/ui/conversation-menu/index.tsx
tests/ui/conversation-menu/browser-check.mjs
tests/ui/conversation-menu/fixture.html
tests/ui/conversation-menu/fixture.tsx
tests/ui/conversation-menu/menu.test.tsx
tests/ui/conversation-menu/vite.config.ts
```

## Observed verification

Commands were run from the prepared worktree. Reused the existing installation with an ignored `node_modules` junction to `C:/Users/user/Documents/Blackout/node_modules`; no installation or version changes. Port 5192 was observed free before starting the strict-port fixture. No processes on 4173/4180/5184/5191 were touched.

| Command | Observed result |
|---|---|
| `npx vitest run tests/ui/conversation-menu/menu.test.tsx` against empty scaffold | RED: 3 meaningful assertion failures; `unit-red.txt`. |
| `node tests/ui/conversation-menu/browser-check.mjs --behavior` against empty scaffold | RED: 4 behavior groups failed for absent UI; `browser-red.json` / `.txt`. |
| Added reader Back-focus regression before correction, same browser command | RED: exact `reader Back must restore focus inside the dialog` failure; `reader-focus-red.json` / `.txt`. |
| Added busy-home regression before correction, focused Vitest command | RED: 1 failed / 3 passed, missing Working status; `busy-red.txt`. |
| Final `npm run typecheck` | PASS, no diagnostics; `typecheck.txt`. |
| Final `npm test` | PASS, 41 files / 254 tests, including all 4 MENU tests; `full-unit.txt`. |
| Final `node tests/ui/conversation-menu/browser-check.mjs --behavior` | PASS, all 4 browser groups; `behavior-green.json` / `.txt`. |
| `node tests/ui/conversation-menu/browser-check.mjs --visual` | First complete batch detected hidden measurement overflow in ancestor geometry. One correction batch, then one confirmation PASS across 55 viewport/state combinations; `visual.json`, `visual-confirmation.json`, `geometry-measurements.json`. |
| Final `npx vite build --config tests/ui/conversation-menu/vite.config.ts` | PASS; `fixture-build.txt`. Fixture output `.local/menu-01-build` is ignored. |
| `impeccable.cmd detect --json src/ui/conversation-menu/index.tsx src/ui/conversation-menu/ConversationMenu.css` | PASS, `[]`; `impeccable.json`. |
| `git diff --check`, base-range file/scope inspection | PASS, only the eight leased additions. |

The synthetic browser tests use the actual React component and actual existing PagedText. They cover 25 entries per actor, the exact original old report and proposal callback IDs, read marking only shown/opened entries, actor switching and late updates, missing/wrong-actor readers, available/unavailable/busy/removed saves, exact save IDs, guidance/speed/restart/practice callbacks, authoritative proposal status guards, home focus, Tab/Shift+Tab wrapping, IME Escape, listener cleanup, Back focus, and actual opener restoration. No runtime errors or `/api/` requests were observed.

## Geometry and evidence

Evidence root: `C:/Users/user/Documents/Blackout/.local/conv-01-independent/MENU-01/`.

Confirmation states per viewport: home, complete notice/error messages, empty saves, populated unavailable save with long ID, busy saves, History, long reader, advanced content, help, options, long notice. Viewports: 1280×720, 1366×768, 1920×1080, 640×360 equivalent and 1280×720 with 32px root text (200%). Body/control text stays at least 16px. Every visible element/control was checked against actual content overflow and dialog/viewport bounds; hidden measurement elements were excluded individually, not by hiding ancestor overflow. There is no overflow-hiding rule on visible reader copy or the panel. Long message and notice pages were joined and matched to their exact original text.

Native home panel: 560×296 at all three desktop sizes. Reduced viewport home: 560×204; 200% text home: 560×285.16. Compact mode focuses three menu actions at a time behind a plainly labeled More/First action, preserving readable controls and guidance. No stacked section dropdowns, stray M or visible 1/1 controls. Help topics are complete sections.

Representative PNGs, inspected with view_image in the bounded passes:

- `1280x720-16-home.png`
- `640x360-16-messages.png`
- `640x360-16-populated-saves.png`
- `640x360-16-long-reader.png`
- `1280x720-32-populated-saves.png`
- `1280x720-32-advanced.png`
- `1280x720-32-help.png`

The advanced-content fixture is a synthetic host-owned section with a nested input, existing PagedText, and callback button. It is mounted only on Replay and results; no enclosing section dropdown is added.

## Remaining gates and limits

- Authored tests and synthetic fixture proof are not independent approval, integrated mission proof, native/DPI acceptance, human visual acceptance, live provider proof or a production application build. No full root application browser flow or demo-laptop rehearsal was run.
- Parent must independently review this immutable range and the separate CONV-01 host seam, publish its focused PR against `feat/conversation-sidebar`, and coordinate eventual root wrapper integration. This implementation worker has not performed Task 2.
- Root must provide usable, bounded advanced replay content; the arbitrary ReactNode slot retains the host's own controls, authority and timing. Actual DesktopReplayView composition remains a host integration gate.
- Reader identity is host-controlled. The host must accept the onOpenEntry/onCloseEntry request to change the reader. Use the run key shown above to remount presentation state on reset. Missing entries and saves stay missing until explicit user navigation; there is no silent replacement.
- No source, contract, dependency, atlas, persistence or engine changes outside the lease. No added art or license claims. No pending interface blockers.
- Parent owns final acknowledgment, task_status verification (`completed`, `result_available`, no pending children), and recoverable archive. This worker has no children and does not self-archive or cancel work for cleanup.

Ruling: use this leased handoff as the execution ledger and the reserved parent QA directory for evidence, following the explicit packet rather than creating skill workspace artifacts outside the lease.
Ruling: preserve incumbent ConversationGame pixel palette/fonts over generic UIUX design-system suggestions. Use its keyboard/focus/contrast guidance.
Ruling: independent final review is parent-owned; no nested reviewer is authorized. Authored tests are not independent approval.

Pre-flight: Task 1 exports the frozen leaf; Task 2 reviews that immutable range. No shared writable interface with the coordinator. Host wrapper, pause and background inertness remain external.
