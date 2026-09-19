import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);

const screen = read('lib/screens/security_screen.dart');
const accountSecurity = read('lib/services/account_security_service.dart');
const auth = read('lib/services/auth_service.dart');
const webSync = read('lib/services/shared_persistence_sync_web.dart');
const regression = read('scripts/technical_regression_check.sh');

test('password success requires definite local session absence and a stable UI epoch', () => {
  const successStart = screen.indexOf('final successEpoch = _securityEpoch;');
  const absenceCheck = screen.indexOf(
    'await _securityService.isLocalSessionDefinitelyAbsent()',
    successStart,
  );
  const epochCheck = screen.indexOf(
    'successEpoch != _securityEpoch',
    absenceCheck,
  );
  const popup = screen.indexOf('await _showOwnedSuccess(', epochCheck);
  const postPopupEpochCheck = screen.indexOf(
    'successEpoch != _securityEpoch',
    popup,
  );
  const navigation = screen.indexOf(
    'Navigator.of(context).pushAndRemoveUntil(',
    postPopupEpochCheck,
  );

  for (const index of [
    successStart,
    absenceCheck,
    epochCheck,
    popup,
    postPopupEpochCheck,
    navigation,
  ]) assert.notEqual(index, -1);
  assert.ok(successStart < absenceCheck);
  assert.ok(absenceCheck < epochCheck);
  assert.ok(epochCheck < popup);
  assert.ok(popup < postPopupEpochCheck);
  assert.ok(postPopupEpochCheck < navigation);
});

test('definite absence never decodes malformed or unreadable state as signed out', () => {
  assert.match(
    auth,
    /isStoredSessionDefinitelyAbsent\(\)[\s\S]*?prefs\.containsKey\(_sessionKey\)[\s\S]*?catch \(error\)[\s\S]*?return false;/u,
  );
  assert.match(
    accountSecurity,
    /isLocalSessionDefinitelyAbsent\(\)[\s\S]*?AuthService\.isStoredSessionDefinitelyAbsent\(\)/u,
  );
});

test('rejection, confirmed-local-failure and unknown outcome stay distinct', () => {
  for (const marker of [
    'PasswordChangeFailureKind.rejected',
    'PasswordChangeFailureKind.confirmedLocalFinalizationFailed',
    'PasswordChangeFailureKind.outcomeUnknown',
    '_isDefinitePasswordRejection',
    '_unknownPasswordChangeOutcome',
  ]) assert.match(accountSecurity, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
  for (const title of [
    'Passwort nicht geändert',
    'Passwort serverseitig geändert',
    'Ergebnis der Passwortänderung unklar',
  ]) assert.match(screen, new RegExp(title, 'u'));
});

test('web security-state notifications participate in the same epoch boundary', () => {
  assert.match(webSync, /'account_security_state_v1'/u);
});

test('supported regression permanently executes RW12 behavior and wiring tests', () => {
  for (const marker of [
    'test/rw12_security_success_ui_principal_epoch_test.dart',
    'test/tool/rw12_security_success_ui_principal_epoch_wiring.test.mjs',
    'test/tool/validate_rw12_security_success_ui_principal_epoch.test.mjs',
  ]) assert.match(regression, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});
