# MENU-01 implementation ledger

Plan: C:/Users/user/Documents/Blackout/.local/conv-01-independent/MENU-01-plan.md

Base: d73e0e8a7168b9208b20e895b8612fde9a904a0e. Exact HEAD and clean state observed before edits; prepared branch t3/conversation-menu. No nested workers.

Task 1: in progress. Frozen controlled props; no interface blocker. Task 2 belongs to parent (independent review/publication).

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

Ruling: use this leased handoff as the execution ledger and the reserved parent QA directory for evidence, following the explicit packet rather than creating skill workspace artifacts outside the lease.
Ruling: preserve incumbent ConversationGame pixel palette/fonts over generic UIUX design-system suggestions. Use its keyboard/focus/contrast guidance.
Ruling: independent final review is parent-owned; no nested reviewer is authorized. Authored tests are not independent approval.

Pre-flight: Task 1 exports the frozen leaf; Task 2 reviews that immutable range. No shared writable interface with the coordinator. Host wrapper, pause and background inertness remain external.
