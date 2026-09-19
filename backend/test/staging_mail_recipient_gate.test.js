import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
process.env.MAIL_TRANSPORT = 'smtp';
process.env.PUSH_TRANSPORT = 'disabled';
process.env.SIT_STAGING_ALLOWED_USER_IDS = 'owner-a';
process.env.SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS = 'contact@shareittoo.com';
process.env.SMTP_HOST = 'smtp-relay.gmail.com';

const { sendVerificationEmail } = await import('../src/mailer.js');

test('staging mail rejects a recipient before any SMTP connection', async () => {
  await assert.rejects(
    sendVerificationEmail({
      email: 'foreign@example.invalid',
      displayName: 'Foreign',
      token: 'synthetic-token',
    }),
    (error) => error?.code === 'mail_recipient_not_allowlisted',
  );
});
