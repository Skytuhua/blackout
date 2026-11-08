# Retro-v1 asset verification

No dependency installation or root script changes are needed. From repository root:

```powershell
python tests/audio-assets/check_assets.py
python tests/audio-assets/test_asset_gate.py
```

Python 3.10+ and `ffprobe`/`ffmpeg` on PATH are required. The checker runs offline,
checks all seven retained preview hashes and all 22 derived hashes, decodes every
source and cue, checks PCM16 mono 44.1 kHz, actual durations/sample peaks/RMS,
non-silence, zero clipping, loop wrap value/slope, loop energy, exact names,
CC0 custody mapping, and package size. Six negative fixture checks cover missing
cue, duplicate ID, corrupt source, changed license, silent output and broken loop.
An additional positive fixture checks LF/CRLF metadata portability. Fixture copies
stay under ignored `.local/sfx-assets/`. Metadata text hashes normalize CRLF to
LF; downloaded audio and derived WAV checksums always hash exact bytes.

To reproduce the delivered WAVs **offline**, run:

```powershell
python tests/audio-assets/build_assets.py
python tests/audio-assets/check_assets.py
```

This intentionally overwrites only generated WAVs and `manifest.json` within
`public/audio/retro-v1/`. Raw previews are hash-checked first. Rebuild with the
recorded ffmpeg version for byte equality; different decoder/resampler versions
may produce different samples. No source is synthesized or downloaded by the
builder. The manifest records trim times, rate/pitch changes, filters, reversal,
DC removal, edge/circular fades, gain, output format and exact checksums.

Open [audition.html](audition.html) directly in a browser for manual, provider-free
audition. It uses local WAV URLs, no server or autoplay, default volume 0.35,
single cue at a time, explicit stop, and hidden-page stop. The two loop buttons
repeat until stopped. The fixture has been prepared but **has not been opened,
browser-tested or listened to by this worker**. At loop wraps, listen for clicks,
pumping, phase changes and fatiguing repetition: numeric continuity cannot judge
those. The fixture's HTMLAudio loop is an audition aid, not proof of gapless Web
Audio runtime playback.

`verification.json` records the observed technical gate. It is a point-in-time
receipt; rerun the checker at the integrated revision. No native device, host,
mission, runtime event ownership, caption, mute-control or user listening
acceptance is established here.
