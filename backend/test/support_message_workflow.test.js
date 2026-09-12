import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSupportMessage,
  publishSupportMessage,
  reviewSupportMessage,
} from '../src/support_message_workflow.js';
import {
  normalizeSupportAccountRecoveryGuidance,
} from '../src/support_account_recovery_domain.js';

const now = new Date('2026-08-21T10:00:00.000Z');
const caseId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const noRows = { rowCount: 0, rows: [] };

function caseRow(overrides = {}) {
  return {
    id: caseId,
    human_readable_case_number: 'SIT-ABCDEFGHJKLM',
    reporter_user_id: 'user-1',
    affected_user_ids: ['user-2'],
    current_owner_id: 'support-1',
    operating_mode: 'simulation',
    status: 'received',
    next_update_at: new Date('2026-08-22T10:00:00.000Z'),
    evidence_due_at: null,
    response_due_at: null,
    appeal_deadline: null,
    safety_flag: false,
    ...overrides,
  };
}

function messageRow(overrides = {}) {
  return {
    id: messageId,
    case_id: caseId,
    sender_type: 'support',
    sender_id: 'support-1',
    recipient_user_id: 'user-1',
    message_type: 'support_template',
    message_title: 'Aktiver Übergabe- oder Rückgabefall',
    template_id: 'T-002',
    template_version: '1.0.0',
    locale: 'de-DE',
    rendered_content: 'Sicherer gerenderter Inhalt',
    rendered_content_sha256: 'a'.repeat(64),
    structured_variables: {},
    approval_level: 'yellow_human_review',
    approved_by: null,
    approved_at: null,
    approval_payload_sha256: null,
    reviewed_by: null,
    reviewed_at: null,
    review_outcome: null,
    send_status: 'pending_approval',
    sent_at: null,
    delivery_status: null,
    corrects_message_id: null,
    lock_version: 1,
    created_at: now,
    recipient_account_status: 'active',
    recipient_deactivated_at: null,
    ...overrides,
  };
}

class ScriptedClient {
  constructor(steps) {
    this.steps = [...steps];
  }

  async query(sql, params = []) {
    const step = this.steps.shift();
    assert.ok(step, `unexpected query: ${sql}`);
    if (step.match) assert.match(sql, step.match);
    if (step.check) step.check({ sql, params });
    return typeof step.result === 'function' ? step.result({ sql, params }) : step.result;
  }

  done() {
    assert.equal(this.steps.length, 0, 'not all scripted queries were used');
  }
}

function intakeVariables() {
  return {
    first_name: 'Walid',
    confirmed_fact: 'Der Supportfall ist serverseitig eingegangen.',
    user_action_or_no_action: 'Du musst im Moment nichts weiter tun.',
    next_update_date: '22.08.2026',
    next_update_time: '12:00',
  };
}

