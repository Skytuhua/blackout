# Blackout desktop raster source

The original built-in `image_gen` output and the exact prompt are retained here. The new runtime route uses `../facility-v2.png` and `../facility-v2.json`. Older files at the asset root are unchanged legacy exports; they are not this art set.

`sprites.json` is an editable native pixel source: each frame contains a rectangular array of indices into the shared 32-color palette, with `-1` meaning transparent. Open the original PNG in a pixel editor for broader changes, or edit these native pixel arrays for precise cleanup. Every frame records its origin crop or derivation. This is AI-generated source art with disclosed deterministic conditioning, not wholly hand-drawn art.

Offline commands, with no npm installation or provider access:

```sh
node public/assets/source/build.mjs
node public/assets/source/validate.mjs --masters
```

`condition.mjs` is the initial import recipe; it recreates the nine master sources from the retained original. It intentionally overwrites `sprites.json`; do not run it after editing native pixels unless rebuilding the initial import. `build.mjs` preserves native pixel edits and rebuilds all runtime and review exports. It never calls a provider. `raster.mjs` handles PNG encoding, decoding and nearest-neighbor assembly using Node standard libraries only.

Anchors are `{x:0,y:0}` for static art and `{x:6,y:8}` for characters, whose feet baseline is native y=15. Frames are untrimmed and unrotated. All coordinates and art extents are logical pixels. `footprint` describes art extent only; scenario geometry alone defines collisions. Decorative fans are subparts with null footprints. Atlas coordinates are data, not stable identifiers: always look up the contracted name.

The first milestone supplies `floor_0`, `wall_0` horizontal, `wall_1` vertical, `wall_2` northwest bend, `rack`, `cooling`, `fan_0`, `commander_s_idle`, and `portrait_commander`. It deliberately does not claim the complete 111-frame set yet. Machine chassis have neutral gray sockets. Observed-state indicators belong to the renderer. Static chassis fan imagery is neutral stopped geometry; fan animation must be selected only from permitted observed state.

Review PNGs are offline contact-sheet evidence. `masters-native.png` and `masters-3x.png` show exact native pixels and nearest-neighbor scale. The raw source was 1254×1254 despite the requested 1024×1024; the runtime atlas is independently encoded at exactly 512×512 RGBA. Provenance and SHA-256 custody are in `provenance.json` and `../review/hashes.json`. These checks do not certify runtime animation, observation isolation or user visual acceptance.
