#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const snapshotBegin = '<!-- SIT_CURRENT_RELEASE_SNAPSHOT_BEGIN -->';
const snapshotEnd = '<!-- SIT_CURRENT_RELEASE_SNAPSHOT_END -->';

const snapshotDocuments = [
  'docs/architecture/B11_CLOSED_STORE_RELEASE_AND_DEVICE_VALIDATION_2026-08-09.md',
  'docs/operations/B11_CLOSED_STORE_AND_DEVICE_TEST_RUNBOOK_2026-08-09.md',
  'docs/evidence/b11/README.md',
];

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function sha256(value, label) {
  const result = nonEmptyString(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(result)) fail(`${label} must be a SHA-256 value.`);
  return result;
}

function fullCommit(value, label) {
  const result = nonEmptyString(value, label).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(result)) fail(`${label} must be a full Git commit.`);
  return result;
}

function readJson(root, relativePath) {
  try {
    return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
  } catch (error) {
    fail(`${relativePath} could not be read as JSON: ${error.message}`);
  }
}

function parsePubspecVersion(pubspecText) {
  const match = /^version:\s*(\d+\.\d+\.\d+)\+(\d{10})\s*$/m.exec(pubspecText);
  if (!match) fail('pubspec.yaml must use semantic+YYYYMMDDNN versioning.');
  return { versionName: match[1], buildNumber: match[2] };
}

function countMatches(text, needle) {
  return text.split(needle).length - 1;
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} does not match the current candidate.`);
}

function renderAndroidDiagnostic(value, label) {
  if (value === undefined || value === null) {
    return '`pending`; noch kein kandidatenspezifischer Nachweis';
  }
  const diagnostic = object(value, label);
  const status = nonEmptyString(diagnostic.status, `${label}.status`);
  if (status !== 'passed') {
    return `\`${status}\`; noch kein bestandener kandidatenspezifischer Nachweis`;
  }
  return `\`passed\` auf ${nonEmptyString(diagnostic.deviceModel, `${label}.deviceModel`)}, Android ${nonEmptyString(diagnostic.osVersion, `${label}.osVersion`)}; \`${nonEmptyString(diagnostic.evidenceRef, `${label}.evidenceRef`)}\``;
}

function validateRolloverBaseline({ manifest, pubspec, documents, root }) {
  const documentedBuilds = new Set();
  for (const relativePath of snapshotDocuments) {
    const content = documents?.[relativePath] ?? readFileSync(resolve(root, relativePath), 'utf8');
    if (countMatches(content, snapshotBegin) !== 1 || countMatches(content, snapshotEnd) !== 1) {
      fail(`${relativePath} must contain exactly one current-release snapshot block.`);
    }
    const snapshot = content.slice(
      content.indexOf(snapshotBegin),
      content.indexOf(snapshotEnd) + snapshotEnd.length,
    );
    const match = /\| Version und Build \| `[^`]+ \((\d{10})\)` \|/.exec(snapshot);
    if (!match) fail(`${relativePath} must identify its documented B11 build.`);
    documentedBuilds.add(match[1]);
  }
  if (documentedBuilds.size !== 1) {
    fail('All B11 snapshot documents must identify the same rollover baseline build.');
  }
  const [documentedBuild] = documentedBuilds;
  const minimumBuild = nonEmptyString(manifest.candidate.minimumBuildNumber, 'candidate.minimumBuildNumber');
  if (BigInt(documentedBuild) < BigInt(minimumBuild) ||
      BigInt(documentedBuild) > BigInt(manifest.candidate.buildNumber) ||
      BigInt(documentedBuild) >= BigInt(pubspec.buildNumber)) {
    fail('The documented rollover baseline must remain between the minimum and current incomplete candidates.');
  }

  const runbookPath = 'docs/operations/B11_CLOSED_STORE_AND_DEVICE_TEST_RUNBOOK_2026-08-09.md';
  const runbook = documents?.[runbookPath] ?? readFileSync(resolve(root, runbookPath), 'utf8');
  const matrixRows = runbook
    .split('\n')
    .filter((line) => /^\| (Android|iOS) real \|/.test(line));
  if (matrixRows.length !== 4 || matrixRows.some((line) => !line.includes(`\`${documentedBuild}\``))) {
    fail('The four runbook device-matrix rows must use the documented rollover baseline build.');
  }
  return documentedBuild;
}

