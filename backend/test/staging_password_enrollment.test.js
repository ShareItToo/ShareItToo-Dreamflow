import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import {
  prepareStagingPasswordInvitation,
  readStagingPasswordEnrollmentConfiguration,
  resolveStagingPasswordEnrollment,
  reserveStagingPasswordEnrollment,
} from '../src/staging_password_enrollment.js';

const now = Date.parse('2026-10-03T12:00:00.000Z');
const email = 'password-enrollment-synthetic@example.invalid';
const userId = 'password-enrollment-synthetic-principal';
const stagingAccess = { enabled: true, valid: true, deploymentEnvironment: 'test', allowedUserIds: [userId] };
const make = () => prepareStagingPasswordInvitation({ email, userId, now });
const registryRoot = fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()), 'sit-password-unit-'));
fs.chmodSync(registryRoot, 0o700);
after(() => fs.rmSync(registryRoot, { recursive: true, force: true }));
let registryIndex = 0;
const canonicalRecord = (invitation) => ({
  emailDigest: invitation.emailDigest,
  expiresAt: invitation.expiresAt,
  issuedAt: invitation.issuedAt,
  tokenDigest: invitation.tokenDigest,
  userId: invitation.userId,
  ...Object.fromEntries(Object.entries(invitation)
    .filter(([key]) => !['emailDigest', 'expiresAt', 'issuedAt', 'tokenDigest', 'userId'].includes(key))
    .toSorted(([left], [right]) => left.localeCompare(right))),
});
const environmentRecords = (invitations) => {
  const file = path.join(registryRoot, `registry-${registryIndex += 1}.json`);
  fs.writeFileSync(file, `${JSON.stringify(invitations.map(canonicalRecord))}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return {
    PRIVATE_PILOT_V4_ENABLED: 'true',
    SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'true',
    SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE: file,
  };
};
const environment = (invitation) => environmentRecords([invitation]);
const read = (env, gate = stagingAccess) => readStagingPasswordEnrollmentConfiguration(env, { stagingAccess: gate, now });
const denied = /staging_password_enrollment_unavailable/u;

test('default off and configured disabled lane fails closed without exposing private input', () => {
  assert.deepEqual(read({}), { enabled: false, invitations: [] });
  for (const env of [
    { SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'yes' },
    { SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS: 'private-invalid-value' },
    { SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'true' },
    { SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'true', SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS: '[]' },
  ]) assert.throws(() => read(env), denied);
});

test('ops preparation uses random bearer material and token-salted email binding', () => {
  const first = make();
  const second = make();
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.invitation.emailDigest, second.invitation.emailDigest);
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(JSON.stringify(first.invitation).includes(first.token), false);
  assert.equal(JSON.stringify(first.invitation).includes(email), false);
  assert.throws(() => prepareStagingPasswordInvitation({ email: email.toUpperCase(), userId, now }), denied);
});

test('existing invitation digest format remains valid; token and email changes fail closed', () => {
  // Fixed synthetic 32-byte bearer vector, never a real invitation/password.
  const token = Buffer.alloc(32, 7).toString('base64url');
  const invitation = {
    tokenDigest: 'dc4bf80c77473d130fa0de86ba4018fe98bb214005e6a5891d12ba91446f9e81',
    emailDigest: '12b72992fb7d8743534375adeef370e6cedfe22cf466ce510e885073b9283d18',
    userId, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 86400000).toISOString(),
  };
  const configuration = read(environment(invitation));
  assert.equal(resolveStagingPasswordEnrollment(configuration, { token, email, now }).userId, userId);
  assert.throws(() => resolveStagingPasswordEnrollment(configuration, { token: Buffer.alloc(32, 8).toString('base64url'), email, now }), denied);
  assert.throws(() => resolveStagingPasswordEnrollment(configuration, { token, email: 'foreign@example.invalid', now }), denied);
});

test('requires valid closed gate and exact unique preauthorized principals', () => {
  const { invitation } = make();
  for (const gate of [
    { ...stagingAccess, enabled: false }, { ...stagingAccess, valid: false },
    { ...stagingAccess, deploymentEnvironment: 'production' },
    { ...stagingAccess, allowedUserIds: [] },
  ]) assert.throws(() => read(environment(invitation), gate), denied);
  assert.throws(() => read({ ...environment(invitation), STRIPE_LIVEMODE: 'true' }), denied);
  assert.throws(() => read({ ...environment(invitation), STRIPE_LIVEMODE: ' TRUE ' }), denied);
  assert.throws(() => read({ ...environment(invitation), PRIVATE_PILOT_V4_ENABLED: 'false' }), denied);
  for (const changed of [
    { ...invitation, userId: 'foreign-principal' }, { ...invitation, tokenDigest: 'bad' },
    { ...invitation, extra: true }, { ...invitation, emailDigest: '' },
    { ...invitation, issuedAt: new Date(now + 1).toISOString() },
    { ...invitation, expiresAt: new Date(now + 86400001).toISOString() },
    { ...invitation, expiresAt: invitation.issuedAt },
  ]) assert.throws(() => read(environment(changed)), denied);
  assert.throws(() => read(environmentRecords([invitation, invitation])), denied);
});

test('exact token/email/expiry succeeds; foreign inputs and authenticated principal switches deny identically', () => {
  const { invitation, token } = make();
  const configuration = read(environment(invitation));
  assert.equal(resolveStagingPasswordEnrollment(configuration, { token, email, now }).userId, userId);
  for (const input of [
    { token: make().token, email, now }, { token, email: 'foreign@example.invalid', now },
    { token: `${token} `, email, now }, { token, email, now, authorizationPresent: true },
    { token, email, now: Date.parse(invitation.expiresAt) },
    { token, email, now: now - 1 }, { token, email: email.toUpperCase(), now },
    { token, email, now: NaN },
  ]) assert.throws(() => resolveStagingPasswordEnrollment(configuration, input), denied);
  assert.throws(() => resolveStagingPasswordEnrollment(read({}), { token, email, now }), denied);
  const expiredConfig = readStagingPasswordEnrollmentConfiguration(environment(invitation), {
    stagingAccess, now: now + 86400001,
  });
  assert.equal(expiredConfig.enabled, true);
  assert.throws(() => resolveStagingPasswordEnrollment(expiredConfig, { token, email, now: now + 86400001 }), denied);
});

test('spent-token reservation rejects replay without serializing principal/email or bearer material', async () => {
  const { invitation, token } = make();
  const calls = [];
  const client = { query: async (...args) => { calls.push(args); return { rowCount: calls.length === 1 ? 1 : 0 }; } };
  await reserveStagingPasswordEnrollment(client, invitation);
  await assert.rejects(reserveStagingPasswordEnrollment(client, invitation), denied);
  assert.match(calls[0][0], /ON CONFLICT \(token_digest\) DO NOTHING/u);
  assert.match(calls[0][0], /clock_timestamp\(\)/u);
  for (const privateValue of [email, userId, token]) assert.equal(JSON.stringify(calls).includes(privateValue), false);
});
