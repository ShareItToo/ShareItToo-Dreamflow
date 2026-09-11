import assert from 'node:assert/strict';
import test from 'node:test';

import {
  privacyExportSinkJava,
  privacyExportSinkManifest,
  privacyExportVaultEligible,
  privacyExportPasswordField,
  privacyExportPasswordDialogVisible,
  privacyExportChooserOwned,
  parsePrivacyExportSinkReceipt,
  privacyExportShareRejected,
  privacyExportSinkHandlerResolved,
  privacyExportSinkFileSize,
  validatePrivacyExportPayload,
  validatePrivacyExportSinkSources,
} from '../../tool/diagnose_android_privacy_export_payload.mjs';

test('privacy export accepts only ready or exact non-binding active two-role state', () => {
  const base = {
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    stripeLivemode: false,
  };
  assert.equal(privacyExportVaultEligible({
    ...base,
    status: 'email-link-verified-ready-for-login',
  }), true);
  const active = {
    ...base,
    status: 'non-binding-simulation-active',
    realTwoRoleJourney: {
      status: 'accepted-chat-ready-for-pixel-role-review',
      listingStatus: 'active',
      simulationOnly: true,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      listingId: 'listing-fixture',
    },
    nonBindingSimulation: {
      status: 'accepted-chat-ready',
      listingId: 'listing-fixture',
      bookingId: 'booking-fixture',
      threadId: 'thread-fixture',
      paymentEndpointCalled: false,
      stripeLivemode: false,
      availabilityUnaffected: true,
      paymentReadRejected: true,
    },
  };
  assert.equal(privacyExportVaultEligible(active), true);
  assert.equal(privacyExportVaultEligible({
    ...active,
    nonBindingSimulation: {
      ...active.nonBindingSimulation,
      paymentEndpointCalled: true,
    },
  }), false);
  assert.equal(privacyExportVaultEligible({
    ...active,
    realTwoRoleJourney: {
      ...active.realTwoRoleJourney,
      listingId: 'different-listing',
    },
  }), false);
  assert.equal(privacyExportVaultEligible({ ...base, status: 'retired' }), false);
});

function payload(overrides = {}) {
  return Buffer.from(JSON.stringify({
    schemaVersion: '1.0',
    accountId: 'owner-id',
    generatedAt: '2026-09-06T18:00:00.000Z',
    data: { profile: { email: 'owner@example.invalid' } },
    localDevice: {
      accountProfile: { accountId: 'owner-id' },
      savedItems: { accountId: 'owner-id' },
      ownedListings: { accountId: 'owner-id' },
      reviews: { accountId: 'owner-id' },
      operationalRecords: { accountId: 'owner-id' },
      safetyPrivacy: { accountId: 'owner-id' },
    },
    ...overrides,
  }));
}

const identities = Object.freeze({
  ownerUserId: 'owner-id',
  ownerEmail: 'owner@example.invalid',
  foreignUserId: 'renter-id',
  foreignEmail: 'renter@example.invalid',
});

function androidNode({
  text = '',
  contentDescription = '',
  className = 'android.view.View',
  enabled = 'true',
  clickable = 'false',
  focusable = 'false',
  password = 'false',
  hint = '',
  bounds = '[0,0][100,100]',
} = {}) {
  return `<node text="${text}" content-desc="${contentDescription}" class="${className}"`
    + ` enabled="${enabled}" clickable="${clickable}" focusable="${focusable}"`
    + ` password="${password}" hint="${hint}" bounds="${bounds}" />`;
}

function passwordField(overrides = {}) {
  return androidNode({
    className: 'android.widget.EditText',
    enabled: 'true',
    clickable: 'true',
    focusable: 'true',
    password: 'true',
    hint: 'Aktuelles Passwort',
    bounds: '[190,1005][1250,1153]',
    ...overrides,
  });
}

test('password dialog recognition binds to exactly one protected editable field', () => {
  const realPixelShape = `<hierarchy>${androidNode({ text: 'Datenexport bestätigen' })}`
    + `${passwordField()}</hierarchy>`;
  assert.equal(privacyExportPasswordDialogVisible(realPixelShape), true);
  assert.match(privacyExportPasswordField(realPixelShape), /android\.widget\.EditText/u);
  assert.equal(privacyExportPasswordDialogVisible(
    `<hierarchy>${androidNode({ text: 'Datenexport bestätigen' })}</hierarchy>`,
  ), false);
  assert.equal(privacyExportPasswordDialogVisible(
    `<hierarchy>${androidNode({ text: 'Datenexport bestätigen' })}`
      + `${androidNode({ text: 'Aktuelles Passwort' })}</hierarchy>`,
  ), false);
  for (const unsafeField of [
    passwordField({ enabled: 'false' }),
    passwordField({ clickable: 'false' }),
    passwordField({ focusable: 'false' }),
    passwordField({ password: 'false' }),
  ]) {
    assert.equal(privacyExportPasswordDialogVisible(
      `<hierarchy>${androidNode({ text: 'Datenexport bestätigen' })}${unsafeField}</hierarchy>`,
    ), false);
  }
  assert.equal(privacyExportPasswordDialogVisible(
    `<hierarchy>${androidNode({ text: 'Datenexport bestätigen' })}`
      + `${passwordField()}${passwordField({ bounds: '[190,1200][1250,1348]' })}</hierarchy>`,
  ), false);
});

