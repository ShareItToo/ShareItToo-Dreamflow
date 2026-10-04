import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const validator = resolve(repositoryRoot, 'tool/validate_store_metadata.dart');
const baseManifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'store/submission.json'), 'utf8'));
const baseAccountReadiness = JSON.parse(readFileSync(
  resolve(repositoryRoot, 'store/platform-account-readiness.json'),
  'utf8',
));
const baseClosedTestingReadiness = JSON.parse(readFileSync(
  resolve(repositoryRoot, 'store/google-play/closed-testing-readiness.json'),
  'utf8',
));

function runWithManifests({
  mutateManifest = () => {},
  mutateAccountReadiness = () => {},
  mutateClosedTestingReadiness = () => {},
  sourceVersion = null,
  extraArgs = ['--allow-candidate-rollover'],
}) {
  const directory = mkdtempSync(join(tmpdir(), 'sit-store-metadata-'));
  try {
    const manifest = structuredClone(baseManifest);
    const accountReadiness = structuredClone(baseAccountReadiness);
    const closedTestingReadiness = structuredClone(baseClosedTestingReadiness);
    mutateManifest(manifest);
    mutateAccountReadiness(accountReadiness);
    mutateClosedTestingReadiness(closedTestingReadiness);
    const manifestPath = join(directory, 'submission.json');
    const accountReadinessPath = join(directory, 'platform-account-readiness.json');
    const closedTestingReadinessPath = join(directory, 'closed-testing-readiness.json');
    const pubspecPath = join(directory, 'pubspec.yaml');
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(accountReadinessPath, `${JSON.stringify(accountReadiness, null, 2)}\n`);
    writeFileSync(closedTestingReadinessPath, `${JSON.stringify(closedTestingReadiness, null, 2)}\n`);
    if (sourceVersion !== null) writeFileSync(pubspecPath, `name: shareittoo\nversion: ${sourceVersion}\n`);
    return spawnSync('dart', [
      'run',
      validator,
      ...extraArgs,
      '--manifest',
      manifestPath,
      '--account-readiness',
      accountReadinessPath,
      '--closed-testing-readiness',
      closedTestingReadinessPath,
      ...(sourceVersion === null ? [] : ['--pubspec', pubspecPath]),
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('accepts the current honest fail-closed Store metadata draft', () => {
  const result = runWithManifests({});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Store metadata valid/);
});

test('strict Store validation rejects a newer unfinished source build', () => {
  const result = runWithManifests({
    extraArgs: [],
    sourceVersion: '1.0.0+2026081304',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /internal upload handoff must remain bound/);
});

test('candidate rollover remains forbidden when a Store submission is requested', () => {
  const result = runWithManifests({
    extraArgs: ['--allow-candidate-rollover', '--require-submittable'],
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /restricted to a fail-closed Store draft/);
});

test('rejects a missing mandatory Store release gate', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      delete manifest.blockingGates.googlePlayAccountAndFee;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must contain exactly the required Store release gates/);
});

test('rejects a missing Google Play closed-test launch gate', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      delete manifest.blockingGates.googlePlayClosedTestingRequirement;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must contain exactly the required Store release gates/);
});

test('rejects closing the Play production-access gate without approved readiness', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      manifest.blockingGates.googlePlayClosedTestingRequirement = 'closed';
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must match evidenced Play production access/);
});

test('rejects a missing Google Play closed-test readiness binding', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      delete manifest.metadataFiles.googlePlay.closedTestingReadiness;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /closedTestingReadiness must be a non-empty string/);
});

test('rejects a missing Google Play production-access application binding', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      delete manifest.metadataFiles.googlePlay.productionAccessApplication;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /productionAccessApplication must be a non-empty string/);
});

test('rejects a missing Google Play closed-test feedback-plan binding', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      delete manifest.metadataFiles.googlePlay.closedTestingFeedbackPlan;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /closedTestingFeedbackPlan must be a non-empty string/);
});

