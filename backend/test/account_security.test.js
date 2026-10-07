import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.MAIL_TRANSPORT = 'memory';
process.env.PUBLIC_BASE_URL = 'https://shareittoo.com/api/v1';
process.env.APP_PUBLIC_URL = 'https://shareittoo.com';

const accountActions = await import('../src/account_actions.js');
const mailer = await import('../src/mailer.js');
const security = await import('../src/security.js');

test('account action tokens are random and only their hash is stored', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (/SELECT id FROM users/u.test(sql)) {
        return { rows: [{ id: 'user-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };

  const first = await accountActions.createActionToken(client, {
    userId: 'user-1',
    kind: 'verify_email',
  });
  const second = await accountActions.createActionToken(client, {
    userId: 'user-1',
    kind: 'verify_email',
  });

  assert.notEqual(first, second);
  assert.ok(first.length >= 64);
  assert.match(calls[0].sql, /FROM users[\s\S]*FOR UPDATE/u);
  assert.equal(calls[2].parameters[2], security.hashActionToken(first));
  assert.equal(calls[2].parameters.includes(first), false);
  assert.ok(calls[2].parameters[3] instanceof Date);
  assert.ok(calls[2].parameters[5] instanceof Date);
  assert.ok(calls[2].parameters[3].getTime() > calls[2].parameters[5].getTime());
  assert.match(calls[3].sql, /FROM users[\s\S]*FOR UPDATE/u);
  assert.equal(calls[5].parameters[2], security.hashActionToken(second));
  assert.equal(calls[5].parameters.includes(second), false);
});

test('account action consumption succeeds exactly once', async () => {
  const rowCounts = [1, 0];
  const client = {
    async query(sql, parameters) {
      assert.match(sql, /consumed_at IS NULL[\s\S]*RETURNING id/u);
      assert.deepEqual(parameters, ['action-token-1']);
      return { rows: [], rowCount: rowCounts.shift() };
    },
  };

  assert.equal(await accountActions.consumeActionToken(client, 'action-token-1'), true);
  assert.equal(await accountActions.consumeActionToken(client, 'action-token-1'), false);
});

test('password-reset token issuance locks the account and fails closed for active takeover cases', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (calls.length === 1) {
        return { rows: [{ id: 'user-1' }], rowCount: 1 };
      }
      if (calls.length === 2) {
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      }
      assert.fail(`unexpected query: ${sql}`);
    },
  };

  await assert.rejects(
    accountActions.createActionToken(client, {
      userId: 'user-1',
      kind: 'reset_password',
    }),
    new RegExp(accountActions.ACCOUNT_RECOVERY_EMAIL_BLOCKED, 'u'),
  );
  assert.match(calls[0].sql, /FROM users[\s\S]*FOR UPDATE/u);
  assert.match(calls[1].sql, /case_subtype = 'account_takeover'/u);
  assert.equal(calls.some((call) => /INSERT INTO auth_action_tokens/u.test(call.sql)), false);
});

test('password-reset lifetime uses one deterministic issuance timestamp', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (calls.length === 1) return { rows: [{ id: 'user-1' }], rowCount: 1 };
      if (calls.length === 2) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
  };

  await accountActions.createActionToken(client, {
    userId: 'user-1',
    kind: 'reset_password',
  });

  const insert = calls.find((call) => /INSERT INTO auth_action_tokens/u.test(call.sql));
  assert.ok(insert);
  assert.match(insert.sql, /payload, created_at/u);
  assert.equal(
    insert.parameters[3].getTime() - insert.parameters[5].getTime(),
    30 * 60 * 1000,
  );
});

test('malformed account tokens are rejected without a database lookup', async () => {
  let queried = false;
  const client = {
    async query() {
      queried = true;
      return { rows: [] };
    },
  };

  const result = await accountActions.lockValidActionToken(client, {
    token: 'too-short',
    kind: 'reset_password',
  });
  assert.equal(result, null);
  assert.equal(queried, false);
});

