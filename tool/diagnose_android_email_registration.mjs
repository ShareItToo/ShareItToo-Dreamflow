#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ensureAndroidGuestSession,
  restoreSyntheticSession,
} from './diagnose_android_logout_lifecycle.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import { buildSyntheticAlias } from './provision_staging_test_accounts.mjs';
import { validatePrivateAndroidReleaseArchive } from './validate_current_head_android_release_archive.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const applicationId = 'com.shareittoo.app';
const apiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const remoteUiDump = '/sdcard/sit-email-registration.xml';
const consentLabels = Object.freeze([
  'Ich bin 18 Jahre oder älter.',
  'Ich bin mindestens 18 Jahre alt, handle als natuerliche Person und nutze ShareItToo im Privat-Pilot ausschliesslich privat.',
  'Ich akzeptiere die AGB.',
  'Ich akzeptiere die Datenschutzbestimmungen.',
]);

function fail(message) {
  throw new Error(message);
}

function outsideRepository(path, label) {
  const absolute = resolve(path);
  if (absolute === repositoryRoot || absolute.startsWith(`${repositoryRoot}${sep}`)) {
    fail(`${label} must remain outside the repository.`);
  }
  return absolute;
}

function privateDirectory(path) {
  const absolute = outsideRepository(path, 'The private UI registration directory');
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  chmodSync(absolute, 0o700);
  return absolute;
}

function writePrivateJson(path, value) {
  privateDirectory(resolve(path, '..'));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

function privateInputFile(path, label) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(`${label} must be absolute.`);
  const canonical = realpathSync(path);
  outsideRepository(canonical, label);
  const stat = statSync(canonical);
  if (!stat.isFile() || stat.size === 0 || (stat.mode & 0o077) !== 0) {
    fail(`${label} must be a non-empty owner-only regular file.`);
  }
  return canonical;
}

function safeRunId(now, random) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('The UI registration timestamp is invalid.');
  if (typeof random !== 'function') fail('The UI registration random source is invalid.');
  const date = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'z').toLowerCase();
  return `${date}-${random(4).toString('hex')}`;
}