export function renderB11ReleaseSnapshot({ deviceManifest, candidateEvidence }) {
  const manifest = object(deviceManifest, 'store/device-validation.json');
  const candidate = object(manifest.candidate, 'candidate');
  const android = object(candidate.android, 'candidate.android');
  const evidence = object(candidateEvidence, 'candidate evidence');
  const staging = object(evidence.staging, 'candidate evidence.staging');
  const exactDiagnostics = object(evidence.exactCandidateDiagnostics, 'candidate evidence.exactCandidateDiagnostics');
  const controlledFcm = evidence.controlledFcm ?? evidence.logoutAndPushLifecycle;
  const logoutLifecycle = evidence.logoutLifecycle ?? evidence.logoutAndPushLifecycle;
  const crashReleaseMapping = object(
    manifest.releaseChecks?.crashReleaseMapping,
    'releaseChecks.crashReleaseMapping',
  );
  const storeLinksAndSigning = object(
    manifest.releaseChecks?.storeWarningsLinksAndSigning,
    'releaseChecks.storeWarningsLinksAndSigning',
  );
  const playInstalledCell = Array.isArray(manifest.deviceMatrix)
    ? manifest.deviceMatrix.find((cell) => (
        cell?.platform === 'android'
        && cell?.storeInstall === 'play-internal'
        && cell?.tests?.installAndFirstStart === 'passed'
      ))
    : null;
  const playStoreInstallVerified = evidence.googlePlayInternalRelease?.status === 'store-install-verified'
    && /^passed-version-\d{10}-installer-com\.android\.vending$/.test(
      exactDiagnostics.googlePlayStoreInstall ?? '',
    )
    && evidence.boundaries?.uploadedToStore === true
    && evidence.boundaries?.installedOnPhysicalDevice === true;
  const fcmPassed = exactDiagnostics.foregroundFcm === 'passed'
    && exactDiagnostics.backgroundFcm === 'passed'
    && exactDiagnostics.terminatedProcessFcm === 'passed'
    && controlledFcm?.status === 'passed';
  const fcmSummary = fcmPassed
    ? `\`passed\` in Vordergrund, Hintergrund und bei beendetem Prozess; \`${nonEmptyString(controlledFcm.evidenceRef, 'candidate evidence controlled FCM evidenceRef')}\``
    : `\`${nonEmptyString(exactDiagnostics.foregroundFcm, 'exactCandidateDiagnostics.foregroundFcm')}/${nonEmptyString(exactDiagnostics.backgroundFcm, 'exactCandidateDiagnostics.backgroundFcm')}/${nonEmptyString(exactDiagnostics.terminatedProcessFcm, 'exactCandidateDiagnostics.terminatedProcessFcm')}\`; noch kein vollständiger kandidatenspezifischer Nachweis`;
  const logoutSummary = logoutLifecycle?.status === 'passed'
    ? `\`passed\`; \`${nonEmptyString(logoutLifecycle.evidenceRef, 'candidate evidence logout lifecycle evidenceRef')}\``
    : `\`${nonEmptyString(exactDiagnostics.logoutColdStartGuestPersistence, 'exactCandidateDiagnostics.logoutColdStartGuestPersistence')}/${nonEmptyString(exactDiagnostics.postLogoutPushSuppression, 'exactCandidateDiagnostics.postLogoutPushSuppression')}\`; noch kein vollständiger kandidatenspezifischer Nachweis`;
  const crashEvidence = crashReleaseMapping.evidenceRef
    ? `; \`${nonEmptyString(crashReleaseMapping.evidenceRef, 'releaseChecks.crashReleaseMapping.evidenceRef')}\``
    : '; noch kein kandidatenspezifischer Nachweis';

  const passedCells = Array.isArray(manifest.deviceMatrix)
    ? manifest.deviceMatrix.filter((cell) => cell?.status === 'passed').length
    : 0;
  const totalCells = Array.isArray(manifest.deviceMatrix) ? manifest.deviceMatrix.length : 0;
  const androidWifiOwnerCell = Array.isArray(manifest.deviceMatrix)
    ? manifest.deviceMatrix.find((cell) => cell?.id === 'android-wifi-owner')
    : null;
  const androidWifiOwnerTests = androidWifiOwnerCell?.tests
    ? Object.entries(androidWifiOwnerCell.tests)
    : [];
  const androidWifiOwnerPassedTests = androidWifiOwnerTests
    .filter(([, status]) => status === 'passed').length;
  const androidWifiOwnerOpenTests = androidWifiOwnerTests
    .filter(([, status]) => status !== 'passed')
    .map(([id, status]) => `${id}=${status}`)
    .join(', ');
  const androidWifiOwnerSummary = androidWifiOwnerCell
    ? `\`${nonEmptyString(androidWifiOwnerCell.status, 'android-wifi-owner.status')}\`; Teilpruefungen ${androidWifiOwnerPassedTests}/${androidWifiOwnerTests.length} bestanden; ${androidWifiOwnerOpenTests}; ${androidWifiOwnerCell.evidenceRef ? `\`${nonEmptyString(androidWifiOwnerCell.evidenceRef, 'android-wifi-owner.evidenceRef')}\`` : 'noch kein kandidatenspezifischer Fortschrittsnachweis'}`
    : '`open`; noch kein kandidatenspezifischer Fortschrittsnachweis';
  const releaseChecks = Object.values(object(manifest.releaseChecks, 'releaseChecks'));
  const passedReleaseChecks = releaseChecks.filter((check) => check?.status === 'passed').length;

  return `${snapshotBegin}