test('memory mail transport produces a one-time verification link', async () => {
  assert.equal(await mailer.verifyMailer(), 'ok');
  const info = await mailer.sendVerificationEmail({
    email: 'person@example.com',
    displayName: 'Test Person',
    token: 'secret-action-token',
  });
  const message = JSON.parse(info.message);
  assert.equal(message.to[0].address, 'person@example.com');
  assert.match(message.subject, /Bestätige deine E-Mail-Adresse/);
  assert.match(message.html, /secret-action-token/);
  assert.match(message.text, /24 Stunden/);
});

test('memory mail transport protects an email-address change', async () => {
  const verificationInfo = await mailer.sendEmailChangeVerification({
    email: 'new-address@example.com',
    displayName: 'Test Person',
    token: 'secret-email-change-token',
  });
  const verification = JSON.parse(verificationInfo.message);
  assert.equal(verification.to[0].address, 'new-address@example.com');
  assert.match(verification.subject, /neue ShareItToo-E-Mail-Adresse/);
  assert.match(verification.html, /secret-email-change-token/);
  assert.match(verification.text, /24 Stunden/);

  const alertInfo = await mailer.sendEmailChangeAlert({
    email: 'old-address@example.com',
    displayName: 'Test Person',
  });
  const alert = JSON.parse(alertInfo.message);
  assert.equal(alert.to[0].address, 'old-address@example.com');
  assert.match(alert.subject, /Änderung/);
  assert.doesNotMatch(alert.text, /secret-email-change-token/);
});

test('memory mail transport produces a one-time account deletion link', async () => {
  const info = await mailer.sendAccountDeletionEmail({
    email: 'person@example.com',
    displayName: 'Test Person',
    token: 'secret-deletion-token',
  });
  const message = JSON.parse(info.message);
  assert.equal(message.to[0].address, 'person@example.com');
  assert.match(message.subject, /Löschung/);
  assert.match(message.html, /secret-deletion-token/);
  assert.match(message.text, /30 Minuten/);
});

test('account result pages escape untrusted content', () => {
  const page = accountActions.resultPage({
    success: false,
    title: '<script>alert(1)</script>',
    message: '<img src=x onerror=alert(1)>',
  });
  assert.equal(page.includes('<script>'), false);
  assert.equal(page.includes('<img'), false);
  assert.match(page, /&lt;script&gt;/);
});

test('public compliance pages stay visibly fail-closed before legal approval', () => {
  assert.equal(accountActions.publicComplianceOverview().status, 'draft');
  assert.equal(accountActions.publicComplianceOverview().submissionReady, false);

  const support = accountActions.publicSupportPage();
  assert.match(support, /data-sit-public-page="support"/);
  assert.match(support, /data-sit-compliance-status="draft"/);
  assert.doesNotMatch(support, /mailto:/);

  const privacy = accountActions.publicPrivacyPage();
  assert.match(privacy, /data-sit-public-page="privacy"/);
  assert.match(privacy, /data-sit-compliance-status="draft"/);
  assert.match(privacy, /rechtlicher Endprüfung/);

  const imprint = accountActions.publicImprintPage();
  assert.match(imprint, /data-sit-public-page="imprint"/);
  assert.match(imprint, /data-sit-compliance-status="draft"/);

  const deletion = accountActions.accountDeletionRequestForm({ submitted: false });
  assert.match(deletion, /data-sit-public-page="account-deletion"/);
  assert.match(deletion, /data-sit-compliance-status="operational"/);
});

