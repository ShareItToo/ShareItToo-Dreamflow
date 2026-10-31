#!/usr/bin/env node

/*
 * Bounded physical profile-photo regression for the current Google-Play
 * candidate.  This module deliberately keeps all credentials, URLs, device
 * serials and private temporary paths out of evidence.  The CLI is the only
 * entry point that performs device/server work; unit tests use the exported
 * pure helpers and orchestration contract below.
 */

import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bindExactRole,
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
import { readEmailVerifiedJourneyVault } from './run_staging_email_verified_two_role_journey.mjs';
import { validateCurrentRolloverCandidate } from './validate_google_play_internal_handoff.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const applicationId = 'com.shareittoo.app';
const pickerPackage = 'com.google.android.photopicker';
const fixtureDisplayName = 'SIT_PROFILE_2803_SYNTHETIC_AVATAR.png';
const apiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const managedUpload = /^\/api\/v1\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(?:full|thumb)\.(?:webp|jpe?g|png)$/iu;

function fail(message) { throw new Error(message); }

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeError(error) {
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  if (!message || message.length > 240
      || /(?:@|https?:\/\/|\/Users\/|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|serial|fixture)/iu.test(message)
      || !/^[A-Za-z0-9_ .,:;()[\]'/-]+$/u.test(message)) return 'safe diagnostic reason unavailable';
  return message;
}

export function assertSafeManagedAvatarUrl(value, base = apiBaseUrl) {
  if (base !== apiBaseUrl) fail('Avatar URL is not a safe managed URL.');
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 300) fail('Avatar URL is not a safe managed URL.');
  let parsed;
  try { parsed = new URL(value); } catch { fail('Avatar URL is not a safe managed URL.'); }
  const expected = new URL(base);
  if (parsed.protocol !== 'https:' || parsed.origin !== expected.origin
      || parsed.username || parsed.password || parsed.href !== value
      || parsed.search || parsed.hash || !managedUpload.test(parsed.pathname)) {
    fail('Avatar URL is not a safe managed URL.');
  }
  return value;
}

// Remote bytes are inspected and discarded, never persisted. Restoration uses
// the original managed URL, not a downloaded file. The prefix is a media-type
// guard, not a claim that an entire image has been decoded or authenticated.
export async function inspectManagedAvatar({ fetchImpl, url, token, requireUploadId = false, timeoutMs = 15000 }) {
  const reason = 'Owner avatar media did not read back safely.';
  assertSafeManagedAvatarUrl(url);
  if (!url || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) fail(reason);
  const controller = new AbortController();
  let reader; let response; let complete = false;
  const expiresAt = performance.now() + timeoutMs;
  const bounded = async (operation) => {
    let timer;
    const remaining = expiresAt - performance.now();
    if (remaining <= 0) { controller.abort(); fail(reason); }
    try {
      return await Promise.race([operation(), new Promise((_, reject) => {
        const expired = () => { controller.abort(); reject(new Error(reason)); };
        timer = setTimeout(expired, remaining);
      })]);
    } finally { clearTimeout(timer); }
  };
  const maxBytes = 8 * 1024 * 1024;
  try {
    response = await bounded(() => fetchImpl(url, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'identity' },
    }));
    if (response.status !== 200 || response.redirected !== false || response.url !== url) fail(reason);
    const type = response.headers.get('content-type');
    const extension = new URL(url).pathname.split('.').at(-1).toLowerCase();
    const expectedType = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[extension];
    if (type !== expectedType) fail(reason);
    const encoding = response.headers.get('content-encoding');
    if (encoding !== null && encoding !== 'identity') fail(reason);
    const length = response.headers.get('content-length');
    if (length !== null && (!/^[1-9][0-9]{0,7}$/u.test(length) || Number(length) > maxBytes)) fail(reason);
    const uploadId = response.headers.get('x-upload-id');
    if (requireUploadId && !isUploadId(uploadId)) fail(reason);
    reader = response.body.getReader();
    let byteLength = 0;
    const prefix = Buffer.alloc(12);
    while (true) {
      const { done, value } = await bounded(() => reader.read());
      if (done) break;
      if (!(value instanceof Uint8Array) || value.length === 0 || value.length > maxBytes - byteLength) fail(reason);
      if (byteLength < prefix.length) prefix.set(value.subarray(0, prefix.length - byteLength), byteLength);
      byteLength += value.length;
    }
    if (byteLength === 0 || (length !== null && Number(length) !== byteLength)) fail(reason);
    const validPrefix = type === 'image/png'
      ? byteLength >= 8 && prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : type === 'image/jpeg'
        ? byteLength >= 3 && prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255
        : byteLength >= 12 && prefix.subarray(0, 4).equals(Buffer.from('RIFF')) && prefix.subarray(8, 12).equals(Buffer.from('WEBP'));
    if (!validPrefix) fail(reason);
    complete = true;
    return { byteLength, contentType: type, uploadId: requireUploadId ? uploadId : null };
  } catch {
    fail(reason); // Never expose transport messages, headers, URLs or credentials.
  } finally {
    if (!complete) {
      controller.abort();
      // Cancellation must not let an uncooperative stream delay the deadline.
      try { Promise.resolve(reader ? reader.cancel() : response?.body?.cancel()).catch(() => {}); } catch { /* sanitized above */ }
    }
    try { reader?.releaseLock(); } catch { /* no transport details escape */ }
  }
}