export function prepareUiRegistrationVault({
  baseEmail,
  vaultRoot = resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'qa',
    'ui-registration-accounts',
  ),
  now = new Date(),
  random = randomBytes,
} = {}) {
  const runId = safeRunId(now, random);
  const directory = privateDirectory(resolve(vaultRoot, runId));
  const vaultFile = resolve(directory, 'account.json');
  const account = {
    role: 'owner',
    displayName: `SITUI${runId.slice(-8)}`,
    email: buildSyntheticAlias(baseEmail, runId, 'owner'),
    password: random(24).toString('base64url'),
  };
  const vault = {
    schemaVersion: 1,
    kind: 'sit-staging-ui-registration-vault',
    runId,
    status: 'prepared-for-pixel-ui-registration',
    createdAt: now.toISOString(),
    apiBaseUrl,
    stripeLivemode: false,
    containsProductionCredentials: false,
    account,
  };
  writePrivateJson(vaultFile, vault);
  return Object.freeze({
    status: vault.status,
    runId,
    vaultFile,
    role: account.role,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

function readVault(vaultFile) {
  const canonical = privateInputFile(vaultFile, 'The UI registration vault');
  let descriptor;
  let vault;
  try {
    descriptor = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) fail('The UI registration vault is not owner-only.');
    vault = JSON.parse(readFileSync(descriptor, 'utf8'));
  } catch {
    fail('The UI registration vault is invalid.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-ui-registration-vault'
      || vault?.apiBaseUrl !== apiBaseUrl
      || vault?.stripeLivemode !== false
      || vault?.containsProductionCredentials !== false
      || vault?.account?.role !== 'owner'
      || !/^[A-Za-z0-9]+$/u.test(vault?.account?.displayName ?? '')
      || !/^[A-Za-z0-9._+@-]+$/u.test(vault?.account?.email ?? '')
      || !/^[A-Za-z0-9_-]{24,}$/u.test(vault?.account?.password ?? '')) {
    fail('The UI registration vault is not a bounded Staging fixture.');
  }
  return { canonical, vault };
}

const transitions = Object.freeze({
  'pixel-ui-submitted': Object.freeze({
    from: 'pixel-ui-registration-submission-in-progress',
    to: 'pixel-ui-registration-accepted-pending-email',
  }),
  'email-link-confirmed': Object.freeze({
    from: 'pixel-ui-registration-accepted-pending-email',
    to: 'email-link-verified-ready-for-pixel-login',
  }),
  'pixel-login-cold-start-passed': Object.freeze({
    from: 'email-link-verified-ready-for-pixel-login',
    to: 'pixel-ui-registration-login-complete',
  }),
});

export function beginUiRegistrationSubmission({
  vaultFile,
  occurredAt = new Date(),
} = {}) {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    fail('The UI registration submission timestamp is invalid.');
  }
  const { canonical, vault } = readVault(vaultFile);
  if (vault.status !== 'prepared-for-pixel-ui-registration') {
    fail('The UI registration submission transition is out of order.');
  }
  vault.status = 'pixel-ui-registration-submission-in-progress';
  vault.events = [...(Array.isArray(vault.events) ? vault.events : []), {
    event: 'pixel-ui-registration-submission-started',
    occurredAt: occurredAt.toISOString(),
  }];
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: vault.status,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

export function markUiRegistrationSubmissionOutcomeUnknown({
  vaultFile,
  occurredAt = new Date(),
} = {}) {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    fail('The UI registration unknown-result timestamp is invalid.');
  }
  const { canonical, vault } = readVault(vaultFile);
  if (vault.status !== 'pixel-ui-registration-submission-in-progress') {
    fail('The UI registration unknown-result transition is out of order.');
  }
  vault.status = 'pixel-ui-registration-submission-outcome-unknown';
  vault.events = [...(Array.isArray(vault.events) ? vault.events : []), {
    event: 'pixel-ui-registration-submission-outcome-unknown',
    occurredAt: occurredAt.toISOString(),
  }];
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: vault.status,
    freshSubmissionAllowed: false,
    reconciliationRequired: true,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

export function transitionUiRegistrationVault({ vaultFile, event, occurredAt = new Date() }) {
  const transition = transitions[event] ?? fail('The UI registration transition is invalid.');
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    fail('The UI registration transition timestamp is invalid.');
  }
  const { canonical, vault } = readVault(vaultFile);
  if (vault.status !== transition.from) fail('The UI registration transition is out of order.');
  vault.status = transition.to;
  vault.events = [...(Array.isArray(vault.events) ? vault.events : []), {
    event,
    occurredAt: occurredAt.toISOString(),
  }];
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: vault.status,
    event,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

export function reconcileUiRegistrationEmailDelivery({
  vaultFile,
  occurredAt = new Date(),
} = {}) {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    fail('The UI registration delivery timestamp is invalid.');
  }
  const { canonical, vault } = readVault(vaultFile);
  if (vault.status !== 'pixel-ui-registration-submission-outcome-unknown') {
    fail('The UI registration delivery reconciliation is out of order.');
  }
  vault.status = 'pixel-ui-registration-accepted-pending-email';
  vault.events = [...(Array.isArray(vault.events) ? vault.events : []), {
    event: 'registration-email-delivery-reconciled',
    occurredAt: occurredAt.toISOString(),
  }];
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: vault.status,
    deliveryReconciled: true,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

function defaultCommandRunner(file, args, { binary = false } = {}) {
  return execFileSync(file, args, {
    encoding: binary ? null : 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function adb(commandRunner, adbPath, device, args, { binary = false } = {}) {
  try {
    const result = commandRunner(adbPath, ['-s', device.serial, ...args], { binary });
    return binary ? Buffer.from(result) : String(result).trim();
  } catch {
    fail('ADB email-registration command failed without exposing the device identifier.');
  }
}

function decodeXml(value) {
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
  const raw = new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
  return raw === undefined ? null : decodeXml(raw);
}

function namedNodes(hierarchy, label) {
  const matchesLabel = (value) => value?.split('\n').some((line) => line === label
    || line.startsWith(`${label},`)
    || line.startsWith(`${label} `)) === true;
  return [...hierarchy.matchAll(/<node\b[^>]*\/>/g)]
    .map((match) => match[0])
    .filter((tag) => matchesLabel(attribute(tag, 'text'))
      || matchesLabel(attribute(tag, 'content-desc'))
      || matchesLabel(attribute(tag, 'hint')));
}

function nodeCenter(tag, label) {
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attribute(tag, 'bounds') ?? '');
  if (!bounds) fail(`The sanitized ${label} action has invalid bounds.`);
  const values = bounds.slice(1).map(Number);
  return {
    x: Math.round((values[0] + values[2]) / 2),
    y: Math.round((values[1] + values[3]) / 2),
  };
}

function tapNamedNode(commandRunner, adbPath, device, hierarchy, label, { chooseLast = false } = {}) {
  const enabled = namedNodes(hierarchy, label).filter((tag) => attribute(tag, 'enabled') !== 'false');
  const clickable = enabled.filter((tag) => attribute(tag, 'clickable') === 'true');
  const matches = clickable.length ? clickable : enabled;
  if (matches.length === 0) fail(`The sanitized ${label} action is missing.`);
  const center = nodeCenter(chooseLast ? matches.at(-1) : matches[0], label);
  adb(commandRunner, adbPath, device, ['shell', 'input', 'tap', String(center.x), String(center.y)]);
}

function inputText(commandRunner, adbPath, device, hierarchy, label, value) {
  if (!/^[A-Za-z0-9._+@-]+$/u.test(value)) fail(`The private ${label} fixture is not safe for bounded ADB input.`);
  tapNamedNode(commandRunner, adbPath, device, hierarchy, label);
  adb(commandRunner, adbPath, device, ['shell', 'input', 'text', value]);
}

function dumpUi(commandRunner, adbPath, device) {
  adb(commandRunner, adbPath, device, ['shell', 'uiautomator', 'dump', remoteUiDump]);
  return adb(commandRunner, adbPath, device, ['exec-out', 'cat', remoteUiDump]);
}

async function waitForHierarchy({ commandRunner, adbPath, device, predicate, wait, attempts = 24 }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(650);
    const hierarchy = dumpUi(commandRunner, adbPath, device);
    if (predicate(hierarchy)) return hierarchy;
  }
  fail('The expected sanitized email-registration surface did not appear.');
}

function parseInstalledPackage(output) {
  const versionName = /^\s*versionName=([^\s]+)\s*$/m.exec(output)?.[1] ?? null;
  const buildNumber = /^\s*versionCode=(\d+)\b/m.exec(output)?.[1] ?? null;
  if (versionName === null || buildNumber === null) fail('Installed ShareItToo version could not be verified.');
  return { versionName, buildNumber };
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function verifyInstalledCandidate(commandRunner, adbPath, device, candidate) {
  const packagePaths = adb(commandRunner, adbPath, device, ['shell', 'pm', 'path', applicationId])
    .split(/\r?\n/)
    .map((line) => line.replace(/^package:/, '').trim())
    .filter(Boolean);
  if (packagePaths.length !== 1 || !packagePaths[0].startsWith('/data/app/')) {
    fail('The email-registration diagnostic requires one exact direct-APK Pixel candidate.');
  }
  const installed = parseInstalledPackage(
    adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'package', applicationId]),
  );
  if (installed.versionName !== candidate.versionName || installed.buildNumber !== candidate.buildNumber) {
    fail('Installed ShareItToo version does not match the verified candidate.');
  }
  const installedSha256 = sha256Bytes(adb(
    commandRunner,
    adbPath,
    device,
    ['exec-out', 'cat', packagePaths[0]],
    { binary: true },
  ));
  if (installedSha256 !== candidate.apkSha256) fail('Installed ShareItToo APK does not match the verified candidate.');
  return { ...installed, apkSha256: installedSha256 };
}

function assertDeviceAlreadyUnlocked(commandRunner, adbPath, device) {
  const policy = adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'window', 'policy']);
  if (/keyguardShowing=true|isStatusBarKeyguard=true/u.test(policy)) {
    fail('The Android phone is locked. Unlock it manually; this diagnostic never enters a passcode.');
  }
}

function launchCandidate(commandRunner, adbPath, device) {
  adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
  const result = adb(commandRunner, adbPath, device, [
    'shell', 'monkey', '-p', applicationId, '-c', 'android.intent.category.LAUNCHER', '1',
  ]);
  if (!/Events injected:\s*1/u.test(result)) fail('Android did not confirm the ShareItToo launch event.');
}

async function openProfile({ commandRunner, adbPath, device, wait }) {
  launchCandidate(commandRunner, adbPath, device);
  const main = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (hierarchy) => namedNodes(hierarchy, 'Mein SIT').length >= 1
      && namedNodes(hierarchy, 'Nachrichten').length >= 1,
    wait,
  });
  tapNamedNode(commandRunner, adbPath, device, main, 'Mein SIT');
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (hierarchy) => namedNodes(hierarchy, 'Abmelden').length >= 1,
    wait,
  });
}

