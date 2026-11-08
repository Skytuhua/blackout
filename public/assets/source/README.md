# Blackout desktop raster source

The original built-in `image_gen` output and the exact prompt are retained here. The new runtime route uses `../facility-v2.png` and `../facility-v2.json`. Older files at the asset root are unchanged legacy exports; they are not this art set.

`sprites.json` is an editable native pixel source: each frame contains a rectangular array of indices into the shared 32-color palette, with `-1` meaning transparent. Open the original PNG in a pixel editor for broader changes, or edit these native pixel arrays for precise cleanup. Every frame records its origin crop or derivation. This is AI-generated source art with disclosed deterministic conditioning, not wholly hand-drawn art.

Offline commands, with no npm installation or provider access:

```sh
node public/assets/source/build.mjs
node public/assets/source/validate.mjs
node public/assets/review/validation-checks.mjs
```

`condition.mjs` is the initial import recipe; it recreates the nine master sources from the retained original. It intentionally overwrites `sprites.json`; do not run it after editing native pixels unless rebuilding the initial import. `complete.mjs` adds the remaining 102 frames from retained source sheets and disclosed native derivations. It preserves the sealed nine master records, but replaces remaining frames, so do not rerun it after editing those native pixels unless deliberately reimporting. `build.mjs` preserves all native pixel edits and rebuilds runtime and review exports. It never calls a provider. `raster.mjs` handles PNG encoding, decoding and nearest-neighbor assembly using Node standard libraries only. Dependency-free import from retained art is `condition.mjs`, then `complete.mjs`, then `build.mjs`; this is not a new generation.

Anchors are `{x:0,y:0}` for static art and `{x:6,y:8}` for characters, whose feet baseline is native y=15. Frames are untrimmed and unrotated. All coordinates and art extents are logical pixels. `footprint` describes art extent only; scenario geometry alone defines collisions. Decorative fans are subparts with null footprints. Atlas coordinates are data, not stable identifiers: always look up the contracted name.

The complete set is exactly 111 frames: 29 environment, 13 equipment/fan, 60 character, four portrait and five observation badges. The first nine master records from `88ee8f0` and both original master contact sheets are sealed in `master-seal.json`, with frame and image hashes tested by validation. No approved master was regenerated or repainted during completion.

Wall meanings: 0 horizontal, 1 vertical, 2 northwest bend, 3 northeast bend, 4 southeast bend, 5 southwest bend, 6 T junction, 7 cross junction, 8 utility doorway, 9 wall vent. Infrastructure meanings: 0 horizontal cyan conduit, 1 vertical cyan, 2..5 cyan elbows in four orientations, 6 cyan T, 7 horizontal electrical tray, 8 vertical tray, 9 electrical elbow. Fixtures: 0 architectural area light, 1..3 bay A/B/C, 4 shrub, 5 low yellow rail. These decorations add no collision or evidence. The scenario remains the only source of solid geometry.

Machine chassis have neutral gray sockets and terminal windows. Observed-state indicators belong to the renderer. Static chassis fan imagery is neutral stopped geometry; fan animation must be selected only from permitted observed state. Cyan conduit and area-light colors are static architectural paint/light artwork and never sampled as measurements. Generator phases only change mechanical grille/belt pixels. Badges are separate symbolic overlays, never baked into equipment. Art supports all requested poses; it does not decide when to show them.

Review PNGs are offline contact-sheet evidence. `masters-native.png` and `masters-3x.png` preserve the approved snapshot. `atlas-contact-native.png` and `atlas-contact-3x.png` show all 111 frames. The animation strip groups idle/walk0/walk1/work0/work1 by direction, plus fan and generator sequences; fan/walk duration is 167ms and work/generator is 250ms. Source sheets are each 1254x1254 despite requested 1024x1024; runtime is independently encoded at exactly 512x512 RGBA. The 32-slot world palette uses 28 colors across delivered pixels. No trimming, rotation in the atlas, smoothing or partial alpha is used.

Provenance and SHA-256 custody are in `provenance.json` and `../review/hashes.json`, including originals, exact prompts, editable pixels, tools and review artifacts. Full validation checks the fixed names/dimensions, alpha, palette, padding, anchors, durations, all source pixels, master preservation and hashes. Failure-path tests deliberately corrupt palette, alpha, bounds, frame metadata, source pixels and source custody, then restore exact bytes. These checks do not certify runtime animation, observation isolation or user visual acceptance.
