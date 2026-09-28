import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  renterAcceptedCardSurfaceClassification,
  ownerNonBindingDetailVisible,
  renterBookingChatSurfaceClassification,
  renterBookingChatVisible,
  renterNonBindingDetailVisible,
  bindExactRole,
  restoreExactRoleWithFreshProfileRetry,
  restoreExactRoleWithBoundedRetries,
  retryIdempotentPixelState,
  waitForExactOwnerDraftWithBoundedRecovery,
  waitForPublishedServerReadback,
  waitForRenterAcceptedCardRecovery,
  runOwnerPublishUiSubphase,
  runAndroidEmailVerifiedTwoRoleProductJourney,
  tapLabel,
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

test('targets the last matching publish action when the obscured page repeats its label', () => {
  const taps = [];
  tapLabel(
    (_command, args) => {
      taps.push(args);
      return '';
    },
    'adb',
    { serial: 'PRIVATE-SERIAL' },
    '<hierarchy>'
      + '<node text="Veröffentlichen" content-desc="" bounds="[10,10][110,110]"/>'
      + '<node text="Veröffentlichen" content-desc="" bounds="[300,600][700,760]"/>'
      + '</hierarchy>',
    'Veröffentlichen',
    { chooseLast: true },
  );
  assert.deepEqual(taps, [[
    '-s', 'PRIVATE-SERIAL', 'shell', 'input', 'tap', '500', '680',
  ]]);
});

test('waits for the durable server publish readback after the UI action returns', async () => {
  let attempts = 0;
  const waits = [];
  const result = await waitForPublishedServerReadback({
    wait: async (milliseconds) => { waits.push(milliseconds); },
    verify: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('listing not active yet');
      return { status: 'pixel-owner-publish-server-confirmed' };
    },
  });
  assert.equal(result.status, 'pixel-owner-publish-server-confirmed');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [650, 650]);
});

test('fails closed after the bounded server publish readback window', async () => {
  let attempts = 0;
  await assert.rejects(
    () => waitForPublishedServerReadback({
      attempts: 2,
      intervalMs: 0,
      verify: async () => {
        attempts += 1;
        throw new Error('listing stayed draft');
      },
    }),
    /listing stayed draft/u,
  );
  assert.equal(attempts, 2);
});

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
    'title-0_role-title-prefix-0_simulation-0_empty-upcoming-1_empty-pending-0_upcoming-tab-1_pending-tab-1_loading-0_requests-load-error-0_requests-load-error-text-0_review-reminder-0',
  );
  assert.equal(classification.includes(title), false);
});

test('retries one fail-closed renter booking read and then accepts exact truth', async () => {
  const observations = [
    '<hierarchy><node text="Buchungen konnten nicht geladen werden"/></hierarchy>',
    '<hierarchy><node text="Buchungen werden geladen"/></hierarchy>',
    '<hierarchy><node text="exact accepted card"/></hierarchy>',
  ];
  let retries = 0;
  const result = await waitForRenterAcceptedCardRecovery({
    wait: async () => {},
    observe: async () => observations.shift(),
    retry: async () => { retries += 1; },
    matches: (value) => value.includes('exact accepted card'),
  });
  assert.equal(result.hierarchy?.includes('exact accepted card'), true);
  assert.equal(result.retryUsed, true);
  assert.equal(retries, 1);
});