test('rejects a missing Google Play Console worksheet binding', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      delete manifest.metadataFiles.googlePlay.consoleEntryWorksheet;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /consoleEntryWorksheet must be a non-empty string/);
});

test('rejects a missing Google Play internal upload handoff binding', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      delete manifest.metadataFiles.googlePlay.internalUploadHandoff;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /internalUploadHandoff must be a non-empty string/);
});

test('rejects a missing Google Play app-content handoff binding', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      delete manifest.metadataFiles.googlePlay.appContentHandoff;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /appContentHandoff must be a non-empty string/);
});

test('rejects an unvalidated Google Play phone screenshot path', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      manifest.assets.googlePlay.phoneScreenshots[0] = 'store/assets/google-play/icon-512.png';
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exactly four validated local candidates/);
});

test('rejects a missing Apple TestFlight handoff binding', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      delete manifest.metadataFiles.apple.testFlightHandoff;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /testFlightHandoff must be a non-empty string/);
});

test('rejects an unrecognized Store release gate', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      manifest.blockingGates.unreviewedShortcut = 'closed';
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must contain exactly the required Store release gates/);
});

test('rejects closing the Play account gate before account setup and fee evidence', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      manifest.blockingGates.googlePlayAccountAndFee = 'closed';
    },
    mutateAccountReadiness: (readiness) => {
      readiness.googlePlay.status = 'account-verifications-complete-app-record-pending';
      readiness.googlePlay.appRecordCreated = false;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must match verified Play account readiness/);
});

test('rejects closing the Play account gate without device verification', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      manifest.blockingGates.googlePlayAccountAndFee = 'closed';
    },
    mutateAccountReadiness: (readiness) => {
      readiness.googlePlay.status = 'ready';
      readiness.googlePlay.appRecordCreated = true;
      readiness.googlePlay.deviceVerification = 'pending';
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must match verified Play account readiness/);
});

test('rejects closing the Play account gate without phone verification', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      manifest.blockingGates.googlePlayAccountAndFee = 'closed';
    },
    mutateAccountReadiness: (readiness) => {
      readiness.googlePlay.status = 'ready';
      readiness.googlePlay.appRecordCreated = true;
      readiness.googlePlay.phoneVerification = 'pending';
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must match verified Play account readiness/);
});

test('rejects closing the Apple account gate before membership and signing evidence', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      manifest.blockingGates.appleAccountXcodeAndSigning = 'closed';
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must match verified Apple account readiness/);
});

test('rejects closing the Firebase owner-terms gate without owner confirmation', () => {
  const result = runWithManifests({
    mutateManifest: (manifest) => {
      manifest.blockingGates.firebaseTermsAcceptedByOwner = 'closed';
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must match the owner confirmation/);
});

test('rejects account readiness containing an email address', () => {
  const result = runWithManifests({
    mutateAccountReadiness: (readiness) => {
      readiness.googlePlay.evidenceRef = 'private@example.test';
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must remain sanitized/);
});

test('rejects hiding the paid Play registration in the account boundary', () => {
  const result = runWithManifests({
    mutateAccountReadiness: (readiness) => {
      readiness.boundaries.purchaseMade = false;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /purchase history must match/);
});

test('rejects hiding the accepted Play agreements in the account boundary', () => {
  const result = runWithManifests({
    mutateAccountReadiness: (readiness) => {
      readiness.boundaries.agreementAccepted = false;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /agreement history must match/);
});

test('rejects a purchase claim without a paid Store account state', () => {
  const result = runWithManifests({
    mutateAccountReadiness: (readiness) => {
      readiness.googlePlay.registrationFeePaid = false;
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /purchase history must match/);
});

test('rejects a Play verification regression while the account gate is closed', () => {
  const result = runWithManifests({
    mutateAccountReadiness: (readiness) => {
      readiness.googlePlay.deviceVerification = 'pending';
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must match verified Play account readiness/);
});
