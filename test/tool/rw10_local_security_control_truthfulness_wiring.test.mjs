import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

test('RW10 is permanently invoked by the supported regression', () => {
  const regression = read('scripts/technical_regression_check.sh');
  for (const marker of [
    'rw10_local_security_control_truthfulness_test.dart',
    'rw10_local_security_control_truthfulness_wiring.test.mjs',
    'validate_rw10_local_security_control_truthfulness.mjs',
  ]) assert.match(regression, new RegExp(escaped(marker), 'u'));
});

test('offline account security has no local mutation or success simulation', () => {
  const screen = read('lib/screens/security_screen.dart');
  for (const marker of [
    'Kontosicherheit ist offline nicht verfügbar.',
    'AccountSecurityService',
    '_securityService.isAvailable',
    'accountSecurityStateKey',
  ]) assert.match(screen, new RegExp(escaped(marker), 'u'));
  for (const forbidden of [
    'Future<void>.delayed',
    'security_settings_v1',
    'signed_in_devices_v1',
    'setSecuritySettings',
    'setSignedInDevices',
  ]) assert.doesNotMatch(screen, new RegExp(escaped(forbidden), 'u'));
});

test('account-security service is exact-session and server authoritative', () => {
  const service = read('lib/services/account_security_service.dart');
  for (const marker of [
    'BackendRepository.getAuthSessions()',
    'BackendRepository.changePassword(',
    'BackendRepository.revokeAuthSession(sessionId)',
    'BackendRepository.logoutAllSessions()',
    '_assertSameCurrentSession(marker)',
    'AuthService.clearSessionIfMatches(',
    'currentCount != 1',
    'raw.length > _maxSessions',
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(service, /SharedPreferences|debugPrint/u);
});

test('conditional auth clear binds account session and email', () => {
  const auth = read('lib/services/auth_service.dart');
  const clear = auth.match(
    /static Future<bool> clearSessionIfMatches\([\s\S]*?\n  \}\n\n  static AuthSession\? _decodeStoredSession/u,
  )?.[0];
  assert.ok(clear, 'conditional session clear must exist');
  for (const marker of [
    'userId',
    'sessionId',
    'email',
    'captureSessionOwner(session)',
    'clearSessionOwnerIfMatches(',
    'runLogoutCleanup: false',
  ]) {
    assert.match(clear, new RegExp(escaped(marker), 'u'));
  }
  assert.match(
    auth,
    /clearSessionOwnerIfMatches\([\s\S]*?_storedSessionMatchesOwner\(raw, owner\)[\s\S]*?prefs\.remove\(_sessionKey\)/u,
  );
  for (const marker of [
    "(session.userId ?? '').trim() == (owner.userId ?? '').trim()",
    "(session.sessionId ?? '').trim() == (owner.sessionId ?? '').trim()",
    'session.createdAt == owner.createdAt',
  ]) assert.match(auth, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(auth, /_storedRemoteSessionMatches/u);
  assert.match(auth, /accountSecurityStateKey/u);
});

test('server session envelope rejects malformed entries instead of filtering', () => {
  const repository = read('lib/services/backend_repository.dart');
  assert.match(repository, /_strictMaps\(response\['sessions'\]\)/u);
  assert.doesNotMatch(
    repository.match(/static Future<List<Map<String, dynamic>>> getAuthSessions\([\s\S]*?\n  \}/u)?.[0] ?? '',
    /whereType|where\(/u,
  );
});

test('retired local security stores and two-factor controls stay absent', () => {
  const data = read('lib/services/data_service.dart');
  const twoFactor = read('lib/screens/two_factor_auth_screen.dart');
  for (const forbidden of [
    '_seedSignedInDevices',
    'setSecuritySettings',
    'getSignedInDevices',
    'setSignedInDevices',
  ]) assert.doesNotMatch(data, new RegExp(escaped(forbidden), 'u'));
  assert.match(twoFactor, /Zwei-Faktor-Schutz ist noch nicht verfügbar/u);
  assert.doesNotMatch(twoFactor, /Switch|setSecuritySettings|_openMethodPicker/u);
});

test('RW10 deterministic matrix covers identity drift and recovery', () => {
  const matrix = read('test/rw10_local_security_control_truthfulness_test.dart');
  for (const marker of [
    'offline security screen exposes no password or session simulation',
    'conditional local clear preserves a different or malformed session',
    'server sessions require one exact current session and strict fields',
    'session replacement rejects an in-flight session-list response',
    'password and logout-all clear only the exact invoking session',
    'session event clears password fields and stale device UI',
    'invalid server session list stays behind a persistent retry',
    'offline security truth remains scrollable at 200 percent text',
  ]) assert.match(matrix, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(matrix, /await\s+Future(?:<void>)?\.delayed|Timer\s*\(/u);
});

test('release truthfulness ratchet forbids the retired debug exception', () => {
  const b10 = read('test/b10_release_truthfulness_test.dart');
  for (const marker of [
    "isNot(contains('!BackendConfig.enabled && !kReleaseMode'))",
    "isNot(contains('setSecuritySettings'))",
    "isNot(contains('_toggleTwoFactor'))",
    "isNot(contains('Future<void>.delayed'))",
  ]) assert.match(b10, new RegExp(escaped(marker), 'u'));
});
