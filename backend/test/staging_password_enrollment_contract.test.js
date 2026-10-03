import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://127.0.0.1:1/synthetic_enrollment';
process.env.JWT_SECRET ??= `synthetic-enrollment-${'x'.repeat(48)}`;
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.SIT_STAGING_ACCESS_GATE_ENABLED = 'true';
process.env.SIT_STAGING_ALLOWED_USER_IDS = 'synthetic-enrollment-principal';
delete process.env.SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED;
delete process.env.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS;
const { createApp } = await import('../src/app.js');
const { config } = await import('../src/config.js');

test('default-off real HTTP path rejects registration before any DB or mail access', async () => {
  assert.equal(config.stagingPasswordEnrollment.enabled, false);
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'staging_registration_disabled');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('source keeps invitation material out of request logs/export and binds cleanup plus default-off template', async () => {
  const read = (file) => fs.readFile(new URL(file, import.meta.url), 'utf8');
  const [observability, exportSource, cleanup, template, app] = await Promise.all([
    read('../src/observability.js'), read('../src/privacy_export.js'),
    read('../src/credential_cleanup.js'), read('../.env.example'), read('../src/app.js'),
  ]);
  assert.doesNotMatch(observability, /req\.(?:body|query|headers)/u);
  assert.doesNotMatch(exportSource, /staging_password_enrollment_redemptions/u);
  assert.match(cleanup, /await pruneExpiredStagingPasswordEnrollments\(client\)/u);
  assert.match(template, /^SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED=false$/mu);
  assert.match(template, /^SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS=$/mu);
  assert.match(app, /app\.post\('\/v1\/auth\/register', registrationLimiter/u);
  assert.match(app, /authorizationPresent: req\.get\('authorization'\) !== undefined/u);
  assert.match(app, /token: req\.body\?\.enrollmentToken,\s*email,\s*authorizationPresent:/u);
  assert.match(app, /const passwordHash = await hashPassword\(password\)/u);
});

test('account passwords retain independent salted scrypt, not invitation/content SHA-256', async () => {
  const { hashPassword, verifyPassword } = await import('../src/security.js');
  const credential = ['synthetic', 'fixture', '17'].join('-');
  const first = await hashPassword(credential); const second = await hashPassword(credential);
  assert.match(first, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/u);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(credential, first), true);
  assert.equal(await verifyPassword(`${credential}-wrong`, first), false);
  assert.equal(await verifyPassword(credential, 'a'.repeat(64)), false);
});
