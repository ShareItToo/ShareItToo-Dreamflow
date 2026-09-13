import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  classifyExactFilteredSearchResult,
  emptyExactSearchResultVisible,
  exactPrivateSearchClearAction,
  exactPrivateSearchInputActions,
  exactPrivateSearchQuery,
  exactFilteredSearchResultVisible,
  exactSearchListingCardVisible,
  exactSearchQueryValueVisible,
  exactSearchRoleProfileVisible,
  exactSearchListingDetailVisible,
  manualSearchFormVisible,
  manualSearchQueryUnfocused,
  normalizedAndroidLabelVisible,
  runAndroidSearchSavedLifecycle,
  unwindExactSearchToMainNavigation,
} from '../../tool/diagnose_android_search_saved_lifecycle.mjs';

test('permits only the exact run id or exact run-bound title as a search query', () => {
  const runId = 'n22-safe-fixture';
  const title = `SIT Meldung ${runId}`;
  assert.equal(exactPrivateSearchQuery({ runId, title }), runId);
  assert.equal(exactPrivateSearchQuery({ runId, title, searchTerm: title }), title);
  assert.deepEqual(exactPrivateSearchInputActions(title), [
    ['shell', 'input', 'text', 'SIT'],
    ['shell', 'input', 'keyevent', '62'],
    ['shell', 'input', 'text', 'Meldung'],
    ['shell', 'input', 'keyevent', '62'],
    ['shell', 'input', 'text', runId],
  ]);
  assert.equal(exactPrivateSearchInputActions(title).flat().includes('%s'), false);
  const clearAction = exactPrivateSearchClearAction();
  assert.deepEqual(clearAction.slice(0, 6), ['shell', 'input', 'keyevent', '--delay', '0', '123']);
  assert.equal(clearAction.filter((value) => value === '67').length, 160);
  assert.throws(
    () => exactPrivateSearchQuery({ runId, title, searchTerm: 'SIT Meldung' }),
    /exact private search term/u,
  );
  assert.throws(
    () => exactPrivateSearchQuery({ runId, title: 'fremde Anzeige', searchTerm: runId }),
    /exact private search expectation/u,
  );
  assert.throws(
    () => exactPrivateSearchInputActions('SIT  Meldung n22-safe-fixture'),
    /exact private search input/u,
  );
});

test('recognizes only the exact current search-field value', () => {
  const hierarchy = [
    '<node content-desc="Was" bounds="[10,100][100,160]"/>',
    '<node class="android.widget.EditText" text="SIT Meldung n22-safe-fixture" ',
    'bounds="[120,100][900,160]" enabled="true"/>',
  ].join('');
  assert.equal(
    exactSearchQueryValueVisible(hierarchy, 'SIT Meldung n22-safe-fixture'),
    true,
  );
  assert.equal(exactSearchQueryValueVisible(hierarchy, ''), false);
  assert.equal(exactSearchQueryValueVisible('<hierarchy/>', ''), false);
});

test('unwinds bounded search routes to the real main navigation without relaunching', async () => {
  const labels = ['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT'];
  const root = `<hierarchy>${labels.map((label) => `<node content-desc="${label}"/>`).join('')}</hierarchy>`;
  const dumps = ['<hierarchy><node content-desc="Suchergebnisse"/></hierarchy>', '<hierarchy><node content-desc="Was"/></hierarchy>', root];
  const calls = [];
  const hierarchy = await unwindExactSearchToMainNavigation({
    commandRunner: (_file, args) => {
      calls.push(args);
      if (args.includes('cat')) return dumps.shift();
      return '';
    },
    adbPath: 'adb',
    device: { serial: 'private-device' },
    wait: async (milliseconds) => assert.equal(milliseconds, 500),
  });
  assert.equal(hierarchy, root);
  assert.equal(calls.filter((args) => args.includes('keyevent')).length, 2);
  assert.equal(calls.some((args) => args.includes('force-stop')), false);
});

