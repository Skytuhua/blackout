# SFX-ASSETS handoff

## Result and revision custody

Implementation base verified clean before edits: `54558c39ad500361d0d5fe243862b0f6767d7d60`.
Contract anchor: `b0a72aa40d63bba8ffd9b05c660f7b5485211abc`.
Prepared task branch: `t3/94074841`; no branch switch, reset, push, PR, merge or watch.

Ordered produced commits:

1. `57a70a864aafa29053b061603171e6fb59cb0fa9` ? licensed sources, exactly 22 WAVs, provenance, offline builder/gate, negative fixtures and unexecuted audition index.
2. The following handoff-only commit contains this document; its final SHA is returned in the worker response (a commit cannot contain its own hash).

No nested agents were launched. Source, App/Menu/UI/scene/shared/config/dependencies/persistence/gateway and sibling `src/audio` / `tests/audio` were not edited. The implementation commit has 39 NEW files; this handoff adds the 40th. Only the assigned new paths were staged.

## Asset contract / API

Exactly `/audio/retro-v1/<cue-id>.wav` for the frozen 22 IDs. Signed PCM16 little-endian, mono, 44,100 Hz; no change to IDs or the sibling runtime API. The 20 one-shots are 0.09?0.625011 seconds, with zero-valued faded edges. `work-loop` is 1.8 seconds and `facility-loop` is 3 seconds, with circular overlaps and numeric wrap/slope continuity. Source-related trims/rate/pitch/filter/reverse/gain reuse is fully recorded, without synthesized substitutes.

Seven **actually downloaded public HQ MP3 previews**, all verified CC0 at their Freesound source pages on 2026-11-08 UTC. Originals displayed login requirements and were not acquired. No credentials requested or used; no blocked source was replaced silently. All raw compressed bytes are retained under `public/audio/retro-v1/sources/` with exact URLs, author/title/ID/license/time/format/size/SHA-256 in `sources/index.json`. Full page snapshots and acquisition script remain in owned ignored `.local/sfx-assets/`; their page hashes are in the source index.

Runtime WAV payload: 957,868 bytes. Observed full public package with sources/manifests: 2,794,831 bytes (metadata checkout line endings can vary). The retained 56.1-second engine source is 1,673,726 bytes, but only the small derived cues need be fetched by runtime. The loudest individual sample peak is -14.0001 dBFS; loop peaks are -32.0010/-36.0057 dBFS. Zero clipped samples in all 22 derived files. Source/page/WAV hashes use exact bytes; builder/index text hashes normalize CRLF to LF.

## Commands actually observed

| Command / action | Observed result |
|---|---|
| `git status --short`, `git rev-parse HEAD`, `git branch --show-current` before work | Clean, exact required HEAD, prepared branch. |
| Read frozen SFX-01 packet and master plan sections 4, 9.3?9.5, 10/11 and release boundaries | Exact 22 filenames/format/leases; visual authority and observation boundaries preserved. |
| Python `urllib.request` source-page fetches and seven exact page-provided HQ preview downloads | HTTP 200 source pages; raw preview `audio/mpeg` responses; ffprobe identified MP3; retained hashes and timestamps. |
| `python tests/audio-assets/check_assets.py` before generation | RED, exit 1: missing asset manifest. |
| `python tests/audio-assets/build_assets.py` | GREEN, 22 source-derived PCM WAVs and detailed manifest generated offline. |
| `python tests/audio-assets/check_assets.py` after generation/final changes | GREEN, 22 cues + 7 raw sources, exact hashes/coverage, ffprobe format checks, ffmpeg error-free decoding, sample duration/peak/RMS/clipping, loop wrap/energy, levels and package budgets. |
| `python tests/audio-assets/test_asset_gate.py` final | GREEN, 7 tests: six failure fixtures and one positive LF/CRLF portability fixture. Fixtures retained in ignored scratch. |
| Second final offline build, compare SHA-256 of 22 WAVs + manifest | GREEN, byte-identical on the recorded toolchain. |
| Extract audition script; `node --check --input-type=commonjs` via stdin | GREEN, JavaScript syntax only; no browser execution. |
| `git apply --check tests/audio-assets/parent-hook.example.patch` | GREEN, external construction example is apply-checkable; not applied. |
| `git diff --cached --check`, staged path/count audit | GREEN, no whitespace errors; exactly 39 allowed NEW implementation files. |
| `git show HEAD:<each audio path>` vs manifest/source-index SHA-256 | GREEN, all 29 committed audio blobs match the working/download-derived hashes. |

Tools observed: Python 3.10.11; ffmpeg/ffprobe 8.0.1 full Gyan build; Node v24.14.0. No dependency install, paid/model/provider call, root script or configuration change. Root npm/application/browser suites were not run because this isolated leaf only produces asset files and independent offline tooling.

## Evidence and reproduction

