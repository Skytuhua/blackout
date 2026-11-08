"""Rebuild the frozen cues OFFLINE from retained, hash-checked Freesound previews.

Requires Python 3.10+ and ffmpeg. This transforms downloaded audio only.
No oscillator, noise generator, provider, network request or synthesized substitute.
"""
import array
import hashlib
import json
import math
import pathlib
import subprocess
import sys
import wave

ROOT = pathlib.Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'public/audio/retro-v1'
RATE = 44100
# cue, source ID, source start/length seconds, playback pitch/rate ratio, peak dBFS,
# lowpass Hz, reverse, circular overlap seconds (0 for a one-shot).
RECIPES = [
    ('ui-select', 869220, 0, .09, 1, -21, 6000, False, 0),
    ('ui-open', 865886, 0, .24, 1.1, -21, 6000, False, 0),
    ('ui-close', 865886, 0, .24, .9, -23, 6000, True, 0),
    ('message-sent', 865886, 0, .18, 1.2, -23, 6000, False, 0),
    ('message-received', 869220, .19, .21, 1, -21, 6000, False, 0),
    ('order-accepted', 431329, 0, .23, 1.1, -21, 6000, False, 0),
    ('order-rejected', 404743, 0, .25, 1.1, -19, 6000, False, 0),
    ('crew-step', 501102, 0, .19, 1, -29, 4000, False, 0),
    ('task-start', 865886, 0, .30, .75, -25, 4500, False, 0),
    ('task-complete', 431329, 0, .46, 1.1, -21, 6000, False, 0),
    ('task-cancel', 404743, 0, .22, 1.25, -23, 5000, False, 0),
    ('report-arrived', 869220, 0, .42, .9, -21, 6000, False, 0),
    ('incident-warning', 365641, 0, .25, .85, -18, 5000, False, 0),
    ('incident-critical', 365641, 0, .40, 1, -14, 5000, False, 0),
    ('cooling-recovered', 431329, 0, .50, .8, -23, 5000, False, 0),
    ('mission-success', 431329, 0, .50, 1, -18, 6000, False, 0),
    ('mission-failure', 404743, 0, .439, .8, -18, 5000, False, 0),
    ('save-complete', 865886, 0, .35, 1.3, -23, 6000, False, 0),
    ('simulation-pause', 865886, 0, .18, .75, -25, 4500, True, 0),
    ('simulation-resume', 865886, 0, .18, 1.2, -25, 5000, False, 0),
    ('work-loop', 519073, 6, 2.4, 1.25, -32, 2400, False, .12),
    ('facility-loop', 519073, 14, 2.4, .75, -36, 900, False, .20),
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text_sha(path):
    # Git may check text out as LF or CRLF. Audio hashes always use exact bytes.
    return hashlib.sha256(path.read_bytes().replace(b'\r\n', b'\n')).hexdigest()


def db(value):
    return 20 * math.log10(value) if value else -999.0


def build():
    source_index = ASSETS / 'sources/index.json'
    sources = json.loads(source_index.read_text(encoding='utf-8'))['sources']
    by_id = {source['id']: source for source in sources}
    # Verify every retained raw file before overwriting any derived output.
    for source in sources:
        raw = ASSETS / source['download']['file']
        if sha(raw) != source['download']['sha256']:
            raise ValueError(f'Raw custody failure: {raw}')
    cues = []
    for cid, sid, start, length, ratio, target, lowpass, reverse, overlap in RECIPES:
        raw = by_id[sid]['download']
        filters = [f'atrim=start={start}:duration={length}', 'asetpts=PTS-STARTPTS',
                   f'asetrate={round(RATE*ratio)}', f'aresample={RATE}',
                   'highpass=f=60', f'lowpass=f={lowpass}']
        if reverse:
            filters.append('areverse')
        args = ['ffmpeg', '-v', 'error', '-i', raw['file'], '-ac', '1',
                '-af', ','.join(filters), '-ar', str(RATE), '-f', 'f32le', '-']
        decoded = array.array('f', subprocess.check_output(args, cwd=ASSETS))
        if sys.byteorder != 'little':
            decoded.byteswap()
        samples = list(decoded)
        # Remove DC per selected segment. No new audio is generated.
        mean = sum(samples) / len(samples)
        samples = [s - mean for s in samples]
        if overlap:
            width = round(overlap * RATE)
            # Circular overlap: middle followed by tail->head blend. Unlike
            # silence fades, this keeps energy through the wrap boundary.
            body = samples[width:-width]
            blend = [samples[-width+i] * (1-i/(width-1)) + samples[i] * (i/(width-1)) for i in range(width)]
            samples = body + blend
            # Correct the final 32 samples toward the next first sample and
            # its incoming slope. The tiny recorded-sample correction makes
            # the PCM wrap value and derivative continuous after quantizing.
            desired_end = samples[0]
            desired_penultimate = desired_end - (samples[1] - samples[0])
            error = desired_end - samples[-1]
            for i in range(32):
                samples[-32+i] += error * (i/31) ** 2
            samples[-2], samples[-1] = desired_penultimate, desired_end
        else:
            # 3 ms attack, 12 ms release, preserving a zero-valued PCM edge.
            attack = min(round(.003 * RATE), len(samples)//2)
            release = min(round(.012 * RATE), len(samples)//2)
            for i in range(attack):
                samples[i] *= i/(attack-1)
            for i in range(release):
                samples[-release+i] *= 1-i/(release-1)
        peak = max(abs(s) for s in samples)
        gain = 10 ** (target/20) / peak
        pcm = array.array('h', [round(s * gain * 32768) for s in samples])
        if sys.byteorder != 'little':
            pcm.byteswap()
        output = ASSETS / f'{cid}.wav'
        with wave.open(str(output), 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(RATE)
            wav.writeframes(pcm.tobytes())
        # Numeric calculations use host-endian values.
        if sys.byteorder != 'little':
            pcm.byteswap()
        peak = max(abs(s) for s in pcm) / 32768
        rms = math.sqrt(sum(s*s for s in pcm)/len(pcm)) / 32768
        cue = {
            'id': cid, 'file': output.name, 'loop': bool(overlap), 'sourceId': sid,
            'sourceRawSha256': raw['sha256'],
            'recipe': {'startSeconds': start, 'sourceDurationSeconds': length,
                       'pitchRateRatio': ratio, 'highpassHz': 60, 'lowpassHz': lowpass,
                       'reverse': reverse, 'removeSegmentDc': True,
                       'attackSeconds': 0 if overlap else .003,
                       'releaseSeconds': 0 if overlap else .012,
                       'circularOverlapSeconds': overlap, 'wrapCorrectionSamples': 32 if overlap else 0,
                       'targetPeakDbfs': target},
            'transform': {'decodeCommandFromAssetDirectory': args,
                          'postprocess': 'tests/audio-assets/build_assets.py',
                          'gainAfterConditioningDb': db(gain)},
            'measurement': {'codec': 'pcm_s16le', 'sampleRate': RATE, 'channels': 1,
                            'bitsPerSample': 16, 'frames': len(pcm),
                            'durationSeconds': len(pcm)/RATE,
                            'peakDbfs': db(peak), 'rmsDbfs': db(rms),
                            'clippedSamples': sum(abs(s) >= 32767 for s in pcm),
                            'wrapDeltaPcm': abs(pcm[-1] - pcm[0]) if overlap else None,
                            'bytes': output.stat().st_size, 'sha256': sha(output)},
        }
        cues.append(cue)
        print(f'{cid}: {len(pcm)/RATE:.3f}s, {db(peak):.2f} dBFS peak, {output.stat().st_size} bytes')
    manifest = {
        'schemaVersion': 1, 'assetBaseUrl': '/audio/retro-v1/',
        'contractAnchor': 'b0a72aa40d63bba8ffd9b05c660f7b5485211abc',
        'implementationBase': '54558c39ad500361d0d5fe243862b0f6767d7d60',
        'sourceIndex': 'sources/index.json', 'sourceIndexLfSha256': text_sha(source_index),
        'builderLfSha256': text_sha(pathlib.Path(__file__)),
        'toolchain': {'ffmpeg': subprocess.check_output(['ffmpeg', '-version'], text=True).splitlines()[0],
                      'python': sys.version.split()[0]},
        'directListeningPerformed': False, 'cues': cues,
    }
    (ASSETS / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    build()
