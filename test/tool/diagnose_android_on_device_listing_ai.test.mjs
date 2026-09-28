import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  classifyPostPhotoPickerSurface,
  controlledMediaRow,
  cleanupListingAiLocalRecovery,
  formatListingAiFailureReport,
  formatPhotoPickerFailureReport,
  listingAiConsentSurfaceReady,
  listingAiDraftReady,
  listingAiDraftReadyHeading,
  listingAiDraftReadyProgressText,
  listingAiOnDeviceDisclosurePrefix,
  listingOpenDiagnosticVocabulary,
  listingOpenFailureDiagnostic,
  newestPhotoPickerTile,
  onDeviceListingAiUiProof,
  onDeviceListingAiViewportAttemptLimit,
  photoPickerDiagnosticVocabulary,
  photoPickerFailureDiagnostic,
  observedListingAiSignals,
  returnedToListingEditorAfterPhotoPicker,
  runAndroidOnDeviceListingAiAcceptance,
  stagingReadbackCommand,
  validateStagingDatabaseContainer,
  verifyStaging,
  waitForListingAiAnalyzeAction,
  waitForListingCreateAction,
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

const createListingScreenSource = readFileSync(
  new URL('../../lib/screens/create_listing_screen.dart', import.meta.url),
  'utf8',
);

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
  + node(listingAiDraftReadyProgressText)
  + node(listingAiDraftReadyHeading)
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

test('accepts the returned listing editor when the photo add tile is below the viewport', () => {
  const returned = '<hierarchy>'
    + '<node text="Neue Anzeige" content-desc="Neue Anzeige"/>'
    + '<node text="Ausgewählte Fotos analysieren" content-desc="Ausgewählte Fotos analysieren"/>'
    + '</hierarchy>';
  assert.equal(returnedToListingEditorAfterPhotoPicker(returned), true);
  assert.equal(returnedToListingEditorAfterPhotoPicker(
    '<hierarchy><node content-desc="Neue Anzeige erstellen"/></hierarchy>',
  ), false);
  assert.equal(returnedToListingEditorAfterPhotoPicker(
    '<hierarchy><node text="Fertig" content-desc="Fertig"/></hierarchy>',
  ), false);
});

test('classifies only a closed vocabulary after the Android photo picker', () => {
  assert.equal(classifyPostPhotoPickerSurface(
    '<hierarchy><node package="com.google.android.photopicker"/></hierarchy>',
  ), 'system-photo-picker');
  assert.equal(classifyPostPhotoPickerSurface(
    '<hierarchy>' + node('Fertig') + '</hierarchy>',
  ), 'photo-selection-confirmation');
  assert.equal(classifyPostPhotoPickerSurface(
    '<hierarchy>' + node('Entdecken') + '</hierarchy>',
  ), 'main-navigation');
  assert.equal(classifyPostPhotoPickerSurface(
    '<hierarchy><node text="private content"/></hierarchy>',
  ), 'unknown-safe-surface');
});

test('waits for exactly one delayed listing-create action after main navigation', async () => {
  const hierarchyWithoutCreateAction = '<hierarchy>' + node('Entdecken') + '</hierarchy>';
  const hierarchyWithDuplicateCreateActions = '<hierarchy>'
    + node('Entdecken') + node('Neue Anzeige erstellen') + node('Neue Anzeige erstellen')
    + '</hierarchy>';
  const hierarchyWithCreateAction = '<hierarchy>'
    + node('Entdecken') + node('Neue Anzeige erstellen') + '</hierarchy>';
  const hierarchySequence = [
    hierarchyWithoutCreateAction,
    hierarchyWithDuplicateCreateActions,
    hierarchyWithCreateAction,
  ];
  const waits = [];
  const commandCalls = [];
  const commandRunner = (_file, args) => {
    commandCalls.push(args);
    if (args.includes('exec-out') && args.includes('cat')) return hierarchySequence.shift();
    return '';
  };
  const result = await waitForListingCreateAction({
    commandRunner,
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    wait: async (intervalMs) => { waits.push(intervalMs); },
  });
  assert.equal(result, hierarchyWithCreateAction);
  assert.deepEqual(waits, [650, 650, 650]);
  assert.equal(commandCalls.filter((args) => args.includes('exec-out') && args.includes('cat')).length, 3);
});