test('accepts a preserved search session only for the exact renter principal', () => {
  const hierarchy = [
    '<node content-desc="WP132 Renter"/>',
    '<node content-desc="Abmelden"/>',
  ].join('');
  assert.equal(
    exactSearchRoleProfileVisible(hierarchy, 'WP132 Renter', 'WP132 Owner'),
    true,
  );
  assert.equal(
    exactSearchRoleProfileVisible(
      `${hierarchy}<node content-desc="WP132 Owner"/>`,
      'WP132 Renter',
      'WP132 Owner',
    ),
    false,
  );
  assert.equal(
    exactSearchRoleProfileVisible(hierarchy, 'WP132 Owner', 'WP132 Renter'),
    false,
  );
});

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

test('accepts an exact filtered result whose long title semantics wrap on Pixel', () => {
  const title = 'SIT Sichtbarkeit n22-safe-fixture';
  const favorite = `Unter Gemerkt speichern: ${title}`;
  const wrappedTitle = title.replace(' ', '&#10;');
  const hierarchy = [
    '<node content-desc="Suchergebnisse"/>',
    `<node content-desc="Anzeige öffnen: ${wrappedTitle}"/>`,
    `<node content-desc="Unter Gemerkt speichern: ${wrappedTitle}"/>`,
  ].join('');
  assert.equal(
    exactFilteredSearchResultVisible(hierarchy, { title, expectedFavoriteLabel: favorite }),
    true,
  );
  assert.equal(
    exactFilteredSearchResultVisible(
      `${hierarchy}<node class="android.widget.ProgressBar"/>`,
      { title, expectedFavoriteLabel: favorite },
    ),
    false,
  );
  assert.equal(exactSearchListingCardVisible(hierarchy, title, favorite), true);
  assert.equal(
    exactSearchListingCardVisible(
      '<node content-desc="Anzeige öffnen: SIT Sichtbarkeit&#10;n22-safe-fixture"/>',
      title,
      null,
    ),
    true,
  );
  assert.equal(
    exactSearchListingCardVisible(hierarchy, title, `Aus Gemerkt entfernen: ${title}`),
    false,
  );
  assert.equal(
    exactFilteredSearchResultVisible(
      '<node content-desc="Suchergebnisse"/><node content-desc="Anzeige öffnen: SIT Sichtbarkeit&#10;n22-safe-fixture"/>',
      { title, expectedFavoriteLabel: null },
    ),
    true,
  );
  assert.equal(
    classifyExactFilteredSearchResult(hierarchy, { title, expectedFavoriteLabel: favorite }),
    'header1-open1-favorite1-saved0-cards1-progress0-error0-empty0-savederror0',
  );
  assert.equal(
    classifyExactFilteredSearchResult(
      '<node content-desc="Suchergebnisse"/><node content-desc="Es gibt noch keinen Artikel zu deiner Suche. Komm bald wieder!"/>',
      { title, expectedFavoriteLabel: favorite },
    ),
    'header1-open0-favorite0-saved0-cards0-progress0-error0-empty1-savederror0',
  );
});

test('accepts only a settled empty exact search result', () => {
  const title = 'SIT Meldung n22-safe-fixture';
  const empty = [
    '<node content-desc="Suchergebnisse"/>',
    '<node content-desc="Es gibt noch keinen Artikel zu deiner Suche. Komm bald wieder!"/>',
  ].join('');
  assert.equal(emptyExactSearchResultVisible(empty, title), true);
  assert.equal(emptyExactSearchResultVisible(`${empty}<node content-desc="${title}"/>`, title), false);
  assert.equal(emptyExactSearchResultVisible(`${empty}<node class="android.widget.ProgressBar"/>`, title), false);
  assert.equal(emptyExactSearchResultVisible('<node content-desc="Suche nicht erreichbar"/>', title), false);
});

test('keeps empty-result timeout diagnostics sanitized and state-based', () => {
  const source = readFileSync(
    'tool/diagnose_android_search_saved_lifecycle.mjs',
    'utf8',
  );
  assert.match(
    source,
    /label: 'empty exact filtered search result'[\s\S]*?catch \{[\s\S]*?classifyExactFilteredSearchResult\([\s\S]*?expectedFavoriteLabel: null/u,
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