### Aktueller maschinengebundener B11-Kandidat

| Merkmal | Verbindlicher Wert |
|---|---|
| App-Identität | \`${nonEmptyString(candidate.applicationId, 'candidate.applicationId')}\` (Android und iOS) |
| Version und Build | \`${nonEmptyString(candidate.versionName, 'candidate.versionName')} (${nonEmptyString(candidate.buildNumber, 'candidate.buildNumber')})\` |
| App-Commit | \`${fullCommit(candidate.commit, 'candidate.commit')}\` |
| Kanal und API | \`${nonEmptyString(candidate.releaseChannel, 'candidate.releaseChannel')}\`, \`${nonEmptyString(candidate.apiBaseUrl, 'candidate.apiBaseUrl')}\` |
| Firebase und Zahlung | vollständig: \`${candidate.firebaseConfigured === true}\`; \`${nonEmptyString(candidate.paymentMode, 'candidate.paymentMode')}\`; \`stripeLivemode=${candidate.stripeLivemode === true}\` |
| Android-AAB SHA-256 | \`${sha256(android.aabSha256, 'candidate.android.aabSha256')}\` |
| Android-APK SHA-256 | \`${sha256(android.apkSha256, 'candidate.android.apkSha256')}\` |
| Uploadzertifikat SHA-256 | \`${sha256(android.signingCertificateSha256, 'candidate.android.signingCertificateSha256')}\` |
| Direkte Android-Diagnose | ${renderAndroidDiagnostic(android.directDiagnostic, 'candidate.android.directDiagnostic')} |
| Direkte Android-App-Link-Diagnose | ${renderAndroidDiagnostic(android.directAppLinks, 'candidate.android.directAppLinks')} |
| Angemeldete Android-Sitzungsdiagnose | ${renderAndroidDiagnostic(android.authenticatedSession, 'candidate.android.authenticatedSession')} |
| Synthetische Android-Rollenbuchung | ${renderAndroidDiagnostic(android.syntheticRoleBooking, 'candidate.android.syntheticRoleBooking')} |
| Authentifizierte Android-Deep-Links | ${renderAndroidDiagnostic(android.authenticatedDeepLinks, 'candidate.android.authenticatedDeepLinks')} |
| Kontrollierte Android-FCM-Diagnose | ${fcmSummary} |
| Android-Abmeldung und Push-Unterdrückung | ${logoutSummary} |
| Android-Offline-/Realtime-Wiederherstellung | ${renderAndroidDiagnostic(android.offlineRealtime, 'candidate.android.offlineRealtime')} |
| Google-Play-Installation | ${playInstalledCell || playStoreInstallVerified ? `\`passed\`; interner Track, exakte Version \`${nonEmptyString(candidate.versionName, 'candidate.versionName')} (${nonEmptyString(candidate.buildNumber, 'candidate.buildNumber')})\`` : '`testing`; noch keine belegte Installation aus dem internen Play-Track'} |
| Android-WLAN-/Owner-Matrix | ${androidWifiOwnerSummary} |
| Play-Signing und öffentliche App-Links | \`${nonEmptyString(storeLinksAndSigning.status, 'releaseChecks.storeWarningsLinksAndSigning.status')}\`${storeLinksAndSigning.evidenceRef ? `; \`${nonEmptyString(storeLinksAndSigning.evidenceRef, 'releaseChecks.storeWarningsLinksAndSigning.evidenceRef')}\`` : '; noch kein kandidatenspezifischer Nachweis'} |
| Crashlytics-Releasezuordnung | \`${nonEmptyString(crashReleaseMapping.status, 'releaseChecks.crashReleaseMapping.status')}\`${crashEvidence} |
| Kandidatenbeleg | \`${nonEmptyString(manifest.releaseChecks.candidateIdentityAndSignatures.evidenceRef, 'releaseChecks.candidateIdentityAndSignatures.evidenceRef')}\` |
| Staging-Servercommit | \`${fullCommit(staging.serverCommit, 'candidate evidence.staging.serverCommit')}\` |
| Ehrlicher Freigabestand | \`${nonEmptyString(manifest.state, 'state')}/${nonEmptyString(manifest.goNoGo, 'goNoGo')}\`; Gerätezellen ${passedCells}/${totalCells}; Releaseprüfungen ${passedReleaseChecks}/${releaseChecks.length} |

Dieser Block wird aus den verbindlichen JSON-Nachweisen geprüft. Eine bestandene Google-Play-Installation ist nur belegt, wenn der aktuelle Kandidat aus dem internen Track installiert und gestartet wurde. Die früheren direkten APK-, App-Link-, Sitzungs-, Rollenbuchungs-, Deep-Link-, FCM-, Abmelde- und Offline-/Realtime-Diagnosen bleiben davon abgegrenzte Vorprüfungen. Die kontrollierten synthetischen WLAN-Nachweise schließen weder Hotspot und die vollständige Rollen-/Netzmatrix noch TalkBack, iOS/TestFlight, Produktion oder Echtgeld.
${snapshotEnd}`;
}

