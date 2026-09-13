#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  bindExactRole,
  containsAllLabels,
  openMainDestination,
  tapClosestToLabel,
  tapLabel,
  waitForHierarchy,
} from './diagnose_android_email_verified_two_role_product_journey.mjs';
import {
  hasExactOwnerBlockConfirmation,
} from './diagnose_android_report_block_interactions.mjs';
import {
  openExactSearch,
} from './diagnose_android_search_saved_lifecycle.mjs';
import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  verifyCurrentHeadAndroidInstalledCandidate,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  readEmailVerifiedJourneyVault,
} from './run_staging_email_verified_two_role_journey.mjs';
import {
  cleanupStagingReportBlockFixture,
  inspectStagingReportBlockFixture,
  markStagingReportBlockPixelRestored,
  readStagingReportBlockJournal,
} from './run_staging_report_block_fixture.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';
import {
  assertCurrentCandidateNoPostCandidateMobileSourceDrift,
  collectCurrentCandidateDriftPaths,
  validateCurrentPrivateAndroidCandidate,
} from './run_n28_current_candidate_pixel_surface_matrix.mjs';

function fail(message) {
  throw new Error(message);
}

function sanitizedFailure(error) {
  const detail = typeof error?.message === 'string' ? error.message.trim() : '';
  if (detail.length === 0 || detail.length > 300
      || /(?:@|https?:\/\/|\/Users\/|\bn22-|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|fixture identifier)/iu.test(detail)
      || !/^[A-Za-z0-9_ .,:;()[\]'/?-]+$/u.test(detail)) {
    return 'safe diagnostic reason unavailable';
  }
  return detail;
}

function exact(value, expected, label) {
  if (value !== expected) fail(`The ${label} result is incomplete or ambiguous.`);
}

export function exactMessageListingVisible(hierarchy, exactTitle) {
  return currentHeadAndroidNamedNodes(hierarchy, exactTitle).length > 0
    || currentHeadAndroidNamedNodes(hierarchy, `· ${exactTitle}`).length > 0;
}

const exactSearchStages = new Set([
  'preflight-target',
  'preflight-companion',
  'action-target',
  'blocked-target',
  'blocked-companion',
  'restored-target',
  'restored-companion',
]);

export function classifyWp132ExactSearchFailure(error) {
  const message = String(error?.message ?? '');
  const resultState = /^The exact filtered search result did not settle \(([a-z0-9-]+)\)\.$/u
    .exec(message)?.[1] ?? null;
  if (resultState !== null) return `exact-result-${resultState}`;
  if (message === 'The exact search principal became unauthenticated.') {
    return 'principal-unauthenticated';
  }
  const safeSurfaceStages = new Set([
    'exact search main navigation',
    'preserved exact search principal',
    'Entdecken destination',
    'settled public catalog',
    'manual search form',
    'exact search query cleared',
    'exact search query entered',
    'search category selector',
    'unfocused search query',
    'search category choice',
    'filtered search form',
    'empty exact filtered search result',
  ]);
  const surface = /^The sanitized ([A-Za-z0-9 -]+) surface did not appear\.$/u
    .exec(message)?.[1] ?? null;
  if (safeSurfaceStages.has(surface)) return surface.replaceAll(' ', '-').toLowerCase();
  const safeActionFailures = new Map([
    ['The sanitized search-query anchor is unavailable.', 'search-query-anchor-unavailable'],
    ['The sanitized search-query editor is unavailable.', 'search-query-editor-unavailable'],
    ['The sanitized normalized-label action is unavailable.', 'normalized-label-action-unavailable'],
  ]);
  return safeActionFailures.get(message) ?? 'session-or-navigation';
}

async function exactWp132Search({ stage, ...options }) {
  if (!exactSearchStages.has(stage)) fail('The WP132 exact-title search stage is invalid.');
  try {
    return await openExactSearch(options);
  } catch (error) {
    const reason = classifyWp132ExactSearchFailure(error);
    fail(`The WP132 ${stage} exact-title search failed at ${reason}.`);
  }
}

async function scrollToListingReportAction({
  commandRunner, adbPath, device, wait,
}) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(hierarchy, 'Melden').length === 1) {
      return hierarchy;
    }
    if (currentHeadAndroidNamedNodes(hierarchy, 'Anzeigenoptionen').length === 0) {
      fail('The sanitized listing options surface closed before the report action was reachable.');
    }
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'swipe', '540', '1800', '540', '700', '320',
    ]);
    await wait(400);
  }
  fail('The sanitized listing report action was not reachable after bounded scrolling.');
}

