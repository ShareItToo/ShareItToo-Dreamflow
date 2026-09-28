import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSafeManagedAvatarUrl,
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
      prepare: async () => { calls.push('prepare'); return { }; },
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
      prepare: async () => ({ photoPicker: { systemSurface: 'com.google.android.photopicker', selected: true }, save: { successDialogVisible: true } }),
      mutate: async () => {},
      readSynthetic: async () => ({ ownUrl: 'synthetic', publicUrl: 'synthetic' }),
      restartSynthetic: async () => ({ displayNameVisible: true }),
      restore: async () => {},
      readRestored: async () => ({ ownUrl: null, publicUrl: null }),
      restartRestored: async () => ({ displayNameVisible: true }),
      cleanup: async () => ({ mediaIdsRemoved: true, remoteFixtureRemoved: true, tempFilesRemoved: true }),
    },
  });
  assert.equal(result.status, 'passed-profile-avatar-regression');
  assert.equal(result.checks.restartPersistence.displayNameVisible, true);
  assert.equal(result.checks.cleanup.mediaIdsRemoved, true);
  assert.equal(result.boundaries.containsSecrets, false);
  assert.doesNotMatch(JSON.stringify(result), /password|token|\/Users\//iu);
});

test('sanitized error never exposes credentials, URLs, or private paths', () => {
  assert.equal(safeError(new Error('password alice@example.com https://staging.shareittoo.com /Users/private')), 'safe diagnostic reason unavailable');
  assert.equal(safeError(new Error('safe bounded restore failure')), 'safe bounded restore failure');
});