export function updateB11ReleaseSnapshots({ root, deviceManifest, candidateEvidence }) {
  const snapshot = renderB11ReleaseSnapshot({ deviceManifest, candidateEvidence });
  for (const relativePath of snapshotDocuments) {
    const path = resolve(root, relativePath);
    const content = readFileSync(path, 'utf8');
    if (countMatches(content, snapshotBegin) !== 1 || countMatches(content, snapshotEnd) !== 1) {
      fail(`${relativePath} must contain exactly one current-release snapshot block.`);
    }
    const updated = content.slice(0, content.indexOf(snapshotBegin))
      + snapshot
      + content.slice(content.indexOf(snapshotEnd) + snapshotEnd.length);
    writeFileSync(path, updated);
  }
}

export function validateB11ReleaseDocs({
  root,
  deviceManifest,
  candidateEvidence,
  pubspecText,
  documents,
  allowCandidateRollover = false,
}) {
  const manifest = object(deviceManifest, 'store/device-validation.json');
  const candidate = object(manifest.candidate, 'candidate');
  const evidence = object(candidateEvidence, 'candidate evidence');
  const evidenceCandidate = object(evidence.candidate, 'candidate evidence.candidate');
  const evidenceAndroid = object(evidence.android, 'candidate evidence.android');
  const android = object(candidate.android, 'candidate.android');
  const pubspec = parsePubspecVersion(pubspecText);

  if (manifest.schemaVersion !== 1 || evidence.schemaVersion !== 1) {
    fail('B11 manifest and candidate evidence must both use schemaVersion=1.');
  }
  if (evidence.kind !== 'android-release-candidate') {
    fail('The candidate evidence must use kind=android-release-candidate.');
  }
  same(candidate.versionName, pubspec.versionName, 'candidate.versionName');
  if (allowCandidateRollover) {
    if (BigInt(pubspec.buildNumber) < BigInt(candidate.buildNumber)) {
      fail('The rollover build number must not be older than the documented candidate.');
    }
  } else {
    same(candidate.buildNumber, pubspec.buildNumber, 'candidate.buildNumber');
  }

  for (const key of [
    'applicationId',
    'bundleId',
    'versionName',
    'buildNumber',
    'commit',
    'releaseChannel',
    'apiBaseUrl',
    'firebaseConfigured',
    'paymentMode',
    'stripeLivemode',
  ]) {
    same(evidenceCandidate[key], candidate[key], `candidate evidence.candidate.${key}`);
  }
  for (const key of ['aabSha256', 'apkSha256', 'signingCertificateSha256']) {
    same(evidenceAndroid[key], android[key], `candidate evidence.android.${key}`);
  }
  if (evidenceAndroid.signatureVerified !== true || evidenceAndroid.packageIdentityVerified !== true) {
    fail('The current Android candidate evidence must verify signature and package identity.');
  }
  if (evidence.privacyAndNetwork?.binaryScan !== 'passed') {
    fail('The current Android candidate evidence must contain a passed binary privacy scan.');
  }
  const internalRelease = evidence.googlePlayInternalRelease;
  const uploadedInternalReleaseBound = new Map([
    ['play-internal', 'store-install-verified'],
    ['google-play-internal-active-store-install-pending',
      'available-to-internal-testers-store-propagation-pending'],
    ['google-play-internal-active-store-install-verified', 'store-install-verified'],
  ]);
  const uploadedStoreBoundaryValid = evidence.boundaries?.uploadedToStore === false || (
    evidence.boundaries?.uploadedToStore === true
    && uploadedInternalReleaseBound.get(evidenceAndroid.delivery) === internalRelease?.status
    && /^docs\/evidence\/b11\/[a-z0-9._-]+\.json$/.test(internalRelease?.evidenceRef ?? '')
  );
  if (!uploadedStoreBoundaryValid || evidence.boundaries?.containsSecrets !== false || evidence.boundaries?.containsRawDeviceIdentifiers !== false) {
    fail('The current candidate evidence must preserve store, secret, and device-identifier boundaries.');
  }

  const currentBuildMarker =
    `| Version und Build | \`${candidate.versionName} (${candidate.buildNumber})\` |`;
  const documentsDescribeCurrentCandidate = snapshotDocuments.every((relativePath) => {
    const content = documents?.[relativePath] ?? readFileSync(resolve(root, relativePath), 'utf8');
    return content.includes(currentBuildMarker);
  });
  const isActiveRollover = allowCandidateRollover && (
    BigInt(pubspec.buildNumber) > BigInt(candidate.buildNumber)
    || !documentsDescribeCurrentCandidate
  );
  if (isActiveRollover) {
    const documentedBuild = validateRolloverBaseline({
      manifest,
      pubspec,
      documents,
      root,
    });
    return {
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      documents: snapshotDocuments.length,
      passedCells: manifest.deviceMatrix.filter((cell) => cell.status === 'passed').length,
      totalCells: manifest.deviceMatrix.length,
      passedReleaseChecks: Object.values(manifest.releaseChecks).filter((check) => check.status === 'passed').length,
      totalReleaseChecks: Object.keys(manifest.releaseChecks).length,
      rolloverBuildNumber: pubspec.buildNumber,
      documentedBuild,
    };
  }

  const expectedSnapshot = renderB11ReleaseSnapshot({ deviceManifest: manifest, candidateEvidence: evidence });
  for (const relativePath of snapshotDocuments) {
    const content = documents?.[relativePath] ?? readFileSync(resolve(root, relativePath), 'utf8');
    if (countMatches(content, snapshotBegin) !== 1 || countMatches(content, snapshotEnd) !== 1) {
      fail(`${relativePath} must contain exactly one current-release snapshot block.`);
    }
    if (!content.includes(expectedSnapshot)) {
      fail(`${relativePath} current-release snapshot is stale or incomplete.`);
    }
  }

  const runbookPath = 'docs/operations/B11_CLOSED_STORE_AND_DEVICE_TEST_RUNBOOK_2026-08-09.md';
  const runbook = documents?.[runbookPath] ?? readFileSync(resolve(root, runbookPath), 'utf8');
  const matrixRows = runbook
    .split('\n')
    .filter((line) => /^\| (Android|iOS) real \|/.test(line));
  if (matrixRows.length !== 4 || matrixRows.some((line) => !line.includes(`\`${candidate.buildNumber}\``))) {
    fail('The four runbook device-matrix rows must use the current candidate build number.');
  }

  return {
    buildNumber: candidate.buildNumber,
    commit: candidate.commit,
    documents: snapshotDocuments.length,
    passedCells: manifest.deviceMatrix.filter((cell) => cell.status === 'passed').length,
    totalCells: manifest.deviceMatrix.length,
    passedReleaseChecks: Object.values(manifest.releaseChecks).filter((check) => check.status === 'passed').length,
    totalReleaseChecks: Object.keys(manifest.releaseChecks).length,
    rolloverBuildNumber: pubspec.buildNumber,
  };
}

