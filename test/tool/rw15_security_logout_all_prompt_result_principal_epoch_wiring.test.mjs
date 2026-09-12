import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);

const screen = read('lib/screens/security_screen.dart');
const service = read('lib/services/account_security_service.dart');
const popup = read('lib/widgets/app_popup.dart');
const trackedRoute = read('lib/widgets/tracked_dialog_route.dart');
const regression = read('scripts/technical_regression_check.sh');

const method = (source, start, end) => source.slice(
  source.indexOf(start),
  source.indexOf(end, source.indexOf(start)),
);

test('definite rejection requires an exact status and operation error code', () => {
  for (const marker of [
    "401: <String>{'invalid_credentials'}",
    "404: <String>{'session_not_found'}",
    "429: <String>{'rate_limit_exceeded'}",
    "'password_too_short'",
    "'password_too_long'",
    "'password_too_weak'",
    "'authentication_required'",
    "'invalid_or_expired_session'",
    "'account_not_active'",
  ]) assert.match(service, new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(service, /<int>\{400, 401, 403, 404, 409, 422, 429\}/u);
});

test('all SecurityScreen actions capture owner before their first await', () => {
  for (const [start, end] of [
    ['Future<void> _changePassword()', 'Future<void> _signOutDevice('],
    ['Future<void> _signOutDevice(', 'Future<void> _logoutAllDevices()'],
    ['Future<void> _logoutAllDevices()', 'String _deviceNameThisPlatform()'],
  ]) {
    const body = method(screen, start, end);
    const capture = body.indexOf('_captureInteractionOwner()');
    const firstAwait = body.indexOf('await ');
    assert.ok(capture >= 0 && capture < firstAwait, start);
  }
});

test('dialog actions recheck owner before each remote invocation', () => {
  for (const [start, end, call] of [
    [
      'Future<void> _signOutDevice(',
      'Future<void> _logoutAllDevices()',
      '_securityService.revokeSession(device.id)',
    ],
    [
      'Future<void> _logoutAllDevices()',
      'String _deviceNameThisPlatform()',
      '_securityService.logoutAllSessions()',
    ],
  ]) {
    const body = method(screen, start, end);
    const dialog = body.indexOf('showTrackedDialog<bool>');
    const ownerGate = body.indexOf('_isInteractionOwnerCurrent(owner)', dialog);
    const remote = body.indexOf(call, ownerGate);
    assert.ok(dialog >= 0 && dialog < ownerGate && ownerGate < remote, start);
  }
});

test('generic catches are confined before success and cannot merge typed results', () => {
  for (const [start, end, typedCatch, successMarker, titles] of [
    [
      'Future<void> _changePassword()',
      'Future<void> _signOutDevice(',
      'on PasswordChangeFailure catch',
      'final successEpoch = _securityEpoch;',
      ['Passwort nicht geändert', 'Passwort serverseitig geändert', 'Ergebnis der Passwortänderung unklar'],
    ],
    [
      'Future<void> _signOutDevice(',
      'Future<void> _logoutAllDevices()',
      'on SessionRevocationFailure catch',
      '_devices = _devices.where',
      ['Geräteabmeldung abgelehnt', 'Gerät serverseitig abgemeldet', 'Ergebnis der Geräteabmeldung unklar'],
    ],
    [
      'Future<void> _logoutAllDevices()',
      'String _deviceNameThisPlatform()',
      'on LogoutAllFailure catch',
      'final successEpoch = _securityEpoch;',
      ['Geräte nicht abgemeldet', 'Geräte serverseitig abgemeldet', 'Ergebnis der Geräteabmeldung unklar'],
    ],
  ]) {
    const body = method(screen, start, end);
    const typed = body.indexOf(typedCatch);
    const generic = body.indexOf('catch (error)', typed);
    const success = body.indexOf(successMarker, generic);
    assert.ok(typed >= 0 && typed < generic && generic < success, start);
    for (const title of titles) assert.match(body, new RegExp(title, 'u'));
  }

  const passwordMethod = method(
    screen,
    'Future<void> _changePassword()',
    'Future<void> _signOutDevice(',
  );
  const passwordSuccess = passwordMethod.slice(
    passwordMethod.indexOf('await _showOwnedSuccess('),
  );
  assert.match(
    passwordSuccess,
    /isLocalSessionDefinitelyAbsent\(\)[\s\S]*?Navigator\.of\(context\)\.pushAndRemoveUntil/u,
  );
});

test('A-owned dialog dismissal removes only its exact route identity', () => {
  assert.match(trackedRoute, /Route<T>\? _route/u);
  assert.match(trackedRoute, /navigator\.removeRoute\(route, result\)/u);
  assert.doesNotMatch(trackedRoute, /navigator\.(?:pop|maybePop)\(/u);
  assert.match(screen, /_activeConfirmationDialog\?\.dismiss\(false\)/u);
  assert.match(screen, /_activeOutcomeDialog\?\.dismiss\(\)/u);
  assert.doesNotMatch(screen, /Navigator\.maybeOf\(context, rootNavigator: true\)/u);
});

test('AppPopup timers and close controls use the same exact route handle', () => {
  assert.match(popup, /showTrackedGeneralDialog/u);
  assert.match(popup, /if \(!closed\) handle\.dismiss\(\)/u);
  assert.match(popup, /onClose: handle\.dismiss/u);
});

test('supported regression permanently executes RW15 behavior and wiring tests', () => {
  for (const marker of [
    'test/rw15_security_logout_all_prompt_result_principal_epoch_test.dart',
    'test/tool/rw15_security_logout_all_prompt_result_principal_epoch_wiring.test.mjs',
    'test/tool/validate_rw15_security_logout_all_prompt_result_principal_epoch.test.mjs',
  ]) assert.match(regression, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});
