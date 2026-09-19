#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  launchCurrentHeadAndroidCandidate,
  verifyCurrentHeadAndroidInstalledCandidate,
  waitForCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  validateCurrentHeadAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const expectedApplicationId = 'com.shareittoo.app';
const expectedApiBaseUrl = 'https://staging.shareittoo.com/api/v1';

function fail(message) {
  throw new Error(message);
}

function pointForLabel(hierarchy, label) {
  const points = currentHeadAndroidNamedNodes(hierarchy, label)
    .map((node) => {
      const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
        currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
      );
      if (bounds === null) return null;
      return {
        x: Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2),
        y: Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2),
      };
    })
    .filter((value) => value !== null)
    .sort((left, right) => right.y - left.y);
  return points[0] ?? null;
}

function tapNavigationLabel(commandRunner, adbPath, device, hierarchy, label) {
  const point = pointForLabel(hierarchy, label);
  if (point === null) fail(`The sanitized ${label} navigation action is unavailable.`);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

async function waitForGuestProfile({ commandRunner, adbPath, device, wait }) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapNavigationLabel(commandRunner, adbPath, device, main, 'Mein SIT');
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await wait(650);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    const guest = currentHeadAndroidNamedNodes(hierarchy, 'Anmelden').length > 0
      && currentHeadAndroidNamedNodes(hierarchy, 'Konto erstellen').length > 0;
    if (guest) return;
    if (currentHeadAndroidNamedNodes(hierarchy, 'Abmelden').length > 0) {
      fail('The Pixel contains an authenticated session; the guest diagnostic never logs it out.');
    }
  }
  fail('The signed-out ShareItToo profile surface did not appear.');
}

async function launchExplore({ commandRunner, adbPath, device, wait }) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapNavigationLabel(commandRunner, adbPath, device, main, 'Entdecken');
}

async function waitForCatalogOutcome({
  commandRunner,
  adbPath,
  device,
  wait,
  expectedTitles,
  attempts = 36,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(700);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(
      hierarchy,
      'Anzeigen konnten nicht geladen werden.',
    ).length > 0) {
      return 'error';
    }
    if (currentHeadAndroidNamedNodes(hierarchy, 'Noch keine Anzeigen').length > 0
        || currentHeadAndroidNamedNodes(hierarchy, 'Keine Anzeigen gefunden').length > 0) {
      return 'empty';
    }
    if (expectedTitles.some((title) => (
      currentHeadAndroidNamedNodes(hierarchy, title).length > 0
    ))) {
      return 'content';
    }
  }
  return 'loading';
}

async function readPublicCatalog(apiBaseUrl, fetchImpl = fetch) {
  const response = await fetchImpl(`${apiBaseUrl}/listings?sort=newest&limit=100`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) fail('The public Staging catalog endpoint did not return success.');
  const body = await response.json();
  if (!Array.isArray(body?.listings)) fail('The public Staging catalog response is invalid.');
  const titles = body.listings.map((listing) => listing?.title);
  if (titles.some((title) => typeof title !== 'string' || title.trim() === '')) {
    fail('The public Staging catalog contains an invalid title.');
  }
  return Object.freeze({ count: titles.length, titles: titles.map((title) => title.trim()) });
}

function expectedOnlineOutcome(catalog) {
  return catalog.count === 0 ? 'empty' : 'content';
}

export async function diagnoseCurrentCandidateAndroidGuestCatalog({
  candidate,
  deviceSummary,
  operations,
  catalog,
  capturedAt = new Date().toISOString(),
}) {
  if (candidate?.applicationId !== expectedApplicationId
      || candidate.apiBaseUrl !== expectedApiBaseUrl
      || candidate.firebaseConfigured !== true
      || candidate.releaseChannel !== 'internal') {
    fail('The candidate is not the exact Firebase-configured internal Staging app.');
  }
  if (!Number.isInteger(catalog?.count)
      || catalog.count < 0
      || !Array.isArray(catalog.titles)
      || catalog.titles.length !== catalog.count) {
    fail('The sanitized public catalog expectation is invalid.');
  }

  await operations.assertSafeReady();
  await operations.assertGuestSession();
  if (await operations.readWifiEnabled() !== true) {
    fail('Wi-Fi must already be enabled before the bounded network diagnostic.');
  }

  const onlineExpectation = expectedOnlineOutcome(catalog);
  const initial = await operations.readCatalogOutcome(catalog.titles);
  if (initial !== onlineExpectation) {
    fail('The initial guest catalog did not match the live Staging catalog truth.');
  }

  let offline = null;
  let recovery = null;
  let primaryFailure = null;
  let wifiChanged = false;
  try {
    await operations.setWifiEnabled(false);
    wifiChanged = true;
    if (await operations.waitForWifiState(false) !== true) {
      fail('Android did not confirm the temporary Wi-Fi disable.');
    }
    offline = await operations.readCatalogOutcome(catalog.titles);
    if (offline !== 'error') {
      fail('The guest catalog did not expose the explicit offline error.');
    }
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (wifiChanged) {
      await operations.setWifiEnabled(true);
      if (await operations.waitForWifiState(true) !== true) {
        fail('Android Wi-Fi could not be restored.');
      }
      if (await operations.waitForStagingReachability() !== true) {
        fail('Staging did not become reachable after restoring Wi-Fi.');
      }
      recovery = await operations.readCatalogOutcome(catalog.titles);
    }
  }
  if (primaryFailure !== null) throw primaryFailure;
  if (recovery !== onlineExpectation) {
    fail('The guest catalog did not recover after validated Wi-Fi restoration.');
  }

  return {
    schemaVersion: 1,
    kind: 'sit-current-candidate-android-guest-catalog-network-truth',
    status: 'passed-bounded-guest-network-truth-diagnostic',
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
    tests: {
      signedOutGuestSession: { status: 'passed', result: 'login-actions-visible' },
      guestCatalogOnline: {
        status: 'passed',
        result: catalog.count === 0 ? 'server-confirmed-empty-state' : 'public-catalog-content-visible',
        publicListingCount: catalog.count,
      },
      offlineTruth: { status: 'passed', result: 'explicit-listings-could-not-be-loaded-error' },
      onlineRecovery: {
        status: 'passed',
        result: 'catalog-restored-after-validated-staging-reachability',
      },
    },
    boundaries: {
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
      uninstallUsed: false,
      dataResetUsed: false,
      downgradeUsed: false,
      networkTemporarilyChanged: true,
      wifiRestored: true,
      loginPerformed: false,
      logoutPerformed: false,
      accountMutationPerformed: false,
      bookingMutationPerformed: false,
      realMoneyUsed: false,
      productionChanged: false,
      storeChanged: false,
      screenshotsCaptured: false,
      rawUiHierarchyRetained: false,
      accountContentInspected: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
      containsNetworkIdentifiers: false,
    },
  };
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  return args[index + 1] ?? fail(`${flag} requires a value.`);
}

