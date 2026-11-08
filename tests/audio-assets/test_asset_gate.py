"""Negative custody fixtures; never alter the shipped assets."""
import json
import pathlib
import shutil
import tempfile
import unittest
import array
import math
import sys
import wave
from unittest.mock import patch

import check_assets


class AssetGateFailureTests(unittest.TestCase):
    def setUp(self):
        scratch = check_assets.ROOT / '.local/sfx-assets'
        scratch.mkdir(parents=True, exist_ok=True)
        # Keep fixture copies in the owned ignored scratch directory for receipts.
        self.assets = pathlib.Path(tempfile.mkdtemp(prefix='gate-', dir=scratch)) / 'retro-v1'
        shutil.copytree(check_assets.ASSETS, self.assets)
        self.override = patch.object(check_assets, 'ASSETS', self.assets)
        self.override.start()
        self.addCleanup(self.override.stop)

    def manifest(self):
        return json.loads((self.assets / 'manifest.json').read_text(encoding='utf-8'))

    def write_manifest(self, value):
        (self.assets / 'manifest.json').write_text(json.dumps(value), encoding='utf-8')

    def test_missing_cue_fails(self):
        (self.assets / 'ui-select.wav').rename(self.assets / 'wrong-name.wav')
        with self.assertRaisesRegex(ValueError, 'Missing or extra delivered WAVs'):
            check_assets.check()

    def test_changed_raw_source_fails(self):
        path = self.assets / 'sources/365641-hq-preview.mp3'
        raw = bytearray(path.read_bytes())
        raw[-1] ^= 1
        path.write_bytes(raw)
        with self.assertRaisesRegex(ValueError, 'raw bytes/checksum'):
            check_assets.check()

    def test_unapproved_license_fails_even_if_index_hash_updated(self):
        index = self.assets / 'sources/index.json'
        sources = json.loads(index.read_text(encoding='utf-8'))
        sources['sources'][0]['license']['spdx'] = 'CC-BY-NC-4.0'
        index.write_text(json.dumps(sources), encoding='utf-8')
        manifest = self.manifest()
        manifest['sourceIndexLfSha256'] = check_assets.text_digest(index)
        self.write_manifest(manifest)
        with self.assertRaisesRegex(ValueError, 'unapproved source license'):
            check_assets.check()

    def test_silent_cue_fails_even_if_file_hash_updated(self):
        path = self.assets / 'ui-select.wav'
        data = path.read_bytes()
        path.write_bytes(data[:44] + bytes(len(data)-44))
        manifest = self.manifest()
        manifest['cues'][0]['measurement']['sha256'] = check_assets.digest(path)
        self.write_manifest(manifest)
        with self.assertRaisesRegex(ValueError, 'silent or excessive level'):
            check_assets.check()

    def test_duplicate_id_fails(self):
        manifest = self.manifest()
        manifest['cues'][1]['id'] = 'ui-select'
        self.write_manifest(manifest)
        with self.assertRaisesRegex(ValueError, 'Cue contract drift'):
            check_assets.check()

    def test_text_metadata_survives_lf_and_crlf_checkout(self):
        index = self.assets / 'sources/index.json'
        normalized = index.read_bytes().replace(b'\r\n', b'\n')
        index.write_bytes(normalized)
        self.assertEqual(check_assets.check()['status'], 'PASS')
        index.write_bytes(normalized.replace(b'\n', b'\r\n'))
        self.assertEqual(check_assets.check()['status'], 'PASS')

    def test_broken_loop_fails_even_with_truthful_new_checksum_and_levels(self):
        path = self.assets / 'work-loop.wav'
        with wave.open(str(path), 'rb') as wav:
            samples = array.array('h', wav.readframes(wav.getnframes()))
        if sys.byteorder != 'little':
            samples.byteswap()
        samples[-1] = -samples[0] if abs(samples[0]) > 5 else 20
        peak = max(abs(s) for s in samples) / 32768
        rms = math.sqrt(sum(s*s for s in samples) / len(samples)) / 32768
        if sys.byteorder != 'little':
            samples.byteswap()
        with wave.open(str(path), 'wb') as wav:
            wav.setparams((1, 2, 44100, 0, 'NONE', 'not compressed'))
            wav.writeframes(samples.tobytes())
        manifest = self.manifest()
        cue = next(c for c in manifest['cues'] if c['id'] == 'work-loop')
        cue['measurement'].update(sha256=check_assets.digest(path), peakDbfs=check_assets.db(peak), rmsDbfs=check_assets.db(rms))
        self.write_manifest(manifest)
        with self.assertRaisesRegex(ValueError, 'discontinuous wrap'):
            check_assets.check()


if __name__ == '__main__':
    unittest.main(verbosity=2)
