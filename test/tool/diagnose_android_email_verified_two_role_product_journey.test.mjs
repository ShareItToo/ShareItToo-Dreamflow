import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renterAcceptedCardSurfaceClassification,
  ownerNonBindingDetailVisible,
  renterBookingChatSurfaceClassification,
  renterBookingChatVisible,
  renterNonBindingDetailVisible,
  restoreExactRoleWithBoundedRetries,
  retryIdempotentPixelState,
  runOwnerPublishUiSubphase,
  runAndroidEmailVerifiedTwoRoleProductJourney,
} from '../../tool/diagnose_android_email_verified_two_role_product_journey.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090305',
  commit: '4bcc018eef7759d9f8fe64f75daba060abf0eb13',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  apkSha256: '1'.repeat(64),
});

function passingOperations(calls) {
  return {
    prepare: async () => {
      calls.push('prepare');
      return { vaultFile: '/private/accounts.json' };
    },
    publishOwnerDraft: async () => {
      calls.push('publish');
      return { status: 'pixel-owner-draft-publish-submitted' };
    },
    verifyPublished: async () => {
      calls.push('verify-published');
      return { status: 'pixel-owner-publish-server-confirmed' };
    },
    simulate: async () => {
      calls.push('simulate');
      return { status: 'email-verified-two-role-simulation-ready-for-pixel-review' };
    },
    verifyFcm: async () => {
      calls.push('fcm');
      return {
        evidence: {
          status: 'delivery-passed-icon-visual-review-pending',
          tests: {
            notificationIconVisual: {
              privateDiagnosticScreenshotSha256: '2'.repeat(64),
            },
          },
        },
      };
    },
    verifyOwner: async () => {
      calls.push('owner');
      return {
        status: 'pixel-owner-accepted-non-binding-surface-passed',
        cardTruth: 'Pilot-Simulation',
      };
    },
    verifyRenter: async () => {
      calls.push('renter');
      return {
        status: 'pixel-renter-product-surfaces-passed',
        cardTruth: 'Pilot-Simulation',
      };
    },
    retire: async () => {
      calls.push('retire');
      return { status: 'email-verified-two-role-product-journey-retired' };
    },
    restoreOwner: async () => {
      calls.push('restore-owner');
      return true;
    },
  };
}

function node(label) {
  return `<node text="${label}" content-desc="" bounds="[0,0][100,100]"/>`;
}

test('binds owner and renter detail truth to their distinct shipped copy', () => {
  const ownerHierarchy = `<hierarchy>${node('Pilot-Simulation · Kommende Vermietung')}${node('Unverbindliche Pilot-Simulation: kein Vertrag, keine Reservierung und keine Zahlung.')}</hierarchy>`;
  const renterHierarchy = `<hierarchy>${node('Pilot-Simulation · Kommende Buchung')}${node('Unverbindliche Pilot-Simulation')}${node('Zahlung entfällt. Dieser Test erzeugt keinen Vertrag, keine Reservierung, keine Auszahlung und keine Erstattung.')}</hierarchy>`;
  assert.equal(ownerNonBindingDetailVisible(ownerHierarchy), true);
  assert.equal(renterNonBindingDetailVisible(renterHierarchy), true);
  assert.equal(ownerNonBindingDetailVisible(renterHierarchy), false);
  assert.equal(renterNonBindingDetailVisible(ownerHierarchy), false);
});

test('matches the exact booking chat through the shipped middle-dot title prefix', () => {
  const title = 'SIT Rollenprüfung n22-fixture';
  const hierarchy = `<hierarchy>${node('Nachrichten-Einstellungen')}${node(`· ${title}`)}${node('Bestätigt')}</hierarchy>`;
  assert.equal(renterBookingChatVisible(hierarchy, title), true);
  assert.equal(renterBookingChatVisible(hierarchy, 'SIT Rollenprüfung another'), false);
});

test('classifies a missing renter booking chat without exposing its title', () => {
  const title = 'SIT Rollenprüfung n22-private-fixture';
  const hierarchy = `<hierarchy>${node('Nachrichten-Einstellungen')}${node(`· ${title}`)}${node('Chat')}${node('Aktiv')}${node('Archiviert')}</hierarchy>`;
  const classification = renterBookingChatSurfaceClassification(hierarchy, title);
  assert.equal(
    classification,
    'settings-1_title-1_confirmed-0_chat-1_completed-0_load-failed-0_empty-0_active-tab-1_archived-tab-1',
  );
  assert.equal(classification.includes(title), false);
});

test('classifies a missing accepted renter card without exposing its title', () => {
  const title = 'SIT Rollenprüfung n22-private-fixture';
  const hierarchy = `<hierarchy>${node('Kommend')}`
    + `${node('Ausstehend')}${node('Du hast keine kommenden Buchungen')}</hierarchy>`;
  const classification = renterAcceptedCardSurfaceClassification(hierarchy, title);
  assert.equal(
    classification,
    'title-0_simulation-0_empty-upcoming-1_empty-pending-0_upcoming-tab-1_pending-tab-1_requests-load-error-0',
  );
  assert.equal(classification.includes(title), false);
});

test('retries an idempotent Pixel state transition exactly once', async () => {
  let attempts = 0;
  const value = await retryIdempotentPixelState(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('transient surface');
    return 'settled';
  });
  assert.equal(value, 'settled');
  assert.equal(attempts, 2);

  attempts = 0;
  await assert.rejects(
    () => retryIdempotentPixelState(async () => {
      attempts += 1;
      throw new Error('persistent surface');
    }),
    /persistent surface/u,
  );
  assert.equal(attempts, 2);
});

