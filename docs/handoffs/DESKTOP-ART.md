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
- Commit: `88ee8f0b8493b56e949ebbbbf8f4d9a8c7544de7`; delivered to parent, received and cherry-picked by coordinator as `7569586`. Parent inspected the master contact sheet. Actual-map visual review is still pending UI fixture integration.

## Complete atlas delivery

Pinned base remains `8b1f4242bbdf38db0633f8fca39bf555bc2d20da`. The completion commit is the commit containing this final handoff; its full SHA is delivered directly to the parent after committing. Apply the completion commit after the master snapshot, already integrated by the coordinator. No branch switch/reset, nested agents, PR, dependency or renderer changes were made. Both commits change only the granted asset/handoff paths.

The exact 111-frame runtime atlas is `public/assets/facility-v2.png` with manifest `public/assets/facility-v2.json`: 29 environment frames, 13 equipment/fan frames, 60 crew frames, four portraits and five separate observation badges. Atlas size is 512x512 RGBA with binary alpha, two-pixel transparent gaps and no trimming or atlas rotation. The palette declares 32 colors; delivered pixels use 28. Native frame sizes, static anchors0,0, character anchors6,8 and feet6,15, and 167ms walk/fan / 250ms work/generator timings match the packet. All 12 directional idle identities are distinct, and every walk/work pair differs. The nine received master source records and both master contact sheets are byte/hash preserved; no approved master art was regenerated or redone.

### Changed paths

- Runtime exports: `public/assets/facility-v2.png`, `public/assets/facility-v2.json`.
- Editable/provenance sources: `public/assets/source/sprites.json`, `provenance.json`, `master-seal.json`, `README.md`; original masters/crew/environment PNGs and exact corresponding prompt TXT files.
- Offline tooling: `public/assets/source/{condition,complete,raster,build,validate}.mjs`, plus `public/assets/review/validation-checks.mjs` and asset-local `.gitattributes` to preserve LF hash custody on Windows.
- Review artifacts: `public/assets/review/masters-{native,3x}.png` unchanged; full `atlas-contact-{native,3x}.png`; grouped `animation-strip-{native,3x}.png`; SHA-256 `hashes.json`; RED/GREEN receipts and rebuild/staged-custody proof.
- Handoff: this file. Existing legacy placeholder exports at the asset root are untouched and are not the new runtime atlas. Renderer adoption belongs to the coordinator/UI owner.

### Generation and source custody

Three successful built-in `image_gen.imagegen` calls produced actual new raster source art: master objects, three crew turnarounds, and environment props. An earlier crew request failed with `connection failed: error sending request` and produced no artifact; its retry through the same built-in tool succeeded. No paid CLI/API fallback or application OpenAI request was made. All three successful returned originals are 1254x1254 (the tool returned this instead of requested1024x1024), preserved project-locally without modification. Exact prompts are `source/master-prompt.txt`, `crew-prompt.txt`, `environment-prompt.txt`; reference roles/hashes and input lists are explicit in `source/provenance.json`.

Art conditioning uses crop records, alpha thresholding, majority palette sampling and explicit native pixel cleanup. Derived walls/conduits, signs, floor variants, limb poses, rotor/belt phases and symbolic observation badges are disclosed in each native frame's origin. This is generated raster source with authored native pixel conditioning/derivation, not an assertion of wholly hand-drawn or exclusive artwork. No external asset pack/license or event-eligibility claim is made.

SHA-256 receipts:

| Asset | SHA-256 |
| --- | --- |
| Runtime PNG | `b0e844a4db73a2bea7e8af3985c68d1cc1a6f37b831d5dcecdeec30001c9ad35` |
| Runtime JSON | `6570dc23aaaf3c9dd0d5ee872aa2199277651a485de92e318adf9251907cc5fe` |
| Original masters | `139e56ac27fb9bda9ca2b37d840fe1f3477158b193faa2a2785612b3a111f86a` |
| Original crew | `35ed3907c4ee03d9ee5ab2fa12587ac4b32460b971f6307dbf03bb89a67767e5` |
| Original environment | `a17311c3323219d2389e4c432c4af0f54178d2134c1c0e9a62b99ad5e001dbc6` |

`review/hashes.json` covers 24 deliverables including runtime, native pixels, originals, exact prompts, source tools, seal and PNG evidence. `source/provenance.json` independently pins all six original/prompt files.

### Commands actually run and observed results

Node `v24.14.0`, using standard libraries only; no node_modules or version changes needed.

1. `node public/assets/source/validate.mjs --masters` before delivery: RED, missing new atlas. Initial receipt `review/red-masters.txt`; master GREEN receipt `review/green-masters.json`.
2. `node public/assets/source/validate.mjs` and initial failure-path runner before completion: RED, missing exact 111-name set; retained `review/red-full.txt`, `red-failure-checks.txt`.
3. `node public/assets/source/complete.mjs`: completed111 frames; all nine master records unchanged. This extends existing masters; it does not call a provider.
4. `node public/assets/source/build.mjs`: generated512x512 atlas, manifest, sheets and hashes from editable source. Repeated build produced a byte-identical 24-file hash manifest, recorded in `review/rebuild-proof.json`.
5. `node public/assets/source/validate.mjs`: GREEN111 frames; exact names/native sizes/anchors/timings, 28 used palette colors, binary alpha, source-pixel match, no stray opaque atlas pixels, two-pixel gaps, master preservation, six original/prompt custody hashes and24 deliverable hashes. Receipt `review/green-full.json`.
6. `node public/assets/review/validation-checks.mjs`: GREEN17 checks. Deliberate corruptions of off-palette pixels, partial alpha, unnamed atlas pixels, missing frames, anchors, timing, overlapping frame placement, editable-source pixels, source hashes, missing original provenance and an original generated PNG were rejected; exact bytes were restored. Also checks all60 fixed-baseline crew frames, distinct directions/walk/work pairs, all four fan/three generator phases, neutral rack apertures, restored baseline. Receipt `review/green-failure-checks.txt`.
7. Native and3x contact sheets and grouped animation strip inspected with `view_image`; all111 frames are represented. PNG evidence is static frame/geometry proof, not runtime animation acceptance.
8. `git diff --check`: clean. Staged Git blob custody checked against all24 recorded SHA-256 entries before final commit; receipt `review/git-custody-proof.json`.

Offline reproduction: edit native indices in `source/sprites.json`, run `node public/assets/source/build.mjs`, then the validator and failure-path runner. No model, browser, server, network or credential is needed. Avoid reimport recipes after manual pixel edits unless deliberately replacing those derived edits; details are in the source README.

### Integration assumptions and limits

- Agreed frame names and JSON shape are unchanged. Every frame source points to its editable native record. Coordinates must be read from JSON, not inferred from frame order. Art footprints are logical-pixel extents and never collision authority; fans/decorations have null footprints. Scenario geometry alone governs solids and travel.
- Rack apertures and equipment terminal windows are neutral. Runtime observation-driven lights and badges remain the renderer's responsibility. Generator phases are mechanical grille/belt changes; static cyan architectural pipes/lights are not measurements. No fake outages, sensor numbers, sparks, resources, repairs or outcome claims are baked into art.
- Worker art scope has no remaining blocker. Actual-map composition, observation gating, clock-driven animation/pause/speed, collision alignment, desktop viewport acceptance and user visual acceptance require coordinator integration and review. No application build, browser suite, live model or mission check was run or claimed here. Mobile remains deferred.
- Final result is delivered to parent first. This worker does not self-archive or cancel for cleanup. Parent acknowledges the final result, confirms task completed/result_available/no pending child runs, then recoverably archives the returned child thread per project rule.
