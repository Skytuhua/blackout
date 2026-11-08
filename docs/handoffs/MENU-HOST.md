# Compact Menu host integration

Base model patch: 5425635. Integrated reviewed MENU-01 c7617ef on a separate followup branch; PR15 f8a7365 stays immutable. The actual normal App now mounts ConversationMenu, removes the fullscreen wrapper, passes complete actor histories and native-save callbacks, and uses compact advanced replay content without the duplicated Runs/action dropdown. History navigation preserves the active sidebar actor and original proposal IDs.

A real integration regression exposed lost opener focus because making the background inert clears document.activeElement before the leaf mounts. Root now captures the opener before opening and restores it after dismissal. Four viewport focus assertions observed RED, then passed.

Observed: typecheck, five focused units, production build, five actual-root browser checks on development4180 and again dedicated production4173. Browser cases cover1280x720/1366x768/1920x1080/640x360 empty/saved lists, native save, History, advanced replay, no-scroll bounded controls and Escape/focus return. Fresh read-only code reviewer approved the host hook. Production demo's owned process was restarted and the new Menu verified there. No provider calls.

Replay report evidence loss remains known and is not claimed fixed by this patch. New user notification/cards/resizer/Enter/no-expand work and full guided-win acceptance remain separate. Leaf internal 55-state/8behavior peer approval is documented in MENU-01, not repeated as host proof.