function supportNotificationSteps() {
  return [
    {
      match: /SELECT id, reporter_user_id, affected_user_ids[\s\S]*FROM support_cases/u,
      result: { rowCount: 1, rows: [caseRow()] },
    },
    {
      match: /INSERT INTO notification_outbox/u,
      check: ({ sql, params }) => {
        assert.equal(params[1], 'user-1');
        assert.equal(params[2], 'in_app');
        assert.match(sql, /'support_case_update'/u);
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /INSERT INTO notification_outbox/u,
      check: ({ sql, params }) => {
        assert.equal(params[1], 'user-1');
        assert.equal(params[2], 'push');
        assert.match(sql, /'support_case_update'/u);
      },
      result: { rowCount: 1, rows: [] },
    },
  ];
}

const approvedConsumerDisputeEnvironment = Object.freeze({
  SIT_CONSUMER_DISPUTE_APPROVED: 'true',
  SIT_CONSUMER_DISPUTE_CONFIGURATION_VERSION: 'VSBG-REVIEW-1',
  SIT_CONSUMER_DISPUTE_BODY_NAME: 'Universalschlichtungsstelle des Bundes',
  SIT_CONSUMER_DISPUTE_BODY_ADDRESS: 'Beispielweg 1, 00000 Beispielstadt',
  SIT_CONSUMER_DISPUTE_BODY_WEBSITE: 'https://www.verbraucher-schlichter.de/',
  SIT_CONSUMER_DISPUTE_PARTICIPATION_STATUS:
    'not_willing_or_obliged_except_mandatory_case',
});

async function withConsumerDisputeEnvironment(callback) {
  const prior = Object.fromEntries(Object.keys(approvedConsumerDisputeEnvironment)
    .map((key) => [key, process.env[key]]));
  Object.assign(process.env, approvedConsumerDisputeEnvironment);
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('green template publication records an in-app message without external delivery', async () => {
  const client = new ScriptedClient([
    { match: /message\.idempotency_key = \$1/u, result: noRows },
    { match: /FROM support_cases WHERE id::text = \$1 FOR UPDATE/u, result: { rowCount: 1, rows: [caseRow()] } },
    { match: /FROM users[\s\S]*FOR KEY SHARE/u, result: { rowCount: 1, rows: [{ id: 'user-1' }] } },
    { match: /SELECT \* FROM support_messages WHERE idempotency_key/u, result: noRows },
    {
      match: /INSERT INTO support_messages/u,
      check: ({ params }) => {
        assert.equal(params[3], 'user-1');
        assert.equal(params[5], 'T-001');
        assert.equal(params[11], 'green_automatic');
        assert.equal(params[12], 'sent');
        assert.equal(params[13], now);
        assert.equal(params[14], 'in_app_recorded');
        assert.match(params[8], /SIT-ABCDEFGHJKLM/u);
        assert.doesNotMatch(params[8], /\{\{|\}\}/u);
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [messageRow({
          id: params[0],
          sender_id: params[2],
          recipient_user_id: params[3],
          message_title: params[4],
          template_id: params[5],
          rendered_content: params[8],
          rendered_content_sha256: params[9],
          approval_level: params[11],
          send_status: params[12],
          sent_at: params[13],
          delivery_status: params[14],
        })],
      }),
    },
    {
      match: /INSERT INTO support_case_events/u,
      check: ({ params }) => {
        assert.equal(params[1], 'message.published');
        const payload = JSON.parse(params[5]);
        assert.equal(payload.inAppMessageRecorded, true);
        assert.equal(payload.externalMessageSent, false);
        assert.equal(params[6], true);
        assert.equal(params[7], 'user_visible');
      },
      result: noRows,
    },
    {
      match: /INSERT INTO audit_log/u,
      check: ({ params }) => {
        assert.equal(params[2], 'support.message_published');
        const metadata = JSON.parse(params[4]);
        assert.equal(metadata.externalMessageSent, false);
        assert.doesNotMatch(JSON.stringify(metadata), /serverseitig eingegangen/u);
      },
      result: noRows,
    },
    ...supportNotificationSteps(),
  ]);
  const result = await createSupportMessage(client, {
    actor: { id: 'support-1', role: 'support' },
    caseId,
    raw: {
      templateId: 'T-001',
      recipientUserId: 'user-1',
      variables: intakeVariables(),
      publishNow: true,
    },
    idempotencyKey: 'message-create-1',
    now,
  });
  assert.equal(result.replayed, false);
  assert.equal(result.message.sendStatus, 'sent');
  assert.equal(result.message.externalMessageSent, false);
  client.done();
});

test('message creation rejects a recipient whose account is closed', async () => {
  const client = new ScriptedClient([
    { match: /message\.idempotency_key = \$1/u, result: noRows },
    { match: /FROM support_cases WHERE id::text = \$1 FOR UPDATE/u, result: { rowCount: 1, rows: [caseRow()] } },
    { match: /FROM users[\s\S]*FOR KEY SHARE/u, result: noRows },
  ]);
  await assert.rejects(
    createSupportMessage(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId,
      raw: {
        templateId: 'T-001',
        recipientUserId: 'user-1',
        variables: intakeVariables(),
        publishNow: true,
      },
      idempotencyKey: 'closed-recipient',
      now,
    }),
    /support_message_recipient_account_closed/u,
  );
  client.done();
});

