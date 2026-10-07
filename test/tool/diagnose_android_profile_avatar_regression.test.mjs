import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  assertSafeManagedAvatarUrl,
  inspectManagedAvatar,
  parseExactNewestMediaRow,
  parseProfileAvatarRegressionArguments,
  runAndroidProfileAvatarRegression,
  safeError,
  syntheticAvatarFixtureBytes,
} from '../../tool/diagnose_android_profile_avatar_regression.mjs';

test('accepts only the unique newest namespaced Android media row', () => {
  const output = [
    'Row: 0 _id=11, _display_name=older.png, date_added=10',
    'Row: 1 _id=12, _display_name=SIT_PROFILE_2803_SYNTHETIC_AVATAR.png, date_added=20',
  ].join('\n');
  assert.deepEqual(parseExactNewestMediaRow(output), { id: 12, name: 'SIT_PROFILE_2803_SYNTHETIC_AVATAR.png', added: 20 });
  assert.throws(() => parseExactNewestMediaRow(output.replace('date_added=20', 'date_added=9')), /newest/u);
  assert.throws(() => parseExactNewestMediaRow(`${output}\nRow: 2 _id=13, _display_name=SIT_PROFILE_2803_SYNTHETIC_AVATAR.png, date_added=21`), /unique/u);
});

test('requires explicit source vault and candidate archive arguments', () => {
  assert.deepEqual(parseProfileAvatarRegressionArguments([
    '--source-vault-file', '/private/vault.json', '--candidate-dir', '/private/archive', '--adb', '/usr/bin/adb',
  ]), { sourceVaultFile: '/private/vault.json', candidateDirectory: '/private/archive', adb: '/usr/bin/adb' });
  assert.throws(() => parseProfileAvatarRegressionArguments(['--candidate-dir', '/private/archive']), /requires source vault/u);
  assert.throws(() => parseProfileAvatarRegressionArguments(['--unsafe', 'x']), /Unknown/u);
});

test('accepts only the exact staging managed avatar URL shape', () => {
  const good = 'https://staging.shareittoo.com/api/v1/uploads/123e4567-e89b-12d3-a456-426614174000-full.png';
  assert.equal(assertSafeManagedAvatarUrl(good), good);
  assert.throws(() => assertSafeManagedAvatarUrl('https://evil.example/api/v1/uploads/123e4567-e89b-12d3-a456-426614174000-full.png'), /safe managed/u);
  assert.throws(() => assertSafeManagedAvatarUrl(`${good}?download=1`), /safe managed/u);
  assert.throws(() => assertSafeManagedAvatarUrl('https://staging.shareittoo.com/api/v1/uploads/not-a-uuid-full.png'), /safe managed/u);
  assert.equal(assertSafeManagedAvatarUrl(null), null);
  for (const unsafe of [
    good.replace('https://', 'https://user:pass@'),
    good.replace('/api/', '/other/../api/'),
    good.replace('https://', 'https:\\\\'),
    good.replace('.com/', '.com:443/'),
    good.replace('staging.', 'STAGING.'),
    `${good}#fragment`, `${good}\n`,
  ]) assert.throws(() => assertSafeManagedAvatarUrl(unsafe), /safe managed/u);
  assert.throws(() => assertSafeManagedAvatarUrl(good, 'https://other.invalid/api/v1'), /safe managed/u);
});

const avatarId = '123e4567-e89b-12d3-a456-426614174000';
const avatarUrl = `https://staging.shareittoo.com/api/v1/uploads/${avatarId}-full.png`;
const mediaFailure = 'Owner avatar media did not read back safely.';
function mediaResponse({ bytes = syntheticAvatarFixtureBytes(), chunks = [bytes], headers = {}, ...overrides } = {}) {
  return {
    status: 200, redirected: false, url: avatarUrl,
    headers: new Headers({ 'content-type': 'image/png', 'x-upload-id': avatarId, ...headers }),
    body: new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } }),
    ...overrides,
  };
}
async function inspectResponse(response, options = {}) {
  return inspectManagedAvatar({ fetchImpl: async () => response, url: avatarUrl, token: 'synthetic', ...options });
}

test('remote inspection uses exact GET, forbids redirects and returns no downloaded bytes or paths', async () => {
  const bytes = syntheticAvatarFixtureBytes();
  const result = await inspectManagedAvatar({
    url: avatarUrl, token: 'synthetic', requireUploadId: true,
    fetchImpl: async (url, options) => {
      assert.equal(url, avatarUrl);
      assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer synthetic');
      assert.equal(options.headers['Accept-Encoding'], 'identity');
      assert.equal(options.signal.aborted, false);
      return mediaResponse({ chunks: [bytes.subarray(0, 2), bytes.subarray(2, 9), bytes.subarray(9)], headers: {
        'content-length': String(bytes.length), 'content-disposition': 'attachment; filename="../../untrusted.bin"',
      } });
    },
  });
  assert.deepEqual(result, { byteLength: bytes.length, contentType: 'image/png', uploadId: avatarId });
});