export async function submitPixelUiRegistration({
  vaultFile,
  candidate,
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  ensureGuest = ensureAndroidGuestSession,
} = {}) {
  const { vault } = readVault(vaultFile);
  if (vault.status !== 'prepared-for-pixel-ui-registration') fail('The UI registration vault is not prepared.');
  assertDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalledCandidate(commandRunner, adbPath, device, candidate);
  if (await ensureGuest({ commandRunner, adbPath, device, wait }) !== true) {
    fail('The Pixel guest session could not be established.');
  }
  let hierarchy = dumpUi(commandRunner, adbPath, device);
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Konto erstellen');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (value) => namedNodes(value, 'Dein SIT-Konto erstellen').length >= 1
      && namedNodes(value, 'Kostenlos registrieren').length >= 1,
    wait,
  });
  for (const [label, value] of [
    ['Name', vault.account.displayName],
    ['E-Mail', vault.account.email],
    ['Passwort', vault.account.password],
    ['Passwort wiederholen', vault.account.password],
  ]) {
    inputText(commandRunner, adbPath, device, hierarchy, label, value);
    hierarchy = dumpUi(commandRunner, adbPath, device);
  }
  adb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
  for (const label of consentLabels) {
    hierarchy = dumpUi(commandRunner, adbPath, device);
    tapNamedNode(commandRunner, adbPath, device, hierarchy, label);
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      predicate: (value) => namedNodes(value, label).some((tag) => attribute(tag, 'checked') === 'true'),
      wait,
      attempts: 8,
    });
  }
  hierarchy = dumpUi(commandRunner, adbPath, device);
  beginUiRegistrationSubmission({ vaultFile });
  try {
    tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Kostenlos registrieren');
    await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      predicate: (value) => value.includes('Prüfe deine E-Mail')
        && namedNodes(value, 'Anmelden').length >= 1,
      wait,
      attempts: 32,
    });
  } catch (error) {
    markUiRegistrationSubmissionOutcomeUnknown({ vaultFile });
    throw error;
  }
  transitionUiRegistrationVault({ vaultFile, event: 'pixel-ui-submitted' });
  return Object.freeze({
    status: 'pixel-ui-registration-accepted-pending-email',
    installedVersionName: installed.versionName,
    installedVersionCode: installed.buildNumber,
    consentCount: consentLabels.length,
    containsEmailAddress: false,
    containsCredential: false,
    containsRawDeviceIdentifier: false,
  });
}