test('message recipient must belong to the locked support case', async () => {
  const client = new ScriptedClient([
    { match: /message\.idempotency_key = \$1/u, result: noRows },
    { match: /FOR UPDATE/u, result: { rowCount: 1, rows: [caseRow()] } },
  ]);
  await assert.rejects(
    createSupportMessage(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId,
      raw: { templateId: 'T-001', recipientUserId: 'stranger', variables: intakeVariables() },
      idempotencyKey: 'wrong-recipient',
      now,
    }),
    /support_message_recipient_forbidden/u,
  );
  client.done();
});

test('progress templates cannot bypass the dedicated proposal workflow', async () => {
  const client = new ScriptedClient([
    { match: /message\.idempotency_key = \$1/u, result: noRows },
    { match: /FROM support_cases WHERE id::text = \$1 FOR UPDATE/u,
      result: { rowCount: 1, rows: [caseRow()] } },
  ]);
  await assert.rejects(
    createSupportMessage(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId,
      raw: {
        templateId: 'T-008',
        recipientUserId: 'user-1',
        variables: {},
      },
      idempotencyKey: 'progress-bypass',
      now,
    }),
    /support_progress_update_workflow_required/u,
  );
  client.done();
});

test('account recovery guidance is server-bound and cannot use the generic message route', async () => {
  const accountRecoveryCase = caseRow({
    case_type: 'trust_safety',
    case_subtype: 'account_takeover',
    priority: 'p0',
    severity: 'critical',
    safety_flag: true,
    account_takeover_flag: true,
    approval_level: 'red_explicit_decision',
  });
  const bypassClient = new ScriptedClient([
    { match: /message\.idempotency_key = \$1/u, result: noRows },
    { match: /FROM support_cases WHERE id::text = \$1 FOR UPDATE/u,
      result: { rowCount: 1, rows: [accountRecoveryCase] } },
  ]);
  await assert.rejects(
    createSupportMessage(bypassClient, {
      actor: { id: 'support-1', role: 'support' },
      caseId,
      raw: {
        templateId: 'T-035',
        recipientUserId: 'user-1',
        variables: {
          first_name: 'Walid',
          secure_recovery_channel: 'E-Mail',
          temporary_account_effect: 'Wiederherstellung freigegeben',
        },
      },
      idempotencyKey: 'account-recovery-bypass',
      now,
    }),
    /support_account_recovery_workflow_required/u,
  );
  bypassClient.done();

  const client = new ScriptedClient([
    { match: /message\.idempotency_key = \$1/u, result: noRows },
    { match: /FROM support_cases WHERE id::text = \$1 FOR UPDATE/u,
      result: { rowCount: 1, rows: [accountRecoveryCase] } },
    {
      match: /password_reauthentication_available[\s\S]*active_authenticated_session/u,
      result: {
        rowCount: 1,
        rows: [{
          id: 'user-1',
          password_reauthentication_available: true,
          active_authenticated_session: true,
        }],
      },
    },
    { match: /SELECT \* FROM support_messages WHERE idempotency_key/u, result: noRows },
    {
      match: /INSERT INTO support_messages/u,
      check: ({ params }) => {
        assert.equal(params[5], 'T-035');
        assert.equal(params[11], 'yellow_human_review');
        assert.equal(params[12], 'pending_approval');
        const variables = JSON.parse(params[10]);
        assert.equal(variables.compromised_channel_used, false);
        assert.equal(variables.password_or_pin_requested, false);
        assert.equal(variables.recovery_action_executed, false);
        assert.match(params[8], /Konto > Sicherheit/u);
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [messageRow({
          id: params[0],
          sender_id: params[2],
          recipient_user_id: params[3],
          message_title: params[4],
          template_id: params[5],
          rendered_content: params[8],
          rendered_content_sha256: params[9],
          structured_variables: JSON.parse(params[10]),
          approval_level: params[11],
          send_status: params[12],
        })],
      }),
    },
    { match: /INSERT INTO support_case_events/u, result: noRows },
    { match: /INSERT INTO audit_log/u, result: noRows },
  ]);
  const result = await createSupportMessage(client, {
    actor: { id: 'support-1', role: 'support' },
    caseId,
    raw: {
      templateId: 'T-035',
      recipientUserId: 'user-1',
      variables: {},
    },
    idempotencyKey: 'account-recovery-guidance',
    accountRecoveryDraft: true,
    now,
  });
  assert.equal(result.message.sendStatus, 'pending_approval');
  client.done();
});