test('finds a long offset disclosure surface and waits for delayed consent readiness', async () => {
  const buttonOnly = '<hierarchy>' + node('Ausgewählte Fotos analysieren') + '</hierarchy>';
  const longDisclosureOnly = '<hierarchy>'
    + node(`${listingAiOnDeviceDisclosurePrefix} Erkannte Objektbegriffe und Texte sowie die ausgewählten Anzeigenfotos werden an SIT übertragen, um einen bearbeitbaren Entwurf zu erstellen.`)
    + node('Nur 1–3 ausgewählte Fotos · ausdrücklicher Start · keine automatische Veröffentlichung')
    + '</hierarchy>';
  const disclosureAndButton = '<hierarchy>'
    + node(listingAiOnDeviceDisclosurePrefix)
    + node('Ausgewählte Fotos analysieren')
    + '</hierarchy>';
  assert.equal(listingAiConsentSurfaceReady(buttonOnly), false);
  assert.equal(listingAiConsentSurfaceReady(longDisclosureOnly), true);

  const hierarchySequence = [
    '<hierarchy>' + node(listingAiOnDeviceDisclosurePrefix) + '</hierarchy>',
    disclosureAndButton,
  ];
  const waits = [];
  const commandRunner = (_file, args) => {
    if (args.includes('exec-out') && args.includes('cat')) return hierarchySequence.shift();
    return '';
  };
  const result = await waitForListingAiAnalyzeAction({
    commandRunner,
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    wait: async (intervalMs) => { waits.push(intervalMs); },
  });
  assert.equal(result, disclosureAndButton);
  assert.deepEqual(waits, [260]);
});

test('maps every photo-picker action to fixed safe diagnostic codes', () => {
  const entries = Object.entries(photoPickerDiagnosticVocabulary);
  assert.ok(entries.length >= 2);
  for (const [substage, value] of entries) {
    const diagnostic = photoPickerFailureDiagnostic(substage);
    assert.deepEqual(diagnostic, {
      stage: 'photo-picker',
      substage,
      code: value.code,
      classification: value.classification,
    });
    assert.match(diagnostic.code, /^PHOTO_PICKER_[A-Z_]+$/u);
    assert.match(diagnostic.classification, /^[a-z-]+$/u);
    assert.doesNotMatch(JSON.stringify(diagnostic), /(?:\/|\\|@|https?:|private|secret|token|password|Foto|Galerie|SIT_WP112)/iu);
  }
  assert.equal(photoPickerFailureDiagnostic('private-label').substage, 'unknown');
});

