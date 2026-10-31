import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateGoogleCloudAndroidKeyRestriction } from
  '../../tool/validate_google_cloud_android_key_restriction.mjs';

const repositoryRoot = new URL('../../', import.meta.url).pathname;
const canonical = JSON.parse(await readFile(new URL(
  '../../docs/evidence/b11/google-cloud-android-api-key-restriction-20260813.json',
  import.meta.url,
), 'utf8'));

async function fixture(mutate) {
  const root = await mkdtemp(join(tmpdir(), 'sit-cloud-android-key-'));
  const evidence = structuredClone(canonical);
  mutate(evidence);
  const evidencePath = join(root, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { root, evidencePath };
}

test('accepts the saved Android restriction after exact-candidate runtime verification', () => {
  assert.deepEqual(validateGoogleCloudAndroidKeyRestriction({ repositoryRoot }), {
    status: 'saved-runtime-regression-passed',
    project: 'shareittoo-staging',
    packageName: 'com.shareittoo.app',
    runtimeRegression: 'passed-exact-installed-candidate-auth-session-and-full-fcm',
  });
});

test('rejects claiming the runtime passed without full Firebase Messaging proof', async (t) => {
  const data = await fixture((evidence) => {
    evidence.verification.firebaseMessaging.status = 'pending';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(
    () => validateGoogleCloudAndroidKeyRestriction({ repositoryRoot, ...data }),
    /runtime verification is incomplete/,
  );
});

test('rejects pretending the separate server credential is restricted', async (t) => {
  const data = await fixture((evidence) => {
    evidence.remainingSeparateGates.googleMapsServerCredentialRestriction = 'closed';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(
    () => validateGoogleCloudAndroidKeyRestriction({ repositoryRoot, ...data }),
    /conflates separate credential gates/,
  );
});

test('rejects storing the certificate fingerprint in repository evidence', async (t) => {
  const data = await fixture((evidence) => {
    evidence.savedRestriction.certificateSha1StoredInEvidence = true;
    evidence.savedRestriction.certificateSha1 = 'AA:'.repeat(19) + 'AA';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(
    () => validateGoogleCloudAndroidKeyRestriction({ repositoryRoot, ...data }),
    /incomplete|unsafe or secret material/,
  );
});
