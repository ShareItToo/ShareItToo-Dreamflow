#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
  validateCandidateArchive,
} from './prepare_android_device_test.mjs';
import { storeScreenshotListings } from './prepare_store_screenshot_fixture.mjs';

const applicationId = 'com.shareittoo.app';
const screenshotListingTitle = storeScreenshotListings[0].title;
const remoteHierarchy = '/sdcard/sit-google-play-screenshot.xml';
const requireFromBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const sharp = requireFromBackend('sharp');

function fail(message) {
  throw new Error(message);
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function command(file, args, { binary = false } = {}) {
  return execFileSync(file, args, {
    encoding: binary ? null : 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function adb(adbPath, device, args, { binary = false } = {}) {
  try {
    const result = command(adbPath, ['-s', device.serial, ...args], { binary });
    return binary ? Buffer.from(result) : String(result).trim();
  } catch {
    fail('ADB screenshot command failed without exposing the device identifier.');
  }
}

function assertUnlocked(adbPath, device) {
  const policy = adb(adbPath, device, ['shell', 'dumpsys', 'window', 'policy']);
  if (/keyguardShowing=true|isStatusBarKeyguard=true/.test(policy)) {
    fail('The Android phone is locked. Unlock it manually; this tool never enters a passcode.');
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseInstalledPackage(output) {
  const versionName = /^\s*versionName=([^\s]+)\s*$/m.exec(output)?.[1] ?? null;
  const buildNumber = /^\s*versionCode=(\d+)\b/m.exec(output)?.[1] ?? null;
  if (versionName === null || buildNumber === null) fail('Installed ShareItToo version could not be verified.');
  return { versionName, buildNumber };
}

function verifyInstalledCandidate(adbPath, device, candidate, archive) {
  const packagePaths = adb(adbPath, device, ['shell', 'pm', 'path', applicationId])
    .split(/\r?\n/)
    .map((line) => line.replace(/^package:/, '').trim())
    .filter(Boolean);
  if (packagePaths.length === 0 || packagePaths.some((value) => !value.startsWith('/data/app/'))) {
    fail('Installed ShareItToo package path is missing or ambiguous.');
  }
  const installed = parseInstalledPackage(
    adb(adbPath, device, ['shell', 'dumpsys', 'package', applicationId]),
  );
  if (installed.versionName !== candidate.versionName
      || installed.buildNumber !== candidate.buildNumber) {
    fail('Installed ShareItToo app is not the exact verified screenshot candidate.');
  }

  if (packagePaths.length === 1) {
    const apkSha256 = sha256(adb(
      adbPath,
      device,
      ['exec-out', 'cat', packagePaths[0]],
      { binary: true },
    ));
    if (apkSha256 !== archive.apkSha256
        || apkSha256 !== candidate.android.apkSha256) {
      fail('Installed ShareItToo APK is not the exact verified screenshot candidate.');
    }
    return { ...installed, delivery: 'direct-apk', apkSha256 };
  }

  const basePackages = packagePaths.filter((value) => value.endsWith('/base.apk'));
  const splitPackagesValid = packagePaths.every((value) => (
    value.endsWith('/base.apk') || /\/split_[^/]+\.apk$/u.test(value)
  ));
  if (basePackages.length !== 1 || !splitPackagesValid) {
    fail('Installed ShareItToo Play package split set is missing or ambiguous.');
  }
  const installerOutput = adb(adbPath, device, [
    'shell', 'pm', 'list', 'packages', '-i', applicationId,
  ]);
  if (!/\binstaller=com\.android\.vending\b/u.test(installerOutput)) {
    fail('Installed ShareItToo split package was not delivered by Google Play.');
  }
  return {
    ...installed,
    delivery: 'google-play-split',
    installerPackageName: 'com.android.vending',
    splitCount: packagePaths.length,
    apkSha256: candidate.android.apkSha256,
  };
}

function xmlValue(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hexadecimal) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attribute(tag, name) {
  const value = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? null : xmlValue(value);
}

function nodes(hierarchy, label, { startsWith = false } = {}) {
  const matches = (value) => value?.split('\n').some((line) => (
    startsWith ? line.startsWith(label) : line === label
  )) === true;
  return (String(hierarchy).match(/<node[^>]*>/g) ?? []).filter((tag) => (
    matches(attribute(tag, 'text')) || matches(attribute(tag, 'content-desc'))
  ));
}

function center(tag, label) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attribute(tag, 'bounds') ?? '');
  if (!match) fail(`The sanitized ${label} action has invalid bounds.`);
  const values = match.slice(1).map(Number);
  return {
    x: Math.round((values[0] + values[2]) / 2),
    y: Math.round((values[1] + values[3]) / 2),
  };
}

function dumpUi(adbPath, device) {
  adb(adbPath, device, ['shell', 'uiautomator', 'dump', remoteHierarchy]);
  try {
    return adb(adbPath, device, ['exec-out', 'cat', remoteHierarchy]);
  } finally {
    try {
      adb(adbPath, device, ['shell', 'rm', '-f', remoteHierarchy]);
    } catch {
      // A later run overwrites the fixed temporary hierarchy path.
    }
  }
}

async function waitForUi(adbPath, device, predicate, wait, label) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(500);
    const hierarchy = dumpUi(adbPath, device);
    if (predicate(hierarchy)) return hierarchy;
  }
  fail(`The sanitized ${label} screenshot surface did not appear.`);
}

function tapNode(adbPath, device, hierarchy, label, options = {}) {
  const matches = nodes(hierarchy, label, options).filter((tag) => attribute(tag, 'enabled') !== 'false');
  if (!matches.length) fail(`The sanitized ${label} action is missing or ambiguous.`);
  const clickable = matches.filter((tag) => attribute(tag, 'clickable') === 'true');
  const candidates = clickable.length ? clickable : matches;
  const selected = candidates
    .map((tag) => ({ tag, point: center(tag, label) }))
    .sort((left, right) => left.point.y - right.point.y || left.point.x - right.point.x)[0];
  if (!selected) fail(`The sanitized ${label} action is missing or ambiguous.`);
  const point = selected.point;
  adb(adbPath, device, ['shell', 'input', 'tap', String(point.x), String(point.y)]);
}

function launch(adbPath, device) {
  adb(adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
  const result = adb(adbPath, device, [
    'shell', 'monkey', '-p', applicationId, '-c', 'android.intent.category.LAUNCHER', '1',
  ]);
  if (!/Events injected:\s*1/.test(result)) fail('Android did not confirm the ShareItToo launch event.');
}

async function screenshot(adbPath, device, outputPath) {
  const raw = adb(adbPath, device, ['exec-out', 'screencap', '-p'], { binary: true });
  const metadata = await sharp(raw).metadata();
  if (metadata.width !== 1440 || metadata.height !== 3120) {
    fail('Pixel screenshot dimensions changed; refusing an unreviewed crop.');
  }
  const bytes = await sharp(raw)
    .extract({ left: 0, top: 144, width: 1440, height: 2560 })
    .resize(1080, 1920, { fit: 'fill' })
    .removeAlpha()
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  writeFileSync(outputPath, bytes, { mode: 0o600 });
  chmodSync(outputPath, 0o600);
  return { width: 1080, height: 1920, byteSize: bytes.length, sha256: sha256(bytes) };
}

export async function captureGooglePlayAndroidScreenshots({
  adbPath = 'adb',
  device,
  candidate,
  archive,
  outputDirectory,
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  assertUnlocked(adbPath, device);
  const installed = verifyInstalledCandidate(adbPath, device, candidate, archive);
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  chmodSync(outputDirectory, 0o700);
  adb(adbPath, device, ['shell', 'cmd', 'statusbar', 'collapse']);

  launch(adbPath, device);
  let hierarchy = await waitForUi(
    adbPath,
    device,
    (value) => nodes(value, 'Entdecken').length === 1 && nodes(value, 'Jetzt suchen').length === 1,
    wait,
    'feed',
  );
  if (attribute(nodes(hierarchy, 'Entdecken')[0], 'selected') !== 'true') {
    tapNode(adbPath, device, hierarchy, 'Entdecken');
    hierarchy = await waitForUi(
      adbPath,
      device,
      (value) => nodes(value, screenshotListingTitle, { startsWith: true }).length === 1,
      wait,
      'feed',
    );
  }
  const scenes = {};
  scenes.feed = await screenshot(adbPath, device, resolve(outputDirectory, '01-feed.png'));

  tapNode(adbPath, device, hierarchy, screenshotListingTitle, { startsWith: true });
  hierarchy = await waitForUi(
    adbPath,
    device,
    (value) => value.includes('Artikelbeschreibung') && value.includes(screenshotListingTitle),
    wait,
    'listing detail',
  );
  scenes['listing-detail'] = await screenshot(
    adbPath,
    device,
    resolve(outputDirectory, '02-listing-detail.png'),
  );
  adb(adbPath, device, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);

  hierarchy = await waitForUi(
    adbPath,
    device,
    (value) => nodes(value, 'Jetzt suchen').length === 1,
    wait,
    'feed after detail',
  );
  tapNode(adbPath, device, hierarchy, 'Jetzt suchen');
  hierarchy = await waitForUi(
    adbPath,
    device,
    (value) => value.includes('KI-Suche')
      && value.includes('Zurücksetzen')
      && value.includes(screenshotListingTitle),
    wait,
    'search',
  );
  scenes.search = await screenshot(adbPath, device, resolve(outputDirectory, '03-search.png'));
  adb(adbPath, device, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);

  hierarchy = await waitForUi(
    adbPath,
    device,
    (value) => nodes(value, 'Neue Anzeige erstellen').length === 1,
    wait,
    'feed before create listing',
  );
  tapNode(adbPath, device, hierarchy, 'Neue Anzeige erstellen');
  await waitForUi(
    adbPath,
    device,
    (value) => value.includes('Neue Anzeige') && value.includes('Beschreibung') && value.includes('Fotos'),
    wait,
    'create listing',
  );
  scenes['create-listing'] = await screenshot(
    adbPath,
    device,
    resolve(outputDirectory, '04-create-listing.png'),
  );
  adb(adbPath, device, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);

  return {
    schemaVersion: 1,
    kind: 'google-play-android-screenshot-capture',
    status: 'four-private-exact-candidate-captures-created-visual-review-pending',
    capturedAt: new Date().toISOString(),
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      apkSha256: installed.apkSha256,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
    },
    device: inspectPhysicalDevice({ adbPath, device }),
    scenes,
    boundaries: {
      privateCaptureOnly: true,
      repositoryScreenshotsChanged: false,
      screenshotUploaded: false,
      playConsoleChanged: false,
      productionChanged: false,
      paymentEndpointCalled: false,
      containsSecrets: false,
      containsEmailAddresses: false,
      containsAccountIdentifiers: false,
      containsRawDeviceIdentifiers: false,
      containsReviewCredentials: false,
    },
  };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const manifest = JSON.parse(readFileSync(resolve(root, 'store/device-validation.json'), 'utf8'));
  const candidate = manifest.candidate;
  const candidateDirectory = resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'release',
    'android',
    `${nonEmptyString(candidate.buildNumber, 'candidate.buildNumber')}-${nonEmptyString(candidate.commit, 'candidate.commit')}`,
  );
  const outputDirectory = resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'qa',
    'store-screenshots',
    `android-${candidate.buildNumber}`,
  );
  const archive = await validateCandidateArchive({ root, candidateDirectory });
  const device = selectSinglePhysicalDevice(parseAdbDevices(command('adb', ['devices', '-l'])));
  const result = await captureGooglePlayAndroidScreenshots({
    adbPath: 'adb',
    device,
    candidate,
    archive,
    outputDirectory,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (typeof process !== 'undefined'
    && process.argv?.[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
