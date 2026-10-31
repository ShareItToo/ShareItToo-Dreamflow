import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifySyntheticImagePickerSurface,
  composerActionPoint,
  containsExactWp21MessageState,
  containsWp21LocationGateFeedback,
  isExactWp21AddressEntrySurface,
  parseAndroidDisplayScale,
  runWp21Lifecycle,
  shouldRetrySyntheticGalleryTap,
  summarizeMessagingMediaTimeLocation,
  uniqueClickableNodeContaining,
} from '../../tool/diagnose_android_messaging_media_time_location.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090507',
  commit: 'a'.repeat(40),
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  paymentMode: 'memory',
  stripeLivemode: false,
  android: Object.freeze({
    apkSha256: 'b'.repeat(64),
    aabSha256: 'c'.repeat(64),
    signingCertificateSha256: 'd'.repeat(64),
  }),
});

const deviceSummary = Object.freeze({
  kind: 'physical-android-device',
  model: 'Pixel 7 Pro',
  androidVersion: '17',
  apiLevel: 37,
  rawIdentifierIncluded: false,
});

const attachment = Object.freeze({
  messageCount: 1,
  sameParticipantProjection: true,
  attachmentMessages: Object.freeze([Object.freeze({ attachmentCount: 1 })]),
  locationMessages: Object.freeze([]),
  flow: Object.freeze({
    handoverTimeConfirmed: false,
    returnTimeConfirmed: false,
    flowTimeRevision: 0,
  }),
});

const times = Object.freeze({
  messageCount: 5,
  sameParticipantProjection: true,
  attachmentMessages: Object.freeze([Object.freeze({ attachmentCount: 1 })]),
  locationMessages: Object.freeze([]),
  flow: Object.freeze({
    handoverTimeRequested: 'Mo, 10:00',
    returnTimeRequested: 'Mi, 10:00',
    handoverTimeConfirmed: true,
    returnTimeConfirmed: true,
    flowTimeRevision: 4,
  }),
});

const location = Object.freeze({
  ...times,
  locationMessages: Object.freeze([]),
});

const retired = Object.freeze({
  status: 'email-verified-two-role-product-journey-retired',
  bookingCancelled: true,
  listingEnded: true,
});

test('composer actions stay bound to the active message field geometry', () => {
  const hierarchy = '<hierarchy><node text="Nachricht…" bounds="[210,1800][950,1840]" /></hierarchy>';
  assert.deepEqual(composerActionPoint(hierarchy, 'camera'), { x: 36, y: 1820 });
  assert.deepEqual(composerActionPoint(hierarchy, 'gallery'), { x: 84, y: 1820 });
  assert.deepEqual(composerActionPoint(hierarchy, 'schedule'), { x: 132, y: 1820 });
  assert.deepEqual(composerActionPoint(hierarchy, 'location'), { x: 180, y: 1820 });
  const unnamedFlutterField = [
    '<hierarchy>',
    '<node text="" content-desc="" class="android.widget.EditText" enabled="true" bounds="[210,1800][950,1840]" />',
    '</hierarchy>',
  ].join('');
  assert.deepEqual(
    composerActionPoint(unnamedFlutterField, 'gallery'),
    { x: 84, y: 1820 },
  );
  const threeXAndroidSurface = '<hierarchy><node text="Nachricht…" bounds="[600,2500][1320,2620]" /></hierarchy>';
  assert.deepEqual(
    composerActionPoint(threeXAndroidSurface, 'gallery', 3),
    { x: 222, y: 2560 },
  );
  assert.throws(
    () => composerActionPoint(hierarchy, 'payment'),
    /composer action is invalid/u,
  );
  assert.throws(
    () => composerActionPoint('<hierarchy />', 'gallery'),
    /exact active message composer is unavailable/u,
  );
});

test('Android display scale prefers an explicit density override', () => {
  assert.equal(parseAndroidDisplayScale([
    'Physical density: 560',
    'Override density: 480',
  ].join('\n')), 3);
  assert.equal(parseAndroidDisplayScale('Physical density: 320'), 2);
  assert.throws(
    () => parseAndroidDisplayScale('density unavailable'),
    /display density is invalid/u,
  );
});

