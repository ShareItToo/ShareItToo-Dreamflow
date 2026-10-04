#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  bindExactRole,
  containsAllLabels,
  openMainDestination,
  tapLabel,
  waitForHierarchy,
} from './diagnose_android_email_verified_two_role_product_journey.mjs';
import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
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
  inspectSyntheticReturnCaseRoleTruth,
  runSyntheticRoleBookingLifecycle,
} from './run_staging_synthetic_booking.mjs';
import {
  runIsolatedAndroidRoleBookingDiagnostic,
} from './run_isolated_android_role_booking_diagnostic.mjs';
import {
  assertCurrentCandidateNoPostCandidateMobileSourceDrift,
  collectCurrentCandidateDriftPaths,
  validateCurrentPrivateAndroidCandidate,
} from './run_n28_current_candidate_pixel_surface_matrix.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const safeDeviceFilename = 'SIT-WP32-SAFE.png';
const safeDeviceFile = `/sdcard/Download/${safeDeviceFilename}`;
const returnCaseDescription = 'Kontrollierter SIT Rueckgabeprueffall';
const contestedAmount = '1.00';

function fail(message) {
  throw new Error(message);
}

function stagedError(message, stage) {
  const error = new Error(message);
  error.sitStage = stage;
  return error;
}

function sanitizedFailure(error) {
  const detail = typeof error?.message === 'string' ? error.message.trim() : '';
  if (detail.length === 0 || detail.length > 340
      || /(?:@|https?:\/\/|\/Users\/|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|fixture identifier|device serial)/iu.test(detail)
      || !/^[A-Za-z0-9_ .,:;()[\]'/-]+$/u.test(detail)) {
    return 'safe diagnostic reason unavailable';
  }
  return detail;
}

function bounds(node, label) {
  const match = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (match === null) fail(`The sanitized ${label} bounds are invalid.`);
  const box = {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4]),
  };
  if (!(box.right > box.left && box.bottom > box.top)) {
    fail(`The sanitized ${label} bounds are empty.`);
  }
  return box;
}

function hierarchyNodes(hierarchy) {
  return String(hierarchy).match(/<node\b[^>]*>/gu) ?? [];
}

export function topRightClickableActionPoint(hierarchy) {
  const nodes = hierarchyNodes(hierarchy)
    .filter((node) => (
      currentHeadAndroidNodeAttribute(node, 'clickable') === 'true'
        && currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false'
    ))
    .map((node) => ({ node, box: bounds(node, 'top-right action') }))
    .filter(({ box }) => box.top < 360 && box.left >= 540)
    .toSorted((left, right) => right.box.right - left.box.right);
  const selected = nodes[0] ?? fail('The sanitized top-right booking action is unavailable.');
  return Object.freeze({
    x: Math.floor((selected.box.left + selected.box.right) / 2),
    y: Math.floor((selected.box.top + selected.box.bottom) / 2),
  });
}

function tapTopRightAction(commandRunner, adbPath, device, hierarchy) {
  const point = topRightClickableActionPoint(hierarchy);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

function enabledEditFields(hierarchy) {
  return hierarchyNodes(hierarchy)
    .filter((node) => (
      currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText'
        && currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false'
    ))
    .map((node) => ({ node, box: bounds(node, 'return-case text field') }))
    .toSorted((left, right) => left.box.top - right.box.top);
}

function tapNode(commandRunner, adbPath, device, entry) {
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'input',
    'tap',
    String(Math.floor((entry.box.left + entry.box.right) / 2)),
    String(Math.floor((entry.box.top + entry.box.bottom) / 2)),
  ]);
}

function enterText(commandRunner, adbPath, device, value) {
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'text', value.replaceAll(' ', '%s'),
  ]);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', 'KEYCODE_BACK',
  ]);
}

function swipeUp(commandRunner, adbPath, device) {
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'swipe', '540', '1720', '540', '520', '320',
  ]);
}