test('T-053 is an admin-only configured red text-form draft with no external send', async () => {
  const supportOwnedLegalCase = caseRow({
    case_type: 'legal_authority',
    case_subtype: 'consumer_dispute_information',
  });
  const supportClient = new ScriptedClient([
    { match: /message\.idempotency_key = \$1/u, result: noRows },
    { match: /FROM support_cases WHERE id::text = \$1 FOR UPDATE/u, result: { rowCount: 1, rows: [supportOwnedLegalCase] } },
  ]);
  await assert.rejects(
    createSupportMessage(supportClient, {
      actor: { id: 'support-1', role: 'support' },
      caseId,
      raw: {
        templateId: 'T-053',
        recipientUserId: 'user-1',
        variables: {
          first_name: 'Walid',
          dispute_subject: 'die entgeltliche Plattformleistung',
        },
      },
      idempotencyKey: 'consumer-dispute-support-forbidden',
      now,
    }),
    /support_consumer_dispute_notice_requires_admin/u,
  );
  supportClient.done();

  const legalCase = { ...supportOwnedLegalCase, current_owner_id: 'admin-1' };
  const adminClient = new ScriptedClient([
    { match: /message\.idempotency_key = \$1/u, result: noRows },
    { match: /FROM support_cases WHERE id::text = \$1 FOR UPDATE/u, result: { rowCount: 1, rows: [legalCase] } },
    { match: /FROM users[\s\S]*FOR KEY SHARE/u, result: { rowCount: 1, rows: [{ id: 'user-1' }] } },
    { match: /SELECT \* FROM support_messages WHERE idempotency_key/u, result: noRows },
    {
      match: /INSERT INTO support_messages/u,
      check: ({ params }) => {
        assert.equal(params[5], 'T-053');
        assert.equal(params[11], 'red_explicit_decision');
        assert.equal(params[12], 'pending_approval');
        assert.equal(params[13], null);
        assert.equal(params[14], null);
        assert.match(params[8], /wird in Textform erteilt/u);
        const variables = JSON.parse(params[10]);
        assert.equal(variables.consumer_dispute_configuration_version, 'VSBG-REVIEW-1');
        assert.equal(
          variables.conciliation_body_website,
          'https://www.verbraucher-schlichter.de/',
        );
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [messageRow({
          id: params[0],
          sender_id: params[2],
          recipient_user_id: params[3],
          message_title: params[4],
          template_id: params[5],
          rendered_content: params[8],
          rendered_content_sha256: params[9],
          structured_variables: JSON.parse(params[10]),
          approval_level: params[11],
          send_status: params[12],
        })],
      }),
    },
    {
      match: /INSERT INTO support_case_events/u,
      check: ({ params }) => {
        assert.equal(params[1], 'message.drafted');
        assert.equal(params[7], 'internal');
      },
      result: noRows,
    },
    { match: /INSERT INTO audit_log/u, result: noRows },
  ]);
  const result = await withConsumerDisputeEnvironment(() => createSupportMessage(adminClient, {
    actor: { id: 'admin-1', role: 'admin' },
    caseId,
    raw: {
      templateId: 'T-053',
      recipientUserId: 'user-1',
      variables: {
        first_name: 'Walid',
        dispute_subject: 'die entgeltliche Plattformleistung',
      },
    },
    idempotencyKey: 'consumer-dispute-admin-draft',
    now,
  }));
  assert.equal(result.message.approvalLevel, 'red_explicit_decision');
  assert.equal(result.message.sendStatus, 'pending_approval');
  assert.equal(result.message.externalMessageSent, false);
  adminClient.done();
});

