#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp111-pixel-fcm-icon-visual-review-20260911.json',
);

function fail(message) { throw new Error(message); }
function exact(actual, expected, label) {
  if (actual !== expected) fail(`${label} is not exact.`);
}

export function validateWp111PixelFcmIconVisualReview(value) {
  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.workPackage, 'WP111_PIXEL_FCM_ICON_VISUAL_REVIEW', 'work package');
  exact(value?.status, 'pixel-current-candidate-fcm-icon-visual-review-passed', 'status');
  exact(value?.candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  exact(value?.candidate?.versionName, '1.0.0', 'version name');
  exact(value?.candidate?.versionCode, '2026091109', 'version code');
  exact(value?.candidate?.artifactSourceHead,
    '5d8b89c82926a9f0a28627a7f36d26a88a9574fe', 'artifact source head');
  exact(value?.candidate?.apiBaseUrl,
    'https://staging.shareittoo.com/api/v1', 'Staging API');

  exact(value?.privateCapture?.sha256,
    '736561d7d8c01bc0e4c19b0ec8fb547a6c1c3cf24e28e700a8cc1784a04ca89f',
    'private capture hash');
  exact(value?.privateCapture?.bytes, 932147, 'private capture bytes');
  exact(value?.privateCapture?.committed, false, 'private capture repository boundary');
  exact(value?.privateCapture?.ownerOnly, true, 'private capture ownership');
  exact(value?.privateCapture?.containsUnrelatedPrivateNotifications, true,
    'private capture sensitivity');
  exact(value?.privateCapture?.distributionAllowed, false, 'private capture distribution');

  const visual = value?.visualReview;
  exact(visual?.shareItTooNotificationCardsVisible, 2, 'visible ShareItToo cards');
  for (const key of [
    'correctBrandMark',
    'brandMarkClearCenteredAndRecognizable',
    'notificationTitleAndBodyLegible',
  ]) exact(visual?.[key], true, `visual review ${key}`);
  for (const key of [
    'blankOrGenericPlaceholder',
    'visibleClippingOrDeformation',
    'aggregateSmallIconRowUsedForAttribution',
  ]) exact(visual?.[key], false, `visual review ${key}`);

  const wiring = value?.androidSmallIconWiring;
  exact(wiring?.firebaseDefaultNotificationIcon,
    '@drawable/ic_stat_shareittoo_v2', 'Firebase small-icon resource');
  exact(wiring?.densityResourceCount, 5, 'small-icon density count');
  for (const key of [
    'allRequiredDimensionsPresent',
    'allResourcesHaveTransparentBackground',
    'allVisibleAlphaBoundsCentered',
    'resourceHashesMatchApprovedBrandAssets',
  ]) exact(wiring?.[key], true, `small-icon wiring ${key}`);

  for (const [key, expected] of Object.entries({
    newPushSent: false,
    notificationCleared: false,
    deviceSettingChanged: false,
    candidateRebuiltOrReinstalled: false,
    onePlusContacted: false,
    storeChanged: false,
    productionChanged: false,
    firebaseProjectChanged: false,
    paymentOrProviderChanged: false,
    cloudVpsDnsChanged: false,
    pullRequestMerged: false,
    containsSecrets: false,
    containsAccountIdentity: false,
    containsRawDeviceIdentifiers: false,
    containsPrivateFilesystemPath: false,
    privateScreenshotCommitted: false,
  })) exact(value?.boundaries?.[key], expected, `boundary ${key}`);

  return Object.freeze({
    status: 'passed-wp111-pixel-fcm-icon-visual-review-evidence',
    versionCode: '2026091109',
    privateCaptureCommitted: false,
  });
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    process.stdout.write(`${JSON.stringify(validateWp111PixelFcmIconVisualReview(evidence))}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP111 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