function isUploadId(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, body) {
  const name = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([name, body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload), 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, payload, crc]);
}

// Deterministic, clearly synthetic 128x128 avatar: cobalt background, head,
// hair and shoulders. It is real PNG bytes and is written outside the repo.
export function syntheticAvatarFixtureBytes() {
  const width = 128;
  const rows = [];
  for (let y = 0; y < width; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const dx = x - 64; const dy = y - 54;
      const head = dx * dx + dy * dy < 27 * 27;
      const hair = dy < -8 && dx * dx + (dy + 5) * (dy + 5) < 30 * 30;
      const shoulders = y > 82 && Math.abs(x - 64) < 50;
      const offset = 1 + x * 4;
      const color = hair ? [27, 35, 58, 255] : head ? [247, 190, 148, 255]
        : shoulders ? [47, 102, 184, 255] : [226, 238, 255, 255];
      row.set(color, offset);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(width, 4);
  header[8] = 8; header[9] = 6;
  const raw = Buffer.concat(rows);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function writeSyntheticAvatarFixture(directory) {
  const root = realpathSync(directory);
  if (root === repositoryRoot || root.startsWith(`${repositoryRoot}/`)) fail('Fixture directory must be outside the repository.');
  chmodSync(root, 0o700);
  const path = join(root, fixtureDisplayName);
  const bytes = syntheticAvatarFixtureBytes();
  writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
  chmodSync(path, 0o600);
  return Object.freeze({ path, displayName: fixtureDisplayName, sha256: sha256(bytes) });
}

import { deflateSync } from 'node:zlib';

export function parseExactNewestMediaRow(output, expectedName = fixtureDisplayName) {
  const rows = String(output).split(/\r?\n/u).map((line) => {
    const id = /(?:^|\s)_id=(\d+)(?:,|$)/u.exec(line)?.[1];
    const name = /(?:^|\s)_display_name=([^,]+)(?:,|$)/u.exec(line)?.[1];
    const added = /(?:^|\s)date_added=(\d+)(?:,|$)/u.exec(line)?.[1];
    return id && name && added ? { id: Number(id), name, added: Number(added) } : null;
  }).filter(Boolean);
  const exact = rows.filter((row) => row.name === expectedName);
  if (exact.length !== 1) fail('The controlled Android media fixture is not unique.');
  const newest = [...rows].sort((a, b) => b.added - a.added || b.id - a.id)[0];
  if (!newest || newest.id !== exact[0].id) fail('The controlled Android media fixture is not newest.');
  return exact[0];
}

export function parseProfileAvatarRegressionArguments(values) {
  const args = { adb: 'adb' };
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!['--source-vault-file', '--candidate-dir', '--adb'].includes(value)) fail('Unknown profile-avatar runner argument.');
    const next = values[++i];
    if (!next || next.startsWith('--')) fail('Profile-avatar runner argument value is missing.');
    args[value.slice(2).replaceAll('-', '') === 'sourcevaultfile' ? 'sourceVaultFile'
      : value.slice(2).replaceAll('-', '') === 'candidatedir' ? 'candidateDirectory' : 'adb'] = next;
  }
  if (!args.sourceVaultFile || !args.candidateDirectory) fail('Profile-avatar runner requires source vault and candidate archive.');
  return Object.freeze(args);
}