test('stops after one bounded renter booking retry when the server stays unavailable', async () => {
  let observations = 0;
  let retries = 0;
  const result = await waitForRenterAcceptedCardRecovery({
    wait: async () => {},
    observe: async () => {
      observations += 1;
      return '<hierarchy>Buchungen konnten nicht geladen werden</hierarchy>';
    },
    retry: async () => { retries += 1; },
    matches: () => false,
    repeatedErrorLimit: 3,
  });
  assert.equal(result.hierarchy, null);
  assert.equal(result.retryUsed, true);
  assert.equal(retries, 1);
  assert.equal(observations, 4);
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

test('reacquires a fresh guest profile before retrying a partially advanced role restore', async () => {
  const profiles = [];
  let reacquisitions = 0;
  const restored = await restoreExactRoleWithFreshProfileRetry({
    initialProfileHierarchy: 'stale-guest-profile',
    reacquireProfile: async () => {
      reacquisitions += 1;
      return 'fresh-guest-profile';
    },
    restore: async (profile) => {
      profiles.push(profile);
      if (profile === 'stale-guest-profile') throw new Error('login surface advanced before timeout');
      return true;
    },
  });
  assert.equal(restored, true);
  assert.deepEqual(profiles, ['stale-guest-profile', 'fresh-guest-profile']);
  assert.equal(reacquisitions, 1);
});

test('bindExactRole reaches the fresh-profile retry path after a stuck login surface', async () => {
  const syntheticBindPassword = ['synthetic', 'bind', 'fixture'].join('-');
  let screen = 'main';
  let loginAttempts = 0;
  let focusedField = null;
  let emailEntered = false;
  let passwordEntered = false;
  const substages = [];
  const node = (label, bounds = '[0,0][500,100]', extra = '') => (
    `<node text="${label}" content-desc="" clickable="true" enabled="true" bounds="${bounds}"${extra}/>`
  );
  const main = () => '<hierarchy>'
    + node('Entdecken', '[0,2200][300,2400]')
    + node('Nachrichten', '[600,2200][900,2400]')
    + node('Mein SIT', '[900,2200][1200,2400]')
    + '</hierarchy>';
  const guestProfile = () => '<hierarchy>'
    + node('Anmelden', '[0,300][500,400]')
    + node('Konto erstellen', '[0,400][500,500]')
    + '</hierarchy>';
  const login = () => '<hierarchy>'
    + (loginAttempts === 1 ? node('Session prüfen…') : '')
    + `<node class="android.widget.EditText" hint="E-Mail" text="${emailEntered ? 'owner@example.invalid' : ''}" bounds="[0,100][500,200]"/>`
    + `<node class="android.widget.EditText" hint="Passwort" text="${passwordEntered ? '••••••••' : ''}" bounds="[0,200][500,300]"/>`
    + (emailEntered && passwordEntered ? node('Anmelden', '[0,300][500,400]') : '')
    + '</hierarchy>';
  const authenticatedProfile = () => '<hierarchy>'
    + node('Owner Fixture') + node('Meine Anzeigen') + node('Mietanfragen') + node('Abmelden')
    + '</hierarchy>';
  const hierarchy = () => {
    if (screen === 'main' || screen === 'main-authenticated') return main();
    if (screen === 'guest-profile') return guestProfile();
    if (screen === 'login-stuck' || screen === 'login-ready') return login();
    return authenticatedProfile();
  };
  const commandRunner = (_file, args) => {
    const command = args.slice(2);
    const joined = command.join(' ');
    if (joined === 'shell am force-stop com.shareittoo.app') return '';
    if (command[0] === 'shell' && command[1] === 'monkey') {
      screen = 'main';
      return 'Events injected: 1';
    }
    if (command[0] === 'shell' && command[1] === 'uiautomator' && command[2] === 'dump') return 'UI hierarchy dumped';
    if (command[0] === 'exec-out' && command[1] === 'cat') return hierarchy();
    if (command[0] === 'shell' && command[1] === 'rm' && command[2] === '-f') return '';
    if (command[0] === 'shell' && command[1] === 'input' && command[2] === 'tap') {
      const y = Number(command.at(-1));
      if (screen === 'main') screen = 'guest-profile';
      else if (screen === 'guest-profile') {
        loginAttempts += 1;
        screen = loginAttempts === 1 ? 'login-stuck' : 'login-ready';
      } else if (screen === 'login-ready') {
        if (y >= 100 && y < 200) focusedField = 'email';
        else if (y >= 200 && y < 300) focusedField = 'password';
        else if (emailEntered && passwordEntered) screen = 'main-authenticated';
      } else if (screen === 'main-authenticated') {
        screen = 'authenticated-profile';
      }
      return '';
    }
    if (command[0] === 'shell' && command[1] === 'input' && command[2] === 'text') {
      if (focusedField === 'email') emailEntered = true;
      if (focusedField === 'password') passwordEntered = true;
      return '';
    }
    if (joined === 'shell dumpsys input_method') return 'mInputShown=false mIsInputViewShown=false';
    throw new Error(`Unexpected fake ADB command: ${joined}`);
  };
  const result = await bindExactRole({
    vault: {
      accounts: [
        { role: 'owner', email: 'owner@example.invalid', password: syntheticBindPassword, displayName: 'Owner Fixture' },
        { role: 'renter', email: 'renter@example.invalid', password: syntheticBindPassword, displayName: 'Renter Fixture' },
      ],
    },
    role: 'owner',
    commandRunner,
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    wait: async () => {},
    onSubstage: (substage) => substages.push(substage),
  });
  assert.equal(result.account.displayName, 'Owner Fixture');
  assert.deepEqual(substages, [
    'guest-reset', 'guest-profile-read', 'login-restore',
    'guest-profile-read', 'login-restore', 'exact-principal',
  ]);
  assert.equal(loginAttempts, 2);
});

test('recovers one exact-draft wait miss with one saved-listings retap', async () => {
  let waits = 0;
  let reads = 0;
  let retaps = 0;
  const result = await waitForExactOwnerDraftWithBoundedRecovery({
    waitForDraft: async () => {
      waits += 1;
      if (waits === 1) throw new Error('first draft wait miss');
      return 'exact draft';
    },
    readHierarchy: async () => {
      reads += 1;
      return 'für später gespeichert';
    },
    hasSavedListingsTab: (hierarchy) => hierarchy.includes('für später gespeichert'),
    retapSavedListings: async () => { retaps += 1; },
  });
  assert.equal(result, 'exact draft');
  assert.equal(waits, 2);
  assert.equal(reads, 1);
  assert.equal(retaps, 1);
});

test('fails after two exact-draft misses without an extra retap', async () => {
  let waits = 0;
  let reads = 0;
  let retaps = 0;
  await assert.rejects(
    () => waitForExactOwnerDraftWithBoundedRecovery({
      waitForDraft: async () => {
        waits += 1;
        throw new Error('persistent draft wait miss');
      },
      readHierarchy: async () => {
        reads += 1;
        return 'für später gespeichert';
      },
      hasSavedListingsTab: () => true,
      retapSavedListings: async () => { retaps += 1; },
    }),
    /persistent draft wait miss/u,
  );
  assert.equal(waits, 2);
  assert.equal(reads, 1);
  assert.equal(retaps, 1);
});

test('does not read or retap after an exact-draft wait succeeds', async () => {
  let reads = 0;
  let retaps = 0;
  const result = await waitForExactOwnerDraftWithBoundedRecovery({
    waitForDraft: async () => 'exact draft',
    readHierarchy: async () => {
      reads += 1;
      return 'für später gespeichert';
    },
    hasSavedListingsTab: () => true,
    retapSavedListings: async () => { retaps += 1; },
  });
  assert.equal(result, 'exact draft');
  assert.equal(reads, 0);
  assert.equal(retaps, 0);
});

test('reuses the restored profile first and reacquires it before a retry', () => {
  const journey = readFileSync(
    new URL('../../tool/diagnose_android_email_verified_two_role_product_journey.mjs', import.meta.url),
    'utf8',
  );
  const bind = journey.slice(
    journey.indexOf('export async function bindExactRole'),
    journey.indexOf('async function publishOwnerDraftOnPixel'),
  );
  assert.doesNotMatch(bind, /launchCurrentHeadAndroidCandidate\(/u);
  assert.match(bind, /initialProfileHierarchy: guestProfile/u);
  assert.match(bind, /reacquireProfile: async \(\) =>/u);

  const logout = readFileSync(
    new URL('../../tool/diagnose_android_logout_lifecycle.mjs', import.meta.url),
    'utf8',
  );
  assert.match(logout, /initialProfileHierarchy = null/u);
  assert.match(logout, /initialMainHierarchy = null/u);
  assert.match(logout, /initialMainHierarchy: mainAfterLogin/u);
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
