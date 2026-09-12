import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  classifyGoogleSocialAuthSurface,
  googleProfileFingerprint,
  parseGoogleSocialAuthArguments,
  sanitizeGoogleSocialAuthFailure,
} from '../../tool/diagnose_android_google_social_auth.mjs';

const root = resolve(import.meta.dirname, '../..');
const source = readFileSync(
  resolve(root, 'tool/diagnose_android_google_social_auth.mjs'),
  'utf8',
);

test('profile fingerprint requires an authenticated profile', () => {
  const hierarchy = '<hierarchy><node text="Abmelden" /></hierarchy>';
  assert.equal(googleProfileFingerprint(hierarchy).length, 64);
  assert.throws(
    () => googleProfileFingerprint('<hierarchy />'),
    /Authenticated profile hierarchy is unavailable/u,
  );
});

test('diagnostic errors never expose private account details', () => {
  assert.equal(
    sanitizeGoogleSocialAuthFailure(new Error('account@example.invalid')),
    'safe diagnostic reason unavailable',
  );
  assert.equal(
    sanitizeGoogleSocialAuthFailure(new Error('The sanitized action is unavailable.')),
    'The sanitized action is unavailable.',
  );
});

test('post-provider surfaces retain a sanitized actionable classification', () => {
  const xml = (nodes) => `<hierarchy>${nodes
    .map((text) => `<node text="${text}" />`)
    .join('')}</hierarchy>`;
  assert.equal(classifyGoogleSocialAuthSurface(xml([
    'Entdecken', 'Mein SIT', 'Abmelden',
  ])), 'authenticated-main');
  assert.equal(classifyGoogleSocialAuthSurface(xml(['Abmelden'])),
      'authenticated-profile');
  assert.equal(classifyGoogleSocialAuthSurface(
    xml(['private@example.invalid']),
    { mailbox: 'private@example.invalid' },
  ), 'private-account-chooser');
  assert.equal(classifyGoogleSocialAuthSurface(xml(['Mit Google anmelden'])),
      'login-entry');
  assert.equal(classifyGoogleSocialAuthSurface(xml([
    'Registrieren', 'AGB', 'Datenschutz', '18 Jahre', 'Privat',
  ])), 'registration-consent');
  assert.equal(classifyGoogleSocialAuthSurface(
    xml(['Google ist noch nicht freigeschaltet']),
  ), 'provider-unavailable');
  assert.equal(classifyGoogleSocialAuthSurface(
    xml(['Die Google-Anmeldung ist gerade nicht erreichbar']),
  ), 'provider-or-backend-error');
  assert.equal(classifyGoogleSocialAuthSurface(xml(['Anmelden'])), 'signed-out');
  assert.equal(classifyGoogleSocialAuthSurface('<hierarchy />'), 'unclassified');
});

test('real Google diagnostic is exact-account and restoration scoped', () => {
  for (const marker of [
    'validatePrivateAndroidReleaseArchive',
    'verifyCurrentHeadAndroidInstalledCandidate',
    'exactPrivateGoogleAccountSelected: true',
    'sameStagingProfileAcrossAllThreeObservations: true',
    'duplicateAccountObserved: false',
    'protectedSyntheticOwnerRestored: true',
    'accountCreationVersusExistingLinkage: \'not-asserted\'',
    'containsEmailAddress: false',
    'containsPrivateFilesystemPaths: false',
    'google-failure-surface.xml',
    'private-capture-retained',
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(source, /console\.log\(.*mailbox|JSON\.stringify\(.*mailbox/gu);
  assert.doesNotMatch(source, /clear data|pm clear|uninstall/gu);
});

test('Google diagnostic requires one explicit private candidate archive', () => {
  assert.deepEqual(parseGoogleSocialAuthArguments([
    '--candidate-dir',
    '/private/candidate',
    '--adb',
    '/safe/adb',
  ]), {
    candidateDirectory: '/private/candidate',
    adbPath: '/safe/adb',
  });
  assert.throws(
    () => parseGoogleSocialAuthArguments([]),
    /candidate-dir is required/u,
  );
  assert.throws(
    () => parseGoogleSocialAuthArguments(['--unknown']),
    /Unknown argument/u,
  );
});
