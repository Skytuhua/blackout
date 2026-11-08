"""Offline custody + delivery gate. Python stdlib; ffprobe/ffmpeg on PATH.

Run: python tests/audio-assets/check_assets.py
This is technical evidence only, never a perceptual or in-game acceptance test.
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
EXPECTED = {
    'ui-select', 'ui-open', 'ui-close', 'message-sent', 'message-received',
    'order-accepted', 'order-rejected', 'crew-step', 'task-start',
    'task-complete', 'task-cancel', 'report-arrived', 'incident-warning',
    'incident-critical', 'cooling-recovered', 'mission-success',
    'mission-failure', 'save-complete', 'simulation-pause',
    'simulation-resume', 'work-loop', 'facility-loop',
}


def require(condition, detail):
    if not condition:
        raise ValueError(detail)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text_digest(path):
    return hashlib.sha256(path.read_bytes().replace(b'\r\n', b'\n')).hexdigest()


def safe_file(relative):
    path = (ASSETS / relative).resolve()
    require(path.is_relative_to(ASSETS.resolve()), f'Path escapes asset directory: {relative}')
    require(path.is_file(), f'Missing asset: {relative}')
    return path


def db(value):
    return 20 * math.log10(value) if value else -999.0


def check():
    manifest_path = ASSETS / 'manifest.json'
    require(manifest_path.is_file(), 'Missing asset manifest (all 22 frozen cues required)')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    require(manifest['schemaVersion'] == 1, 'Unsupported asset manifest version')
    require(manifest['assetBaseUrl'] == '/audio/retro-v1/', 'Asset URL contract changed')
    require(manifest['builderLfSha256'] == text_digest(pathlib.Path(__file__).with_name('build_assets.py')), 'Builder checksum drift; rebuild manifest')
    cues = manifest['cues']
    require(len(cues) == 22 and {c['id'] for c in cues} == EXPECTED, 'Cue contract drift')
    require({p.stem for p in ASSETS.glob('*.wav')} == EXPECTED, 'Missing or extra delivered WAVs')
    source_index = safe_file('sources/index.json')
    require(text_digest(source_index) == manifest['sourceIndexLfSha256'], 'Source index checksum drift')
    sources = json.loads(source_index.read_text(encoding='utf-8'))['sources']
    source_ids = {s['id'] for s in sources}
    require(len(source_ids) == len(sources), 'Duplicate source IDs')
    require(source_ids == {c['sourceId'] for c in cues}, 'Unmapped or missing raw sources')
    for source in sources:
        sid = source['id']
        require(source['sourcePage'] == f"https://freesound.org/people/{source['author']}/sounds/{sid}/", f'{sid}: source identity')
        require(source['title'] and source['observedAtUtc'], f'{sid}: missing source evidence')
        license_data = source['license']
        require(license_data['spdx'] == 'CC0-1.0', f'{sid}: unapproved source license')
        require(license_data['url'] == 'https://creativecommons.org/publicdomain/zero/1.0/', f'{sid}: license URL')
        require(license_data['observedLabel'] == 'Creative Commons 0', f'{sid}: license evidence')
        raw = source['download']
        require(raw['kind'] == 'public-preview', f'{sid}: preview must stay labeled')
        require(raw['url'].startswith('https://cdn.freesound.org/previews/') and f'/{sid}_' in raw['url'] and raw['url'].endswith('-hq.mp3'), f'{sid}: preview URL')
        require(raw['contentType'] == 'audio/mpeg' and raw['retrievedAtUtc'], f'{sid}: download evidence')
        path = safe_file(raw['file'])
        require(path.stat().st_size == raw['bytes'] and digest(path) == raw['sha256'], f'{sid}: raw bytes/checksum')
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))
        streams = probe['streams']
        require(len(streams) == 1 and streams[0]['codec_name'] == source['probe']['codec'] == 'mp3', f'{sid}: raw preview codec')
        require(int(streams[0]['sample_rate']) == source['probe']['sampleRate'] and streams[0]['channels'] == source['probe']['channels'], f'{sid}: raw preview format')
        require(abs(float(probe['format']['duration']) - source['probe']['durationSeconds']) < 1e-6, f'{sid}: raw preview duration')
        subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'], check=True, stdout=subprocess.DEVNULL)
    by_id = {source['id']: source for source in sources}
    rows = []
    for cue in cues:
        cid = cue['id']
        require(cue['file'] == f'{cid}.wav', f'{cid}: filename contract')
        source = by_id[cue['sourceId']]['download']
        require(cue['sourceRawSha256'] == source['sha256'], f'{cid}: broken custody mapping')
        path = safe_file(cue['file'])
        measurement = cue['measurement']
        require(path.stat().st_size == measurement['bytes'] and digest(path) == measurement['sha256'], f'{cid}: derived bytes/checksum')
        with wave.open(str(path), 'rb') as wav:
            require((wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) == (1, 2, 44100, 'NONE'), f'{cid}: PCM16 mono 44100 required')
            count = wav.getnframes()
            samples = array.array('h', wav.readframes(count))
        if sys.byteorder != 'little':
            samples.byteswap()
        require(len(samples) == count and count > 0, f'{cid}: truncated or empty WAV')
        peak = max(abs(sample) for sample in samples) / 32768
        rms = math.sqrt(sum(sample * sample for sample in samples) / count) / 32768
        seconds = count / 44100
        loop = cid in ('work-loop', 'facility-loop')
        require(cue['loop'] == loop, f'{cid}: loop contract')
        require((1.0 <= seconds <= 4.0) if loop else (0.05 <= seconds <= 1.5), f'{cid}: duration budget')
        require(-60 < db(rms) and db(peak) <= (-29.9 if loop else -8.9), f'{cid}: silent or excessive level')
        require(abs(db(peak) - cue['recipe']['targetPeakDbfs']) < 0.03, f'{cid}: target peak mismatch')
        require(all(abs(s) < 32767 for s in samples), f'{cid}: clipped samples')
        require(abs(measurement['durationSeconds'] - seconds) < 1e-8, f'{cid}: duration receipt')
        require(abs(measurement['peakDbfs'] - db(peak)) < 1e-6 and abs(measurement['rmsDbfs'] - db(rms)) < 1e-6, f'{cid}: level receipt')
        if loop:
            # A numeric seam gate is necessary but does not establish perceptual looping.
            require(abs(samples[-1] - samples[0]) <= 1, f'{cid}: discontinuous wrap')
            require(abs((samples[1] - samples[0]) - (samples[-1] - samples[-2])) <= 2, f'{cid}: discontinuous wrap slope')
            windows = [samples[i:i+2205] for i in range(0, count-2204, 2205)]
            require(min(math.sqrt(sum(s*s for s in w)/len(w))/32768 for w in windows) > 10 ** (-65/20), f'{cid}: silent gap in loop')
        else:
            require(samples[0] == samples[-1] == 0, f'{cid}: one-shot edge fade missing')
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(path)]))['streams']
        require(len(probe) == 1 and probe[0]['codec_name'] == 'pcm_s16le' and probe[0]['sample_rate'] == '44100' and probe[0]['channels'] == 1, f'{cid}: ffprobe format')
        subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'], check=True, stdout=subprocess.DEVNULL)
        rows.append({'id': cid, 'durationSeconds': seconds, 'peakDbfs': round(db(peak), 4), 'rmsDbfs': round(db(rms), 4), 'bytes': path.stat().st_size})
    runtime_bytes = sum(row['bytes'] for row in rows)
    package_bytes = sum(p.stat().st_size for p in ASSETS.rglob('*') if p.is_file())
    require(runtime_bytes < 2 * 1024 * 1024, 'Runtime WAV budget exceeded')
    require(package_bytes < 5 * 1024 * 1024, 'Packaged sources + WAV budget exceeded')
    return {'status': 'PASS', 'cues': len(rows), 'rawSources': len(sources), 'runtimeBytes': runtime_bytes, 'packageBytes': package_bytes, 'directListeningPerformed': False, 'measurements': rows}


if __name__ == '__main__':
    try:
        print(json.dumps(check(), indent=2))
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        sys.exit(1)
