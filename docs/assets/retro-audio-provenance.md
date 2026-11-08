# Blackout retro-v1 audio provenance

Asset package for SFX-ASSETS, contract anchor `b0a72aa40d63bba8ffd9b05c660f7b5485211abc`, implementation base `54558c39ad500361d0d5fe243862b0f6767d7d60`. Only the frozen 22 cue filenames are delivered. No runtime or game integration is part of this patch.

## Source custody and licenses

All seven source pages were fetched directly on 2026-11-08 UTC. Each displayed **Creative Commons 0**, with a link to [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Each displayed **Login to download** for the original file. No login or original download was attempted; these are the public **HQ MP3 previews**, not original WAV files. Preview URLs were extracted from the source page, then actually downloaded without credentials. The source files below retain the exact downloaded bytes.

[`sources/index.json`](../../public/audio/retro-v1/sources/index.json) records author, title, numeric ID, authoritative source-page URL, observed license label and link, observation/retrieval timestamps, page SHA-256, exact preview URL, final response URL, response MIME type, raw bytes/SHA-256, and measured preview format/duration. Page snapshots remain in the worker's ignored `.local/sfx-assets/<id>.html`; they are research receipts and are not deployed. Raw sources remain under `public/audio/retro-v1/sources/`.

| Freesound source | Author | Verified license | Exact acquired preview | Retained bytes |
|---|---|---|---|---:|
| [8 Bit Alarm.wav (#365641)](https://freesound.org/people/furbyguy/sounds/365641/) | furbyguy | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [HQ MP3 preview](https://cdn.freesound.org/previews/365/365641_5829171-hq.mp3) | 9,025 |
| [8-bit footsteps.wav (#501102)](https://freesound.org/people/EVRetro/sounds/501102/) | EVRetro | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [HQ MP3 preview](https://cdn.freesound.org/previews/501/501102_6299573-hq.mp3) | 34,518 |
| [8-Bit Powerup (#431329)](https://freesound.org/people/SomeGuy22/sounds/431329/) | SomeGuy22 | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [HQ MP3 preview](https://cdn.freesound.org/previews/431/431329_2711716-hq.mp3) | 14,351 |
| [017_UI_Game_SFX (#869220)](https://freesound.org/people/SignatureSoundsOrg/sounds/869220/) | SignatureSoundsOrg | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [HQ MP3 preview](https://cdn.freesound.org/previews/869/869220_19205925-hq.mp3) | 12,629 |
| [8-Bit UI FX 1 (#865886)](https://freesound.org/people/CAT-FOX_ALEX/sounds/865886/) | CAT-FOX_ALEX | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [HQ MP3 preview](https://cdn.freesound.org/previews/865/865886_17675683-hq.mp3) | 28,599 |
| [Retro video game sfx - Fail (#404743)](https://freesound.org/people/OwlStorm/sounds/404743/) | OwlStorm | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [HQ MP3 preview](https://cdn.freesound.org/previews/404/404743_140737-hq.mp3) | 15,971 |
| [8-bit car engine.wav (#519073)](https://freesound.org/people/EVRetro/sounds/519073/) | EVRetro | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [HQ MP3 preview](https://cdn.freesound.org/previews/519/519073_6299573-hq.mp3) | 1,673,726 |

Courtesy credits: furbyguy; EVRetro; SomeGuy22; SignatureSoundsOrg; CAT-FOX_ALEX; OwlStorm (Ashe Kirk / Owlish Media). CC0 does not require attribution; these credits preserve source identity. No NC, ND, unclear-license source, music or voice source is used. The fail sound's page explicitly identifies OwlStorm's CC0 release and preferred courtesy name.

## Conditioning and cue mapping

[`manifest.json`](../../public/audio/retro-v1/manifest.json) is the machine-readable cue-to-raw mapping. Every cue refers to a source ID and raw SHA-256; it also records the full decode command, source trim, playback-rate/pitch ratio, high/low-pass filters, reversal, DC removal, fades/overlap, gain, derived SHA-256 and actual format/duration/peak/RMS/bytes. Builder and source-index text hashes normalize CRLF to LF for portable Git checkouts; raw audio, source-page receipts and derived WAV hashes use exact bytes. Tool versions are included.

The restrained retro palette is a design intent pending listening: short UI/notification blips, one footfall taken from the Famitracker footsteps, a sourced alert for both warning severities, sourced rising/falling one-shots for results, and two quiet mechanical textures from the steady portion of the Famitracker engine. Related cues deliberately reuse sources with different trims, rates and levels. The engine source is repurposed as a coarse mechanism texture; no literal recording of repairs or cooling is claimed. No oscillator, generated noise, replacement synthesis, music bed or voice was added.

All cues are mono, signed little-endian PCM16 WAV at 44,100 Hz. Source trims are decoded, mono-downmixed, pitch/rate-adjusted through `asetrate` + `aresample`, filtered, DC-centered and peak-normalized. One-shots receive a 3 ms attack and 12 ms release. Loops use circular tail-to-head linear overlap (120/200 ms), followed by a 32-sample wrap correction; no silence fade is inserted at each repetition. Exact sample value and first-difference continuity are tested. Perceptual seamlessness still requires direct audition.

| Frozen filename | Source ID | Measured seconds | Sample peak dBFS | Bytes |
|---|---:|---:|---:|---:|
| `ui-select.wav` | 869220 | 0.090000 | -21.001 | 7,982 |
| `ui-open.wav` | 865886 | 0.218186 | -21.001 | 19,288 |
| `ui-close.wav` | 865886 | 0.266667 | -22.999 | 23,564 |
| `message-sent.wav` | 865886 | 0.150000 | -22.999 | 13,274 |
| `message-received.wav` | 869220 | 0.210000 | -21.001 | 18,566 |
| `order-accepted.wav` | 431329 | 0.209093 | -21.001 | 18,486 |
| `order-rejected.wav` | 404743 | 0.227279 | -18.999 | 20,090 |
| `crew-step.wav` | 501102 | 0.190000 | -28.997 | 16,802 |
| `task-start.wav` | 865886 | 0.400000 | -24.998 | 35,324 |
| `task-complete.wav` | 431329 | 0.418186 | -21.001 | 36,928 |
| `task-cancel.wav` | 404743 | 0.176009 | -22.999 | 15,568 |
| `report-arrived.wav` | 869220 | 0.466667 | -21.001 | 41,204 |
| `incident-warning.wav` | 365641 | 0.294127 | -18.001 | 25,986 |
| `incident-critical.wav` | 365641 | 0.400000 | -14.000 | 35,324 |
| `cooling-recovered.wav` | 431329 | 0.625011 | -22.999 | 55,170 |
| `mission-success.wav` | 431329 | 0.500000 | -18.001 | 44,144 |
| `mission-failure.wav` | 404743 | 0.548753 | -18.001 | 48,444 |
| `save-complete.wav` | 865886 | 0.269229 | -22.999 | 23,790 |
| `simulation-pause.wav` | 865886 | 0.240000 | -24.998 | 21,212 |
| `simulation-resume.wav` | 865886 | 0.150000 | -24.998 | 13,274 |
| `work-loop.wav` | 519073 | 1.800000 | -32.001 | 158,804 |
| `facility-loop.wav` | 519073 | 3.000000 | -36.006 | 264,644 |

Runtime WAV total: **957,868 bytes**. Observed package total including all raw previews and manifests: **2,794,831 bytes** (text checkout line endings can change metadata size). The 56.1-second unmodified engine preview accounts for 1,673,726 bytes; it is deliberately retained for custody, though the runtime loads only the small derived loops. Vite/public packaging also carries retained sources, so package size and loaded runtime size are distinct. No deployment measurement is claimed.

## Observed verification and acceptance limits

- Initial RED: `python tests/audio-assets/check_assets.py` exited 1 with missing manifest before cue generation.
- GREEN: the same offline checker passed all 22 cues and seven sources. `ffprobe` verified actual stream formats; `ffmpeg -xerror` decoded every raw preview and delivered WAV. Python measured duration, bytes, sample peak/RMS, zero clipped samples, exact hashes, silence/level limits and both loop wraps.
- `python tests/audio-assets/test_asset_gate.py`: six negative fixture tests passed for missing cue, duplicate ID, source corruption, disallowed license, silent cue and discontinuous loop, including checks after plausible manifest/hash updates. A seventh positive test passed both LF and CRLF source-index checkouts without changing custody hashes.
- A second offline build reproduced all 22 WAV hashes and the manifest byte-for-byte with the recorded toolchain.
- `git apply --check tests/audio-assets/parent-hook.example.patch` checks the external root construction example without modifying source. The sibling runtime import can only be typechecked after that worker is integrated.
- [`verification.json`](../../tests/audio-assets/verification.json) retains the measured technical receipt. [`audition.html`](../../tests/audio-assets/audition.html) is a local, explicit-gesture audition index with a 0.35 volume default and repeat buttons for the two loops. It was prepared but not browser-tested or listened to.

**Direct listening unperformed.** Numeric continuity, low peaks and successful decoding do not establish perceived restraint, distinctness, pleasantness, gapless browser looping, semantic recognition or absence of perceptual clicks. This worker has not observed browser runtime playback, a physical audio device, the demo host, a mission, captions, mute/volume UI or user acceptance. Root retains those checks, lifecycle/event bindings and accessibility controls. Alarms, reports and state must remain understandable through readable visual/captioned UI with audio off; sound does not create or validate simulation actions.

Offline reproduction commands and fixture details: [`tests/audio-assets/README.md`](../../tests/audio-assets/README.md). No new dependencies, root scripts, shared schemas, gateway, persistence, scene, App or Menu edits are required by this asset package.