export async function completePixelUiRegistrationLogin({
  vaultFile,
  candidate,
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  ensureGuest = ensureAndroidGuestSession,
  restoreSession = restoreSyntheticSession,
} = {}) {
  const { vault } = readVault(vaultFile);
  if (vault.status !== 'email-link-verified-ready-for-pixel-login') {
    fail('The UI registration email link is not confirmed.');
  }
  assertDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalledCandidate(commandRunner, adbPath, device, candidate);
  if (await ensureGuest({ commandRunner, adbPath, device, wait }) !== true
      || await restoreSession({
        commandRunner,
        adbPath,
        device,
        wait,
        account: vault.account,
      }) !== true) {
    fail('The verified UI registration account could not log in on the Pixel.');
  }
  let hierarchy = dumpUi(commandRunner, adbPath, device);
  if (namedNodes(hierarchy, vault.account.displayName).length !== 1
      || namedNodes(hierarchy, 'Gast').length !== 0) {
    fail('The Pixel profile did not bind to the exact registered principal.');
  }
  hierarchy = await openProfile({ commandRunner, adbPath, device, wait });
  if (namedNodes(hierarchy, vault.account.displayName).length !== 1
      || namedNodes(hierarchy, 'Gast').length !== 0) {
    fail('The exact registered principal did not survive a cold start.');
  }
  transitionUiRegistrationVault({ vaultFile, event: 'pixel-login-cold-start-passed' });
  return Object.freeze({
    status: 'pixel-ui-registration-login-complete',
    installedVersionName: installed.versionName,
    installedVersionCode: installed.buildNumber,
    exactPrincipalVisible: true,
    coldStartSessionPersisted: true,
    containsEmailAddress: false,
    containsCredential: false,
    containsRawDeviceIdentifier: false,
  });
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function run() {
  const args = process.argv.slice(2);
  const phase = argumentValue(args, '--phase') ?? fail('--phase is required.');
  if (phase === 'prepare') {
    const mailboxFile = privateInputFile(
      resolve(argumentValue(args, '--mailbox-file') ?? fail('--mailbox-file is required.')),
      'The mailbox input file',
    );
    const vaultRoot = argumentValue(args, '--vault-root');
    const result = prepareUiRegistrationVault({
      baseEmail: readFileSync(mailboxFile, 'utf8'),
      ...(vaultRoot ? { vaultRoot: resolve(vaultRoot) } : {}),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const vaultFile = resolve(argumentValue(args, '--vault-file') ?? fail('--vault-file is required.'));
  if (phase === 'record-email-confirmation') {
    const result = transitionUiRegistrationVault({ vaultFile, event: 'email-link-confirmed' });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (phase === 'reconcile-delivered-email') {
    const result = reconcileUiRegistrationEmailDelivery({ vaultFile });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (!['submit', 'complete'].includes(phase)) fail('The requested UI registration phase is invalid.');
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir') ?? fail('--candidate-dir is required.'),
  );
  const candidate = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  const devices = parseAdbDevices(defaultCommandRunner('adb', ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: 'adb', device });
  const result = phase === 'submit'
    ? await submitPixelUiRegistration({ vaultFile, candidate, device })
    : await completePixelUiRegistrationLogin({ vaultFile, candidate, device });
  process.stdout.write(`${JSON.stringify({
    ...result,
    device: deviceSummary,
    boundaries: {
      stagingOnly: true,
      realMoneyUsed: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      productionChanged: false,
      googlePlayChanged: false,
      onePlusContacted: false,
      credentialsPrinted: false,
      verificationLinkPrinted: false,
      rawDeviceIdentifierPrinted: false,
    },
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'Pixel email-registration diagnostic failed.'}\n`);
    process.exitCode = 1;
  }
}