test('approved public privacy copy covers the evidenced current data flows and deletion limits', () => {
  const privacy = accountActions.publicPrivacyPage({
    compliance: {
      approved: true,
      providerName: 'Example Provider',
      providerAddress: 'Example Address',
      privacyEmail: 'privacy-contact.invalid',
      effectiveDate: '2026-08-12',
    },
  });

  assert.match(privacy, /data-sit-compliance-status="approved"/);
  assert.match(privacy, /Example Provider/);
  assert.match(privacy, /Google Maps Platform/);
  assert.match(privacy, /Firebase Cloud Messaging/);
  assert.match(privacy, /Firebase Crashlytics/);
  assert.match(privacy, /Telefonnummer per SMS bestätigen/);
  assert.match(privacy, /deutsche Rufnummern/);
  assert.match(privacy, /bis zu 180 Tagen/);
  assert.match(privacy, /90 Tage/);
  assert.match(privacy, /keine dauerhafte Hintergrund- oder Live-Ortung/);
  assert.match(privacy, /keine aktivierte Echtgeld-Zahlungsübertragung an Stripe/);
  assert.match(privacy, /keine Ausweisprüfung/);
  assert.match(privacy, /keine Karten- oder Bankdaten/);
  assert.match(privacy, /Empfänger und Dienstleister/);
  assert.match(privacy, /Speicherung, Löschung und Rechte/);
  assert.match(privacy, /innerhalb von 14 Tagen/);
  assert.equal(privacy.includes('shareittoo.com/account-deletion'), true);
  assert.doesNotMatch(privacy, /OpenAI/);
});

test('approved public imprint exposes only the confirmed provider identity', () => {
  const imprint = accountActions.publicImprintPage({
    compliance: {
      approved: true,
      providerName: 'Example Provider',
      providerAddress: 'Example Address',
      supportEmail: 'contact.invalid',
      representative: 'Example Representative',
      contentResponsible: 'Example Responsible',
    },
    consumerDispute: {
      isComplete: true,
    },
  });

  assert.match(imprint, /data-sit-compliance-status="approved"/);
  assert.match(imprint, /Example Provider/);
  assert.match(imprint, /Example Representative/);
  assert.match(imprint, /Example Responsible/);
  assert.match(imprint, /mailto:contact\.invalid/);
  assert.match(imprint, /soweit keine gesetzliche Verpflichtung im Einzelfall besteht/);
});

test('public imprint stays draft when the VSBG configuration is incomplete', () => {
  const imprint = accountActions.publicImprintPage({
    compliance: {
      approved: true,
      providerName: 'Example Provider',
      providerAddress: 'Example Address',
      supportEmail: 'contact.invalid',
      representative: 'Example Representative',
      contentResponsible: 'Example Responsible',
    },
    consumerDispute: {
      isComplete: false,
    },
  });

  assert.match(imprint, /data-sit-compliance-status="draft"/);
  assert.doesNotMatch(imprint, /Example Provider/);
  assert.match(imprint, /Verbraucherstreitbeilegung/);
});

test('approved public support page exposes DSA and product-safety contact routes', () => {
  const support = accountActions.publicSupportPage({
    compliance: {
      approved: true,
      supportEmail: 'support-contact.invalid',
    },
    productSafety: {
      isComplete: true,
      consumerContactEmail: 'produktsicherheit@example.test',
    },
  });

  assert.match(support, /data-sit-compliance-status="approved"/);
  assert.match(support, /mailto:support-contact\.invalid/);
  assert.match(support, /Rechtswidrige Inhalte melden/);
  assert.match(support, /Meldung rechtswidriger Inhalt/);
  assert.match(support, /Beschwerde zu einer Moderationsentscheidung/);
  assert.match(support, /Produktsicherheit melden/);
  assert.match(support, /mailto:produktsicherheit@example\.test/);
  assert.match(support, /Nutze das Produkt nicht weiter/);
  assert.match(support, /kein Notruf/);
});

test('public compliance stays draft until product-safety approval is complete', () => {
  const common = {
    compliance: { approved: true },
    consumerDispute: { isComplete: true },
  };
  assert.deepEqual(accountActions.publicComplianceOverview({
    ...common,
    productSafety: { isComplete: false },
  }), {
    status: 'draft',
    submissionReady: false,
    pages: {
      support: 'draft',
      privacy: 'draft',
      consumerDispute: 'approved',
      productSafety: 'draft',
      accountDeletion: 'operational',
    },
  });
  assert.equal(accountActions.publicComplianceOverview({
    ...common,
    productSafety: { isComplete: true },
  }).submissionReady, true);
});