function loadRepositoryInputs(root) {
  const deviceManifest = readJson(root, 'store/device-validation.json');
  const evidenceRef = nonEmptyString(
    deviceManifest.releaseChecks?.candidateIdentityAndSignatures?.evidenceRef,
    'releaseChecks.candidateIdentityAndSignatures.evidenceRef',
  );
  if (!/^docs\/evidence\/b11\/[a-z0-9._-]+\.json$/.test(evidenceRef)) {
    fail('The current candidate evidence reference must stay below docs/evidence/b11/.');
  }
  return {
    deviceManifest,
    candidateEvidence: readJson(root, evidenceRef),
    pubspecText: readFileSync(resolve(root, 'pubspec.yaml'), 'utf8'),
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
    const allowCandidateRollover = process.argv.includes('--allow-candidate-rollover');
    const updateSnapshots = process.argv.includes('--update-snapshots');
    const unknownArgs = process.argv.slice(2).filter((arg) => (
      arg !== '--allow-candidate-rollover' && arg !== '--update-snapshots'
    ));
    if (unknownArgs.length > 0) fail(`Unknown argument: ${unknownArgs[0]}`);
    const inputs = loadRepositoryInputs(root);
    if (updateSnapshots) {
      updateB11ReleaseSnapshots({ root, ...inputs });
    }
    const result = validateB11ReleaseDocs({
      root,
      ...inputs,
      allowCandidateRollover,
    });
    console.log(
      `B11 release docs valid: build=${result.buildNumber}, documents=${result.documents}, ` +
      `matrix=${result.passedCells}/${result.totalCells}, releaseChecks=${result.passedReleaseChecks}/${result.totalReleaseChecks}, ` +
      `rolloverBuild=${result.rolloverBuildNumber}.`,
    );
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}