test('temporary Android sink has no network or external-storage capability', () => {
  const result = validatePrivacyExportSinkSources();
  assert.equal(result.internetPermission, false);
  assert.equal(result.externalStoragePermission, false);
  assert.equal(result.privateFileOnly, true);
  assert.doesNotMatch(privacyExportSinkManifest, /uses-permission/u);
  assert.doesNotMatch(privacyExportSinkJava, /https?:|Socket|URLConnection|HttpClient|WebView/u);
});

test('share-surface cleanup is bound only to the exact WP33 export', () => {
  assert.equal(privacyExportChooserOwned(
    `<hierarchy>${androidNode({ text: 'shareittoo-data-export.json' })}</hierarchy>`,
  ), true);
  assert.equal(privacyExportChooserOwned(
    `<hierarchy>${androidNode({ text: 'unrelated-private-document.pdf' })}</hierarchy>`,
  ), false);
});

test('installed sink resolution accepts only the exact JSON-share component', () => {
  assert.equal(privacyExportSinkHandlerResolved(
    '  com.shareittoo.dev.privacyexportsink/.ExportReceiverActivity\n',
  ), true);
  assert.equal(privacyExportSinkHandlerResolved(
    'com.shareittoo.dev.privacyexportsink/.DifferentActivity\n',
  ), false);
});

test('temporary sink requires an exact bounded file size before reading bytes', () => {
  assert.equal(privacyExportSinkFileSize('196\n', 'receipt.json'), 196);
  assert.equal(
    privacyExportSinkFileSize(String(32 * 1024 * 1024), 'shareittoo-data-export.json'),
    32 * 1024 * 1024,
  );
  for (const missingOrUnsafe of ['', '0', 'not found', '-1', '4097']) {
    assert.throws(
      () => privacyExportSinkFileSize(missingOrUnsafe, 'receipt.json'),
      /unavailable|invalid byte length/u,
    );
  }
  assert.throws(
    () => privacyExportSinkFileSize('1', '../receipt.json'),
    /not allowlisted/u,
  );
});

test('temporary sink receipt is exact and bounded for chooser or direct delivery', () => {
  const receipt = Buffer.from(JSON.stringify({
    status: 'received',
    bytes: 1234,
    sha256: 'a'.repeat(64),
  }));
  assert.deepEqual(parsePrivacyExportSinkReceipt(receipt), {
    status: 'received',
    bytes: 1234,
    sha256: 'a'.repeat(64),
  });
  for (const invalid of [
    Buffer.from('not-json'),
    Buffer.from(JSON.stringify({ status: 'received', bytes: 0, sha256: 'a'.repeat(64) })),
    Buffer.from(JSON.stringify({ status: 'received', bytes: 1, sha256: 'invalid' })),
    Buffer.from(JSON.stringify({
      status: 'received', bytes: 1, sha256: 'a'.repeat(64), extra: true,
    })),
  ]) {
    assert.throws(() => parsePrivacyExportSinkReceipt(invalid), /receipt is invalid/u);
  }
});

test('correct-password rejection is detected before waiting for an Android share surface', () => {
  assert.equal(privacyExportShareRejected(
    `<hierarchy>${androidNode({ text: 'Datenexport fehlgeschlagen' })}</hierarchy>`,
  ), true);
  assert.equal(privacyExportShareRejected(
    `<hierarchy>${androidNode({ text: 'Datenexport erstellt' })}</hierarchy>`,
  ), false);
});

test('accepts an exact owner-bound export with all six local sections', () => {
  const result = validatePrivacyExportPayload({ bytes: payload(), ...identities });
  assert.equal(result.exactOwnerBound, true);
  assert.equal(result.foreignEmailAbsent, true);
  assert.equal(result.foreignOpaqueIdentifierOutsideSharedRecordsAbsent, true);
  assert.deepEqual(result.sharedCounterpartySections, []);
  assert.deepEqual(result.localSections, [
    'accountProfile',
    'operationalRecords',
    'ownedListings',
    'reviews',
    'safetyPrivacy',
    'savedItems',
  ]);
});