test('composite thread selection requires exactly one clickable row containing the title', () => {
  const hierarchy = [
    '<hierarchy>',
    '<node text="" content-desc="Gegenrolle\nSIT Rollenprüfung n22-safe\nBestätigt" clickable="true" bounds="[20,300][1060,520]" />',
    '<node text="SIT Rollenprüfung n22-safe" content-desc="" clickable="false" bounds="[100,330][900,380]" />',
    '</hierarchy>',
  ].join('');
  const node = uniqueClickableNodeContaining(
    hierarchy,
    'SIT Rollenprüfung n22-safe',
  );
  assert.match(node, /clickable="true"/u);
  assert.throws(
    () => uniqueClickableNodeContaining(
      hierarchy.replace('</hierarchy>', `${node}</hierarchy>`),
      'SIT Rollenprüfung n22-safe',
    ),
    /not uniquely available/u,
  );
});

test('synthetic image picker classification remains identity-free', () => {
  const hierarchy = [
    '<hierarchy>',
    '<node package="com.google.android.documentsui" text="Recent" class="android.widget.TextView" />',
    '<node package="com.google.android.documentsui" text="SIT-WP21-SAFE.png" class="android.widget.TextView" />',
    '</hierarchy>',
  ].join('');
  assert.deepEqual(classifySyntheticImagePickerSurface(hierarchy), {
    app: false,
    documentsUi: true,
    mediaPicker: false,
    photoSheet: false,
    locationSheet: false,
    messagesSettings: false,
    mainNavigation: false,
    safeFilename: true,
    activeEditFields: 0,
  });
  assert.equal(JSON.stringify(
    classifySyntheticImagePickerSurface(hierarchy),
  ).includes('Recent'), false);
  const chat = {
    app: true,
    activeEditFields: 1,
    photoSheet: false,
    locationSheet: false,
    mainNavigation: false,
  };
  assert.equal(shouldRetrySyntheticGalleryTap(chat, 2), true);
  assert.equal(shouldRetrySyntheticGalleryTap(chat, 5), true);
  assert.equal(shouldRetrySyntheticGalleryTap(chat, 3), false);
  assert.equal(shouldRetrySyntheticGalleryTap({
    ...chat,
    photoSheet: true,
  }, 2), false);
  assert.equal(shouldRetrySyntheticGalleryTap({
    ...chat,
    mainNavigation: true,
  }, 2), false);
});

test('WP21 message convergence requires every exact server-backed label', () => {
  const labels = ['Foto hinzugefügt', 'Übergabezeit angefragt'];
  assert.equal(
    containsExactWp21MessageState(
      '<hierarchy><node text="Foto hinzugefügt" /></hierarchy>',
      labels,
    ),
    false,
  );
  assert.equal(
    containsExactWp21MessageState(
      '<hierarchy><node text="Foto hinzugefügt" /><node text="Übergabezeit angefragt" /></hierarchy>',
      labels,
    ),
    true,
  );
  assert.throws(
    () => containsExactWp21MessageState('<hierarchy />', []),
    /labels are invalid/u,
  );
});

test('WP21 address entry binds the active field instead of presentation-only hint text', () => {
  const surface = [
    '<hierarchy>',
    '<node text="Adresse teilen" class="android.widget.TextView" />',
    '<node text="" content-desc="" class="android.widget.EditText" enabled="true" bounds="[40,300][1040,430]" />',
    '</hierarchy>',
  ].join('');
  assert.equal(isExactWp21AddressEntrySurface(surface), true);
  assert.equal(
    isExactWp21AddressEntrySurface(surface.replace('enabled="true"', 'enabled="false"')),
    false,
  );
  assert.equal(
    isExactWp21AddressEntrySurface(surface.replace('Adresse teilen', 'Standort teilen')),
    false,
  );
});

test('WP21 location gate accepts persistent Flutter feedback in merged semantics', () => {
  const combined = [
    '<hierarchy>',
    '<node text="" content-desc="Hinweis: Standortfreigabe noch gesperrt. Ein genauer Ort bleibt geschützt." />',
    '</hierarchy>',
  ].join('');
  assert.equal(containsWp21LocationGateFeedback(combined), true);
  assert.equal(
    containsWp21LocationGateFeedback(
      '<hierarchy><node text="Standort wurde geteilt" /></hierarchy>',
    ),
    false,
  );
});