test('independent admin review binds approval to the exact immutable hash', async () => {
  const row = messageRow();
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/u, result: noRows },
    { match: /FOR UPDATE OF message/u, result: { rowCount: 1, rows: [{ ...row, case_operating_mode: 'simulation' }] } },
    { match: /SELECT 1 FROM support_case_events/u, result: noRows },
    {
      match: /UPDATE support_messages/u,
      check: ({ params }) => {
        assert.equal(params[1], 'admin-1');
        assert.equal(params[3], 'approved');
        assert.equal(params[5], 'admin-1');
        assert.equal(params[7], row.rendered_content_sha256);
        assert.equal(params[8], 'approved');
        assert.equal(params[9], 1);
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [{
          ...row,
          reviewed_by: params[1],
          reviewed_at: params[2],
          review_outcome: params[3],
          approved_by: params[5],
          approved_at: params[6],
          approval_payload_sha256: params[7],
          send_status: params[8],
          lock_version: 2,
        }],
      }),
    },
    { match: /INSERT INTO support_case_events/u, result: noRows },
    { match: /INSERT INTO audit_log/u, result: noRows },
  ]);
  const result = await reviewSupportMessage(client, {
    actor: { id: 'admin-1', role: 'admin' },
    caseId,
    messageId,
    raw: {
      outcome: 'approved',
      expectedVersion: 1,
      expectedPayloadSha256: row.rendered_content_sha256,
      reviewNotes: 'Wortlaut und bestätigte Falldaten wurden geprüft.',
    },
    idempotencyKey: 'message-review-1',
    now,
  });
  assert.equal(result.message.sendStatus, 'approved');
  assert.equal(result.message.approvalPayloadSha256, row.rendered_content_sha256);
  client.done();
});

