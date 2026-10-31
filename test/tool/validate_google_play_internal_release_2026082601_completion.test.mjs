import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validateGooglePlayInternalRelease2026082601Completion,
} from '../../tool/validate_google_play_internal_release_2026082601_completion.mjs';

const root = new URL('../../', import.meta.url).pathname;
const paths = {
  evidence:
    '../../store/google-play/google-play-internal-release-2026082601-completion.json',
  candidateManifest:
    '../../store/google-play/rw20-current-internal-candidate-manifest.json',
  preReleaseHandoff:
    '../../store/google-play/rw20-current-internal-upload-handoff.json',
};
const canonical = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [
    key,
    JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8')),
  ]),
));

function validate(mutate = () => {}) {
  const value = structuredClone(canonical);
  mutate(value);
  return validateGooglePlayInternalRelease2026082601Completion({ root, ...value });
}

test('binds the exact candidate to the completed Internal release', () => {
  assert.deepEqual(validate(), {
    status: 'google-play-internal-release-complete',
    track: 'internal-testing',
    versionCode: '2026082601',
    candidateHashConfirmed: true,
    releaseStatus: 'available-to-internal-testers',
    testerListUnchanged: true,
    otherTracksUnchanged: true,
    nextGate: 'ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO',
  });
});

test('rejects candidate, artifact, track or release drift', () => {
  for (const mutate of [
    (value) => { value.evidence.candidate.versionCode = '2026082602'; },
    (value) => { value.evidence.candidate.aabSha256 = 'a'.repeat(64); },
    (value) => { value.evidence.release.track = 'production'; },
    (value) => { value.evidence.release.status = 'draft'; },
    (value) => { value.evidence.release.sentForReview = true; },
  ]) assert.throws(() => validate(mutate), /drifted/u);
});

test('rejects tester, competing-track, review or device overclaims', () => {
  for (const mutate of [
    (value) => { value.evidence.postReleaseReadback.testerListUnchanged = false; },
    (value) => { value.evidence.postReleaseReadback.productionTrackChanged = true; },
    (value) => { value.evidence.postReleaseReadback.otherTracksUnchanged = false; },
    (value) => { value.evidence.boundaries.deviceAccessed = true; },
    (value) => { value.evidence.nextGate.candidateDeviceResults = 'PASSED'; },
  ]) assert.throws(() => validate(mutate), /drifted/u);
});

test('rejects private identity, URL, path and credential-shaped material', () => {
  const credentialKey = ['pass', 'word'].join('');
  for (const unsafe of [
    { note: 'person@example.invalid' },
    { note: 'https://example.invalid/private' },
    { note: '/Users/person/private' },
    { [credentialKey]: 'do-not-store' },
  ]) assert.throws(() => validate((value) => {
    value.evidence.unsafe = unsafe;
  }), /email|URL|filesystem|credential/u);
});
