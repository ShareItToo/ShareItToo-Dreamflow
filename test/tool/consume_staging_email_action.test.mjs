import assert from 'node:assert/strict';
import { chmodSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  consumeStagingEmailVerification,
  consumeStagingPasswordReset,
  extractStagingEmailActionUrl,
  verifyConsumedStagingEmailAction,
} from '../../tool/consume_staging_email_action.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();

function token(character = 'a') {
  return character.repeat(64);
}

function actionUrl(kind, value = token()) {
  const path = kind === 'email-verification'
    ? 'email-verification/confirm'
    : 'password-reset/form';
  return `https://staging.shareittoo.com/api/v1/auth/${path}?token=${value}`;
}

function html(heading, extra = '') {
  return `<!doctype html><html><body><h1>${heading}</h1>${extra}</body></html>`;
}

function response(status, heading, extra = '') {
  return new Response(html(heading, extra), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function resetVault(root) {
  const path = resolve(root, 'reset.json');
  writeFileSync(path, `${JSON.stringify({
    schemaVersion: 1,
    kind: 'sit-staging-pixel-password-reset-vault',
    status: 'pixel-password-reset-request-accepted-pending-email',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    stripeLivemode: false,
    containsProductionCredentials: false,
    pendingPassword: `S1tR${token('p')}`,
  })}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

test('extracts one duplicated exact Staging action without returning another origin', () => {
  const exact = actionUrl('email-verification');
  assert.equal(extractStagingEmailActionUrl(`${exact}\n<a href="${exact}">ok</a>`, 'email-verification').href, exact);
  assert.throws(
    () => extractStagingEmailActionUrl(
      `${exact}\n${actionUrl('email-verification', token('b'))}`,
      'email-verification',
    ),
    /one unique exact Staging action/u,
  );
  assert.throws(
    () => extractStagingEmailActionUrl(
      `https://evil.example/api/v1/auth/email-verification/confirm?token=${token()}`,
      'email-verification',
    ),
    /one unique exact Staging action/u,
  );
});

test('confirms email verification only after exact success and single-use replay', async () => {
  const requests = [];
  const result = await consumeStagingEmailVerification({
    content: actionUrl('email-verification'),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return requests.length === 1
        ? response(200, 'E-Mail bestätigt')
        : response(400, 'Link nicht mehr gültig');
    },
  });
  assert.equal(result.status, 'email-verification-confirmed-single-use');
  assert.equal(result.containsActionUrl, false);
  assert.equal(requests.length, 2);
  assert.equal(requests.every((request) => request.options.redirect === 'manual'), true);
});

test('submits reset credential only to the exact fixed Staging form and proves consumption', async () => {
  const root = tempFixtures.makeSync('sit-email-action-reset-');
  const requests = [];
  const result = await consumeStagingPasswordReset({
    content: actionUrl('password-reset'),
    resetVaultFile: resetVault(root),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (requests.length === 1) {
        return response(200, 'Neues Passwort festlegen',
          '<input name="token"><input name="password"><input name="passwordConfirm">');
      }
      if (requests.length === 2) return response(200, 'Passwort geändert');
      return response(400, 'Link nicht mehr gültig');
    },
  });
  assert.equal(result.status, 'password-reset-confirmed-single-use');
  assert.equal(requests.length, 3);
  assert.equal(requests[1].url, 'https://staging.shareittoo.com/api/v1/auth/password-reset/form');
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.body.get('token'), token());
  assert.match(requests[1].options.body.get('password'), /^S1tR/u);
  assert.equal(requests[1].options.body.get('passwordConfirm'), requests[1].options.body.get('password'));
});

test('fails closed for transport, intermediary and unstructured outcomes', async () => {
  await assert.rejects(
    consumeStagingEmailVerification({
      content: actionUrl('email-verification'),
      fetchImpl: async () => { throw new Error('private transport detail'); },
    }),
    /result is unknown.*do not replay/iu,
  );
  await assert.rejects(
    consumeStagingEmailVerification({
      content: actionUrl('email-verification'),
      fetchImpl: async () => response(408, 'E-Mail bestätigt'),
    }),
    /not a definite success/u,
  );
  await assert.rejects(
    consumeStagingEmailVerification({
      content: actionUrl('email-verification'),
      fetchImpl: async () => new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }),
    /non-HTML/u,
  );
});

test('keeps definite reset success distinct from a rate-limited replay check', async () => {
  const root = tempFixtures.makeSync('sit-email-action-rate-limit-');
  let call = 0;
  const result = await consumeStagingPasswordReset({
    content: actionUrl('password-reset'),
    resetVaultFile: resetVault(root),
    fetchImpl: async () => {
      call += 1;
      if (call === 1) {
        return response(200, 'Neues Passwort festlegen',
          '<input name="token"><input name="password"><input name="passwordConfirm">');
      }
      if (call === 2) return response(200, 'Passwort geändert');
      return new Response('{"error":"rate_limit_exceeded"}', {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '120',
        },
      });
    },
  });
  assert.equal(result.status, 'password-reset-confirmed-replay-reconciliation-required');
  assert.equal(result.submissionHttpStatus, 200);
  assert.equal(result.replayHttpStatus, 429);
  assert.equal(result.replayRetryAfterSeconds, 120);
});

test('reconciles a consumed link without resubmitting an action', async () => {
  const requests = [];
  const result = await verifyConsumedStagingEmailAction({
    content: actionUrl('password-reset'),
    kind: 'password-reset',
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return response(400, 'Link nicht mehr gültig');
    },
  });
  assert.equal(result.status, 'consumed');
  assert.equal(result.httpStatus, 400);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, undefined);
});

test('requires an owner-only pending reset vault before any network call', async () => {
  const root = tempFixtures.makeSync('sit-email-action-permissions-');
  const vault = resetVault(root);
  chmodSync(vault, 0o644);
  let called = false;
  await assert.rejects(
    consumeStagingPasswordReset({
      content: actionUrl('password-reset'),
      resetVaultFile: vault,
      fetchImpl: async () => { called = true; return response(500, 'no'); },
    }),
    /owner-only/u,
  );
  assert.equal(called, false);
});