async function scrollUntil({
  commandRunner,
  adbPath,
  device,
  wait,
  predicate,
  label,
  attempts = 8,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (predicate(hierarchy)) return hierarchy;
    swipeUp(commandRunner, adbPath, device);
    await wait(450);
  }
  fail(`The sanitized ${label} surface did not become reachable.`);
}

function readReturnCaseVault(vaultFile) {
  let vault;
  try {
    vault = JSON.parse(readFileSync(vaultFile, 'utf8'));
  } catch {
    fail('The isolated return-case vault is invalid.');
  }
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-synthetic-account-vault'
      || vault?.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || vault?.stripeLivemode !== false
      || !Array.isArray(vault?.accounts)
      || vault.accounts.length !== 2
      || new Set(vault.accounts.map((entry) => entry?.role)).size !== 2
      || !vault.accounts.every((entry) => ['owner', 'renter'].includes(entry?.role))) {
    fail('The isolated return-case vault is not a safe two-role Staging fixture.');
  }
  return vault;
}

async function openCompletedBooking({
  vaultFile,
  role,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const vault = readReturnCaseVault(vaultFile);
  const title = vault.syntheticBooking?.title
    ?? fail('The isolated completed booking title is unavailable.');
  if (vault.syntheticBooking?.workflowStatus !== 'completed') {
    fail('The isolated booking is not completed.');
  }
  const bound = await bindExactRole({
    vault,
    role,
    commandRunner,
    adbPath,
    device,
    wait,
  });
  let hierarchy;
  if (role === 'owner') {
    tapLabel(commandRunner, adbPath, device, bound.hierarchy, 'Mietanfragen');
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'WP32 owner rental hub',
      predicate: (value) => containsAllLabels(value, ['Mietanfragen', 'Abgeschlossen']),
    });
  } else {
    hierarchy = await openMainDestination({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'Buchungen',
    });
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'WP32 renter booking hub',
      predicate: (value) => containsAllLabels(value, ['Meine Buchungen', 'Abgeschlossen']),
    });
  }
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Abgeschlossen');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: `WP32 ${role} completed booking`,
    attempts: 50,
    predicate: (value) => currentHeadAndroidNamedNodes(value, title).length > 0,
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, title);
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: `WP32 ${role} booking detail`,
    attempts: 50,
    predicate: (value) => {
      try {
        return currentHeadAndroidNamedNodes(value, title).length > 0
          && topRightClickableActionPoint(value) !== null;
      } catch {
        return false;
      }
    },
  });
  return { hierarchy, title };
}

async function openBookingMenu({
  hierarchy,
  commandRunner,
  adbPath,
  device,
  wait,
  expectReturnCase,
}) {
  tapTopRightAction(commandRunner, adbPath, device, hierarchy);
  const menu = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP32 booking action menu',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Problem melden').length > 0,
  });
  const returnCaseVisible = currentHeadAndroidNamedNodes(
    menu,
    'Rückgabe-Prüffall eröffnen',
  ).length === 1;
  if (returnCaseVisible !== expectReturnCase) {
    fail('The return-case action eligibility does not match authoritative booking truth.');
  }
  return menu;
}

export async function verifyReturnCaseEntryPointForRole({
  vaultFile,
  role,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const opened = await openCompletedBooking({
    vaultFile, role, commandRunner, adbPath, device, wait,
  });
  await openBookingMenu({
    hierarchy: opened.hierarchy,
    commandRunner,
    adbPath,
    device,
    wait,
    expectReturnCase: true,
  });
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', 'KEYCODE_BACK',
  ]);
  return Object.freeze({
    status: 'return-case-entry-point-passed',
    role,
    supportActionDistinct: true,
    returnCaseActionVisible: true,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

async function selectPrivateEvidence({
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const picker = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP32 private evidence picker',
    attempts: 50,
    predicate: (value) => currentHeadAndroidNamedNodes(value, safeDeviceFilename).length > 0,
  });
  tapLabel(commandRunner, adbPath, device, picker, safeDeviceFilename);
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP32 private evidence upload',
    attempts: 90,
    predicate: (value) => currentHeadAndroidNamedNodes(value, safeDeviceFilename).length > 0
      && value.includes('com.shareittoo.app'),
  });
}