test('restores an exact role with at most three deterministically checked attempts', async () => {
  let attempts = 0;
  let waits = 0;
  const restored = await restoreExactRoleWithBoundedRetries({
    operation: async () => {
      attempts += 1;
      return attempts === 3;
    },
    wait: async (milliseconds) => {
      assert.equal(milliseconds, 750);
      waits += 1;
    },
  });
  assert.equal(restored, true);
  assert.equal(attempts, 3);
  assert.equal(waits, 2);
});

test('reports the exact sanitized owner-publish UI subphase without leaking private detail', async () => {
  await assert.rejects(
    () => runOwnerPublishUiSubphase({
      label: 'wait-exact-draft',
      operation: async () => {
        throw new Error('private@example.test /Users/private/secret');
      },
    }),
    /Owner-publish subphase wait-exact-draft failed safely: safe diagnostic reason unavailable/u,
  );
  await assert.rejects(
    () => runOwnerPublishUiSubphase({
      label: 'unknown',
      operation: async () => true,
    }),
    /owner-publish UI subphase contract is invalid/u,
  );
});

test('closes the Pixel email-verified two-role journey and records only sanitized truth', async () => {
  const calls = [];
  const result = await runAndroidEmailVerifiedTwoRoleProductJourney({
    candidate,
    deviceSummary: { model: 'Pixel 7 Pro', physical: true },
    operations: passingOperations(calls),
    capturedAt: '2026-09-03T09:00:00.000Z',
  });
  assert.equal(result.status, 'passed-pixel-email-verified-two-role-product-journey');
  assert.deepEqual(calls, [
    'prepare',
    'publish',
    'verify-published',
    'simulate',
    'fcm',
    'owner',
    'renter',
    'retire',
    'restore-owner',
  ]);
  assert.equal(result.tests.distinctEmailVerifiedPrincipals, 'passed');
  assert.equal(result.tests.ownerDraftPublishThroughPixelUi, 'passed-server-confirmed-active');
  assert.equal(result.tests.principalSwitchIsolation, 'passed-owner-absent-under-renter');
  assert.equal(result.tests.controlledFcm, 'passed-foreground-background-terminated');
  assert.equal(result.boundaries.monetaryEffectMinor, 0);
  assert.equal(result.boundaries.listingLeftActive, false);
  assert.equal(result.boundaries.testBookingLeftActive, false);
  assert.equal(result.boundaries.containsAccountIdentity, false);
  assert.equal(result.boundaries.containsSecrets, false);
  assert.equal(JSON.stringify(result).includes('/private/'), false);
});

test('binds the same sanitized journey to the exact physical OnePlus profile', async () => {
  const calls = [];
  const result = await runAndroidEmailVerifiedTwoRoleProductJourney({
    candidate,
    deviceSummary: {
      manufacturer: 'OnePlus',
      model: 'CPH2581',
      physical: true,
    },
    operations: passingOperations(calls),
    deviceProfile: 'oneplus',
    capturedAt: '2026-09-10T21:00:00.000Z',
  });
  assert.equal(result.kind, 'android-oneplus-email-verified-two-role-product-journey');
  assert.equal(result.status, 'passed-oneplus-email-verified-two-role-product-journey');
  assert.equal(
    result.tests.ownerDraftPublishThroughOnePlusUi,
    'passed-server-confirmed-active',
  );
  assert.equal('ownerDraftPublishThroughPixelUi' in result.tests, false);
  assert.equal(result.boundaries.physicalPixelOnly, false);
  assert.equal(result.boundaries.physicalOnePlusOnly, true);
  assert.equal(result.boundaries.onePlusContacted, true);
  assert.equal(result.boundaries.monetaryEffectMinor, 0);
  assert.equal(result.boundaries.containsAccountIdentity, false);
  assert.equal(result.boundaries.containsSecrets, false);
});

test('rejects a OnePlus claim for any other physical Android model', async () => {
  const calls = [];
  await assert.rejects(
    () => runAndroidEmailVerifiedTwoRoleProductJourney({
      candidate,
      deviceSummary: {
        manufacturer: 'Google',
        model: 'Pixel 7 Pro',
        physical: true,
      },
      operations: passingOperations(calls),
      deviceProfile: 'oneplus',
    }),
    /exact physical CPH2581 device/u,
  );
  assert.deepEqual(calls, []);
});

test('retires prepared state and restores the owner after a product-surface failure', async () => {
  const calls = [];
  const operations = passingOperations(calls);
  operations.verifyRenter = async () => {
    calls.push('renter');
    throw new Error('The renter surface failed safely.');
  };
  await assert.rejects(
    () => runAndroidEmailVerifiedTwoRoleProductJourney({
      candidate,
      deviceSummary: { model: 'Pixel 7 Pro', physical: true },
      operations,
    }),
    /Product-journey phase renter-surface failed safely: The renter surface failed safely/u,
  );
  assert.deepEqual(calls.slice(-2), ['retire', 'restore-owner']);
});

test('reports a fail-closed cleanup error if both the journey and retirement fail', async () => {
  const calls = [];
  const operations = passingOperations(calls);
  operations.verifyOwner = async () => {
    calls.push('owner');
    throw new Error('Owner presentation failed safely.');
  };
  operations.retire = async () => {
    calls.push('retire');
    throw new Error('Retirement failed safely.');
  };
  await assert.rejects(
    () => runAndroidEmailVerifiedTwoRoleProductJourney({
      candidate,
      deviceSummary: { model: 'Pixel 7 Pro', physical: true },
      operations,
    }),
    /Cleanup also failed safely in retire/u,
  );
  assert.equal(calls.at(-1), 'restore-owner');
});
