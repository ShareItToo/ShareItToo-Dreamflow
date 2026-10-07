import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const auth = read('lib/services/auth_service.dart');
const screen = read('lib/screens/register_screen.dart');
const lane = read('lib/services/staging_password_enrollment_client.dart');
const invited = auth.slice(auth.indexOf('static Future<AuthResult> registerInvitedStagingAccount('), auth.indexOf('static Future<AuthResult> registerLocalAccount('));
const ui = screen.slice(screen.indexOf('Future<void> _registerInvited()'), screen.indexOf('Future<void> _socialRegister('));

test('separate client flag defaults off and exact staging/private-pilot gates cannot be skipped', () => {
  assert.match(lane, /'SIT_WEB_PASSWORD_ENROLLMENT_ENABLED',\s*defaultValue: false/u);
  for (const required of ['requested &&', 'web &&', 'backendEnabled &&', 'privatePilot &&', '!realPayments &&', "apiBaseUrl == 'https://staging.shareittoo.com/api/v1'", "origin == 'https://staging.shareittoo.com'", "releaseChannel == 'internal'"]) assert.ok(lane.includes(required), required);
  assert.match(screen, /!kReleaseMode && widget.debugEnrollmentEnvironment != null/u);
  assert.match(screen, /!kReleaseMode && widget.debugInvitedRegistration != null/u);
  assert.match(screen, /if \(_enrollmentAvailable\) return _registerInvited\(\)/u);
  assert.match(screen, /if \(_enrollmentAvailable\) \.\.\./u);
});

test('real service binds payload to existing unauthenticated register route and owned-session transaction', () => {
  assert.match(invited, /if \(!StagingPasswordEnrollmentEnvironment.current.available\)/u);
  assert.match(invited, /await isStoredSessionDefinitelyAbsent\(\)/u);
  assert.match(invited, /submitStagingPasswordEnrollment<AuthResult>/u);
  assert.match(invited, /method: 'POST', path: '\/auth\/register', body: body/u);
  assert.doesNotMatch(invited, /accessToken:|additionalHeaders:|queryParameters|Uri\.|debugPrint|print\(|SharedPreferences|setString|analytics|crash/u);
  for (const required of ['_authAttemptPreflightCurrent', '_authAttemptActionCurrent', 'expectedGeneration: expectedSessionEpoch', '_discardIssuedRemoteSession', '_authResultSessionDefinitelyCurrent', '_discardPersistedAuthResult']) assert.ok(invited.includes(required));
  assert.match(invited, /response\['accepted'\] != true \|\| response\['session'\] is! Map/u);
});

test('controller cleared before validation; legal reading retains it; request map released on all completion paths', () => {
  assert.ok(ui.indexOf('_enrollmentCtrl.clear()') < ui.indexOf('_formKey.currentState?.validate()'));
  assert.match(ui, /enrollmentToken: token/u);
  assert.match(ui, /token = '';\s*final result = await future/u);
  assert.match(ui, /finally \{\s*token = '';\s*if \(mounted\) \{\s*_enrollmentCtrl.clear\(\)/u);
  assert.doesNotMatch(ui, /debugPrint|print\(|SharedPreferences|Uri\.|analytics|crash|catch \(error\)/u);
  const legal = screen.slice(screen.indexOf('void _openTerms()'), screen.indexOf('@override\n  void dispose()'));
  assert.doesNotMatch(legal, /_enrollmentCtrl.clear/u);
  assert.match(screen, /_enrollmentCtrl.clear\(\);\s*_enrollmentCtrl.dispose\(\)/u);
  assert.match(screen, /Future<void> _socialRegister[^]*?_enrollmentCtrl.clear\(\)/u);
  assert.match(screen, /LengthLimitingTextInputFormatter\(\s*43,/u);
  assert.match(lane, /finally \{\s*enrollmentToken = '';\s*password = '';\s*payload.clear\(\)/u);
});

test('consent facts and literal action label remain identical for invited registration', () => {
  for (const fact of ['termsAccepted', 'privacyAccepted', 'minimumAgeConfirmed', 'privateUseConfirmed']) {
    assert.ok(ui.includes(`${fact}: true`));
    assert.ok(lane.includes(`!${fact}`));
  }
  assert.ok(ui.includes("registrationActionLabel: 'Kostenlos registrieren'"));
  assert.ok(lane.includes("registrationActionLabel != 'Kostenlos registrieren'"));
  assert.ok(screen.includes('return _registerInvited()'));
  assert.ok(screen.includes('AuthService.registerLocalAccount('));
});