test('configured T-053 red draft requires independent review before in-app publication', async () => {
  const red = messageRow({
    sender_id: 'admin-1',
    template_id: 'T-053',
    approval_level: 'red_explicit_decision',
  });
  const reviewClient = new ScriptedClient([
    { match: /FROM support_case_events AS event/u, result: noRows },
    { match: /FOR UPDATE OF message/u, result: { rowCount: 1, rows: [{ ...red, case_operating_mode: 'simulation' }] } },
    { match: /SELECT 1 FROM support_case_events/u, result: noRows },
    {
      match: /UPDATE support_messages/u,
      result: ({ params }) => ({
        rowCount: 1,
        rows: [{
          ...red,
          reviewed_by: params[1],
          reviewed_at: params[2],
          review_outcome: params[3],
          approved_by: params[5],
          approved_at: params[6],
          approval_payload_sha256: params[7],
          send_status: params[8],
          lock_version: 2,
        }],
      }),
    },
    { match: /INSERT INTO support_case_events/u, result: noRows },
    { match: /INSERT INTO audit_log/u, result: noRows },
  ]);
  const reviewed = await reviewSupportMessage(reviewClient, {
    actor: { id: 'admin-2', role: 'admin' },
    caseId,
    messageId,
    raw: {
      outcome: 'approved',
      expectedVersion: 1,
      expectedPayloadSha256: red.rendered_content_sha256,
      reviewNotes: 'VSBG-Konfiguration und Textformhinweis wurden unabhängig geprüft.',
    },
    idempotencyKey: 'consumer-dispute-review',
    now,
  });
  assert.equal(reviewed.message.sendStatus, 'approved');
  reviewClient.done();

  const approved = messageRow({
    ...red,
    approved_by: 'admin-2',
    approved_at: now,
    approval_payload_sha256: red.rendered_content_sha256,
    reviewed_by: 'admin-2',
    reviewed_at: now,
    review_outcome: 'approved',
    send_status: 'approved',
    lock_version: 2,
  });
  const publishClient = new ScriptedClient([
    { match: /FROM support_case_events AS event/u, result: noRows },
    {
      match: /FOR UPDATE OF message/u,
      result: {
        rowCount: 1,
        rows: [{
          ...approved,
          case_current_owner_id: 'admin-1',
          case_operating_mode: 'simulation',
        }],
      },
    },
    { match: /SELECT 1 FROM support_case_events/u, result: noRows },
    {
      match: /UPDATE support_messages/u,
      result: {
        rowCount: 1,
        rows: [{
          ...approved,
          send_status: 'sent',
          sent_at: now,
          delivery_status: 'in_app_recorded',
          lock_version: 3,
        }],
      },
    },
    {
      match: /INSERT INTO support_case_events/u,
      check: ({ params }) => {
        const payload = JSON.parse(params[5]);
        assert.equal(payload.approvalLevel, 'red_explicit_decision');
        assert.equal(payload.externalMessageSent, false);
        assert.equal(params[7], 'user_visible');
      },
      result: noRows,
    },
    { match: /INSERT INTO audit_log/u, result: noRows },
    ...supportNotificationSteps(),
  ]);
  const published = await publishSupportMessage(publishClient, {
    actor: { id: 'admin-1', role: 'admin' },
    caseId,
    messageId,
    raw: {
      expectedVersion: 2,
      expectedPayloadSha256: red.rendered_content_sha256,
    },
    idempotencyKey: 'consumer-dispute-publication',
    now,
  });
  assert.equal(published.message.sendStatus, 'sent');
  assert.equal(published.message.externalMessageSent, false);
  publishClient.done();
});

test('review rejects a red draft outside the dedicated T-053 decision path', async () => {
  const red = messageRow({
    sender_id: 'admin-1',
    template_id: 'T-043',
    approval_level: 'red_explicit_decision',
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/u, result: noRows },
    {
      match: /FOR UPDATE OF message/u,
      result: { rowCount: 1, rows: [{ ...red, case_operating_mode: 'simulation' }] },
    },
    { match: /SELECT 1 FROM support_case_events/u, result: noRows },
  ]);

  await assert.rejects(
    reviewSupportMessage(client, {
      actor: { id: 'admin-2', role: 'admin' },
      caseId,
      messageId,
      raw: {
        outcome: 'approved',
        expectedVersion: 1,
        expectedPayloadSha256: red.rendered_content_sha256,
        reviewNotes: 'Dieser rote Entwurf darf nicht den T-053-Sonderweg verwenden.',
      },
      idempotencyKey: 'other-red-review',
      now,
    }),
    /support_message_review_state_invalid/u,
  );
  client.done();
});

test('publication rejects an approved red record outside T-053', async () => {
  const red = messageRow({
    template_id: 'T-043',
    approval_level: 'red_explicit_decision',
    approved_by: 'admin-2',
    approved_at: now,
    approval_payload_sha256: 'a'.repeat(64),
    reviewed_by: 'admin-2',
    reviewed_at: now,
    review_outcome: 'approved',
    send_status: 'approved',
    lock_version: 2,
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/u, result: noRows },
    {
      match: /FOR UPDATE OF message, recipient/u,
      result: {
        rowCount: 1,
        rows: [{
          ...red,
          case_current_owner_id: 'support-1',
          case_operating_mode: 'simulation',
          case_next_update_at: new Date('2026-08-22T10:00:00.000Z'),
        }],
      },
    },
    { match: /SELECT 1 FROM support_case_events/u, result: noRows },
  ]);

  await assert.rejects(
    publishSupportMessage(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId,
      messageId,
      raw: {
        expectedVersion: 2,
        expectedPayloadSha256: red.rendered_content_sha256,
      },
      idempotencyKey: 'other-red-publication',
      now,
    }),
    /support_message_publication_not_approved/u,
  );
  client.done();
});