test('renders a CLI-safe photo-picker report without original failure text', () => {
  const rendered = formatPhotoPickerFailureReport({
    stage: 'photo-picker',
    primary: {
      stage: 'photo-picker',
      substage: 'wait-system-picker',
      code: 'PHOTO_PICKER_SYSTEM_SURFACE_UNAVAILABLE',
      classification: 'system-picker-unavailable',
      original: '/Users/walid/private/photo.png?token=secret',
    },
    cleanup: 'failed',
    ownerRestore: 'passed',
    originalError: 'private diagnostic path and token=secret',
  });
  assert.equal(
    rendered,
    'ERROR: SIT stage photo-picker: PHOTO_PICKER_SYSTEM_SURFACE_UNAVAILABLE'
      + '/system-picker-unavailable/wait-system-picker cleanup=failed ownerRestore=passed',
  );
  assert.doesNotMatch(rendered, /(?:Users|token=|secret|private|\.png)/iu);
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

test('requires both real draft-ready signals and rejects the stale runner-only text', () => {
  assert.equal(listingAiDraftReady(successfulHierarchy), true);
  const staleOnly = '<hierarchy>'
    + node('Bearbeitbarer Entwurf ist bereit.')
    + node(listingAiDraftReadyHeading)
    + node('title: bitte prüfen')
    + node('category: bitte prüfen')
    + node('subcategory: bitte prüfen')
    + node('description: bitte prüfen')
    + node('projectTags: bitte prüfen')
    + node('useCases: bitte prüfen')
    + '</hierarchy>';
  assert.equal(listingAiDraftReady(staleOnly), false);
  assert.throws(() => onDeviceListingAiUiProof(staleOnly), /result is incomplete/u);
});

test('binds the physical runner draft-ready sentinels to the actual app UI source', () => {
  assert.equal(createListingScreenSource.includes(listingAiDraftReadyProgressText), true);
  assert.equal(createListingScreenSource.includes(listingAiDraftReadyHeading), true);
  assert.equal(createListingScreenSource.includes('Bearbeitbarer Entwurf ist bereit.'), false);
});

test('reports only sanitized field-language signals when chips are outside the viewport', () => {
  const signals = observedListingAiSignals(
    '<hierarchy><node text="Bearbeitbarer KI-Entwurf" content-desc=""/></hierarchy>',
  );
  assert.equal(signals.title, false);
  assert.equal(signals.category, false);
  assert.equal(signals.titel, false);
  assert.equal(Object.keys(signals).includes('account'), false);
});

test('keeps a staged physical-diagnostic failure intact for the CLI boundary', async () => {
  const staged = Object.assign(new Error('field collection failed'), {
    sitStage: 'collect-fields',
  });
  await assert.rejects(
    () => runAndroidOnDeviceListingAiAcceptance({
      candidate,
      deviceSummary: device,
      operations: {
        perform: async () => { throw staged; },
        verifyServer: async () => server,
        cleanup: async () => ({ localRecoveryCleared: true, controlledMediaRemoved: true }),
        restoreOwner: async () => true,
      },
    }),
    (error) => error === staged && error.sitStage === 'collect-fields',
  );
});

test('preserves the primary stage when cleanup and restore also run', async () => {
  const calls = [];
  await assert.rejects(
    () => runAndroidOnDeviceListingAiAcceptance({
      candidate,
      deviceSummary: device,
      operations: {
        currentStage: () => 'collect-fields',
        perform: async () => { throw new Error('unmarked field failure'); },
        verifyServer: async () => server,
        cleanup: async () => { calls.push('cleanup'); return { localRecoveryCleared: true, controlledMediaRemoved: true }; },
        restoreOwner: async () => { calls.push('restore'); return true; },
      },
    }),
    (error) => error?.sitStage === 'collect-fields',
  );
  assert.deepEqual(calls, ['cleanup', 'restore']);
});

test('reports a late analyze failure with sanitized cleanup and owner-restore outcomes', async () => {
  const calls = [];
  await assert.rejects(
    () => runAndroidOnDeviceListingAiAcceptance({
      candidate,
      deviceSummary: device,
      operations: {
        currentStage: () => 'analyze',
        perform: async () => { throw new Error('stale result text was not observed'); },
        verifyServer: async () => server,
        cleanup: async () => { calls.push('cleanup'); return { localRecoveryCleared: true, controlledMediaRemoved: true }; },
        restoreOwner: async () => { calls.push('restore'); return true; },
      },
    }),
    (error) => {
      assert.deepEqual(error.listingAiFailureReport, {
        schemaVersion: 1,
        stage: 'analyze',
        primary: {
          stage: 'analyze',
          code: 'LISTING_AI_ANALYZE_RESULT_UNAVAILABLE',
          classification: 'analyze-result-unavailable',
        },
        cleanup: 'passed',
        ownerRestore: 'passed',
      });
      assert.equal(
        formatListingAiFailureReport(error.listingAiFailureReport),
        'ERROR: SIT stage analyze: LISTING_AI_ANALYZE_RESULT_UNAVAILABLE'
          + '/analyze-result-unavailable cleanup=passed ownerRestore=passed',
      );
      return true;
    },
  );
  assert.deepEqual(calls, ['cleanup', 'restore']);
});

test('reports fixed sanitized open-listing substages with cleanup and owner restore', async () => {
  for (const [substage, value] of Object.entries(listingOpenDiagnosticVocabulary)) {
    const diagnostic = listingOpenFailureDiagnostic(substage);
    assert.deepEqual(diagnostic, {
      stage: 'open-listing',
      substage,
      code: value.code,
      classification: value.classification,
    });
    if (substage === 'unknown') continue;
    await assert.rejects(
      () => runAndroidOnDeviceListingAiAcceptance({
        candidate,
        deviceSummary: device,
        operations: {
          currentStage: () => 'open-listing',
          currentSubstage: () => substage,
          perform: async () => { throw new Error('/private/open-listing-surface'); },
          verifyServer: async () => server,
          cleanup: async () => ({ localRecoveryCleared: true, controlledMediaRemoved: true }),
          restoreOwner: async () => true,
        },
      }),
      (error) => {
        assert.deepEqual(error.listingAiFailureReport.primary, diagnostic);
        assert.equal(
          formatListingAiFailureReport(error.listingAiFailureReport),
          `ERROR: SIT stage open-listing: ${value.code}/${value.classification}/${substage}`
            + ' cleanup=passed ownerRestore=passed',
        );
        assert.doesNotMatch(JSON.stringify(error.listingAiFailureReport), /(?:private|open-listing-surface|\/)/iu);
        return true;
      },
    );
  }
});

test('cleans the opened listing surface even when analyze fails before a performed result exists', async () => {
  const calls = [];
  const localRecoveryCleared = await cleanupListingAiLocalRecovery({
    createSurfaceOpened: true,
    performed: null,
    commandRunner: 'runner',
    adbPath: 'adb',
    device: 'device',
    removeThumbnail: async (...args) => { calls.push(['remove', ...args]); return true; },
    navigateBack: (...args) => { calls.push(['back', ...args]); },
  });
  assert.equal(localRecoveryCleared, true);
  assert.deepEqual(calls, [
    ['remove', 'runner', 'adb', 'device'],
    ['back', 'runner', 'adb', 'device'],
  ]);
});

test('retains the primary photo-picker failure and separate cleanup and owner-restore outcomes', async () => {
  const primary = new Error('/private/user/photo.png leaked would be unsafe');
  const calls = [];
  await assert.rejects(
    () => runAndroidOnDeviceListingAiAcceptance({
      candidate,
      deviceSummary: device,
      operations: {
        currentStage: () => 'photo-picker',
        currentSubstage: () => 'wait-system-picker',
        perform: async () => { throw primary; },
        verifyServer: async () => server,
        cleanup: async () => { calls.push('cleanup'); throw new Error('/private/cleanup'); },
        restoreOwner: async () => { calls.push('restore'); throw new Error('/private/restore'); },
      },
    }),
    (error) => {
      assert.equal(error, primary);
      assert.equal(error.listingAiDiagnostic.code, 'PHOTO_PICKER_SYSTEM_SURFACE_UNAVAILABLE');
      assert.equal(error.listingAiDiagnostic.classification, 'system-picker-unavailable');
      assert.deepEqual(error.listingAiFailureReport, {
        schemaVersion: 1,
        stage: 'photo-picker',
        primary: error.listingAiDiagnostic,
        cleanup: 'failed',
        ownerRestore: 'failed',
      });
      assert.doesNotMatch(JSON.stringify(error.listingAiFailureReport), /(?:\/|\\|private|photo\.png)/iu);
      return true;
    },
  );
  assert.deepEqual(calls, ['cleanup', 'restore']);
});

test('keeps consent readiness rejection in the fixed photo-picker report', async () => {
  const calls = [];
  await assert.rejects(
    () => runAndroidOnDeviceListingAiAcceptance({
      candidate,
      deviceSummary: device,
      operations: {
        currentStage: () => 'photo-picker',
        currentSubstage: () => 'tap-analysis-consent',
        perform: async () => { throw new Error('/private/consent-surface'); },
        verifyServer: async () => server,
        cleanup: async () => { calls.push('cleanup'); return { localRecoveryCleared: true, controlledMediaRemoved: true }; },
        restoreOwner: async () => { calls.push('restore'); throw new Error('/private/owner-restore'); },
      },
    }),
    (error) => {
      assert.equal(error.sitStage, 'photo-picker');
      assert.deepEqual(error.listingAiFailureReport, {
        schemaVersion: 1,
        stage: 'photo-picker',
        primary: {
          stage: 'photo-picker',
          substage: 'tap-analysis-consent',
          code: 'PHOTO_PICKER_ANALYSIS_CONSENT_TAP_FAILED',
          classification: 'analysis-consent-tap-failed',
        },
        cleanup: 'passed',
        ownerRestore: 'failed',
      });
      assert.equal(
        formatPhotoPickerFailureReport(error.listingAiFailureReport),
        'ERROR: SIT stage photo-picker: PHOTO_PICKER_ANALYSIS_CONSENT_TAP_FAILED'
          + '/analysis-consent-tap-failed/tap-analysis-consent cleanup=passed ownerRestore=failed',
      );
      return true;
    },
  );
  assert.deepEqual(calls, ['cleanup', 'restore']);
});

test('uses a bounded viewport collection budget', () => {
  assert.equal(onDeviceListingAiViewportAttemptLimit, 24);
});

test('requires an explicit safe staging database target and threads it into readback', () => {
  assert.equal(validateStagingDatabaseContainer('sit-green-postgres-20260918011528-wp254'),
    'sit-green-postgres-20260918011528-wp254');
  assert.throws(
    () => validateStagingDatabaseContainer(undefined),
    /staging-database-container is required/u,
  );
  for (const unsafe of ['green; rm -rf /', 'green/../../postgres', 'green\npostgres', ' green']) {
    assert.throws(
      () => validateStagingDatabaseContainer(unsafe),
      /safe Docker container name/u,
    );
  }
  const invocation = stagingReadbackCommand('sit-green-postgres-20260918011528-wp254');
  assert.equal(invocation.command, 'ssh');
  assert.match(invocation.args.at(-1), /docker exec -i sit-green-postgres-20260918011528-wp254 /u);
  assert.doesNotMatch(invocation.args.at(-1), /shareittoo-staging-postgres/iu);
});

test('verifyStaging uses exactly the selected container rather than a legacy fallback', () => {
  const calls = [];
  const result = verifyStaging((command, args) => {
    calls.push({ command, args });
    return JSON.stringify({ recentDraftFound: true });
  }, '2026-09-21T10:00:00.000Z', 'green-db-bound-by-evidence');
  assert.deepEqual(result, { recentDraftFound: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'ssh');
  assert.match(calls[0].args.at(-1), /docker exec -i green-db-bound-by-evidence /u);
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
  assert.deepEqual(Object.keys(result).sort(), [
    'boundaries', 'capturedAt', 'candidate', 'device', 'fixture',
    'runtime', 'schemaVersion', 'status', 'tests', 'workPackage',
  ].sort());
  assert.equal(result.listingAiFailureReport, undefined);
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
