import assert from 'node:assert/strict';
import test from 'node:test';

import {
  exactSearchListingDetailVisible,
  manualSearchFormVisible,
  manualSearchQueryUnfocused,
  normalizedAndroidLabelVisible,
  runAndroidSearchSavedLifecycle,
} from '../../tool/diagnose_android_search_saved_lifecycle.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090506',
  commit: 'd350e3e26f03ec52eac1a86c1cf400148dfd50b1',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  android: { apkSha256: '1'.repeat(64) },
});

test('recognizes the real Pixel search form without requiring a hidden hint', () => {
  const hierarchy = [
    '<hierarchy>',
    '<node class="android.widget.EditText" text="" content-desc="" bounds="[89,378][1351,479]" enabled="true"/>',
    '<node class="android.view.View" text="" content-desc="Was" bounds="[83,611][153,656]"/>',
    '<node class="android.widget.EditText" text="" content-desc="" bounds="[363,608][1238,659]" enabled="true"/>',
    '<node class="android.view.View" text="" content-desc="Kategorie" bounds="[83,700][250,745]"/>',
    '<node class="android.view.View" text="" content-desc="Alle Kategorien" bounds="[363,700][900,760]"/>',
    '<node class="android.view.View" text="" content-desc="Suchen" bounds="[700,1800][1000,1900]"/>',
    '</hierarchy>',
  ].join('');
  assert.equal(manualSearchFormVisible(hierarchy), true);
  assert.equal(manualSearchQueryUnfocused(hierarchy), true);
  assert.equal(
    manualSearchQueryUnfocused(hierarchy.replace(
      'bounds="[363,608][1238,659]" enabled="true"',
      'bounds="[363,608][1238,659]" enabled="true" focused="true"',
    )),
    false,
  );
  assert.equal(manualSearchFormVisible(hierarchy.replace('content-desc="Kategorie"', 'content-desc=""')), false);
});

test('matches a category whose real Pixel semantics wrap onto two lines', () => {
  const hierarchy = '<node class="android.view.View" text="" '
    + 'content-desc="Werkzeuge&#10;&amp; Kleingeräte" bounds="[510,406][930,686]"/>';
  assert.equal(
    normalizedAndroidLabelVisible(hierarchy, 'Werkzeuge & Kleingeräte'),
    true,
  );
  assert.equal(normalizedAndroidLabelVisible(hierarchy, 'Technik & Elektronik'), false);
});

test('binds listing detail proof to the wrapped exact title and fixture location', () => {
  const hierarchy = [
    '<node class="android.view.View" text="" content-desc="SIT Rollenprüfung&#10;n22-safe-fixture" bounds="[50,500][1300,620]"/>',
    '<node class="android.view.View" text="" content-desc="Heilbronn, Deutschland" bounds="[50,630][1300,700]"/>',
    '<node class="android.widget.Button" text="" content-desc="Verfügbarkeit prüfen" bounds="[50,1800][1300,1950]"/>',
  ].join('');
  assert.equal(
    exactSearchListingDetailVisible(
      hierarchy,
      'SIT Rollenprüfung n22-safe-fixture',
    ),
    true,
  );
  assert.equal(
    exactSearchListingDetailVisible(hierarchy, 'SIT Rollenprüfung n22-other'),
    false,
  );
});

function passingOperations(calls) {
  return {
    prepare: async () => {
      calls.push('prepare');
      return { vaultFile: '/private/accounts.json' };
    },
    activate: async () => {
      calls.push('activate');
      return { status: 'isolated-product-journey-fixture-active' };
    },
    searchOpenAndSave: async () => {
      calls.push('search-open-save');
      return { status: 'pixel-renter-search-filter-open-save-passed' };
    },
    verifyRestartPersistence: async () => {
      calls.push('restart-persistence');
      return { status: 'pixel-renter-saved-item-present-stably' };
    },
    verifyOtherPrincipalIsolation: async () => {
      calls.push('owner-isolation');
      return { status: 'pixel-owner-saved-item-absent-stably' };
    },
    verifyRenterRestored: async () => {
      calls.push('renter-restored');
      return { status: 'pixel-renter-saved-item-present-stably' };
    },
    removeSaved: async () => {
      calls.push('remove');
      return { status: 'pixel-renter-exact-saved-item-removed' };
    },
    verifyRemoved: async () => {
      calls.push('verify-removed');
      return { status: 'pixel-renter-saved-item-absent-stably' };
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

test('closes exact Pixel search, saved-state persistence and account isolation', async () => {
  const calls = [];
  const result = await runAndroidSearchSavedLifecycle({
    candidate,
    deviceSummary: { model: 'Pixel 7 Pro', physical: true },
    operations: passingOperations(calls),
    capturedAt: '2026-09-05T20:00:00.000Z',
  });
  assert.equal(result.status, 'passed-pixel-search-saved-lifecycle');
  assert.deepEqual(calls, [
    'prepare',
    'activate',
    'search-open-save',
    'restart-persistence',
    'owner-isolation',
    'renter-restored',
    'remove',
    'verify-removed',
    'retire',
    'restore-owner',
  ]);
  assert.equal(result.tests.processRestartPersistence, 'passed-three-stable-settled-observations');
  assert.equal(result.tests.accountIsolation, 'passed-other-principal-three-stable-settled-observations');
  assert.equal(result.boundaries.unrelatedSavedItemsChanged, false);
  assert.equal(result.boundaries.bookingCreated, false);
  assert.equal(result.boundaries.containsSecrets, false);
  assert.equal(JSON.stringify(result).includes('/private/'), false);
});

test('retires the listing and restores the owner after a saved-state failure', async () => {
  const calls = [];
  const operations = passingOperations(calls);
  operations.verifyOtherPrincipalIsolation = async () => {
    calls.push('owner-isolation');
    throw new Error('Owner isolation did not settle safely.');
  };
  await assert.rejects(
    () => runAndroidSearchSavedLifecycle({
      candidate,
      deviceSummary: { model: 'Pixel 7 Pro', physical: true },
      operations,
    }),
    /did not settle safely/u,
  );
  assert.deepEqual(calls.slice(-2), ['retire', 'restore-owner']);
});
test('rejects an inexact lifecycle outcome and still cleans up', async () => {
  const calls = [];
  const operations = passingOperations(calls);
  operations.removeSaved = async () => {
    calls.push('remove');
    return { status: 'ambiguous' };
  };
  await assert.rejects(
    () => runAndroidSearchSavedLifecycle({
      candidate,
      deviceSummary: { model: 'Pixel 7 Pro', physical: true },
      operations,
    }),
    /did not close exactly/u,
  );
  assert.deepEqual(calls.slice(-2), ['retire', 'restore-owner']);
});