async function request(fetchImpl, path, { baseUrl = apiBaseUrl, method = 'GET', token = null, body, expected = [200], headers = {} } = {}) {
  if (!/^\/[A-Za-z0-9_./?=&%-]+$/u.test(path) || path.includes('://') || /payment|stripe/iu.test(path)) fail('Unsafe Staging API path.');
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body instanceof FormData ? {} : body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  });
  const raw = await response.text();
  let value = null; try { value = raw ? JSON.parse(raw) : null; } catch { /* sanitized */ }
  if (!expected.includes(response.status)) fail(`Staging ${method} request failed with HTTP ${response.status}.`);
  return value;
}

async function loginAndReadOriginal({ fetchImpl, account, baseUrl }) {
  const session = await request(fetchImpl, '/auth/login', { baseUrl, method: 'POST', body: { email: account.email, password: account.password } });
  if (typeof session?.accessToken !== 'string' || session.accessToken.length < 20) fail('Owner login did not return a usable session.');
  const own = await request(fetchImpl, '/auth/me', { baseUrl, token: session.accessToken });
  const id = own?.user?.id;
  if (typeof id !== 'string' || !id) fail('Owner identity did not read back safely.');
  const photoURL = typeof own.user.photoURL === 'string' && own.user.photoURL ? own.user.photoURL : null;
  assertSafeManagedAvatarUrl(photoURL, baseUrl);
  return { token: session.accessToken, id, photoURL };
}

async function readProfiles({ fetchImpl, baseUrl, token, id }) {
  const own = await request(fetchImpl, '/auth/me', { baseUrl, token });
  const publicProfile = await request(fetchImpl, `/profiles/${encodeURIComponent(id)}`, { baseUrl, token });
  const ownUrl = typeof own?.user?.photoURL === 'string' && own.user.photoURL ? own.user.photoURL : null;
  const publicUrl = typeof publicProfile?.user?.photoURL === 'string' && publicProfile.user.photoURL ? publicProfile.user.photoURL : null;
  assertSafeManagedAvatarUrl(ownUrl, baseUrl); assertSafeManagedAvatarUrl(publicUrl, baseUrl);
  return { ownUrl, publicUrl, ownHash: ownUrl ? sha256(ownUrl) : null, publicHash: publicUrl ? sha256(publicUrl) : null };
}

function mediaInventory({ commandRunner, adbPath, device }) {
  return currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'content', 'query', '--uri', 'content://media/external/images/media', '--projection', '_id:_display_name:date_added']);
}

function tapNode(commandRunner, adbPath, device, node) {
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(currentHeadAndroidNodeAttribute(node, 'bounds') ?? '');
  if (!bounds) fail('Photo-picker tile bounds are unavailable.');
  currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'tap', String(Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2)), String(Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2))]);
}

function hasLabel(hierarchy, label) { return currentHeadAndroidNamedNodes(hierarchy, label).length > 0; }

async function openProfileEditor({ commandRunner, adbPath, device, wait }) {
  const main = await openMainDestination({ commandRunner, adbPath, device, wait, label: 'Mein SIT' });
  tapLabel(commandRunner, adbPath, device, main, 'Kontoeinstellungen');
  const settings = await waitForHierarchy({ commandRunner, adbPath, device, wait, label: 'account settings', predicate: (h) => hasLabel(h, 'Profilinformationen') });
  tapLabel(commandRunner, adbPath, device, settings, 'Profilinformationen');
  return waitForHierarchy({ commandRunner, adbPath, device, wait, label: 'profile editor', predicate: (h) => hasLabel(h, 'Foto ändern') && hasLabel(h, 'Speichern') });
}

