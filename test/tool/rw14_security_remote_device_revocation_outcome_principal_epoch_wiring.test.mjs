import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);

const screen = read('lib/screens/security_screen.dart');
const service = read('lib/services/account_security_service.dart');
const regression = read('scripts/technical_regression_check.sh');

test('remote-device confirmation is bound before the dialog and checked before service use', () => {
  const method = screen.slice(
    screen.indexOf('Future<void> _signOutDevice('),
    screen.indexOf('Future<void> _logoutAllDevices()'),
  );
  const ownerCapture = method.indexOf('final owner = _captureInteractionOwner();');
  const dialog = method.indexOf('showTrackedDialog<bool>', ownerCapture);
  const ownerGate = method.indexOf('_isInteractionOwnerCurrent(owner)', dialog);
  const serviceCall = method.indexOf(
    '_securityService.revokeSession(device.id)',
    ownerGate,
  );
  assert.ok(ownerCapture >= 0 && ownerCapture < dialog);
  assert.ok(dialog < ownerGate && ownerGate < serviceCall);
});

test('service keeps rejection confirmed-local-failure and unknown distinct', () => {
  for (const marker of [
    'SessionRevocationFailureKind.rejected',
    'SessionRevocationFailureKind.confirmedLocalFinalizationFailed',
    'SessionRevocationFailureKind.outcomeUnknown',
    '_isDefiniteSessionRevocationRejection',
    '_isInvokingSessionDefinitelyCurrent',
  ]) assert.match(service, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});

test('UI requires exact target principal proof and stable response epoch', () => {
  const method = screen.slice(
    screen.indexOf('Future<void> _signOutDevice('),
    screen.indexOf('Future<void> _logoutAllDevices()'),
  );
  for (const marker of [
    'error.targetSessionId != device.id',
    '!error.invokingSessionDefinitelyCurrent',
    '!_isInteractionOwnerCurrent',
  ]) assert.match(method, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});

test('typed failures become explicit reload state and open A outcome closes under B', () => {
  assert.match(screen, /Die Sitzungsliste ist nach der Geräteaktion nicht mehr/u);
  assert.match(screen, /_loadError =/u);
  assert.match(screen, /_activeOutcomeDialog\?\.dismiss\(\)/u);
  assert.doesNotMatch(screen, /_revocationOutcomeVisible/u);
  for (const title of [
    'Geräteabmeldung abgelehnt',
    'Gerät serverseitig abgemeldet',
    'Ergebnis der Geräteabmeldung unklar',
  ]) assert.match(screen, new RegExp(title, 'u'));
});

test('supported regression permanently executes RW14 behavior and wiring tests', () => {
  for (const marker of [
    'test/rw14_security_remote_device_revocation_outcome_principal_epoch_test.dart',
    'test/tool/rw14_security_remote_device_revocation_outcome_principal_epoch_wiring.test.mjs',
    'test/tool/validate_rw14_security_remote_device_revocation_outcome_principal_epoch.test.mjs',
  ]) assert.match(regression, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});
