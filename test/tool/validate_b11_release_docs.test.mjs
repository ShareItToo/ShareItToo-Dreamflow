import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateB11ReleaseDocs } from '../../tool/validate_b11_release_docs.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const deviceManifest = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'store/device-validation.json'), 'utf8'),
);
const evidenceRef = deviceManifest.releaseChecks.candidateIdentityAndSignatures.evidenceRef;
const candidateEvidence = JSON.parse(readFileSync(resolve(repositoryRoot, evidenceRef), 'utf8'));
const pubspecText = readFileSync(resolve(repositoryRoot, 'pubspec.yaml'), 'utf8');
const documentedCandidatePubspecText = pubspecText.replace(
  /^(version:\s*\d+\.\d+\.\d+\+)\d{10}\s*$/m,
  `$1${deviceManifest.candidate.buildNumber}`,
);
const documentPaths = [
  'docs/architecture/B11_CLOSED_STORE_RELEASE_AND_DEVICE_VALIDATION_2026-08-09.md',
  'docs/operations/B11_CLOSED_STORE_AND_DEVICE_TEST_RUNBOOK_2026-08-09.md',
  'docs/evidence/b11/README.md',
];
const documents = Object.fromEntries(
  documentPaths.map((relativePath) => [relativePath, readFileSync(resolve(repositoryRoot, relativePath), 'utf8')]),
);

function validate(overrides = {}) {
  return validateB11ReleaseDocs({
    root: repositoryRoot,
    deviceManifest: structuredClone(deviceManifest),
    candidateEvidence: structuredClone(candidateEvidence),
    pubspecText,
    documents: structuredClone(documents),
    allowCandidateRollover: true,
    ...overrides,
  });
}

function strictBaselineManifest() {
  return structuredClone(deviceManifest);
}

function validateStrict(overrides = {}) {
  return validateB11ReleaseDocs({
    root: repositoryRoot,
    deviceManifest: strictBaselineManifest(),
    candidateEvidence: structuredClone(candidateEvidence),
    pubspecText: documentedCandidatePubspecText,
    documents: structuredClone(documents),
    allowCandidateRollover: false,
    ...overrides,
  });
}

test('repository B11 release documentation matches the current candidate', () => {
  const result = validateStrict();
  const expectedPassedReleaseChecks = Object.values(deviceManifest.releaseChecks)
    .filter((check) => check.status === 'passed').length;
  assert.equal(result.buildNumber, deviceManifest.candidate.buildNumber);
  assert.equal(result.documents, 3);
  assert.equal(result.passedCells, 0);
  assert.equal(result.passedReleaseChecks, expectedPassedReleaseChecks);
});

test('documents the exact verified Play installation without prematurely passing a device cell', () => {
  assert.equal(deviceManifest.deviceMatrix.some((cell) => cell.status === 'passed'), false);
  for (const content of Object.values(documents)) {
    assert.equal(
      content.includes(
        `| Google-Play-Installation | \`passed\`; interner Track, exakte Version \`1.0.0 (${deviceManifest.candidate.buildNumber})\` |`,
      ),
      true,
    );
  }
});

test('documents exact-candidate Android Wi-Fi progress without claiming the full cell passed', () => {
  for (const content of Object.values(documents)) {
    assert.equal(
      content.includes(
        '| Android-WLAN-/Owner-Matrix | `testing`; Teilpruefungen 9/11 bestanden;',
      ),
      true,
    );
  }
});

test('rejects a stale build number in a snapshot', () => {
  const changed = structuredClone(documents);
  const path = documentPaths[0];
  changed[path] = changed[path].replace(
    `1.0.0 (${deviceManifest.candidate.buildNumber})`,
    '1.0.0 (2026080903)',
  );
  assert.throws(() => validateStrict({ documents: changed }), /snapshot is stale or incomplete/);
});

test('rejects a stale or missing app-link diagnostic in a snapshot', () => {
  const changed = structuredClone(documents);
  const path = documentPaths[1];
  const appLinkEvidenceRef = deviceManifest.candidate.android.directAppLinks?.evidenceRef;
  changed[path] = appLinkEvidenceRef
    ? changed[path].replace(
        `\`${appLinkEvidenceRef}\``,
        '`docs/evidence/b11/android-app-link-diagnostic-stale.json`',
      )
    : changed[path].replace(
        '| Direkte Android-App-Link-Diagnose | `pending`',
        '| Direkte Android-App-Link-Diagnose | `passed`',
      );
  assert.throws(() => validateStrict({ documents: changed }), /snapshot is stale or incomplete/);
});