test('rejects a foreign root principal or account email anywhere', () => {
  assert.throws(
    () => validatePrivacyExportPayload({
      bytes: payload({ accountId: 'renter-id' }),
      ...identities,
    }),
    /root contract or exact owner binding/u,
  );
  assert.throws(
    () => validatePrivacyExportPayload({
      bytes: payload({
        data: {
          profile: { email: 'owner@example.invalid' },
          note: 'renter@example.invalid',
        },
      }),
      ...identities,
    }),
    /foreign account email/u,
  );
  assert.throws(
    () => validatePrivacyExportPayload({
      bytes: payload({
        data: {
          profile: { email: 'owner@example.invalid' },
          counterpartyId: 'renter-id',
        },
      }),
      ...identities,
    }),
    /remote privacy export contains a foreign opaque principal identifier/u,
  );
});

test('allows opaque counterpart references only in shared local record sections', () => {
  const shared = JSON.parse(payload().toString('utf8'));
  shared.localDevice.operationalRecords.thread = { participantId: 'renter-id' };
  shared.localDevice.reviews.received = [{ reviewerId: 'renter-id' }];
  shared.localDevice.safetyPrivacy.blockedUserIds = ['renter-id'];
  const result = validatePrivacyExportPayload({
    bytes: Buffer.from(JSON.stringify(shared)),
    ...identities,
  });
  assert.deepEqual(result.sharedCounterpartySections, [
    'operationalRecords',
    'reviews',
    'safetyPrivacy',
  ]);

  for (const section of ['accountProfile', 'ownedListings', 'savedItems']) {
    const unsafe = JSON.parse(payload().toString('utf8'));
    unsafe.localDevice[section].foreignUserId = 'renter-id';
    assert.throws(
      () => validatePrivacyExportPayload({
        bytes: Buffer.from(JSON.stringify(unsafe)),
        ...identities,
      }),
      /principal-private local export section/u,
    );
  }
});

test('rejects missing sections, cross-owner local sections and credential keys', () => {
  assert.throws(
    () => validatePrivacyExportPayload({
      bytes: payload({ localDevice: { accountProfile: { accountId: 'owner-id' } } }),
      ...identities,
    }),
    /exact six local sections/u,
  );
  const wrongSection = JSON.parse(payload().toString('utf8'));
  wrongSection.localDevice.reviews.accountId = 'renter-id';
  assert.throws(
    () => validatePrivacyExportPayload({ bytes: Buffer.from(JSON.stringify(wrongSection)), ...identities }),
    /belongs to another principal/u,
  );
  assert.throws(
    () => validatePrivacyExportPayload({
      bytes: payload({ data: { email: 'owner@example.invalid', accessToken: 'forbidden' } }),
      ...identities,
    }),
    /credential- or session-shaped key/u,
  );
});

test('allows only the exact typed password-change timestamp as non-credential metadata', () => {
  const accepted = validatePrivacyExportPayload({
    bytes: payload({
      data: {
        account: {
          email: 'owner@example.invalid',
          password_changed_at: '2026-09-06T17:30:00.000Z',
        },
      },
    }),
    ...identities,
  });
  assert.equal(accepted.forbiddenCredentialKeyCount, 0);
  assert.equal(validatePrivacyExportPayload({
    bytes: payload({
      data: {
        account: {
          email: 'owner@example.invalid',
          password_changed_at: null,
        },
      },
    }),
    ...identities,
  }).forbiddenCredentialKeyCount, 0);

  for (const data of [
    {
      account: {
        email: 'owner@example.invalid',
        password_changed_at: 'not-a-timestamp',
      },
    },
    {
      account: { email: 'owner@example.invalid' },
      password_changed_at: '2026-09-06T17:30:00.000Z',
    },
    {
      account: {
        email: 'owner@example.invalid',
        [['pass', 'word'].join('')]: 'forbidden',
      },
    },
  ]) {
    assert.throws(
      () => validatePrivacyExportPayload({ bytes: payload({ data }), ...identities }),
      /credential- or session-shaped key/u,
    );
  }
});

test('rejects invalid, empty and oversized export bytes', () => {
  assert.throws(
    () => validatePrivacyExportPayload({ bytes: Buffer.alloc(0), ...identities }),
    /invalid byte length/u,
  );
  assert.throws(
    () => validatePrivacyExportPayload({ bytes: Buffer.from('not-json'), ...identities }),
    /not valid JSON/u,
  );
  assert.throws(
    () => validatePrivacyExportPayload({
      bytes: payload({ generatedAt: 'not-a-timestamp' }),
      ...identities,
    }),
    /root contract or exact owner binding/u,
  );
  assert.throws(
    () => validatePrivacyExportPayload({
      bytes: Buffer.alloc((32 * 1024 * 1024) + 1),
      ...identities,
    }),
    /invalid byte length/u,
  );
});
