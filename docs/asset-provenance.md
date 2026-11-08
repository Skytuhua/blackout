# Asset and template provenance

The desktop runtime atlas is `public/assets/facility-v2.png` with its JSON manifest. Its editable pixel source, original generated rasters, exact prompts, hashes and custody checks are retained under `public/assets/source/` and `public/assets/review/`. See [DESKTOP-ART handoff](handoffs/DESKTOP-ART.md) for the complete chain.

The approved direction is flat, coarse-pixel top-down art, following the three user references. Built-in image generation supplied three raster sources; deterministic editable pixels supplied the 111-frame, 512×512, binary-alpha export with 28 used palette colors. This records production method and source custody; it makes no external asset-license claim.

For each shipped asset or imported code component, record source, creator or generation method, date, original license or applicable terms, modifications, final path, and review status. Preserve upstream license notices when incorporating licensed template code.

| Item | Source or generation method | License/terms basis | Modifications | Final path | Review status |
|---|---|---|---|---|---|
| Phaser/React template, if incorporated | Official `phaserjs/template-react-ts` repository | Inspect the exact pinned revision's license before copying. | Pending implementation. | Pending. | Not imported. |
| Desktop facility atlas and portraits | Built-in imagegen originals plus editable indexed pixel source | Original prompts, retained rasters and per-frame origins recorded in source provenance | Palette normalization, fixed anchors, walk/work/mechanical phases, separate observation badges | `public/assets/facility-v2.png` and `.json` | Validator, custody and runtime pixel checks pass; user visual acceptance separate |

Record AI assistance and generated art accurately in submission materials if current event rules require it. Do not use an earlier year's rule sheet as authority for the current event.

## Foundation provenance

- Supplied ZIP SHA-256: `06b5ca1fcca9edba628fe3ba1d5e44c4331a10cb615243924742203c604cc1f6`.
- Supplied master plan SHA-256: `e174493deaf11ee6077b142a66a242186f49210829e40fea81a714c4ccb33759`. Attachment, root original and ZIP copy matched before extraction. Baseline commit: `6cf1bac`.
- Dependency/bridge reference: official `phaserjs/template-react-ts` at `c7265972c856906cacf1f2892d8565d64a358d34`. No template application source copied. Compatible React 19, Phaser 4 and Vite 6 dependencies pinned. Actual Phaser 4 ESM requires named/namespace imports.
- Foundation map is code-authored grid placeholders, not production art. No external art shipped yet.
- Barlow Condensed and IBM Plex Sans from Fontsource; self-hosted Latin subsets. Preserve their OFL notices in distribution.
- Pixelify Sans from Fontsource supplies the desktop HUD; detailed copy uses IBM Plex Sans. All three font notices ship under `public/licenses/fonts/`.
