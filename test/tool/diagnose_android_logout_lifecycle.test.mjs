import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureAndroidGuestSession,
  hasEnteredNamedLoginInput,
  isAndroidSoftwareKeyboardShown,
  isV52ForegroundPushPopup,
  sendOppositeRoleMessage,
} from '../../tool/diagnose_android_logout_lifecycle.mjs';

function delayedPhysicalGuestResetRunner() {
  let screen = 'main';
  let mainDumps = 0;
  let profileDumps = 0;
  const node = (label, bounds) => (
    `<node text="${label}" content-desc="" clickable="true" enabled="true" bounds="${bounds}"/>`
  );
  const hierarchy = () => {
    if (screen === 'main') {
      mainDumps += 1;
      if (mainDumps <= 20) return '<hierarchy/>';
      return `<hierarchy>${node('Entdecken', '[0,2200][300,2400]')}`
        + `${node('Nachrichten', '[600,2200][900,2400]')}`
        + `${node('Mein SIT', '[900,2200][1200,2400]')}</hierarchy>`;
    }
    if (screen === 'profile') {
      profileDumps += 1;
      if (profileDumps <= 20) return '<hierarchy/>';
      return `<hierarchy>${node('Meine Anzeigen', '[0,200][500,300]')}`
        + `${node('Mietanfragen', '[0,300][500,400]')}`
        + `${node('Abmelden', '[0,400][500,500]')}</hierarchy>`;
    }
    if (screen === 'confirmation') {
      return `<hierarchy>${node('Abmelden?', '[0,100][500,200]')}`
        + `${node('Abbrechen', '[0,300][400,400]')}`
        + `${node('Abmelden', '[400,300][800,400]')}</hierarchy>`;
    }
    return `<hierarchy>${node('Anmelden', '[0,300][500,400]')}`
      + `${node('Konto erstellen', '[0,400][500,500]')}</hierarchy>`;
  };
  return (_file, args) => {
    const command = args.slice(2);
    const joined = command.join(' ');
    if (joined === 'shell am force-stop com.shareittoo.app') return '';
    if (command[0] === 'shell' && command[1] === 'monkey') {
      screen = 'main';
      mainDumps = 0;
      return 'Events injected: 1';
    }
    if (joined === 'shell uiautomator dump /sdcard/sit-logout-lifecycle.xml') {
      return 'UI hierarchy dumped';
    }
    if (joined === 'exec-out cat /sdcard/sit-logout-lifecycle.xml') return hierarchy();
    if (joined === 'shell rm -f /sdcard/sit-logout-lifecycle.xml') return '';
    if (command[0] === 'shell' && command[1] === 'input' && command[2] === 'tap') {
      if (screen === 'main') screen = 'profile';
      else if (screen === 'profile') screen = 'confirmation';
      else if (screen === 'confirmation') screen = 'guest';
      return '';
    }
    throw new Error(`Unexpected fake ADB command: ${joined}`);
  };
}

test('login restoration requires populated editable fields rather than static labels', () => {
  const emailInput = '<node class="android.widget.EditText" hint="E-Mail" text="synthetic@example.invalid" />';
  const emptyPassword = '<node class="android.widget.EditText" hint="Passwort" text="" />';
  const populatedPassword = '<node class="android.widget.EditText" hint="Passwort" text="••••••••" />';
  const staticLabel = '<node class="android.widget.TextView" text="Passwort" />';
  assert.equal(hasEnteredNamedLoginInput(emailInput, 'E-Mail'), true);
  assert.equal(hasEnteredNamedLoginInput(emptyPassword, 'Passwort'), false);
  assert.equal(hasEnteredNamedLoginInput(populatedPassword, 'Passwort'), true);
  assert.equal(hasEnteredNamedLoginInput(staticLabel, 'Passwort'), false);
});

test('guest reset tolerates a bounded slow physical cold start and profile load', async () => {
  let waits = 0;
  const result = await ensureAndroidGuestSession({
    commandRunner: delayedPhysicalGuestResetRunner(),
    adbPath: 'adb',
    device: { serial: 'PRIVATE-SERIAL' },
    wait: async (milliseconds) => {
      assert.equal(milliseconds, 650);
      waits += 1;
    },
  });
  assert.equal(result, true);
  assert.equal(waits, 44);
});

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