function exactPublicOwnerProfileVisible(hierarchy, ownerName) {
  return currentHeadAndroidNamedNodes(hierarchy, ownerName).length > 0
    && currentHeadAndroidNamedNodes(hierarchy, 'Mehr Optionen').length >= 1;
}

async function openExactPublicOwnerProfile({
  commandRunner, adbPath, device, wait, ownerName,
}) {
  let hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, attempts: 48,
    label: 'exact public owner profile outcome',
    predicate: (value) => (
      exactPublicOwnerProfileVisible(value, ownerName)
        || value.includes('Profil konnte nicht geladen werden')
    ),
  });
  if (exactPublicOwnerProfileVisible(hierarchy, ownerName)) return hierarchy;
  if (currentHeadAndroidNamedNodes(hierarchy, 'Erneut laden').length !== 1) {
    fail('The public owner profile failed without an exact retry action.');
  }
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Erneut laden');
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, attempts: 48,
    label: 'exact public owner profile after bounded retry',
    predicate: (value) => exactPublicOwnerProfileVisible(value, ownerName),
  });
  return hierarchy;
}

async function settledMessages({
  commandRunner, adbPath, device, wait, exactTitle, visible,
}) {
  let hierarchy = await openMainDestination({
    commandRunner, adbPath, device, wait, label: 'Nachrichten',
  });
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    attempts: 48,
    label: 'settled messages',
    predicate: (value) => (
      currentHeadAndroidNamedNodes(value, 'Nachrichten-Einstellungen').length > 0
        && currentHeadAndroidNamedNodes(value, 'Alle').length > 0
        && !value.includes('class="android.widget.ProgressBar"')
        && currentHeadAndroidNamedNodes(
          value,
          'Nachrichten konnten nicht sicher geladen werden.',
        ).length === 0
    ),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Alle');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    attempts: 48,
    label: visible ? 'exact message visible' : 'exact message absent',
    predicate: (value) => (
      currentHeadAndroidNamedNodes(value, 'Nachrichten-Einstellungen').length > 0
        && !value.includes('class="android.widget.ProgressBar"')
        && currentHeadAndroidNamedNodes(
          value,
          'Nachrichten konnten nicht sicher geladen werden.',
        ).length === 0
        && exactMessageListingVisible(value, exactTitle) === visible
    ),
  });
  return hierarchy;
}

async function openBlockedUsers({ commandRunner, adbPath, device, wait }) {
  let hierarchy = await openMainDestination({
    commandRunner, adbPath, device, wait, label: 'Mein SIT',
  });
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'authenticated profile',
    predicate: (value) => containsAllLabels(value, ['Meine Anzeigen', 'Abmelden', 'Suchen']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Suchen');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'profile search',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Suche schließen').length > 0,
  });
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'text', 'Blockierte%sNutzer',
  ]);
  currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '66']);
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    attempts: 48,
    label: 'blocked users',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Blockierte Nutzer').length > 0,
  });
}

