import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { assertGreenPostEnrollmentProfile, assertGreenAuthProfileReadback, summarizeGreenAllowedIds, greenAllowedIdsProbeExpression } from '../ops/green_auth_profile.mjs';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const ids = 'synthetic-owner,synthetic-renter,synthetic-google';
const source = `sha256:${'a'.repeat(64)}`;
const profile = { kind: 'google-post-enrollment', schemaVersion: 1, sourceImageDigest: source, ...summarizeGreenAllowedIds(ids), googleUserIdDigest: sha('synthetic-google') };
const env = { FIREBASE_AUTH_ENABLED: 'true', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '', SIT_STAGING_ALLOWED_USER_IDS: ids };

test('explicit exact profile is image-bound and does not weaken default provider-off', () => {
  assert.deepEqual(assertGreenPostEnrollmentProfile(profile, source), profile);
  assert.equal(assertGreenAuthProfileReadback(env, profile), true);
  assert.throws(() => assertGreenAuthProfileReadback(env), /provider_off_invalid/u);
  assert.equal(assertGreenAuthProfileReadback({ FIREBASE_AUTH_ENABLED: 'false' }), true);
  for (const invalid of [null, { ...profile, extra: true }, { ...profile, schemaVersion: 2 }, { ...profile, allowedUserIdsCount: 1 }, { ...profile, googleUserIdDigest: 'raw-id' }]) {
    assert.throws(() => assertGreenPostEnrollmentProfile(invalid, source), /profile_invalid/u);
  }
  assert.throws(() => assertGreenPostEnrollmentProfile(profile, `sha256:${'b'.repeat(64)}`), /profile_invalid/u);
});

test('missing extra reordered duplicate and whitespace IDs fail closed', () => {
  for (const value of ['synthetic-owner,synthetic-renter', `${ids},extra`, ids.split(',').reverse().join(','), `${ids},synthetic-google`, `${ids}, spaced`, '']) {
    assert.throws(() => assertGreenAuthProfileReadback({ ...env, SIT_STAGING_ALLOWED_USER_IDS: value }, profile), /allowed_ids_(?:drift|invalid)/u);
  }
  assert.throws(() => assertGreenAuthProfileReadback(env, { ...profile, googleUserIdDigest: sha('foreign') }), /google_id_missing/u);
});

for (const [name, value] of Object.entries({ FIREBASE_AUTH_ENABLED: 'false', FIREBASE_PHONE_VERIFICATION_ENABLED: 'true', SIT_STAGING_ACCESS_GATE_ENABLED: 'false', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'true', SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: 'digest=user' })) {
  test(`post-enrollment rejects ${name} drift`, () => {
    assert.throws(() => assertGreenAuthProfileReadback({ ...env, [name]: value }, profile), /auth_drift/u);
  });
}

test('actual candidate probe outputs digest/count only and enforces profile', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import crypto from 'node:crypto'; console.log(JSON.stringify({${greenAllowedIdsProbeExpression}}));`], { encoding: 'utf8', env: { ...process.env, SIT_STAGING_ALLOWED_USER_IDS: ids } });
  assert.equal(output.includes('synthetic'), false);
  const summary = JSON.parse(output);
  assert.deepEqual(summary, summarizeGreenAllowedIds(ids));
  const { SIT_STAGING_ALLOWED_USER_IDS: omitted, ...flags } = env;
  assert.equal(assertGreenAuthProfileReadback({ ...flags, ...summary, googleRegistrationAllowlistEmpty: true }, profile), true);
  assert.throws(() => assertGreenAuthProfileReadback({ ...flags, ...summary, allowedUserIdsCount: 2 }, profile), /allowed_ids_drift/u);
  assert.throws(() => assertGreenAuthProfileReadback({ ...flags, ...summary, googleRegistrationAllowlistEmpty: false }, profile), /auth_drift/u);
});