test('rejects a stale or missing authenticated-session diagnostic in a snapshot', () => {
  const changed = structuredClone(documents);
  const path = documentPaths[2];
  const sessionEvidenceRef = deviceManifest.candidate.android.authenticatedSession?.evidenceRef;
  changed[path] = sessionEvidenceRef
    ? changed[path].replace(
        `\`${sessionEvidenceRef}\``,
        '`docs/evidence/b11/android-authenticated-session-stale.json`',
      )
    : changed[path].replace(
        '| Angemeldete Android-Sitzungsdiagnose | `pending`',
        '| Angemeldete Android-Sitzungsdiagnose | `passed`',
      );
  assert.throws(() => validateStrict({ documents: changed }), /snapshot is stale or incomplete/);
});

test('rejects a stale or missing synthetic-role booking diagnostic in a snapshot', () => {
  const changed = structuredClone(documents);
  const path = documentPaths[0];
  const roleEvidenceRef = deviceManifest.candidate.android.syntheticRoleBooking?.evidenceRef;
  changed[path] = roleEvidenceRef
    ? changed[path].replace(
        `\`${roleEvidenceRef}\``,
        '`docs/evidence/b11/android-synthetic-role-booking-stale.json`',
      )
    : changed[path].replace(
        '| Synthetische Android-Rollenbuchung | `pending`',
        '| Synthetische Android-Rollenbuchung | `passed`',
      );
  assert.throws(() => validateStrict({ documents: changed }), /snapshot is stale or incomplete/);
});

test('rejects a stale or missing authenticated deep-link diagnostic in a snapshot', () => {
  const changed = structuredClone(documents);
  const path = documentPaths[1];
  const deepLinkEvidenceRef = deviceManifest.candidate.android.authenticatedDeepLinks?.evidenceRef;
  changed[path] = deepLinkEvidenceRef
    ? changed[path].replace(
        `\`${deepLinkEvidenceRef}\``,
        '`docs/evidence/b11/android-authenticated-deep-links-stale.json`',
      )
    : changed[path].replace(
        '| Authentifizierte Android-Deep-Links | `pending`',
        '| Authentifizierte Android-Deep-Links | `passed`',
      );
  assert.throws(() => validateStrict({ documents: changed }), /snapshot is stale or incomplete/);
});

test('rejects duplicate snapshot markers', () => {
  const changed = structuredClone(documents);
  const path = documentPaths[2];
  changed[path] += '\n<!-- SIT_CURRENT_RELEASE_SNAPSHOT_BEGIN -->\n';
  assert.throws(() => validateStrict({ documents: changed }), /exactly one current-release snapshot block/);
});

test('rejects candidate evidence whose artifact hash differs', () => {
  const changed = structuredClone(candidateEvidence);
  changed.android.apkSha256 = 'a'.repeat(64);
  assert.throws(
    () => validateStrict({ candidateEvidence: changed }),
    /candidate evidence.android.apkSha256 does not match/,
  );
});

test('rejects a Store-upload boundary without an exact internal-release binding', () => {
  const changed = structuredClone(candidateEvidence);
  changed.boundaries.uploadedToStore = true;
  changed.googlePlayInternalRelease = undefined;
  assert.throws(
    () => validateStrict({ candidateEvidence: changed }),
    /must preserve store, secret, and device-identifier boundaries/,
  );
});

test('rejects a device matrix row that points to an older build', () => {
  const changed = structuredClone(documents);
  const path = documentPaths[1];
  changed[path] = changed[path].replace(
    `| Android real | offen | offen | \`${deviceManifest.candidate.buildNumber}\` | WLAN`,
    '| Android real | offen | offen | `2026080903` | WLAN',
  );
  assert.throws(() => validateStrict({ documents: changed }), /four runbook device-matrix rows/);
});

test('rejects pubspec drift from the documented candidate', () => {
  assert.throws(
    () => validateStrict({ pubspecText: 'version: 1.0.0+2026081100\n' }),
    /candidate.buildNumber does not match/,
  );
});

test('rollover mode accepts an incomplete current candidate above the documented baseline', () => {
  const nextBuild = (BigInt(deviceManifest.candidate.buildNumber) + 1n).toString();
  const expectedPassedReleaseChecks = Object.values(deviceManifest.releaseChecks)
    .filter((check) => check.status === 'passed').length;
  const result = validate({ pubspecText: `version: 1.0.0+${nextBuild}\n` });
  assert.equal(result.buildNumber, deviceManifest.candidate.buildNumber);
  assert.equal(result.rolloverBuildNumber, nextBuild);
  assert.equal(result.documentedBuild, deviceManifest.candidate.buildNumber);
  assert.equal(result.passedReleaseChecks, expectedPassedReleaseChecks);
});

test('rollover mode rejects a build older than the documented candidate', () => {
  assert.throws(
    () => validate({
      pubspecText: `version: 1.0.0+2026081103\n`,
    }),
    /must not be older than the documented candidate/,
  );
});
