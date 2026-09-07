import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAndroidSoftwareKeyboardShown,
  isV52ForegroundPushPopup,
  sendOppositeRoleMessage,
} from '../../tool/diagnose_android_logout_lifecycle.mjs';

test('dismisses login input only for an exact visible Android software keyboard', () => {
  assert.equal(isAndroidSoftwareKeyboardShown(
    'mImeWindowVis=3\n  mInputShown=true\n  mIsInputViewShown=true mStatusIcon=0',
  ), true);
  assert.equal(isAndroidSoftwareKeyboardShown(
    'mInputShown=false\n  mIsInputViewShown=false',
  ), false);
  assert.equal(isAndroidSoftwareKeyboardShown(
    'mInputShown=true\n  mIsInputViewShown=false',
  ), false);
});

test('recognizes only the exact V5.2 in-app push surface', () => {
  assert.equal(isV52ForegroundPushPopup(
    '<node content-desc="Benachrichtigung: Neue ShareItToo-Aktualisierung. In der App ansehen." />'
      + '<node content-desc="Öffnen" />',
  ), true);
  assert.equal(isV52ForegroundPushPopup(
    '<node content-desc="Bestätigung erforderlich" /><node content-desc="Öffnen" />',
  ), false);
  assert.equal(isV52ForegroundPushPopup(
    '<node content-desc="Neue ShareItToo-Aktualisierung" />'
      + '<node content-desc="In der App ansehen." />',
  ), false);
});

test('logout push suppression sends only from the opposite synthetic role', async () => {
  const calls = [];
  const sender = async (options) => {
    calls.push(options);
    return {
      status: 'synthetic-booking-diagnostic-message-sent',
      paymentEndpointCalled: false,
      stripeLivemode: false,
    };
  };

  await sendOppositeRoleMessage('/private/vault.json', 'owner', sender);
  await sendOppositeRoleMessage('/private/vault.json', 'renter', sender);

  assert.deepEqual(calls, [
    {
      vaultFile: '/private/vault.json',
      senderRole: 'renter',
      diagnosticKind: 'logout',
    },
    {
      vaultFile: '/private/vault.json',
      senderRole: 'owner',
      diagnosticKind: 'logout',
    },
  ]);
});

test('logout push suppression rejects an unknown signed-in role', async () => {
  await assert.rejects(
    () => sendOppositeRoleMessage('/private/vault.json', 'admin', async () => null),
    /signed-in synthetic role is invalid/,
  );
});