async function reportAndBlock({
  journalFile, commandRunner, adbPath, device, wait,
}) {
  const { journal } = readStagingReportBlockJournal(journalFile);
  const { vault } = readEmailVerifiedJourneyVault(journal.journeyVaultFile);
  const ownerName = vault.accounts.find((entry) => entry.role === 'owner')?.displayName
    ?? fail('The exact WP132 owner is unavailable.');
  await bindExactRole({ vault, role: 'renter', commandRunner, adbPath, device, wait });
  await settledMessages({
    commandRunner,
    adbPath,
    device,
    wait,
    exactTitle: vault.realTwoRoleJourney.title,
    visible: true,
  });
  let { hierarchy } = await exactWp132Search({
    stage: 'preflight-target',
    vaultFile: journal.journeyVaultFile,
    exactTitle: journal.targetListing.title,
    searchTerm: journal.targetListing.title,
    expectedSaved: false,
    bindRole: false,
    requireFavoriteState: false,
    commandRunner,
    adbPath,
    device,
    wait,
  });
  await exactWp132Search({
    stage: 'preflight-companion',
    vaultFile: journal.journeyVaultFile,
    exactTitle: journal.companionListing.title,
    searchTerm: journal.companionListing.title,
    expectedSaved: false,
    bindRole: false,
    requireFavoriteState: false,
    commandRunner,
    adbPath,
    device,
    wait,
  });
  ({ hierarchy } = await exactWp132Search({
    stage: 'action-target',
    vaultFile: journal.journeyVaultFile,
    exactTitle: journal.targetListing.title,
    searchTerm: journal.targetListing.title,
    expectedSaved: false,
    bindRole: false,
    requireFavoriteState: false,
    commandRunner,
    adbPath,
    device,
    wait,
  }));
  tapLabel(
    commandRunner,
    adbPath,
    device,
    hierarchy,
    `Anzeigenoptionen: ${journal.targetListing.title}`,
  );
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'listing options',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Anzeigenoptionen').length >= 1,
  });
  hierarchy = await scrollToListingReportAction({
    commandRunner, adbPath, device, wait,
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Melden');
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'listing report form',
    predicate: (value) => containsAllLabels(value, ['Anzeige melden', 'Betrug / Täuschung']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Betrug / Täuschung');
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'listing report submit',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Meldung senden').length === 1,
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Meldung senden');
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, attempts: 48, label: 'listing report success',
    predicate: (value) => containsAllLabels(value, ['Meldung gesendet', 'Fertig']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Fertig');
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'search result after report',
    predicate: (value) => currentHeadAndroidNamedNodes(value, journal.targetListing.title).length > 0,
  });
  tapLabel(
    commandRunner,
    adbPath,
    device,
    hierarchy,
    `Anzeigenoptionen: ${journal.targetListing.title}`,
  );
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'listing owner profile action',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Vermieterprofil ansehen').length === 1,
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Vermieterprofil ansehen');
  hierarchy = await openExactPublicOwnerProfile({
    commandRunner, adbPath, device, wait, ownerName,
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Mehr Optionen');
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'owner-bound block action',
    predicate: (value) => currentHeadAndroidNamedNodes(value, `${ownerName} blockieren`).length === 1,
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, `${ownerName} blockieren`);
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'owner-bound block confirmation',
    predicate: (value) => hasExactOwnerBlockConfirmation(value, ownerName),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Blockieren', { chooseLast: true });
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, attempts: 48, label: 'owner-bound block success',
    predicate: (value) => containsAllLabels(
      value,
      [`Du hast ${ownerName} blockiert.`, 'Zu Entdecken'],
    ),
  });
  return { hierarchy, ownerName, messageTitle: vault.realTwoRoleJourney.title };
}

async function verifyBlockedAndUnblock({
  journalFile, blockSurface, ownerName, messageTitle,
  commandRunner, adbPath, device, wait,
}) {
  await inspectStagingReportBlockFixture({ journalFile, expectedPhase: 'blocked' });
  tapLabel(commandRunner, adbPath, device, blockSurface, 'Zu Entdecken');
  const { journal } = readStagingReportBlockJournal(journalFile);
  let { hierarchy } = await exactWp132Search({
    stage: 'blocked-target',
    vaultFile: journal.journeyVaultFile,
    exactTitle: journal.targetListing.title,
    searchTerm: journal.targetListing.title,
    expectedVisible: false,
    bindRole: false,
    requireFavoriteState: false,
    commandRunner,
    adbPath,
    device,
    wait,
  });
  await exactWp132Search({
    stage: 'blocked-companion',
    vaultFile: journal.journeyVaultFile,
    exactTitle: journal.companionListing.title,
    searchTerm: journal.companionListing.title,
    expectedVisible: false,
    bindRole: false,
    requireFavoriteState: false,
    commandRunner,
    adbPath,
    device,
    wait,
  });
  await settledMessages({
    commandRunner, adbPath, device, wait, exactTitle: messageTitle, visible: false,
  });
  hierarchy = await openBlockedUsers({ commandRunner, adbPath, device, wait });
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, attempts: 48, label: 'exact blocked owner entry',
    predicate: (value) => (
      currentHeadAndroidNamedNodes(value, ownerName).length > 0
        && currentHeadAndroidNamedNodes(value, 'Entblockieren').length > 0
    ),
  });
  tapClosestToLabel(
    commandRunner, adbPath, device, hierarchy, 'Entblockieren', ownerName,
  );
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'unblock confirmation',
    predicate: (value) => containsAllLabels(value, ['Nutzer entblockieren?', 'Entblockieren']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Entblockieren', { chooseLast: true });
  await waitForHierarchy({
    commandRunner, adbPath, device, wait, attempts: 48, label: 'empty blocked-user truth',
    predicate: (value) => currentHeadAndroidNamedNodes(
      value,
      'Du hast keine Nutzer blockiert.',
    ).length === 1,
  });
  await inspectStagingReportBlockFixture({ journalFile, expectedPhase: 'unblocked' });
  hierarchy = (await exactWp132Search({
    stage: 'restored-target',
    vaultFile: journal.journeyVaultFile,
    exactTitle: journal.targetListing.title,
    searchTerm: journal.targetListing.title,
    expectedSaved: false,
    bindRole: false,
    requireFavoriteState: false,
    commandRunner,
    adbPath,
    device,
    wait,
  })).hierarchy;
  await exactWp132Search({
    stage: 'restored-companion',
    vaultFile: journal.journeyVaultFile,
    exactTitle: journal.companionListing.title,
    searchTerm: journal.companionListing.title,
    expectedSaved: false,
    bindRole: false,
    requireFavoriteState: false,
    commandRunner,
    adbPath,
    device,
    wait,
  });
  return true;
}

