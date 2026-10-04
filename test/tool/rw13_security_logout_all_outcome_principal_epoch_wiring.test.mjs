import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);

const screen = read('lib/screens/security_screen.dart');
const accountSecurity = read('lib/services/account_security_service.dart');
const regression = read('scripts/technical_regression_check.sh');

test('logout-all navigation requires definite local absence and a stable epoch', () => {
  const methodStart = screen.indexOf('Future<void> _logoutAllDevices()');
  const serviceCall = screen.indexOf(
    'await _securityService.logoutAllSessions();',
    methodStart,
  );
  const successEpoch = screen.indexOf(
    'final successEpoch = _securityEpoch;',
    serviceCall,
  );
  const absenceCheck = screen.indexOf(
    'await _securityService.isLocalSessionDefinitelyAbsent()',
    successEpoch,
  );
  const epochCheck = screen.indexOf(
    'successEpoch != _securityEpoch',
    absenceCheck,
  );
  const navigation = screen.indexOf(
    'Navigator.of(context).pushAndRemoveUntil(',
    epochCheck,
  );

  for (const index of [
    methodStart,
    serviceCall,
    successEpoch,
    absenceCheck,
    epochCheck,
    navigation,
  ]) assert.notEqual(index, -1);
  assert.ok(serviceCall < successEpoch);
  assert.ok(successEpoch < absenceCheck);
  assert.ok(absenceCheck < epochCheck);
  assert.ok(epochCheck < navigation);
});

test('logout-all keeps rejection confirmed-local-failure and unknown distinct', () => {
  for (const marker of [
    'LogoutAllFailureKind.rejected',
    'LogoutAllFailureKind.confirmedLocalFinalizationFailed',
    'LogoutAllFailureKind.outcomeUnknown',
    '_isDefiniteLogoutAllRejection',
    '_unknownLogoutAllOutcome',
  ]) {
    assert.match(accountSecurity, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
  }
  for (const title of [
    'Geräte nicht abgemeldet',
    'Geräte serverseitig abgemeldet',
    'Ergebnis der Geräteabmeldung unklar',
  ]) assert.match(screen, new RegExp(title, 'u'));
});

test('unknown logout outcome conditionally contains only the invoking session', () => {
  const unknownStart = accountSecurity.indexOf(
    'Future<LogoutAllFailure> _unknownLogoutAllOutcome',
  );
  const conditionalClear = accountSecurity.indexOf(
    'clearCurrentSessionIfMatches(',
    unknownStart,
  );
  const definiteAbsence = accountSecurity.indexOf(
    'isLocalSessionDefinitelyAbsent()',
    conditionalClear,
  );
  assert.notEqual(unknownStart, -1);
  assert.notEqual(conditionalClear, -1);
  assert.notEqual(definiteAbsence, -1);
  assert.ok(unknownStart < conditionalClear);
  assert.ok(conditionalClear < definiteAbsence);
});

test('logout-all no longer treats decoded null as definite local absence', () => {
  const methodStart = accountSecurity.indexOf(
    'Future<void> logoutAllSessions() async',
  );
  const methodEnd = accountSecurity.indexOf(
    'static bool _isDefiniteLogoutAllRejection',
    methodStart,
  );
  const method = accountSecurity.slice(methodStart, methodEnd);
  assert.match(method, /isLocalSessionDefinitelyAbsent\(\)/u);
  assert.doesNotMatch(method, /await readSession\(\) != null/u);
});

test('supported regression permanently executes RW13 behavior and wiring tests', () => {
  for (const marker of [
    'test/rw13_security_logout_all_outcome_principal_epoch_test.dart',
    'test/tool/rw13_security_logout_all_outcome_principal_epoch_wiring.test.mjs',
    'test/tool/validate_rw13_security_logout_all_outcome_principal_epoch.test.mjs',
  ]) assert.match(regression, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});