export async function openReturnCaseOnPixel({
  vaultFile,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const opened = await openCompletedBooking({
    vaultFile,
    role: 'renter',
    commandRunner,
    adbPath,
    device,
    wait,
  });
  let hierarchy = await openBookingMenu({
    hierarchy: opened.hierarchy,
    commandRunner,
    adbPath,
    device,
    wait,
    expectReturnCase: true,
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Rückgabe-Prüffall eröffnen');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP32 return-case form',
    attempts: 45,
    predicate: (value) => containsAllLabels(value, [
      'Problem melden', 'Wähle ein Problem', 'Schaden melden',
    ]),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Schaden melden');

  hierarchy = await scrollUntil({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP32 return-case description',
    predicate: (value) => enabledEditFields(value).length > 0,
  });
  tapNode(commandRunner, adbPath, device, enabledEditFields(hierarchy)[0]);
  enterText(commandRunner, adbPath, device, returnCaseDescription);

  hierarchy = await scrollUntil({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP32 contested amount',
    predicate: (value) => enabledEditFields(value).length >= 2
      || currentHeadAndroidNamedNodes(value, 'z. B. 12,50').length > 0,
  });
  const amountFields = enabledEditFields(hierarchy);
  tapNode(commandRunner, adbPath, device, amountFields.at(-1)
    ?? fail('The sanitized WP32 amount field is unavailable.'));
  enterText(commandRunner, adbPath, device, contestedAmount);

  hierarchy = await scrollUntil({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP32 evidence action',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Foto hinzufügen').length > 0,
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Foto hinzufügen');
  hierarchy = await selectPrivateEvidence({ commandRunner, adbPath, device, wait });
  hierarchy = await scrollUntil({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP32 submit action',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Meldung senden').length > 0,
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Meldung senden');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP32 accepted return case',
    attempts: 100,
    predicate: (value) => containsAllLabels(value, [
      'Prüffall eröffnet', 'Der Prüffall wurde eindeutig angelegt.', 'OK',
    ]),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'OK');
  return Object.freeze({
    status: 'pixel-return-case-server-accepted',
    actingRole: 'renter',
    exactOwnedRouteUsed: true,
    privateEvidenceCount: 1,
    contestedAuthorizedMinor: 100,
    additionalChargeMinor: 0,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

export async function verifyReturnCasePostStateForRole({
  vaultFile,
  role,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const opened = await openCompletedBooking({
    vaultFile, role, commandRunner, adbPath, device, wait,
  });
  if (currentHeadAndroidNamedNodes(opened.hierarchy, 'In Prüfung').length === 0) {
    fail(`The ${role} return-case review state is not visible.`);
  }
  const menu = await openBookingMenu({
    hierarchy: opened.hierarchy,
    commandRunner,
    adbPath,
    device,
    wait,
    expectReturnCase: false,
  });
  if (currentHeadAndroidNamedNodes(menu, 'Problem melden').length === 0) {
    fail('The distinct general support action disappeared after return-case creation.');
  }
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', 'KEYCODE_BACK',
  ]);
  return Object.freeze({
    status: 'return-case-post-state-passed',
    role,
    needsReviewVisible: true,
    duplicateEntryPointAbsent: true,
    supportActionStillVisible: true,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

export async function runWp32ReturnCaseLifecycle({
  candidate,
  deviceSummary,
  sourceDrift,
  operations,
  capturedAt = new Date().toISOString(),
} = {}) {
  const required = [
    'prepareDeviceFile',
    'completeFixture',
    'verifyEntryPoint',
    'openCase',
    'inspectServer',
    'verifyPostState',
    'removeDeviceFile',
    'restoreOwner',
  ];
  if (operations === null || typeof operations !== 'object'
      || required.some((key) => typeof operations[key] !== 'function')) {
    fail('The WP32 return-case operations are incomplete.');
  }
  let deviceFilePrepared = false;
  let lifecycle;
  let ownerEntry;
  let renterEntry;
  let opened;
  let server;
  let renterPost;
  let ownerPost;
  let ownerRestored = false;
  let primaryFailure = null;
  let cleanupFailure = null;
  try {
    await operations.prepareDeviceFile();
    deviceFilePrepared = true;
    lifecycle = await operations.completeFixture();
    ownerEntry = await operations.verifyEntryPoint('owner');
    renterEntry = await operations.verifyEntryPoint('renter');
    opened = await operations.openCase();
    server = await operations.inspectServer();
    renterPost = await operations.verifyPostState('renter');
    ownerPost = await operations.verifyPostState('owner');
  } catch (error) {
    primaryFailure = error;
  } finally {
    try {
      await operations.removeDeviceFile();
    } catch (error) {
      cleanupFailure = error;
    }
    try {
      ownerRestored = await operations.restoreOwner() === true;
    } catch (error) {
      cleanupFailure ??= error;
    }
  }
  if (primaryFailure !== null) {
    if (cleanupFailure !== null) {
      throw stagedError(
        `${sanitizedFailure(primaryFailure)} Cleanup also failed safely: ${sanitizedFailure(cleanupFailure)}.`,
        'primary-and-cleanup',
      );
    }
    throw primaryFailure;
  }
  if (cleanupFailure !== null) throw cleanupFailure;
  if (!deviceFilePrepared
      || lifecycle?.status !== 'passed-bounded-synthetic-role-booking-lifecycle'
      || ownerEntry?.status !== 'return-case-entry-point-passed'
      || renterEntry?.status !== 'return-case-entry-point-passed'
      || opened?.status !== 'pixel-return-case-server-accepted'
      || server?.status !== 'synthetic-return-case-role-truth-passed'
      || renterPost?.status !== 'return-case-post-state-passed'
      || ownerPost?.status !== 'return-case-post-state-passed'
      || ownerRestored !== true) {
    fail('The WP32 physical return-case lifecycle did not close exactly.');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'android-v52-return-case-lifecycle',
    status: 'passed-pixel-v52-return-case-lifecycle',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      firebaseConfigured: candidate.firebaseConfigured,
      apkSha256: candidate.apkSha256,
    },
    device: deviceSummary,
    sourceDrift,
    tests: {
      completedV52Booking: 'passed',
      ownerEntryPoint: 'passed-distinct-from-support',
      renterEntryPoint: 'passed-distinct-from-support',
      privateEvidenceUpload: 'passed-one-image',
      renterServerSubmission: 'passed-server-accepted',
      participantServerTruth: 'passed-two-equal-projections',
      needsReview: 'passed-owner-and-renter',
      duplicateEntryPoint: 'passed-absent-after-case',
      generalSupportRemains: 'passed-owner-and-renter',
      protectedOwnerSessionRestored: true,
    },
    boundaries: {
      physicalPixelOnly: true,
      syntheticAccountsOnly: true,
      contractCreatedInStaging: true,
      reservationCreatedInStaging: true,
      auditCaseRetainedInStaging: true,
      paymentMode: 'memory',
      paymentEndpointCalled: false,
      stripeLivemode: false,
      monetaryEffectMinor: 0,
      additionalChargeMinor: 0,
      onePlusContacted: false,
      productionChanged: false,
      googlePlayChanged: false,
      providerConsoleChanged: false,
      firebaseConsoleChanged: false,
      cloudVpsDnsChanged: false,
      pullRequestMerged: false,
      containsAccountIdentity: false,
      containsSecrets: false,
      containsTokens: false,
      containsFixtureIdentifiers: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
    },
  });
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const sourceVaultFile = resolve(
    argumentValue(args, '--source-vault-file')
      ?? fail('--source-vault-file is required.'),
  );
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir')
      ?? fail('--candidate-dir is required.'),
  );
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const archive = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  const candidate = {
    ...validateCurrentPrivateAndroidCandidate(archive),
    paymentMode: 'memory',
    stripeLivemode: false,
  };
  const sourceDrift = assertCurrentCandidateNoPostCandidateMobileSourceDrift(
    collectCurrentCandidateDriftPaths({
      root: repositoryRoot,
      candidateCommit: candidate.commit,
    }),
  );
  const commandRunner = defaultCurrentHeadAndroidCommandRunner;
  const devices = parseAdbDevices(commandRunner(adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ commandRunner, adbPath, device });
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);
  const wait = (milliseconds) => new Promise(
    (resolvePromise) => setTimeout(resolvePromise, milliseconds),
  );
  const source = readEmailVerifiedJourneyVault(sourceVaultFile).vault;

  const result = await runIsolatedAndroidRoleBookingDiagnostic({
    vaultFile: sourceVaultFile,
    expectedStatus: 'passed-pixel-v52-return-case-lifecycle',
    runner: (isolatedVaultFile) => runWp32ReturnCaseLifecycle({
      candidate,
      deviceSummary,
      sourceDrift,
      operations: {
        prepareDeviceFile: async () => {
          currentHeadAndroidAdb(commandRunner, adbPath, device, [
            'push',
            resolve(repositoryRoot, 'assets/images/shareittoo_app_icon_master.png'),
            safeDeviceFile,
          ]);
          currentHeadAndroidAdb(commandRunner, adbPath, device, [
            'shell', 'am', 'broadcast',
            '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
            '-d', `file://${safeDeviceFile}`,
          ]);
        },
        completeFixture: () => runSyntheticRoleBookingLifecycle({
          vaultFile: isolatedVaultFile,
        }),
        verifyEntryPoint: (role) => verifyReturnCaseEntryPointForRole({
          vaultFile: isolatedVaultFile,
          role,
          commandRunner,
          adbPath,
          device,
          wait,
        }),
        openCase: () => openReturnCaseOnPixel({
          vaultFile: isolatedVaultFile,
          commandRunner,
          adbPath,
          device,
          wait,
        }),
        inspectServer: () => inspectSyntheticReturnCaseRoleTruth({
          vaultFile: isolatedVaultFile,
          expectedEvidenceCount: 1,
          expectedContestedAuthorizedMinor: 100,
        }),
        verifyPostState: (role) => verifyReturnCasePostStateForRole({
          vaultFile: isolatedVaultFile,
          role,
          commandRunner,
          adbPath,
          device,
          wait,
        }),
        removeDeviceFile: async () => {
          currentHeadAndroidAdb(commandRunner, adbPath, device, [
            'shell', 'rm', '-f', safeDeviceFile,
          ]);
        },
        restoreOwner: async () => {
          const bound = await bindExactRole({
            vault: source,
            role: 'owner',
            commandRunner,
            adbPath,
            device,
            wait,
          });
          return currentHeadAndroidNamedNodes(
            bound.hierarchy,
            bound.account.displayName,
          ).length === 1
            && currentHeadAndroidNamedNodes(
              bound.hierarchy,
              bound.other.displayName,
            ).length === 0;
        },
      },
    }),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const stage = typeof error?.sitStage === 'string'
        && /^[a-z0-9/-]+$/u.test(error.sitStage)
      ? `WP32 stage ${error.sitStage}: `
      : '';
    process.stderr.write(`ERROR: ${stage}${sanitizedFailure(error)}\n`);
    process.exitCode = 1;
  });
}