test('remote bytes have no filesystem sink; only the generated synthetic fixture is written', () => {
  const source = readFileSync(new URL('../../tool/diagnose_android_profile_avatar_regression.mjs', import.meta.url), 'utf8');
  assert.equal((source.match(/writeFileSync\(/gu) ?? []).length, 1);
  assert.match(source, /writeFileSync\(path, bytes, \{ mode: 0o600, flag: 'wx' \}\)/u);
  assert.doesNotMatch(source, /originalBytesPath|original-owner-avatar\.bin|response\.arrayBuffer/u);
});

test('unsafe URLs fail before any credential-bearing fetch', async () => {
  for (const url of [null, `${avatarUrl}?next=other`, avatarUrl.replace('staging.shareittoo.com', 'other.invalid'), avatarUrl.replace('https://', 'https://user@')]) {
    let calls = 0;
    await assert.rejects(inspectManagedAvatar({ url, token: 'synthetic', fetchImpl: async () => { calls += 1; } }));
    assert.equal(calls, 0);
  }
});

for (const [label, overrides] of Object.entries({
  'redirect status': { status: 302 },
  'followed redirect': { redirected: true },
  'foreign response': { url: 'https://other.invalid/avatar.png' },
  'different managed response': { url: avatarUrl.replace('-full.', '-thumb.') },
  'missing final response URL': { url: '' },
  'failed status': { status: 403 },
  'HTML content type': { headers: { 'content-type': 'text/html' } },
  'MIME-extension mismatch': { headers: { 'content-type': 'image/jpeg' } },
  'compressed response': { headers: { 'content-encoding': 'gzip' } },
  'oversized declared length': { headers: { 'content-length': '8388609' } },
  'negative declared length': { headers: { 'content-length': '-1' } },
  'ambiguous declared length': { headers: { 'content-length': '1, 2' } },
  'incorrect declared length': { headers: { 'content-length': '1' } },
  'HTML with image MIME': { bytes: Buffer.from('<html>untrusted</html>') },
  'empty response': { chunks: [] },
  'invalid chunk': { chunks: ['untrusted'] },
  'empty chunk': { chunks: [new Uint8Array()] },
  'missing body': { body: null },
  'missing owner ID': { headers: { 'x-upload-id': '' } },
  'unsafe owner ID': { headers: { 'x-upload-id': '../../untrusted' } },
})) {
  test(`remote inspection rejects ${label} with sanitized failure`, async () => {
    await assert.rejects(inspectResponse(mediaResponse(overrides), { requireUploadId: true }), { message: mediaFailure });
  });
}

test('stream size is enforced without trusting the length header, with cancellation', async () => {
  let cancelled = false; let pulls = 0;
  const body = new ReadableStream({
    pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  await assert.rejects(inspectResponse(mediaResponse({ body })), { message: mediaFailure });
  assert.equal(pulls, 9); assert.equal(cancelled, true);
});

test('exact maximum size is accepted and no response bytes are retained', async () => {
  const bytes = Buffer.alloc(8 * 1024 * 1024);
  syntheticAvatarFixtureBytes().copy(bytes);
  assert.deepEqual(await inspectResponse(mediaResponse({ bytes })), { byteLength: bytes.length, contentType: 'image/png', uploadId: null });
});

test('JPEG and WebP signatures must agree with the managed extension and MIME', async () => {
  for (const [extension, type, bytes] of [
    ['jpg', 'image/jpeg', Buffer.from([255, 216, 255, 224])],
    ['jpeg', 'image/jpeg', Buffer.from([255, 216, 255, 224])],
    ['webp', 'image/webp', Buffer.from('RIFF0000WEBP')],
  ]) {
    const url = avatarUrl.replace('.png', `.${extension}`);
    const response = mediaResponse({ bytes, url, headers: { 'content-type': type } });
    assert.equal((await inspectResponse(response, { url })).contentType, type);
    await assert.rejects(inspectResponse(mediaResponse({ bytes: Buffer.from('not an image'), url, headers: { 'content-type': type } }), { url }), { message: mediaFailure });
    if (extension === 'webp') {
      const nonAscii = Buffer.from(bytes); nonAscii[0] |= 128;
      await assert.rejects(inspectResponse(mediaResponse({ bytes: nonAscii, url, headers: { 'content-type': type } }), { url }), { message: mediaFailure });
    }
  }
});

test('transport and stream exceptions are sanitized', async () => {
  const unsafe = new Error('https://other.invalid/private /private/secret synthetic auth');
  await assert.rejects(inspectManagedAvatar({ url: avatarUrl, token: 'synthetic', fetchImpl: async () => { throw unsafe; } }), { message: mediaFailure });
  const body = new ReadableStream({ pull(controller) { controller.error(unsafe); } });
  await assert.rejects(inspectResponse(mediaResponse({ body })), { message: mediaFailure });
});

test('header and stalled-body deadlines abort even an uncooperative transport or cancellation', async () => {
  let signal;
  await assert.rejects(inspectManagedAvatar({ url: avatarUrl, token: 'synthetic', timeoutMs: 10,
    fetchImpl: async (_, options) => { signal = options.signal; return new Promise(() => {}); },
  }), { message: mediaFailure });
  assert.equal(signal.aborted, true);
  let cancelled = false;
  const body = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; return new Promise(() => {}); } });
  await assert.rejects(inspectResponse(mediaResponse({ body }), { timeoutMs: 10 }), { message: mediaFailure });
  assert.equal(cancelled, true);
});