async function selectPhotoPickerFixture({ commandRunner, adbPath, device, wait }) {
  let editor = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  tapLabel(commandRunner, adbPath, device, editor, 'Foto ändern');
  const sheet = await waitForHierarchy({ commandRunner, adbPath, device, wait, label: 'photo source sheet', predicate: (h) => hasLabel(h, 'Foto aus Galerie wählen') });
  tapLabel(commandRunner, adbPath, device, sheet, 'Foto aus Galerie wählen');
  const picker = await waitForHierarchy({ commandRunner, adbPath, device, wait, label: 'system photo picker', predicate: (h) => String(h).includes(`package="${pickerPackage}"`) });
  const tiles = String(picker).match(/<node\b[^>]*>/gu)?.filter((node) => currentHeadAndroidNodeAttribute(node, 'package') === pickerPackage && currentHeadAndroidNodeAttribute(node, 'clickable') === 'true') ?? [];
  const tile = tiles.map((node) => ({ node, bounds: /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(currentHeadAndroidNodeAttribute(node, 'bounds') ?? '') })).find(({ bounds }) => bounds && Number(bounds[3]) - Number(bounds[1]) >= 200 && Number(bounds[4]) - Number(bounds[2]) >= 200);
  if (!tile) fail('System photo picker fixture tile is unavailable.');
  tapNode(commandRunner, adbPath, device, tile.node);
  const selected = await waitForHierarchy({ commandRunner, adbPath, device, wait, label: 'photo picker selection', predicate: (h) => hasLabel(h, 'Fertig') });
  tapLabel(commandRunner, adbPath, device, selected, 'Fertig');
  editor = await waitForHierarchy({ commandRunner, adbPath, device, wait, label: 'returned profile editor', predicate: (h) => hasLabel(h, 'Foto ändern') && hasLabel(h, 'Speichern') });
  return { systemSurface: pickerPackage, selected: true, returnedToEditor: Boolean(editor) };
}

async function saveProfile({ commandRunner, adbPath, device, wait }) {
  const editor = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  tapLabel(commandRunner, adbPath, device, editor, 'Speichern');
  const dialog = await waitForHierarchy({ commandRunner, adbPath, device, wait, label: 'profile save dialog', predicate: (h) => hasLabel(h, 'Gespeichert') && hasLabel(h, 'OK') });
  tapLabel(commandRunner, adbPath, device, dialog, 'OK');
  const returned = await waitForHierarchy({ commandRunner, adbPath, device, wait, label: 'returned account settings', predicate: (h) => hasLabel(h, 'Kontoeinstellungen') });
  return { successDialogVisible: true, returnedToAccountSettings: Boolean(returned) };
}