export async function runCurrentCandidateReportBlockLifecycle({
  candidate,
  deviceSummary,
  operations,
  capturedAt = new Date().toISOString(),
} = {}) {
  if (candidate?.applicationId !== 'com.shareittoo.app'
      || candidate?.versionName !== '1.0.0'
      || candidate?.buildNumber !== '2026091306'
      || candidate?.commit !== 'a56570921ce47448b38324ee3208598a8f299ca7'
      || candidate?.android?.apkSha256 !== 'c921a34e446b4b06515b106a86ac5fa3f0df69f6a4b4c7c56fd12eb927fd183f') {
    fail('The WP132 candidate binding is not exact.');
  }
  if (deviceSummary?.model !== 'Pixel 7 Pro' || deviceSummary?.physical !== true) {
    fail('WP132 requires the physical Pixel 7 Pro.');
  }
  for (const name of ['exercise', 'cleanup', 'restoreOwner', 'markRestored']) {
    if (typeof operations?.[name] !== 'function') fail(`The WP132 ${name} operation is missing.`);
  }
  let primaryFailure = null;
  let exercised = false;
  let cleanup = null;
  let restored = false;
  try {
    exact(await operations.exercise(), true, 'physical report-block-unblock');
    exercised = true;
  } catch (error) {
    primaryFailure = error;
  }
  try {
    cleanup = await operations.cleanup();
  } catch (error) {
    if (primaryFailure === null) primaryFailure = error;
  }
  try {
    restored = await operations.restoreOwner();
  } catch (error) {
    if (primaryFailure === null) primaryFailure = error;
  }
  if (cleanup?.status === 'cleanup-server-confirmed-recovery-required' && restored === true) {
    try {
      await operations.markRestored();
    } catch (error) {
      if (primaryFailure === null) primaryFailure = error;
    }
  }
  if (primaryFailure !== null) throw primaryFailure;
  if (!exercised
      || cleanup?.status !== 'cleanup-server-confirmed-recovery-required'
      || cleanup.exactListingsEnded !== 3
      || cleanup.exactBlockCount !== 0
      || cleanup.retainedModerationReportCount !== 1
      || cleanup.exactRoleSessionsRevoked !== true
      || restored !== true) {
    fail('The WP132 physical lifecycle or reversible cleanup is incomplete.');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-wp132-current-candidate-report-block',
    status: 'passed-exact-current-pixel-report-block-restored',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      versionCode: candidate.buildNumber,
      sourceHead: candidate.commit,
      apkSha256: candidate.android.apkSha256,
      physicalPixelPackageMatched: true,
      postCandidateMobileSourceDrift: false,
    },
    pixel: {
      physical: true,
      model: 'Pixel 7 Pro',
      reportSubmittedThroughExactListingUi: true,
      reportAcceptedExactlyOnce: true,
      ownerBlockedThroughOwnerBoundUi: true,
      bothSameOwnerListingsHidden: true,
      exactCancelledChatHidden: true,
      blockedUsersEntryVisible: true,
      ownerUnblockedThroughExactEntryUi: true,
      serverConfirmedEmptyBlockTruth: true,
      bothSameOwnerListingsVisibleAgain: true,
    },
    cleanup: {
      exactListingsEnded: 3,
      exactListingsAbsentFromPublicCatalog: 3,
      temporaryBlockRemoved: true,
      moderationReportRetainedAsAudit: true,
      exactRoleSessionsRevoked: true,
      protectedOwnerSessionRestored: true,
      recoveryRequired: false,
      paymentEndpointCalled: false,
      contractCreated: false,
      reservationCreated: false,
      monetaryEffectMinor: 0,
    },
    boundaries: {
      stagingSyntheticDataOnly: true,
      productionChanged: false,
      googlePlayChanged: false,
      firebaseChanged: false,
      paymentProviderCalled: false,
      realMoneyUsed: false,
      onePlusContacted: false,
      pullRequestMerged: false,
      containsSecrets: false,
      containsAccountIdentifiers: false,
      containsFixtureIdentifiers: false,
      containsPrivateFilesystemPaths: false,
      containsRawDeviceIdentifiers: false,
    },
  });
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const phase = argumentValue(args, '--phase') ?? 'full';
  if (!['full', 'restore-only'].includes(phase)) fail('Unknown WP132 Pixel phase.');
  const root = resolve(argumentValue(args, '--root') ?? process.cwd());
  const journalFile = resolve(
    argumentValue(args, '--journal-file') ?? fail('--journal-file is required.'),
  );
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir') ?? fail('--candidate-dir is required.'),
  );
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const archive = await validatePrivateAndroidReleaseArchive({ root, candidateDirectory });
  const candidate = validateCurrentPrivateAndroidCandidate(archive);
  const drift = collectCurrentCandidateDriftPaths({
    root,
    candidateCommit: candidate.commit,
  });
  assertCurrentCandidateNoPostCandidateMobileSourceDrift(drift);
  const commandRunner = defaultCurrentHeadAndroidCommandRunner;
  const device = selectSinglePhysicalDevice(parseAdbDevices(
    commandRunner(adbPath, ['devices', '-l']),
  ));
  const deviceSummary = inspectPhysicalDevice({ commandRunner, adbPath, device });
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);
  const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
  if (phase === 'restore-only') {
    const { journal } = readStagingReportBlockJournal(journalFile);
    const { vault } = readEmailVerifiedJourneyVault(journal.journeyVaultFile);
    const bound = await bindExactRole({
      vault, role: 'owner', commandRunner, adbPath, device, wait,
    });
    if (currentHeadAndroidNamedNodes(bound.hierarchy, bound.account.displayName).length !== 1
        || currentHeadAndroidNamedNodes(bound.hierarchy, bound.other.displayName).length !== 0) {
      fail('The protected WP132 owner restoration is ambiguous.');
    }
    markStagingReportBlockPixelRestored({ journalFile });
    process.stdout.write(`${JSON.stringify({
      status: 'complete-restored',
      protectedOwnerSessionRestored: true,
      recoveryRequired: false,
      containsSecrets: false,
      containsAccountIdentifiers: false,
      containsFixtureIdentifiers: false,
    })}\n`);
    return;
  }
  const operations = {
    exercise: async () => {
      const block = await reportAndBlock({
        journalFile, commandRunner, adbPath, device, wait,
      });
      return verifyBlockedAndUnblock({
        journalFile,
        blockSurface: block.hierarchy,
        ownerName: block.ownerName,
        messageTitle: block.messageTitle,
        commandRunner,
        adbPath,
        device,
        wait,
      });
    },
    cleanup: () => cleanupStagingReportBlockFixture({ journalFile }),
    restoreOwner: async () => {
      const { journal } = readStagingReportBlockJournal(journalFile);
      const { vault } = readEmailVerifiedJourneyVault(journal.journeyVaultFile);
      const bound = await bindExactRole({
        vault, role: 'owner', commandRunner, adbPath, device, wait,
      });
      return currentHeadAndroidNamedNodes(bound.hierarchy, bound.account.displayName).length === 1
        && currentHeadAndroidNamedNodes(bound.hierarchy, bound.other.displayName).length === 0;
    },
    markRestored: () => markStagingReportBlockPixelRestored({ journalFile }),
  };
  const result = await runCurrentCandidateReportBlockLifecycle({
    candidate,
    deviceSummary,
    operations,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${sanitizedFailure(error)}\n`);
    process.exitCode = 1;
  });
}