test('synthetic fixture bytes are deterministic and a real PNG', () => {
  const first = syntheticAvatarFixtureBytes();
  const second = syntheticAvatarFixtureBytes();
  assert.deepEqual(first, second);
  assert.deepEqual([...first.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(first.length > 500);
});

test('failure path is fail-closed and always attempts restore and cleanup', async () => {
  const calls = [];
  await assert.rejects(() => runAndroidProfileAvatarRegression({
    candidate: { applicationId: 'com.shareittoo.app', versionName: '1.0.0', versionCode: '2026092803', apiBaseUrl: 'https://staging.shareittoo.com/api/v1' },
    deviceSummary: { physical: true, manufacturer: 'Google', model: 'Pixel' },
    operations: {
      prepare: async () => {
        calls.push('prepare');
        return {
          photoPicker: {
            systemSurface: 'com.google.android.photopicker',
            selected: true,
            returnedToEditor: true,
          },
          save: {
            successDialogVisible: true,
            returnedToAccountSettings: true,
          },
        };
      },
      mutate: async () => { calls.push('mutate'); throw new Error('bounded synthetic mutation failed'); },
      readSynthetic: async () => {}, restartSynthetic: async () => {},
      restore: async () => { calls.push('restore'); return true; },
      readRestored: async () => { calls.push('readRestored'); }, restartRestored: async () => { calls.push('restartRestored'); },
      cleanup: async () => { calls.push('cleanup'); return true; },
    },
  }), (error) => {
    assert.match(error.message, /failed/u);
    assert.deepEqual(error.profileAvatarFailureReport.boundaries, { containsSecrets: false, containsRawDeviceIdentifier: false });
    return true;
  });
  assert.deepEqual(calls, ['prepare', 'mutate', 'restore', 'readRestored', 'restartRestored', 'cleanup']);
});

test('success evidence stays sanitized and records restart plus exact restore gates', async () => {
  const result = await runAndroidProfileAvatarRegression({
    candidate: { applicationId: 'com.shareittoo.app', versionName: '1.0.0', versionCode: '2026092803', artifactSourceHead: 'a'.repeat(40), apiBaseUrl: 'https://staging.shareittoo.com/api/v1' },
    deviceSummary: { physical: true, manufacturer: 'Google', model: 'Pixel 7 Pro' },
    operations: {
      prepare: async () => ({
        photoPicker: {
          systemSurface: 'com.google.android.photopicker',
          selected: true,
          returnedToEditor: true,
        },
        save: { successDialogVisible: true, returnedToAccountSettings: true },
      }),
      mutate: async () => {},
      readSynthetic: async () => ({
        authMePhotoUrlSha256: '1'.repeat(64),
        publicProfilePhotoUrlSha256: '1'.repeat(64),
        changedFromOriginal: true,
      }),
      restartSynthetic: async () => ({
        profileCardVisible: true,
        navigationVisible: true,
        publicProfileVisible: true,
        avatarImageWidgetObserved: true,
        publicProfileImageWidgetObserved: true,
      }),
      restore: async () => {},
      readRestored: async () => ({
        authMeExactOriginal: true,
        publicProfileExactOriginal: true,
      }),
      restartRestored: async () => ({
        profileCardVisible: true,
        navigationVisible: true,
        publicProfileVisible: true,
      }),
      cleanup: async () => ({
        mediaIdsRemoved: true,
        remoteMediaIds: 1,
        remoteDeleteSecond404: true,
        remoteFixtureRemoved: true,
        tempFilesRemoved: true,
      }),
    },
  });
  assert.equal(result.status, 'passed-profile-avatar-regression');
  assert.equal(result.checks.restartPersistence.profileCardVisible, true);
  assert.equal(result.checks.cleanup.mediaIdsRemoved, true);
  assert.equal(result.boundaries.containsSecrets, false);
  assert.doesNotMatch(JSON.stringify(result), /password|token|\/Users\//iu);
});

test('sanitized error never exposes credentials, URLs, or private paths', () => {
  assert.equal(safeError(new Error('password alice@example.com https://staging.shareittoo.com /Users/private')), 'safe diagnostic reason unavailable');
  assert.equal(safeError(new Error('safe bounded restore failure')), 'safe bounded restore failure');
});