test('message author cannot review their own yellow draft', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/u, result: noRows },
    { match: /FOR UPDATE OF message/u, result: { rowCount: 1, rows: [{ ...messageRow({ sender_id: 'admin-1' }), case_operating_mode: 'simulation' }] } },
    { match: /SELECT 1 FROM support_case_events/u, result: noRows },
  ]);
  await assert.rejects(
    reviewSupportMessage(client, {
      actor: { id: 'admin-1', role: 'admin' },
      caseId,
      messageId,
      raw: {
        outcome: 'approved',
        expectedVersion: 1,
        expectedPayloadSha256: 'a'.repeat(64),
        reviewNotes: 'Wortlaut und Falldaten wurden geprüft.',
      },
      idempotencyKey: 'self-review',
      now,
    }),
    /support_message_self_review_forbidden/u,
  );
  client.done();
});

test('reviewed yellow message publishes only into the authenticated in-app record', async () => {
  const approved = messageRow({
    approved_by: 'admin-1',
    approved_at: now,
    approval_payload_sha256: 'a'.repeat(64),
    reviewed_by: 'admin-1',
    reviewed_at: now,
    review_outcome: 'approved',
    send_status: 'approved',
    lock_version: 2,
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/u, result: noRows },
    { match: /FOR UPDATE OF message/u, result: { rowCount: 1, rows: [{ ...approved, case_current_owner_id: 'support-1', case_operating_mode: 'simulation' }] } },
    { match: /SELECT 1 FROM support_case_events/u, result: noRows },
    {
      match: /UPDATE support_messages/u,
      check: ({ params }) => assert.deepEqual(params, [messageId, now, 2, 'approved']),
      result: { rowCount: 1, rows: [{ ...approved, send_status: 'sent', sent_at: now, delivery_status: 'in_app_recorded', lock_version: 3 }] },
    },
    {
      match: /INSERT INTO support_case_events/u,
      check: ({ params }) => {
        const payload = JSON.parse(params[5]);
        assert.equal(payload.externalMessageSent, false);
        assert.equal(params[7], 'user_visible');
      },
      result: noRows,
    },
    { match: /INSERT INTO audit_log/u, result: noRows },
    ...supportNotificationSteps(),
  ]);
  const result = await publishSupportMessage(client, {
    actor: { id: 'support-1', role: 'support' },
    caseId,
    messageId,
    raw: { expectedVersion: 2, expectedPayloadSha256: 'a'.repeat(64) },
    idempotencyKey: 'message-publish-1',
    now,
  });
  assert.equal(result.message.sendStatus, 'sent');
  assert.equal(result.message.externalMessageSent, false);
  client.done();
});

