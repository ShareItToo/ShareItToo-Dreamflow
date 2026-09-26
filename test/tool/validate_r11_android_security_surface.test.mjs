import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateR11AndroidSecuritySurface } from '../../tool/validate_r11_android_security_surface.mjs';

const evidence = JSON.parse(readFileSync(
  new URL('../../docs/evidence/48h-remote/r11-android-security-permission-surface-20260824.json', import.meta.url),
  'utf8',
));

function validate(changed = evidence) {
  return validateR11AndroidSecuritySurface(changed);
}

test('accepts the exact retained R11 merged-artifact evidence', () => {
  assert.deepEqual(validate(), {
    status: 'verified-merged-debug-artifact-regression-and-codeql-passed',
    implementationHead: '9ec9c62c7ca806e16ab5beb354e4872b3f513e13',
    permissionCount: 14,
    exportedComponentCount: 8,
    nextPackage: 'R12',
  });
});

test('rejects permission or exported-component drift', () => {
  const permission = structuredClone(evidence);
  permission.permissions.push({ name: 'android.permission.READ_SMS', maxSdkVersion: null });
  assert.throws(() => validate(permission), /r11_permission_surface_invalid/u);

  const component = structuredClone(evidence);
  component.components.exported[0].permission = 'android.permission.BIND_DEVICE_ADMIN';
  assert.throws(() => validate(component), /r11_exported_components_invalid/u);
});

test('rejects intent, FileProvider or package-visibility expansion', () => {
  const intent = structuredClone(evidence);
  intent.intentSurface.inventorySha256 = '0'.repeat(64);
  assert.throws(() => validate(intent), /r11_intent_surface_invalid/u);

  const provider = structuredClone(evidence);
  provider.fileProviders[0].exported = true;
  assert.throws(() => validate(provider), /r11_file_provider_surface_invalid/u);

  const visibility = structuredClone(evidence);
  visibility.packageVisibility.packages.push('com.example.any');
  assert.throws(() => validate(visibility), /r11_package_visibility_invalid/u);
});

test('rejects policy, Firebase or Stage-A enablement drift', () => {
  const policy = structuredClone(evidence);
  policy.policies.cleartextTrafficDisabled = false;
  assert.throws(() => validate(policy), /r11_android_policy_invalid/u);

  const firebase = structuredClone(evidence);
  firebase.firebase.analyticsCollectionDisabled = false;
  assert.throws(() => validate(firebase), /r11_firebase_surface_invalid/u);

  const stageA = structuredClone(evidence);
  stageA.stageA.realPaymentEnabled = true;
  assert.throws(() => validate(stageA), /r11_stage_a_surface_invalid/u);
});

test('rejects live-boundary or changed GitHub claims', () => {
  const live = structuredClone(evidence);
  live.boundaries.storeChanged = true;
  assert.throws(() => validate(live), /r11_boundary_invalid/u);

  const github = structuredClone(evidence);
  github.githubVerification.regression.runId = 1;
  assert.throws(() => validate(github), /r11_github_verification_invalid/u);
});