test('WP21 summary proves media, two-party times, persistence and gated location only', () => {
  const evidence = summarizeMessagingMediaTimeLocation({
    candidate,
    deviceSummary,
    sourceDrift: { mobileSourceChanged: false },
    afterAttachment: attachment,
    afterTimes: times,
    afterLocation: location,
    coldRestartVisible: true,
    ownerRestored: true,
    retired,
    capturedAt: '2026-09-06T00:00:00.000Z',
  });
  assert.equal(evidence.status,
    'pixel-attachment-and-two-party-times-passed-location-gate-closed');
  assert.equal(evidence.tests.locationMessageCreatedBeforeRevealWindow, false);
  assert.equal(evidence.boundaries.syntheticMediaOnly, true);
  assert.equal(evidence.boundaries.privateLocationRecordedInEvidence, false);
  assert.equal(evidence.boundaries.paymentEndpointCalled, false);
  assert.equal(evidence.boundaries.onePlusContacted, false);
  assert.equal(JSON.stringify(evidence).includes('Testweg'), false);
});

test('WP21 summary rejects a false location success or incomplete counterparty time', () => {
  assert.throws(
    () => summarizeMessagingMediaTimeLocation({
      candidate,
      deviceSummary,
      sourceDrift: { mobileSourceChanged: false },
      afterAttachment: attachment,
      afterTimes: times,
      afterLocation: {
        ...location,
        locationMessages: [{ text: 'forbidden' }],
      },
      coldRestartVisible: true,
      ownerRestored: true,
      retired,
    }),
    /acceptance is incomplete/u,
  );
  assert.throws(
    () => summarizeMessagingMediaTimeLocation({
      candidate,
      deviceSummary,
      sourceDrift: { mobileSourceChanged: false },
      afterAttachment: attachment,
      afterTimes: {
        ...times,
        flow: { ...times.flow, returnTimeConfirmed: false },
      },
      afterLocation: location,
      coldRestartVisible: true,
      ownerRestored: true,
      retired,
    }),
    /acceptance is incomplete/u,
  );
});

test('WP21 lifecycle always removes the device file, retires the fixture and restores owner', async () => {
  const calls = [];
  const evidence = await runWp21Lifecycle({
    candidate,
    deviceSummary,
    sourceDrift: { mobileSourceChanged: false },
    operations: {
      prepare: async () => {
        calls.push('prepare');
        return { vaultFile: '/private/fixture' };
      },
      activate: async () => calls.push('activate'),
      simulate: async () => calls.push('simulate'),
      exercise: async () => {
        calls.push('exercise');
        return {
          afterAttachment: attachment,
          afterTimes: times,
          afterLocation: location,
          coldRestartVisible: true,
        };
      },
      removeDeviceFile: async () => calls.push('remove-device-file'),
      retire: async () => {
        calls.push('retire');
        return retired;
      },
      restoreOwner: async () => {
        calls.push('restore-owner');
        return true;
      },
    },
  });
  assert.equal(evidence.kind, 'sit-wp21-pixel-messaging-media-time-location');
  assert.deepEqual(calls, [
    'prepare',
    'activate',
    'simulate',
    'exercise',
    'remove-device-file',
    'retire',
    'restore-owner',
  ]);
});

test('WP21 lifecycle preserves cleanup when the physical exercise fails', async () => {
  const calls = [];
  await assert.rejects(
    runWp21Lifecycle({
      candidate,
      deviceSummary,
      sourceDrift: { mobileSourceChanged: false },
      operations: {
        prepare: async () => ({ vaultFile: '/private/fixture' }),
        activate: async () => {},
        simulate: async () => {},
        exercise: async () => {
          throw new Error('The synthetic attachment surface was absent.');
        },
        removeDeviceFile: async () => calls.push('remove-device-file'),
        retire: async () => {
          calls.push('retire');
          return retired;
        },
        restoreOwner: async () => {
          calls.push('restore-owner');
          return true;
        },
      },
    }),
    /synthetic attachment surface was absent/u,
  );
  assert.deepEqual(calls, ['remove-device-file', 'retire', 'restore-owner']);
});

test('WP21 lifecycle reports a sanitized cleanup phase after successful exercise', async () => {
  await assert.rejects(
    runWp21Lifecycle({
      candidate,
      deviceSummary,
      sourceDrift: { mobileSourceChanged: false },
      operations: {
        prepare: async () => ({ vaultFile: '/private/fixture' }),
        activate: async () => {},
        simulate: async () => {},
        exercise: async () => ({
          afterAttachment: attachment,
          afterTimes: times,
          afterLocation: location,
          coldRestartVisible: true,
        }),
        removeDeviceFile: async () => {},
        retire: async () => retired,
        restoreOwner: async () => {
          throw new Error('main navigation unavailable');
        },
      },
    }),
    (error) => {
      assert.match(error.message, /cleanup failed during restore-protected-owner/u);
      assert.equal(error.sitStage, 'cleanup-restore-protected-owner');
      return true;
    },
  );
});
