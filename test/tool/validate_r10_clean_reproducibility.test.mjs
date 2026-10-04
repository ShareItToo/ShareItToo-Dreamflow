import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { androidToolchain } from '../../tool/validate_android_toolchain.mjs';

import {
  validateR10CleanReproducibility,
  validateR10TechnicalDebtDocument,
} from '../../tool/validate_r10_clean_reproducibility.mjs';

const evidence = JSON.parse(readFileSync(
  new URL('../../docs/evidence/48h-remote/r10-clean-reproducibility-20260824.json', import.meta.url),
  'utf8',
));
const technicalDebt = readFileSync(
  new URL('../../docs/operations/48H_R10_TECHNICAL_DEBT_2026-08-24.md', import.meta.url),
  'utf8',
);
const currentVersionMatch = /^version:\s*([^+\s]+)\+(\d+)\s*$/mu.exec(readFileSync(
  new URL('../../pubspec.yaml', import.meta.url),
  'utf8',
));
assert.notEqual(currentVersionMatch, null);
const currentVersion = {
  versionName: currentVersionMatch[1],
  versionCode: currentVersionMatch[2],
};

function validate(changed = evidence, options) {
  return validateR10CleanReproducibility(changed, options);
}

test('accepts the exact retained R10 clean-checkout evidence', () => {
  assert.deepEqual(validate(), {
    status: 'verified-clean-checkout-regression-and-codeql-passed',
    implementationHead: '322e97ecc0c20c7f765054523dbcf1ddf45d0e9a',
    migrations: 112,
    assets: 84,
    apkClassification: 'd8-synthetic-checksum-metadata-only',
    nextPackage: 'R11',
  });
});

test('accepts a structurally exact detached CI execution result', () => {
  const ci = structuredClone(evidence);
  ci.status = 'verified-local-clean-checkout-ci-pending';
  ci.ciAndCodeql.exactGithubVerification = 'pending';
  delete ci.githubVerification;
  ci.source.implementationHead = 'a'.repeat(40);
  ci.source.checkoutHead = 'a'.repeat(40);
  ci.toolchain.node = 'v22.99.1';
  ci.toolchain.gradle = androidToolchain.gradle;
  ci.commands.fullTechnicalRegression.durationSeconds = 700;
  ci.observedOn = '2026-08-25';
  ci.android.identity.versionName = currentVersion.versionName;
  ci.android.identity.versionCode = currentVersion.versionCode;
  ci.android.identity.compileSdk = 36;
  ci.android.identity.targetSdk = 36;
  assert.equal(validate(ci, { executionOnly: true }).implementationHead, 'a'.repeat(40));

  ci.toolchain.gradle = '8.12';
  assert.throws(() => validate(ci, { executionOnly: true }), /toolchain identity/u);
  ci.toolchain.gradle = androidToolchain.gradle;

  ci.observedOn = '2026-02-31';
  assert.throws(
    () => validate(ci, { executionOnly: true }),
    /evidence identity or status/u,
  );

  ci.observedOn = '2026-08-25';
  ci.android.identity.versionCode = '1';
  assert.throws(
    () => validate(ci, { executionOnly: true }),
    /build identity/u,
  );
});

test('retains the separate post-PF18 technical-debt exit contract', () => {
  assert.doesNotThrow(() => validateR10TechnicalDebtDocument(technicalDebt));
  assert.throws(
    () => validateR10TechnicalDebtDocument(technicalDebt.replace(
      'EXACT CI VERIFIED',
      'CLOSED WITHOUT CI',
    )),
    /technical-debt exit contract/u,
  );
  assert.throws(
    () => validateR10TechnicalDebtDocument(technicalDebt.replace(
      'No stale local properties',
      'Stale local properties',
    )),
    /technical-debt exit contract/u,
  );
});

test('rejects source inventory or clean-checkout drift', () => {
  const inventory = structuredClone(evidence);
  inventory.sourceComparison.assets.after.sha256 = '0'.repeat(64);
  assert.throws(() => validate(inventory), /assets inventory/u);

  const dirty = structuredClone(evidence);
  dirty.source.isolatedCheckoutFinallyClean = false;
  assert.throws(() => validate(dirty), /clean-checkout proof/u);
});

test('rejects missing commands and unbounded generated state', () => {
  const commands = structuredClone(evidence);
  delete commands.commands.secretScan;
  assert.throws(() => validate(commands), /command inventory/u);

  const footprint = structuredClone(evidence);
  footprint.generatedFootprint.after.pathsKiB.build = 6 * 1024 * 1024;
  footprint.generatedFootprint.after.projectGeneratedKiB = Object.values(
    footprint.generatedFootprint.after.pathsKiB,
  ).reduce((sum, amount) => sum + amount, 0);
  footprint.generatedFootprint.after.totalKiB =
    footprint.generatedFootprint.after.projectGeneratedKiB
      + footprint.generatedFootprint.after.isolatedPackageCachesKiB;
  assert.throws(() => validate(footprint), /project_generated_footprint/u);
});

test('rejects Android identity, permissions or runtime-provider drift', () => {
  const identity = structuredClone(evidence);
  identity.android.identity.versionCode = '1';
  assert.throws(() => validate(identity), /build identity/u);

  const permission = structuredClone(evidence);
  permission.android.permissions.push({ name: 'android.permission.READ_SMS', maxSdkVersion: null });
  assert.throws(() => validate(permission), /permission surface/u);

  const provider = structuredClone(evidence);
  provider.android.runtimeConfiguration.compiledOpenAiApiOriginPresent = true;
  assert.throws(() => validate(provider), /network or provider/u);
});

test('rejects unexplained APK drift or a false binary-identity claim', () => {
  const drift = structuredClone(evidence);
  drift.android.reproduction.classification = 'unexplained-payload-drift';
  drift.android.reproduction.knownEquivalent = false;
  drift.android.reproduction.unexplainedDifferingEntries = ['classes18.dex'];
  assert.throws(() => validate(drift), /reproduction classification/u);

  const overclaim = structuredClone(evidence);
  overclaim.limitations.binaryIdentityClaimedOnlyWhenRawShaMatches = true;
  assert.throws(() => validate(overclaim), /limitations or binary identity/u);
});

test('rejects live action, credential handling or changed GitHub claims', () => {
  const live = structuredClone(evidence);
  live.boundaries.storeChanged = true;
  assert.throws(() => validate(live), /live or credential boundary/u);

  const github = structuredClone(evidence);
  github.githubVerification.advancedSecurity.annotations = 1;
  assert.throws(() => validate(github), /exact GitHub verification/u);

  const dismissed = structuredClone(evidence);
  dismissed.githubVerification.advancedSecurity.findingsDismissed = true;
  assert.throws(() => validate(dismissed), /exact GitHub verification/u);

  const inspected = structuredClone(evidence);
  inspected.githubVerification.gitGuardian.credentialDetailInspected = true;
  assert.throws(() => validate(inspected), /exact GitHub verification/u);
});
