import assert from 'node:assert/strict';
import test from 'node:test';

import {
  controlledMediaRow,
  newestPhotoPickerTile,
  onDeviceListingAiUiProof,
  runAndroidOnDeviceListingAiAcceptance,
} from '../../tool/diagnose_android_on_device_listing_ai.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026091109',
  commit: '5d8b89c82926a9f0a28627a7f36d26a88a9574fe',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  apkSha256: '1'.repeat(64),
  signingCertificateSha256: '2'.repeat(64),
});

const device = Object.freeze({
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel 7 Pro',
  apiLevel: 35,
  securityPatch: '2026-08-05',
});

const server = Object.freeze({
  recentDraftFound: true,
  exactlyOneRecentDraft: true,
  ageBounded: true,
  statusEditing: true,
  revisionOne: true,
  disclosureExact: true,
  preflightConsumed: true,
  oneVersion: true,
  suggestionsNonempty: true,
  allOwnerConfirmationsFalse: true,
  providerOnDevice: true,
  modelExact: true,
  zeroUnitsAndCost: true,
  outcomeSucceeded: true,
  notPublished: true,
  generationAuditExact: true,
});

function node(label) {
  return `<node text="${label}" content-desc="${label}"/>`;
}

const successfulHierarchy = '<hierarchy>'
  + node('Bearbeitbarer Entwurf ist bereit.')
  + node('Bearbeitbarer KI-Entwurf')
  + node('title: bitte prüfen')
  + node('category: bitte prüfen')
  + node('subcategory: bitte prüfen')
  + node('description: bitte prüfen')
  + node('projectTags: bitte prüfen')
  + node('useCases: bitte prüfen')
  + '</hierarchy>';

function passingOperations(calls) {
  return {
    perform: async () => {
      calls.push('perform');
      return { fixtureSelected: true, ui: successfulHierarchy };
    },
    verifyServer: async () => {
      calls.push('server');
      return server;
    },
    cleanup: async () => {
      calls.push('cleanup');
      return { localRecoveryCleared: true, controlledMediaRemoved: true };
    },
    restoreOwner: async () => {
      calls.push('restore');
      return true;
    },
  };
}

test('selects only the newest square Android photo-picker tile', () => {
  const hierarchy = '<hierarchy>'
    + '<node package="com.google.android.photopicker" clickable="true" bounds="[10,10][100,100]"/>'
    + '<node package="com.google.android.photopicker" clickable="true" bounds="[481,1380][959,1858]"/>'
    + '<node package="com.google.android.photopicker" clickable="true" bounds="[0,1380][478,1858]"/>'
    + '</hierarchy>';
  assert.deepEqual(newestPhotoPickerTile(hierarchy).area, {
    left: 0,
    top: 1380,
    right: 478,
    bottom: 1858,
    width: 478,
    height: 478,
  });
});

test('requires the controlled image to be the unique newest media row', () => {
  const output = 'Row: 0 _id=2, _display_name=SIT_WP112_CONTROLLED_DRILL.png, date_added=20\n'
    + 'Row: 1 _id=1, _display_name=older-private-photo.jpg, date_added=10';
  assert.deepEqual(controlledMediaRow(output), {
    id: 2,
    name: 'SIT_WP112_CONTROLLED_DRILL.png',
    added: 20,
  });
  assert.throws(
    () => controlledMediaRow(`${output}\nRow: 2 _id=3, _display_name=newer.jpg, date_added=30`),
    /not the newest/u,
  );
  assert.equal(JSON.stringify(controlledMediaRow(output)).includes('older-private-photo'), false);
});

test('accepts only a meaningful editable local-analysis UI result', () => {
  const proof = onDeviceListingAiUiProof(successfulHierarchy);
  assert.equal(proof.draftReady, true);
  assert.equal(proof.titleSuggested, true);
  assert.equal(proof.categorySuggested, true);
  assert.equal(proof.safeFallbackAbsent, true);
  assert.throws(
    () => onDeviceListingAiUiProof('<hierarchy>' + node('Manueller Fallback aktiv.') + '</hierarchy>'),
    /result is incomplete/u,
  );
});

test('closes physical on-device Listing-AI with zero-cost non-public evidence', async () => {
  const calls = [];
  const result = await runAndroidOnDeviceListingAiAcceptance({
    candidate,
    deviceSummary: device,
    operations: passingOperations(calls),
    capturedAt: '2026-09-11T15:00:00.000Z',
  });
  assert.deepEqual(calls, ['perform', 'server', 'cleanup', 'restore']);
  assert.equal(result.status, 'passed-physical-pixel-on-device-listing-ai');
  assert.equal(result.tests.providerOnDevice, true);
  assert.equal(result.tests.zeroUnitsAndCost, true);
  assert.equal(result.tests.notPublished, true);
  assert.equal(result.tests.controlledMediaRemoved, true);
  assert.equal(result.runtime.externalProviderExecutionAllowed, false);
  assert.equal(result.boundaries.containsSecrets, false);
  assert.equal(JSON.stringify(result).includes('/private/'), false);
});

test('cleans and restores the protected owner after a server mismatch', async () => {
  const calls = [];
  const operations = passingOperations(calls);
  operations.verifyServer = async () => {
    calls.push('server');
    return { ...server, zeroUnitsAndCost: false };
  };
  await assert.rejects(
    () => runAndroidOnDeviceListingAiAcceptance({
      candidate,
      deviceSummary: device,
      operations,
    }),
    /readback did not close exactly/u,
  );
  assert.deepEqual(calls, ['perform', 'server', 'cleanup', 'restore']);
});

test('fails rather than claiming an incomplete cleanup', async () => {
  const calls = [];
  const operations = passingOperations(calls);
  operations.cleanup = async () => {
    calls.push('cleanup');
    return { localRecoveryCleared: true, controlledMediaRemoved: false };
  };
  await assert.rejects(
    () => runAndroidOnDeviceListingAiAcceptance({
      candidate,
      deviceSummary: device,
      operations,
    }),
    /cleanup did not close exactly/u,
  );
  assert.deepEqual(calls, ['perform', 'server', 'cleanup', 'restore']);
});