- `docs/assets/retro-audio-provenance.md`: authoritative source links, courtesy credits, source status, processing, all 22 filename/source/duration/peak/size rows and acceptance limits.
- `public/audio/retro-v1/sources/index.json`: source custody; `public/audio/retro-v1/manifest.json`: cue recipes and exact hashes.
- `tests/audio-assets/verification.json`: observed final technical gate and 22 measured rows.
- `tests/audio-assets/README.md`: offline build/check commands.
- `tests/audio-assets/audition.html`: direct-file local audition, default volume 0.35, explicit gesture, one sound at a time, stop/hidden-page stop and loop repeat controls. Prepared, syntax-checked, **not opened or listened to**.
- Owned ignored `.local/sfx-assets/`: original fetched page snapshots, one-time acquisition script, technical receipts and retained negative fixture copies. Not part of the commits or deployment.

Reproduction, with Python 3.10+ and installed ffmpeg/ffprobe on PATH, no network:

```powershell
$env:PYTHONDONTWRITEBYTECODE = '1'
python tests/audio-assets/check_assets.py
python tests/audio-assets/test_asset_gate.py
# Optional deterministic regeneration with recorded ffmpeg toolchain:
python tests/audio-assets/build_assets.py
python tests/audio-assets/check_assets.py
```

## External root hook example

The root can use the sibling frozen API's default, or explicitly pass this package's URL:

```ts
import { createGameAudio } from './audio';

const audio = createGameAudio({ assetBaseUrl: '/audio/retro-v1/' });
```

`tests/audio-assets/parent-hook.example.patch` adds a tiny typed construction example under the leased fixture directory. The patch was checked but not applied; its sibling runtime import was not typechecked in this asset-only branch. Root owns initialization lifetime, trusted gesture unlock, mute/volume storage/UI, event identity and generation fences, public state updates and destroy. No manual cue event is fired by this asset patch. Root owns explicit UI/message/order/save/pause/alert events; sibling `update` owns public crew/work/report/cooling/mission transitions as frozen. Keep readable visual/captioned alerts authoritative with audio off; audio never authorizes engine work.

## Limits, blockers and remaining acceptance

No remaining source/license/cue-coverage blocker. The original-file login restriction is explicitly handled through authorized public previews. Technical continuity does not establish **perceptual** seamlessness, sound recognition, relative loudness preference, absence of pumping/phase artifacts, fatigue or final palette coherence. Direct listening is unperformed. Browser decoding/playback, Web Audio gapless loops, host/device audio, native acceptance, integrated event ownership, UI accessibility controls/captions and real mission behavior are all unperformed here and remain root integration/review gates. No game integration, listening approval, native/device/host result or mission acceptance is claimed. Parent independently reviews/publishes the focused patch.

Parent owns child cleanup: receive/acknowledge this result, confirm task status completed / result_available / hasPendingChildRuns:false, then recoverably archive returned child thread. This worker does not archive itself or permanently delete any thread.

## Exact changed files

- `docs/assets/retro-audio-provenance.md`
- `public/audio/retro-v1/cooling-recovered.wav`
- `public/audio/retro-v1/crew-step.wav`
- `public/audio/retro-v1/facility-loop.wav`
- `public/audio/retro-v1/incident-critical.wav`
- `public/audio/retro-v1/incident-warning.wav`
- `public/audio/retro-v1/manifest.json`
- `public/audio/retro-v1/message-received.wav`
- `public/audio/retro-v1/message-sent.wav`
- `public/audio/retro-v1/mission-failure.wav`
- `public/audio/retro-v1/mission-success.wav`
- `public/audio/retro-v1/order-accepted.wav`
- `public/audio/retro-v1/order-rejected.wav`
- `public/audio/retro-v1/report-arrived.wav`
- `public/audio/retro-v1/save-complete.wav`
- `public/audio/retro-v1/simulation-pause.wav`
- `public/audio/retro-v1/simulation-resume.wav`
- `public/audio/retro-v1/sources/365641-hq-preview.mp3`
- `public/audio/retro-v1/sources/404743-hq-preview.mp3`
- `public/audio/retro-v1/sources/431329-hq-preview.mp3`
- `public/audio/retro-v1/sources/501102-hq-preview.mp3`
- `public/audio/retro-v1/sources/519073-hq-preview.mp3`
- `public/audio/retro-v1/sources/865886-hq-preview.mp3`
- `public/audio/retro-v1/sources/869220-hq-preview.mp3`
- `public/audio/retro-v1/sources/index.json`
- `public/audio/retro-v1/task-cancel.wav`
- `public/audio/retro-v1/task-complete.wav`
- `public/audio/retro-v1/task-start.wav`
- `public/audio/retro-v1/ui-close.wav`
- `public/audio/retro-v1/ui-open.wav`
- `public/audio/retro-v1/ui-select.wav`
- `public/audio/retro-v1/work-loop.wav`
- `tests/audio-assets/README.md`
- `tests/audio-assets/audition.html`
- `tests/audio-assets/build_assets.py`
- `tests/audio-assets/check_assets.py`
- `tests/audio-assets/parent-hook.example.patch`
- `tests/audio-assets/test_asset_gate.py`
- `tests/audio-assets/verification.json`
- `docs/handoffs/SFX-ASSETS.md`
