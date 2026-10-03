import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import { parseAppleOwnershipRequest } from '../src/apple_ownership.js';
import { normalizeAppleRevocationMaterial } from '../src/apple_revocation.js';

process.env.FIREBASE_AUTH_ENABLED = 'false';
process.env.PUSH_TRANSPORT = 'disabled';
const { normalizeFirebaseSocialClaims, verifyFirebaseSocialToken, SocialAuthError } =
  await import('../src/firebase_social_auth.js');

const claims = (changes = {}) => ({
  uid: 'synthetic-apple-firebase-user', email: 'synthetic@example.invalid',
  email_verified: true,
  firebase: { sign_in_provider: 'apple.com', identities: { 'apple.com': ['synthetic-subject'] } },
  ...changes,
});

test('Apple Web payload exactly matches the v2 ownership acquire contract', () => {
  const source = fs.readFileSync(
    new URL('../../lib/services/apple_web_v2_client.dart', import.meta.url), 'utf8',
  );
  const start = source.indexOf('Map<String, dynamic> acquireBody(');
  const payload = source.slice(start, source.indexOf('@override', start));
  assert.ok(start >= 0);
  assert.deepEqual([...payload.matchAll(/^\s*'([^']+)':/gmu)].map((match) => match[1]), [
    'idToken', 'appleAuth', 'version', 'operation', 'requestId', 'authorizationCode',
  ]);
  assert.match(payload, /'idToken': idToken,\s*'appleAuth': \{\s*'version': 2,\s*'operation': 'acquire',\s*'requestId': requestId,\s*'authorizationCode': _authorizationCode,\s*\},/u);
  assert.doesNotMatch(payload, /appleAuthorizationCode|provider|accessToken/u);

  const command = {
    idToken: 'synthetic-firebase-id-token-'.repeat(5),
    appleAuth: {
      version: 2,
      operation: 'acquire',
      requestId: Buffer.alloc(32, 7).toString('base64url'),
      authorizationCode: 'synthetic-code',
    },
  };
  assert.deepEqual(parseAppleOwnershipRequest(Buffer.from(JSON.stringify(command)), command), command);
  const legacyTopLevel = {
    idToken: command.idToken,
    appleAuthorizationCode: command.appleAuth.authorizationCode,
  };
  assert.throws(
    () => parseAppleOwnershipRequest(Buffer.from(JSON.stringify(legacyTopLevel)), legacyTopLevel),
    (error) => error.code === 'invalid_apple_ownership_request',
  );

  const auth = fs.readFileSync(new URL('../../lib/services/auth_service.dart', import.meta.url), 'utf8');
  const webStart = auth.indexOf('static Future<AuthResult> _signInWithWebAppleOwned(');
  const webOwner = auth.slice(webStart, auth.indexOf('@visibleForTesting', webStart));
  assert.ok(webStart >= 0);
  assert.doesNotMatch(webOwner, /appleAuthorizationCode|_firebaseSocialIdToken|signInWithProvider/u);
});

test('native and legacy Apple revocation material contract remains covered independently', () => {
  assert.deepEqual(normalizeAppleRevocationMaterial({ authorizationCode: 'synthetic-code' }), {
    kind: 'authorization_code', value: 'synthetic-code',
  });
  assert.equal(normalizeAppleRevocationMaterial({ authorizationCode: '' }), null);
  assert.throws(() => normalizeAppleRevocationMaterial({ authorizationCode: 'x'.repeat(12001) }),
    (error) => error.code === 'apple_revocation_material_invalid');
});

test('verified Apple claims and subject remain authoritative; client labels cannot replace them', async () => {
  const identity = await verifyFirebaseSocialToken('synthetic-firebase-'.repeat(10), {
    verifyIdToken: async (_, revoked) => {
      assert.equal(revoked, true);
      return claims({ provider: 'google' });
    },
  });
  assert.equal(identity.provider, 'apple');
  assert.equal(identity.subject, 'synthetic-subject');
  for (const identities of [{}, { 'google.com': ['synthetic-subject'] }, { 'apple.com': [] }]) {
    assert.throws(() => normalizeFirebaseSocialClaims(claims({
      firebase: { sign_in_provider: 'apple.com', identities },
    })), (error) => error.code === 'invalid_social_token');
  }
  assert.throws(() => normalizeFirebaseSocialClaims(claims({ email: '' })),
    (error) => error.code === 'social_email_required');
});

test('real loopback HTTP boundary verifies only idToken and never trusts Apple code as identity', async () => {
  const { createApp } = await import('../src/app.js');
  const seen = [];
  const app = createApp({ verifySocialToken: async (value) => {
    seen.push(value);
    // Deliberately reject before database/provider effects; not login proof.
    throw new SocialAuthError(401, 'invalid_social_token');
  } });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const payload of [
      { idToken: 'synthetic-firebase', appleAuthorizationCode: 'synthetic-code' },
      { appleAuthorizationCode: 'synthetic-code', provider: 'apple' },
    ]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/auth/social`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.error, 'invalid_social_token');
      assert.doesNotMatch(JSON.stringify(body), /synthetic-code|synthetic-firebase/);
    }
    assert.deepEqual(seen, ['synthetic-firebase', undefined]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('existing allowlist/Google-only enrollment and server code exchange stay intact', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const start = source.indexOf("app.post('/v1/auth/social'");
  const route = source.slice(start, source.indexOf("app.post('/v1/auth/", start + 1));
  assert.match(route, /const googleRegistrationLaneEnabled = config.stagingGoogleRegistration.enabled\s*&& identity.provider === 'google'/);
  assert.match(route, /else if \(!stagingGoogleRegistration\) throw new HttpError\(403, 'staging_registration_disabled'\)/);
  assert.match(route, /assertStagingUserAllowed\(existing.rows\[0\].id\)/);
  assert.match(route, /authorizationCode: req.body\?\.appleAuthorizationCode/);
  assert.match(route, /code: appleRevocationMaterial.value,\s*expectedSubject: identity.subject/);
  assert.match(route, /typeof req.body\?\.appleRefreshToken === 'string'[\s\S]*invalid_social_provider_material/);
  assert.doesNotMatch(route, /req.body\?\.provider|req.body\?\.accessToken/);
});
