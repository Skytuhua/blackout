# DESKTOP-ART handoff

## First master milestone

- Pinned base: `8b1f4242bbdf38db0633f8fca39bf555bc2d20da`, clean at start; branch `t3/desktop-art-assets`.
- Owned paths only: `public/assets/**`, `docs/handoffs/DESKTOP-ART.md`. No nested agents, provider API requests, dependencies, renderer, schemas, global docs or PR changes.
- Read AGENTS, desktop rebuild plan, task packet, master plan section 9; inspected all three original reference PNGs with `view_image`.
- New raster art generated with built-in `image_gen.imagegen`, using those images as style references. Original bytes: `public/assets/source/generated-masters-original.png`; exact prompt: `public/assets/source/master-prompt.txt`. Actual generation 1254×1254, runtime normalized to 512×512.
- Runtime: `public/assets/facility-v2.png`, `public/assets/facility-v2.json`. Initial frames: floor_0, wall_0..2, rack, cooling, fan_0, commander_s_idle, portrait_commander. Nine delivered frames; remaining full-set work continues after milestone.
- Editable native pixels: `public/assets/source/sprites.json`; deterministic import/build/validation tools alongside it. Machine sockets are neutral gray; no fabricated operational indicators or outage state. Footprints are art extent in logical pixels, never collision authority.
- Evidence: `public/assets/review/masters-native.png`, `masters-3x.png`, `atlas-contact-native.png`, `atlas-contact-3x.png`, `hashes.json`. Source custody and reference hashes: `public/assets/source/provenance.json`.
- RED observed: `node public/assets/source/validate.mjs --masters` failed because the new raster atlas was absent; receipt `public/assets/review/red-masters.txt`.
- GREEN observed: `node public/assets/source/condition.mjs`, `node public/assets/source/build.mjs`, `node public/assets/source/validate.mjs --masters`: nine frames, 512×512 RGBA, binary alpha, 16 used colors from the 32-color palette, two-pixel gaps, exact source-pixel match, source and deliverable hashes verified. Receipt `public/assets/review/green-masters.json`.
- Native and 3× master sheets inspected with `view_image`. No runtime map, browser, build, mission, paid model, or user visual acceptance claimed. Coordinator owns renderer integration and fresh independent review.
- Dependencies: none for offline asset tooling beyond Node standard library. Existing node_modules absent in this worker; no install/version changes needed.
- Commit: the commit containing this milestone document is the first master milestone; the concrete SHA is sent directly to the coordinator after committing.

## Remaining work

Complete exact 111-name atlas, all crew directions and walk/work poses, environment set, equipment and badge overlays; add animation-strip evidence and final validation/negative custody probes. Final commit list and limitations will be appended here.
