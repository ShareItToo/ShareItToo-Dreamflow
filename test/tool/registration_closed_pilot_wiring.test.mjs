import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('registration error classifier is used only for structured backend exceptions', () => {
  const auth = read('lib/services/auth_service.dart');
  const registration = auth.slice(auth.indexOf('static Future<AuthResult> registerLocalAccount('), auth.indexOf('await ensureSeeded();', auth.indexOf('static Future<AuthResult> registerLocalAccount(')));
  assert.match(registration, /on BackendException catch \(error\)[\s\S]*classifyRegistrationBackendError\(error\)[\s\S]*return AuthResult.failure\(failure\)/u);
  assert.match(registration, /catch \(error\)[\s\S]*return const AuthResult.failure\(AuthFailure.network\)/u);
});

test('registration shows exact pilot restriction and directs invitees to existing login without no-write claims', () => {
  const screen = read('lib/screens/register_screen.dart');
  assert.match(screen, /AuthFailure.pilotRegistrationClosed =>\s*'Die Registrierung ist auf eingeladene Pilotkonten beschränkt\. Du hast bereits Zugang\? Bitte melde dich an\.'/u);
  assert.match(screen, /AuthFailure.network =>\s*'Es ist ein Netzwerkfehler aufgetreten\. Bitte versuche es erneut\.'/u);
  assert.match(screen, /AppPopup.toast\(context, icon: Icons.error_outline, title: msg\)/u);
  assert.ok(screen.includes("'Anmelden'"));
  assert.ok(screen.includes('LoginScreen('));
  assert.doesNotMatch(screen, /Kein Konto wurde|Es wurde kein Konto|Keine Daten wurden/u);
});