test('reviewed account recovery guidance rechecks the alternate authenticated path', async () => {
  const accountCase = {
    case_type: 'trust_safety',
    case_subtype: 'account_takeover',
    priority: 'p0',
    severity: 'critical',
    safety_flag: true,
    account_takeover_flag: true,
    approval_level: 'red_explicit_decision',
    reporter_user_id: 'user-1',
  };
  const guidance = normalizeSupportAccountRecoveryGuidance({
    supportCase: accountCase,
    recipientUserId: 'user-1',
    activeAuthenticatedSession: true,
    passwordReauthenticationAvailable: true,
  });
  const approved = messageRow({
    template_id: 'T-035',
    structured_variables: { ...guidance.bindings, ...guidance.metadata },
    approved_by: 'admin-1',
    approved_at: now,
    approval_payload_sha256: 'a'.repeat(64),
    reviewed_by: 'admin-1',
    reviewed_at: now,
    review_outcome: 'approved',
    send_status: 'approved',
    lock_version: 2,
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/u, result: noRows },
    {
      match: /recipient_active_authenticated_session/u,
      result: {
        rowCount: 1,
        rows: [{
          ...approved,
          case_current_owner_id: 'support-1',
          case_operating_mode: 'simulation',
          case_next_update_at: new Date('2026-08-22T10:00:00.000Z'),
          case_type: accountCase.case_type,
          case_subtype: accountCase.case_subtype,
          case_priority: accountCase.priority,
          case_severity: accountCase.severity,
          case_safety_flag: accountCase.safety_flag,
          case_account_takeover_flag: accountCase.account_takeover_flag,
          case_approval_level: accountCase.approval_level,
          case_reporter_user_id: accountCase.reporter_user_id,
          recipient_active_authenticated_session: false,
          recipient_password_reauthentication_available: true,
        }],
      },
    },
    { match: /SELECT 1 FROM support_case_events/u, result: noRows },
  ]);
  await assert.rejects(
    publishSupportMessage(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId,
      messageId,
      raw: { expectedVersion: 2, expectedPayloadSha256: 'a'.repeat(64) },
      idempotencyKey: 'account-recovery-stale-publication',
      now,
    }),
    /support_account_recovery_alternate_verification_unavailable/u,
  );
  client.done();
});

test('publication rechecks a promised next-update deadline after approval', async () => {
  const approved = messageRow({
    approved_by: 'admin-1',
    approved_at: now,
    approval_payload_sha256: 'a'.repeat(64),
    reviewed_by: 'admin-1',
    reviewed_at: now,
    review_outcome: 'approved',
    send_status: 'approved',
    lock_version: 2,
    structured_variables: { next_update_date: '21.08.2026' },
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/u, result: noRows },
    {
      match: /case_next_update_at/u,
      result: {
        rowCount: 1,
        rows: [{
          ...approved,
          case_current_owner_id: 'support-1',
          case_operating_mode: 'simulation',
          case_next_update_at: now,
        }],
      },
    },
    { match: /SELECT 1 FROM support_case_events/u, result: noRows },
  ]);
  await assert.rejects(
    publishSupportMessage(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId,
      messageId,
      raw: { expectedVersion: 2, expectedPayloadSha256: 'a'.repeat(64) },
      idempotencyKey: 'message-publish-overdue',
      now,
    }),
    /support_message_next_update_overdue/u,
  );
  client.done();
});

test('publication rejects a message whose recipient account was closed after drafting', async () => {
  const approved = messageRow({
    approved_by: 'admin-1',
    approved_at: now,
    approval_payload_sha256: 'a'.repeat(64),
    reviewed_by: 'admin-1',
    reviewed_at: now,
    review_outcome: 'approved',
    send_status: 'approved',
    lock_version: 2,
    recipient_account_status: 'closed',
    recipient_deactivated_at: now,
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/u, result: noRows },
    {
      match: /JOIN users AS recipient[\s\S]*FOR UPDATE OF message, recipient/u,
      result: {
        rowCount: 1,
        rows: [{
          ...approved,
          case_current_owner_id: 'support-1',
          case_operating_mode: 'simulation',
          case_next_update_at: new Date('2026-08-22T10:00:00.000Z'),
        }],
      },
    },
  ]);
  await assert.rejects(
    publishSupportMessage(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId,
      messageId,
      raw: { expectedVersion: 2, expectedPayloadSha256: 'a'.repeat(64) },
      idempotencyKey: 'closed-recipient-publication',
      now,
    }),
    /support_message_recipient_account_closed/u,
  );
  client.done();
});