function surfaceEvidence(hierarchy, displayName) {
  const nodes = String(hierarchy).match(/<node\b[^>]*>/gu) ?? [];
  return { displayNameVisible: hasLabel(hierarchy, displayName), imageWidgetObserved: nodes.some((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.ImageView') };
}

async function captureOwnerSurfaces({ commandRunner, adbPath, device, wait, displayName }) {
  const profile = await openMainDestination({ commandRunner, adbPath, device, wait, label: 'Mein SIT' });
  const card = surfaceEvidence(profile, displayName);
  let publicProfileVisible = false;
  let publicProfileImageWidgetObserved = false;
  if (card.displayNameVisible && hasLabel(profile, 'Mein Profil anzeigen')) {
    try {
      tapLabel(commandRunner, adbPath, device, profile, 'Mein Profil anzeigen');
      const publicProfile = await waitForHierarchy({
        commandRunner, adbPath, device, wait, label: 'public profile',
        predicate: (h) => hasLabel(h, 'Öffentliches Profil') && hasLabel(h, displayName),
      });
      publicProfileVisible = Boolean(publicProfile);
      publicProfileImageWidgetObserved = surfaceEvidence(
        publicProfile,
        displayName,
      ).imageWidgetObserved;
      currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
    } catch {
      // A route without a deterministic public-profile action is evidence of
      // an unavailable surface, never a reason to claim it passed.
    }
  }
  return {
    profileCardVisible: card.displayNameVisible,
    navigationVisible: hasLabel(profile, 'Mein SIT'),
    publicProfileVisible,
    avatarImageWidgetObserved: card.imageWidgetObserved,
    publicProfileImageWidgetObserved,
    avatarRenderDeterministic: false,
  };
}

async function restartAndCaptureOwnerSurfaces({
  commandRunner,
  adbPath,
  device,
  wait,
  displayName,
}) {
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'am', 'force-stop', applicationId,
  ]);
  await wait(750);
  return captureOwnerSurfaces({
    commandRunner,
    adbPath,
    device,
    wait,
    displayName,
  });
}

export async function runAndroidProfileAvatarRegression({ candidate, deviceSummary, operations, capturedAt = new Date().toISOString() }) {
  if (!candidate || !operations || typeof operations.prepare !== 'function' || typeof operations.mutate !== 'function' || typeof operations.readSynthetic !== 'function' || typeof operations.restartSynthetic !== 'function' || typeof operations.restore !== 'function' || typeof operations.readRestored !== 'function' || typeof operations.restartRestored !== 'function' || typeof operations.cleanup !== 'function') fail('Profile-avatar regression operation contract is invalid.');
  let primary = null; let restore = null; let cleanup = null; let state;
  try {
    state = await operations.prepare();
    if (state?.photoPicker?.systemSurface !== pickerPackage
        || state.photoPicker.selected !== true
        || state.photoPicker.returnedToEditor !== true
        || state?.save?.successDialogVisible !== true
        || state.save.returnedToAccountSettings !== true) {
      fail('Profile-avatar picker or save proof is incomplete.');
    }
    await operations.mutate(state);
    const synthetic = await operations.readSynthetic(state);
    if (synthetic?.changedFromOriginal !== true
        || synthetic.authMePhotoUrlSha256 === null
        || synthetic.authMePhotoUrlSha256 !== synthetic.publicProfilePhotoUrlSha256) {
      fail('Profile-avatar synthetic server proof is incomplete.');
    }
    const restartSynthetic = await operations.restartSynthetic(state);
    if (restartSynthetic?.profileCardVisible !== true
        || restartSynthetic.navigationVisible !== true
        || restartSynthetic.publicProfileVisible !== true
        || restartSynthetic.avatarImageWidgetObserved !== true
        || restartSynthetic.publicProfileImageWidgetObserved !== true) {
      fail('Profile-avatar restarted UI proof is incomplete.');
    }
    await operations.restore(state);
    restore = await operations.readRestored(state);
    if (restore?.authMeExactOriginal !== true
        || restore.publicProfileExactOriginal !== true) {
      fail('Profile-avatar restored server proof is incomplete.');
    }
    const restartRestored = await operations.restartRestored(state);
    if (restartRestored?.profileCardVisible !== true
        || restartRestored.navigationVisible !== true
        || restartRestored.publicProfileVisible !== true) {
      fail('Profile-avatar restored UI proof is incomplete.');
    }
    cleanup = await operations.cleanup(state);
    if (cleanup?.mediaIdsRemoved !== true
        || cleanup.remoteMediaIds !== 1
        || cleanup.remoteDeleteSecond404 !== true
        || cleanup.remoteFixtureRemoved !== true
        || cleanup.tempFilesRemoved !== true) {
      fail('Profile-avatar cleanup proof is incomplete.');
    }
    return {
      schemaVersion: 1,
      kind: 'sit-pixel-profile-avatar-regression',
      status: 'passed-profile-avatar-regression',
      capturedAt,
      candidate: { applicationId: candidate.applicationId, versionName: candidate.versionName, versionCode: candidate.versionCode, artifactSourceHead: candidate.commit ?? candidate.artifactSourceHead, apiBaseUrl: candidate.apiBaseUrl },
      device: { platform: 'android', physical: deviceSummary?.physical === true, manufacturer: deviceSummary?.manufacturer, model: deviceSummary?.model, containsRawDeviceIdentifier: false },
      checks: {
        ownerLogin: 'passed',
        originalOwnerIdentityCaptured: { idSha256: state.originalOwnerIdSha256 ?? null, avatarPresent: state.originalAvatarUrlSha256 !== null, avatarUrlSha256: state.originalAvatarUrlSha256 ?? null },
        syntheticFixtureSha256: state.fixtureSha256 ?? null,
        photoPicker: state.photoPicker,
        save: state.save,
        serverReadback: synthetic,
        restartPersistence: restartSynthetic,
        restoredServerReadback: restore,
        restoredAfterRestart: restartRestored,
        cleanup,
      },
      boundaries: { containsSecrets: false, containsRawDeviceIdentifier: false, containsPrivateFilesystemPaths: false, paymentEndpointCalled: false, googlePlayChanged: false, productionChanged: false },
    };
  } catch (error) {
    primary = safeError(error);
    try {
      if (state) {
        await operations.restore(state);
        await operations.readRestored(state);
        await operations.restartRestored(state);
        restore = true;
      }
    } catch (restoreError) { restore = `failed: ${safeError(restoreError)}`; }
    try { cleanup = await operations.cleanup(state); } catch (cleanupError) { cleanup = `failed: ${safeError(cleanupError)}`; }
    const failure = new Error(`Profile-avatar regression failed: ${primary}; restore=${restore ? 'attempted' : 'not-attempted'}; cleanup=${cleanup ? 'attempted' : 'not-attempted'}.`);
    failure.profileAvatarFailureReport = { schemaVersion: 1, kind: 'sit-pixel-profile-avatar-regression', status: 'failed-closed', primaryFailure: primary, restore: restore ? 'attempted' : 'not-attempted', cleanup: cleanup ? 'attempted' : 'not-attempted', boundaries: { containsSecrets: false, containsRawDeviceIdentifier: false } };
    throw failure;
  }
}

function createPrivateTempDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'sit-profile-avatar-'));
  chmodSync(directory, 0o700);
  return directory;
}