function parseArguments(args) {
  const allowed = new Set([
    '--adb', '--candidate-dir', '--source-commit', '--version-name', '--build-number',
  ]);
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || args[index + 1] === undefined) {
      fail(`Unknown or incomplete argument: ${args[index] ?? '<missing>'}`);
    }
  }
  const candidateDirectory = argumentValue(args, '--candidate-dir')
    ?? fail('--candidate-dir is required.');
  const commit = argumentValue(args, '--source-commit')
    ?? fail('--source-commit is required.');
  const versionName = argumentValue(args, '--version-name') ?? '1.0.0';
  const buildNumber = argumentValue(args, '--build-number')
    ?? fail('--build-number is required.');
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  return { candidateDirectory, commit, versionName, buildNumber, adbPath };
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const candidate = await validateCurrentHeadAndroidReleaseArchive({
    candidateDirectory: args.candidateDirectory,
    expectedIdentity: {
      versionName: args.versionName,
      buildNumber: args.buildNumber,
      commit: args.commit,
    },
  });
  const devices = parseAdbDevices(defaultCurrentHeadAndroidCommandRunner(
    args.adbPath,
    ['devices', '-l'],
  ));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const catalog = await readPublicCatalog(candidate.apiBaseUrl);
  const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
  const readWifiEnabled = () => (
    currentHeadAndroidAdb(
      defaultCurrentHeadAndroidCommandRunner,
      args.adbPath,
      device,
      ['shell', 'settings', 'get', 'global', 'wifi_on'],
    ).trim() === '1'
  );
  const operations = {
    assertSafeReady: async () => {
      assertCurrentHeadAndroidDeviceAlreadyUnlocked(
        defaultCurrentHeadAndroidCommandRunner,
        args.adbPath,
        device,
      );
      verifyCurrentHeadAndroidInstalledCandidate(
        defaultCurrentHeadAndroidCommandRunner,
        args.adbPath,
        device,
        candidate,
      );
    },
    assertGuestSession: () => waitForGuestProfile({
      commandRunner: defaultCurrentHeadAndroidCommandRunner,
      adbPath: args.adbPath,
      device,
      wait,
    }),
    readWifiEnabled,
    setWifiEnabled: async (enabled) => {
      currentHeadAndroidAdb(
        defaultCurrentHeadAndroidCommandRunner,
        args.adbPath,
        device,
        ['shell', 'svc', 'wifi', enabled ? 'enable' : 'disable'],
      );
    },
    waitForWifiState: async (expected) => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (readWifiEnabled() === expected) return true;
        await wait(500);
      }
      return false;
    },
    waitForStagingReachability: async () => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
          currentHeadAndroidAdb(
            defaultCurrentHeadAndroidCommandRunner,
            args.adbPath,
            device,
            ['shell', 'ping', '-c', '1', '-W', '2', 'staging.shareittoo.com'],
          );
          return true;
        } catch {
          await wait(1_000);
        }
      }
      return false;
    },
    readCatalogOutcome: async (expectedTitles) => {
      await launchExplore({
        commandRunner: defaultCurrentHeadAndroidCommandRunner,
        adbPath: args.adbPath,
        device,
        wait,
      });
      return waitForCatalogOutcome({
        commandRunner: defaultCurrentHeadAndroidCommandRunner,
        adbPath: args.adbPath,
        device,
        wait,
        expectedTitles,
      });
    },
  };
  const evidence = await diagnoseCurrentCandidateAndroidGuestCatalog({
    candidate,
    deviceSummary,
    operations,
    catalog,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'Current-candidate Android guest catalog diagnostic failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
