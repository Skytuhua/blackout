# Asset and template provenance

No production asset atlas or application template code is included in this planning package.

The approved direction is the latest flat, coarse-pixel top-down concept developed during planning. It is a reference for producing grid-consistent runtime assets, not a claim that a usable atlas already exists.

For each shipped asset or imported code component, record source, creator or generation method, date, original license or applicable terms, modifications, final path, and review status. Preserve upstream license notices when incorporating licensed template code.

| Item | Source or generation method | License/terms basis | Modifications | Final path | Review status |
|---|---|---|---|---|---|
| Phaser/React template, if incorporated | Official `phaserjs/template-react-ts` repository | Inspect the exact pinned revision's license before copying. | Pending implementation. | Pending. | Not imported. |
| Floor, rack, cooling, technician masters | To be produced against the approved art direction. | Record the actual generator or owned source used. | Native grid, palette, anchor, and frame verification required. | `public/assets/` | Not produced. |

Record AI assistance and generated art accurately in submission materials if current event rules require it. Do not use an earlier year's rule sheet as authority for the current event.

## Foundation provenance

- Supplied ZIP SHA-256: `06b5ca1fcca9edba628fe3ba1d5e44c4331a10cb615243924742203c604cc1f6`.
- Supplied master plan SHA-256: `e174493deaf11ee6077b142a66a242186f49210829e40fea81a714c4ccb33759`. Attachment, root original and ZIP copy matched before extraction. Baseline commit: `6cf1bac`.
- Dependency/bridge reference: official `phaserjs/template-react-ts` at `c7265972c856906cacf1f2892d8565d64a358d34`. No template application source copied. Compatible React 19, Phaser 4 and Vite 6 dependencies pinned. Actual Phaser 4 ESM requires named/namespace imports.
- Foundation map is code-authored grid placeholders, not production art. No external art shipped yet.
- Barlow Condensed and IBM Plex Sans from Fontsource; self-hosted Latin subsets. Preserve their OFL notices in distribution.