async function concreteRunner({ sourceVaultFile, candidateDirectory, adbPath = 'adb', fetchImpl = fetch, commandRunner = defaultCurrentHeadAndroidCommandRunner, wait = async (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const current = await validateCurrentRolloverCandidate({ repositoryRoot });
  const candidateRoot = realpathSync(resolve(candidateDirectory));
  if (candidateRoot !== realpathSync(dirname(current.archive.apkPath)) || current.candidate.versionCode !== '2026092803') fail('Current Google Play candidate is not the exact 2026092803 archive.');
  const devices = parseAdbDevices(commandRunner(adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ commandRunner, adbPath, device });
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, { ...current.candidate, versionName: current.candidate.versionName, buildNumber: current.candidate.versionCode, android: current.archive });
  if (installed.delivery !== 'google-play-split') fail('Installed candidate is not Google Play delivered.');
  const { vault } = readEmailVerifiedJourneyVault(sourceVaultFile);
  const temp = createPrivateTempDirectory();
  const fixture = writeSyntheticAvatarFixture(temp);
  let mediaId = null; let original; let token; let id; let uiUpload;
  const cleanupMedia = () => {
    if (mediaId !== null) currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'content', 'delete', '--uri', 'content://media/external/images/media', '--where', `_id=${mediaId}`]);
    currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'rm', '-f', `/sdcard/Download/${fixtureDisplayName}`]);
    const remoteState = currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'sh', '-c', `if [ -e /sdcard/Download/${fixtureDisplayName} ]; then echo present; else echo absent; fi`]);
    if (!/^absent\s*$/u.test(remoteState)) fail('The exact Android remote fixture was not removed.');
    const remaining = mediaInventory({ commandRunner, adbPath, device });
    if (String(remaining).split(/\r?\n/u).some((line) => line.includes(`_display_name=${fixtureDisplayName}`))) fail('The exact Android media fixture was not removed.');
  };
  const operations = {
    prepare: async () => {
      try {
        ({ token, id, photoURL: original } = await loginAndReadOriginal({ fetchImpl, account: vault.accounts.find((a) => a.role === 'owner'), baseUrl: current.candidate.apiBaseUrl }));
        if (original) {
          await inspectManagedAvatar({ fetchImpl, url: original, token });
        }
        currentHeadAndroidAdb(commandRunner, adbPath, device, ['push', fixture.path, `/sdcard/Download/${fixtureDisplayName}`]);
        currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file:///sdcard/Download/${fixtureDisplayName}`]);
        const row = parseExactNewestMediaRow(mediaInventory({ commandRunner, adbPath, device })); mediaId = row.id;
        await bindExactRole({ vault, role: 'owner', commandRunner, adbPath, device, wait });
        const photoPicker = await openProfileEditor({ commandRunner, adbPath, device, wait }).then(() => selectPhotoPickerFixture({ commandRunner, adbPath, device, wait }));
        const save = await saveProfile({ commandRunner, adbPath, device, wait });
        const uiReadback = await readProfiles({ fetchImpl, baseUrl: current.candidate.apiBaseUrl, token, id });
        if (!uiReadback.ownUrl || uiReadback.ownUrl === original || uiReadback.publicUrl !== uiReadback.ownUrl) fail('Photo-picker profile save did not produce a changed exact server readback.');
        uiUpload = { id: (await inspectManagedAvatar({ fetchImpl, url: uiReadback.ownUrl, token, requireUploadId: true })).uploadId, url: uiReadback.ownUrl };
        return { photoPicker, save, original, id, uiUpload, originalOwnerIdSha256: sha256(id), originalAvatarUrlSha256: original ? sha256(original) : null, fixtureSha256: fixture.sha256 };
      } catch (error) {
        if (token && id && original !== undefined) {
          try { await request(fetchImpl, '/profile', { baseUrl: current.candidate.apiBaseUrl, method: 'PATCH', token, body: { photoURL: original } }); } catch { /* final failure remains fail-closed */ }
        }
        if (token && uiUpload?.id) {
          try { await request(fetchImpl, `/uploads/${encodeURIComponent(uiUpload.id)}`, { baseUrl: current.candidate.apiBaseUrl, method: 'DELETE', token, expected: [204, 404] }); } catch { /* preserve primary failure */ }
        }
        try { cleanupMedia(); } catch { /* preserve primary failure */ }
        throw error;
      }
    },
    mutate: async (state) => { if (!state?.uiUpload?.id) fail('The UI profile upload identifier is unavailable.'); },
    readSynthetic: async (state) => { const read = await readProfiles({ fetchImpl, baseUrl: current.candidate.apiBaseUrl, token, id }); if (read.ownUrl !== state.uiUpload.url || read.publicUrl !== state.uiUpload.url) fail('Synthetic avatar server readback did not match.'); return { authMePhotoUrlSha256: read.ownHash, publicProfilePhotoUrlSha256: read.publicHash, changedFromOriginal: true }; },
    restartSynthetic: async () => restartAndCaptureOwnerSurfaces({ commandRunner, adbPath, device, wait, displayName: vault.accounts.find((a) => a.role === 'owner').displayName }),
    restore: async () => { await request(fetchImpl, '/profile', { baseUrl: current.candidate.apiBaseUrl, method: 'PATCH', token, body: { photoURL: original } }); },
    readRestored: async () => { const read = await readProfiles({ fetchImpl, baseUrl: current.candidate.apiBaseUrl, token, id }); if (read.ownUrl !== original || read.publicUrl !== original) fail('Original avatar server readback did not restore exactly.'); return { authMeExactOriginal: true, publicProfileExactOriginal: true, originalPhotoUrlSha256: original ? sha256(original) : null }; },
    restartRestored: async () => restartAndCaptureOwnerSurfaces({ commandRunner, adbPath, device, wait, displayName: vault.accounts.find((a) => a.role === 'owner').displayName }),
    cleanup: async (state) => { cleanupMedia(); const ids = [...new Set([state?.uiUpload?.id, uiUpload?.id].filter(Boolean))]; for (const remoteId of ids) { const path = `/uploads/${encodeURIComponent(remoteId)}`; await request(fetchImpl, path, { baseUrl: current.candidate.apiBaseUrl, method: 'DELETE', token, expected: [204, 404] }); await request(fetchImpl, path, { baseUrl: current.candidate.apiBaseUrl, method: 'DELETE', token, expected: [404] }); } rmSync(temp, { recursive: true, force: true }); return { mediaIdsRemoved: true, remoteMediaIds: ids.length, remoteDeleteSecond404: true, remoteFixtureRemoved: true, tempFilesRemoved: true }; },
  };
  try { return await runAndroidProfileAvatarRegression({ candidate: current.candidate, deviceSummary, operations }); } finally { if (existsSync(temp)) rmSync(temp, { recursive: true, force: true }); }
}

export { safeError };

if (import.meta.url === `file://${process.argv[1]}`) {
  try { const args = parseProfileAvatarRegressionArguments(process.argv.slice(2)); const result = await concreteRunner(args); process.stdout.write(`${JSON.stringify(result)}\n`); }
  catch (error) { process.stderr.write(`PROFILE_AVATAR_REGRESSION_FIX: ${safeError(error)}\n`); process.exitCode = 1; }
}
