import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  completeDsaNoticeLocator,
  createSupportCase,
  getSupportCase,
  listStaffSupportCases,
  transitionSupportCase,
} from '../src/support_case_workflow.js';
import {
  supportCaseFamilies,
  supportIntakeScopeVersion,
  supportPacketVersion,
  supportSafetyGuidanceVersion,
  supportSafetyTriageVersion,
} from '../src/support_case_domain.js';

const now = new Date('2026-08-21T10:00:00.000Z');
const nextUpdateAt = new Date('2026-08-21T12:00:00.000Z');
const userActionDueAt = new Date('2026-08-23T18:00:00.000Z');

function safetyTriage(immediateDanger = false) {
  return {
    version: supportSafetyTriageVersion,
    packetVersion: supportPacketVersion,
    guidanceVersion: supportSafetyGuidanceVersion,
    immediateDanger,
    guidanceShown: immediateDanger,
  };
}

function issueScope(separationGuidanceShown = false) {
  return {
    version: supportIntakeScopeVersion,
    singleIssueConfirmed: true,
    separationGuidanceShown,
  };
}

function caseRow(overrides = {}) {
  return {
    id: 'case-1',
    human_readable_case_number: 'SIT-ABCDEFGHJKLM',
    dsa_notice_number: null,
    dsa_notice_evidence: null,
    dsa_notice_locator_status: null,
    dsa_notice_locator_kind: null,
    product_safety_notice_number: null,
    product_safety_evidence: null,
    product_safety_triage_due_at: null,
    feedback_context: null,
    case_type: 'general_help',
    case_subtype: 'general_how_to',
    status: 'received',
    priority: 'p3',
    severity: 'low',
    source_channel: 'app',
    operating_mode: 'simulation',
    locale: 'de-DE',
    reporter_user_id: 'user-1',
    reporter_role: 'user',
    affected_user_ids: [],
    linked_booking_id: null,
    linked_listing_id: null,
    linked_payment_id: null,
    linked_refund_id: null,
    linked_payout_id: null,
    current_owner_id: null,
    current_owner_role: 'general_support_owner',
    escalation_target_role: null,
    approval_level: 'green_automatic',
    waiting_on: 'support_owner',
    waiting_reason: 'Der Eingang wartet auf die fachliche Übernahme.',
    next_action: 'Eingang fachlich prüfen und einem verantwortlichen Owner zuweisen.',
    response_due_at: null,
    evidence_due_at: null,
    next_update_at: nextUpdateAt,
    user_facing_summary: 'Allgemeine Hilfe im Testmodus.',
    internal_summary: null,
    safety_flag: false,
    privacy_flag: false,
    dsa_flag: false,
    authority_flag: false,
    article18_candidate_flag: false,
    money_flag: false,
    account_takeover_flag: false,
    policy_snapshot_id: null,
    decision_id: null,
    implementation_pending_action: null,
    resolution_reference: null,
    appeal_available: false,
    appeal_deadline: null,
    appeal_id: null,
    appeal_configured_at: null,
    appeal_configured_by: null,
    closure_reason: null,
    reopen_reason: null,
    idempotency_key: 'support.case.create:key-1',
    lock_version: 1,
    created_at: now,
    updated_at: now,
    resolved_at: null,
    closed_at: null,
    ...overrides,
  };
}

class ScriptedClient {
  constructor(steps) {
    this.steps = [...steps];
    this.calls = [];
  }

  async query(sql, params = []) {
    this.calls.push({ sql, params });
    const step = this.steps.shift();
    assert.ok(step, `unexpected query: ${sql}`);
    if (step.match) assert.match(sql, step.match);
    if (step.check) step.check({ sql, params });
    return typeof step.result === 'function'
      ? step.result({ sql, params })
      : step.result;
  }

  done() {
    assert.equal(this.steps.length, 0, 'not all scripted database calls were used');
  }
}

const noRows = { rowCount: 0, rows: [] };

test('create replays before validating a changed request body', async () => {
  const client = new ScriptedClient([{
    match: /FROM support_cases/,
    result: { rowCount: 1, rows: [caseRow()] },
  }]);
  const result = await createSupportCase(client, {
    actor: { id: 'user-1', role: 'user' },
    raw: null,
    idempotencyKey: 'key-1',
    nextUpdateAt,
    now,
  });
  assert.equal(result.replayed, true);
  assert.equal(result.supportCase.caseNumber, 'SIT-ABCDEFGHJKLM');
  assert.equal(result.supportCase.timezone, 'Europe/Berlin');
  assert.match(result.supportCase.nextUpdateDisplay, /21\.08\.2026/u);
  assert.match(result.supportCase.nextUpdateDisplay, /14:00/u);
  assert.equal(result.supportCase.userActionDueAt, null);
  assert.equal(result.supportCase.userActionDueDisplay, null);
  assert.equal('approvalLevel' in result.supportCase, false);
  assert.equal('flags' in result.supportCase, false);
  client.done();
});

test('create validates linked-entity access and records case, event and audit', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_cases/, result: noRows },
    {
      match: /AS booking_allowed/,
      check: ({ params }) => assert.deepEqual(params.slice(0, 3), [
        'user-1',
        'booking-1',
        'listing-1',
      ]),
      result: {
        rowCount: 1,
        rows: [{
          booking_allowed: true,
          listing_exists: true,
          payment_allowed: true,
          refund_allowed: true,
          payout_allowed: true,
        }],
      },
    },
    {
      match: /INSERT INTO support_cases/,
      check: ({ params }) => {
        assert.match(params[1], /^SIT-[A-HJ-NP-Z2-9]{12}$/);
        assert.equal(params[2], 'active_handover');
        assert.equal(params[4], 'p1');
        assert.equal(params[7], 'internal_testing');
        assert.equal(params[25], 'booking-1');
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [caseRow({
          id: params[0],
          human_readable_case_number: params[1],
          case_type: params[2],
          case_subtype: params[3],
          priority: params[4],
          severity: params[5],
          source_channel: params[6],
          operating_mode: params[7],
          reporter_user_id: params[9],
          reporter_role: params[10],
          current_owner_role: params[11],
          approval_level: params[12],
          waiting_on: params[13],
          waiting_reason: params[14],
          next_action: params[15],
          next_update_at: params[16],
          user_facing_summary: params[17],
          linked_booking_id: params[25],
          linked_listing_id: params[26],
          idempotency_key: params[30],
          intake_scope_evidence: JSON.parse(params[31]),
          dsa_notice_number: params[32],
          dsa_notice_evidence: params[33] == null ? null : JSON.parse(params[33]),
          created_at: params[36],
          updated_at: params[36],
        })],
      }),
    },
    {
      match: /INSERT INTO support_case_events/,
      check: ({ params }) => {
        assert.equal(params[1], 'user');
        assert.equal(params[2], 'user-1');
        const payload = JSON.parse(params[3]);
        assert.equal(payload.operatingMode, 'internal_testing');
        assert.deepEqual(payload.safetyTriage, safetyTriage());
        assert.deepEqual(payload.issueScope, issueScope(true));
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        assert.equal(params[2], 'support.case_created');
        assert.equal(JSON.parse(params[4]).priority, 'p1');
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);

  const result = await createSupportCase(client, {
    actor: { id: 'user-1', role: 'user' },
    raw: {
      caseType: 'active_handover',
      caseSubType: 'qr_or_code_failure',
      summary: 'QR-Code funktioniert beim internen Test nicht.',
      linkedBookingId: 'booking-1',
      linkedListingId: 'listing-1',
      safetyTriage: safetyTriage(),
      issueScope: issueScope(true),
    },
    idempotencyKey: 'key-2',
    nextUpdateAt,
    operatingMode: 'internal_testing',
    now,
  });
  assert.equal(result.replayed, false);
  assert.equal(result.supportCase.priority, 'p1');
  assert.equal(result.supportCase.operatingMode, 'internal_testing');
  assert.equal('severity' in result.supportCase, false);
  client.done();
});

test('create persists controlled P4 feedback without linked entities or escalation', async () => {
  const feedbackContext = {
    version: 'sit_support_feedback_context_v1',
    feedbackKind: 'improvement_suggestion',
    productArea: 'app_experience',
    nonUrgentConfirmed: true,
  };
  const client = new ScriptedClient([
    { match: /FROM support_cases/, result: noRows },
    {
      match: /AS booking_allowed/,
      check: ({ params }) => assert.deepEqual(params, [
        'user-1', null, null, null, null, null,
      ]),
      result: {
        rowCount: 1,
        rows: [{
          booking_allowed: true,
          listing_exists: true,
          payment_allowed: true,
          refund_allowed: true,
          payout_allowed: true,
        }],
      },
    },
    {
      match: /INSERT INTO support_cases/,
      check: ({ sql, params }) => {
        assert.match(sql, /feedback_context/u);
        assert.equal(params[2], 'general_help');
        assert.equal(params[3], 'feedback_or_improvement');
        assert.equal(params[4], 'p4');
        assert.equal(params[5], 'low');
        assert.equal(params[11], 'general_support_owner');
        assert.equal(params[12], 'green_automatic');
        assert.deepEqual(params.slice(25, 30), [null, null, null, null, null]);
        assert.deepEqual(JSON.parse(params[40]), feedbackContext);
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [caseRow({
          id: params[0],
          human_readable_case_number: params[1],
          case_type: params[2],
          case_subtype: params[3],
          priority: params[4],
          severity: params[5],
          current_owner_role: params[11],
          approval_level: params[12],
          next_action: params[15],
          next_update_at: params[16],
          feedback_context: JSON.parse(params[40]),
          created_at: params[36],
          updated_at: params[36],
        })],
      }),
    },
    {
      match: /INSERT INTO support_case_events/,
      check: ({ params }) => {
        const payload = JSON.parse(params[3]);
        assert.equal(payload.priority, 'p4');
        assert.deepEqual(payload.feedbackContext, feedbackContext);
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        const metadata = JSON.parse(params[4]);
        assert.equal(metadata.priority, 'p4');
        assert.equal(metadata.feedbackContextVersion, feedbackContext.version);
        assert.equal(metadata.feedbackKind, feedbackContext.feedbackKind);
        assert.equal(metadata.feedbackProductArea, feedbackContext.productArea);
        assert.equal(metadata.feedbackNonUrgentConfirmed, true);
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);

  const result = await createSupportCase(client, {
    actor: { id: 'user-1', role: 'user' },
    raw: {
      caseType: 'general_help',
      caseSubType: 'feedback_or_improvement',
      summary: 'Nicht dringende Verbesserung für die App vorschlagen.',
      safetyTriage: safetyTriage(),
      issueScope: issueScope(),
      feedbackContext,
    },
    idempotencyKey: 'feedback-key-1',
    now,
  });

  assert.equal(result.supportCase.priority, 'p4');
  assert.deepEqual(result.supportCase.feedbackContext, feedbackContext);
  assert.equal(result.supportCase.linkedBookingId, null);
  assert.equal(result.supportCase.linkedListingId, null);
  client.done();
});

test('product-safety creation snapshots bounded evidence and a rapid triage receipt', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_cases/, result: noRows },
    {
      match: /AS booking_allowed/,
      result: {
        rowCount: 1,
        rows: [{
          booking_allowed: true,
          listing_exists: true,
          payment_allowed: true,
          refund_allowed: true,
          payout_allowed: true,
        }],
      },
    },
    {
      match: /INSERT INTO support_cases/,
      check: ({ params }) => {
        assert.equal(params[2], 'trust_safety');
        assert.equal(params[3], 'dangerous_item_or_injury');
        assert.equal(params[4], 'p1');
        assert.equal(params[11], 'trust_safety_owner');
        assert.equal(params[12], 'red_explicit_decision');
        assert.equal(params[18], true);
        assert.equal(params[21], true);
        assert.match(params[37], /^SIT-P-[A-HJ-NP-Z2-9]{12}$/u);
        assert.equal(params[39].toISOString(), '2026-08-21T11:00:00.000Z');
        assert.deepEqual(JSON.parse(params[38]), {
          version: 'sit_product_safety_intake_v1',
          contactPointVersion: 'sit_product_safety_contact_point_v1',
          issueKind: 'accident_or_injury',
          productIdentification: 'Bohrmaschine Modell X',
          riskDescription:
              'Beim Einschalten trat Rauch aus und eine Hand wurde verletzt.',
          injuryOccurred: true,
          safetyGuidanceAcknowledged: true,
          sourceChannel: 'app',
          submittedAt: now.toISOString(),
        });
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [caseRow({
          id: params[0],
          human_readable_case_number: params[1],
          case_type: params[2],
          case_subtype: params[3],
          priority: params[4],
          severity: params[5],
          source_channel: params[6],
          operating_mode: params[7],
          reporter_user_id: params[9],
          reporter_role: params[10],
          current_owner_role: params[11],
          approval_level: params[12],
          waiting_on: params[13],
          next_update_at: params[16],
          user_facing_summary: params[17],
          safety_flag: params[18],
          authority_flag: params[21],
          idempotency_key: params[30],
          product_safety_notice_number: params[37],
          product_safety_evidence: JSON.parse(params[38]),
          product_safety_triage_due_at: params[39],
          created_at: params[36],
          updated_at: params[36],
        })],
      }),
    },
    {
      match: /INSERT INTO support_case_events/,
      check: ({ params }) => {
        const payload = JSON.parse(params[3]);
        assert.match(payload.productSafetyNotice.noticeNumber, /^SIT-P-/u);
        assert.deepEqual(payload.productSafetyNotice, {
          noticeNumber: payload.productSafetyNotice.noticeNumber,
          version: 'sit_product_safety_intake_v1',
          contactPointVersion: 'sit_product_safety_contact_point_v1',
          issueKind: 'accident_or_injury',
          triageDueAt: '2026-08-21T11:00:00.000Z',
        });
        assert.equal(params[3].includes('Bohrmaschine'), false);
        assert.equal(params[3].includes('verletzt'), false);
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        const metadata = JSON.parse(params[4]);
        assert.match(metadata.productSafetyNoticeNumber, /^SIT-P-/u);
        assert.equal(metadata.productSafetyTriageDueAt,
          '2026-08-21T11:00:00.000Z');
        assert.equal(params[4].includes('Bohrmaschine'), false);
        assert.equal(params[4].includes('verletzt'), false);
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);

  const result = await createSupportCase(client, {
    actor: { id: 'user-1', role: 'user' },
    raw: {
      caseType: 'trust_safety',
      caseSubType: 'dangerous_item_or_injury',
      summary: 'Unfall oder Verletzung durch Produkt gesondert melden.',
      safetyTriage: safetyTriage(),
      issueScope: issueScope(),
      productSafetyNotice: {
        version: 'sit_product_safety_intake_v1',
        contactPointVersion: 'sit_product_safety_contact_point_v1',
        issueKind: 'accident_or_injury',
        productIdentification: 'Bohrmaschine Modell X',
        riskDescription:
            'Beim Einschalten trat Rauch aus und eine Hand wurde verletzt.',
        injuryOccurred: true,
        safetyGuidanceAcknowledged: true,
      },
    },
    idempotencyKey: 'product-safety-key-1',
    now,
  });

  assert.equal(result.supportCase.caseType, 'trust_safety');
  assert.equal(result.supportCase.priority, 'p1');
  assert.match(result.supportCase.productSafetyNoticeNumber, /^SIT-P-/u);
  assert.equal(result.supportCase.productSafetyTriageDueAt,
    '2026-08-21T11:00:00.000Z');
  assert.match(result.supportCase.productSafetyTriageDueDisplay, /13:00/u);
  assert.equal('productSafetyEvidence' in result.supportCase, false);
  client.done();
});

test('DSA notice creation snapshots server-side reporter identity and exposes only its Notice ID', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_cases/, result: noRows },
    {
      match: /AS booking_allowed/,
      result: {
        rowCount: 1,
        rows: [{
          booking_allowed: true,
          listing_exists: true,
          payment_allowed: true,
          refund_allowed: true,
          payout_allowed: true,
        }],
      },
    },
    {
      match: /profile ->> 'displayName'/,
      check: ({ params }) => assert.deepEqual(params, ['user-1']),
      result: {
        rowCount: 1,
        rows: [{ email: 'reporter@example.test', display_name: 'Ria Reporterin' }],
      },
    },
    {
      match: /INSERT INTO support_cases/,
      check: ({ params }) => {
        assert.match(params[32], /^SIT-N-[A-HJ-NP-Z2-9]{12}$/u);
        assert.equal(params[12], 'red_explicit_decision');
        assert.equal(params[34], 'complete');
        assert.equal(params[35], 'listing_reference');
        const evidence = JSON.parse(params[33]);
        assert.deepEqual(evidence, {
          version: 'sit_dsa_notice_intake_v1',
          contentType: 'listing',
          contentLocator: 'listing:listing-1',
          illegalityStatement:
              'Diese konkrete Anzeige verletzt nach meiner Einschätzung geltendes Recht.',
          jurisdictionOrLegalBasis: 'Deutschland; falls bekannt § Beispiel',
          goodFaithConfirmed: true,
          reporterName: 'Ria Reporterin',
          reporterEmail: 'reporter@example.test',
          sourceChannel: 'app',
          submittedAt: now.toISOString(),
        });
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [caseRow({
          id: params[0],
          human_readable_case_number: params[1],
          dsa_notice_number: params[32],
          dsa_notice_evidence: JSON.parse(params[33]),
          dsa_notice_locator_status: params[34],
          dsa_notice_locator_kind: params[35],
          case_type: params[2],
          case_subtype: params[3],
          priority: params[4],
          severity: params[5],
          current_owner_role: params[11],
          approval_level: params[12],
          waiting_on: params[13],
          dsa_flag: params[20],
          created_at: params[36],
          updated_at: params[36],
        })],
      }),
    },
    {
      match: /INSERT INTO support_case_events/,
      check: ({ params }) => {
        const payload = JSON.parse(params[3]);
        assert.match(payload.dsaNotice.noticeNumber, /^SIT-N-/u);
        assert.equal(payload.dsaNotice.version, 'sit_dsa_notice_intake_v1');
        assert.equal(payload.dsaNotice.contentType, 'listing');
        assert.deepEqual(Object.keys(payload.dsaNotice).sort(), [
          'contentType', 'locatorKind', 'locatorStatus', 'noticeNumber',
          'version',
        ]);
        assert.equal(params[3].includes('listing:listing-1'), false);
        assert.equal(params[3].includes('reporter@example.test'), false);
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        const metadata = JSON.parse(params[4]);
        assert.match(metadata.dsaNoticeNumber, /^SIT-N-/u);
        assert.equal(params[4].includes('listing:listing-1'), false);
        assert.equal(params[4].includes('reporter@example.test'), false);
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);

  const result = await createSupportCase(client, {
    actor: { id: 'user-1', role: 'user' },
    raw: {
      caseType: 'moderation_content',
      caseSubType: 'illegal_content_notice',
      summary: 'Rechtswidrigen Inhalt in einer konkreten Anzeige melden.',
      safetyTriage: safetyTriage(),
      issueScope: issueScope(),
      dsaNotice: {
        version: 'sit_dsa_notice_intake_v1',
        contentType: 'listing',
        contentLocator: 'listing:listing-1',
        illegalityStatement:
            'Diese konkrete Anzeige verletzt nach meiner Einschätzung geltendes Recht.',
        jurisdictionOrLegalBasis: 'Deutschland; falls bekannt § Beispiel',
        goodFaithConfirmed: true,
      },
    },
    idempotencyKey: 'dsa-key-1',
    now,
  });

  assert.equal(result.supportCase.caseType, 'moderation_content');
  assert.match(result.supportCase.dsaNoticeNumber, /^SIT-N-/u);
  assert.equal(result.supportCase.dsaNoticeLocatorStatus, 'complete');
  assert.equal(result.supportCase.dsaNoticeLocatorPrompt, null);
  assert.equal(result.supportCase.dsaNoticeLocatorMaySubmit, false);
  assert.equal('dsaNoticeEvidence' in result.supportCase, false);
  client.done();
});

test('DSA notice creation fails closed when server-side reporter identity is incomplete', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_cases/, result: noRows },
    {
      match: /AS booking_allowed/,
      result: {
        rowCount: 1,
        rows: [{
          booking_allowed: true,
          listing_exists: true,
          payment_allowed: true,
          refund_allowed: true,
          payout_allowed: true,
        }],
      },
    },
    {
      match: /profile ->> 'displayName'/,
      result: { rowCount: 1, rows: [{ email: 'reporter@example.test', display_name: null }] },
    },
  ]);

  await assert.rejects(createSupportCase(client, {
    actor: { id: 'user-1', role: 'user' },
    raw: {
      caseType: 'moderation_content',
      caseSubType: 'illegal_content_notice',
      summary: 'Rechtswidrigen Inhalt als DSA-Notice melden.',
      safetyTriage: safetyTriage(),
      issueScope: issueScope(),
      dsaNotice: {
        version: 'sit_dsa_notice_intake_v1',
        contentType: 'other',
        contentLocator: 'content:123',
        illegalityStatement: 'Dieser genaue Inhalt verletzt nach meiner Einschätzung geltendes Recht.',
        goodFaithConfirmed: true,
      },
    },
    idempotencyKey: 'dsa-key-identity',
    now,
  }), /support_dsa_notice_reporter_identity_incomplete/u);
  client.done();
});

test('reporter completes a DSA locator append-only without exposing its value', async () => {
  const incomplete = caseRow({
    case_type: 'moderation_content',
    case_subtype: 'illegal_content_notice',
    dsa_notice_number: 'SIT-N-ABCDEFGHJKLM',
    dsa_notice_evidence: {
      version: 'sit_dsa_notice_intake_v1',
      contentType: 'message',
    },
    dsa_notice_locator_status: 'needs_clarification',
    dsa_notice_locator_kind: null,
    current_owner_role: 'moderation_owner',
    approval_level: 'red_explicit_decision',
    waiting_on: 'reporter',
    dsa_flag: true,
  });
  const client = new ScriptedClient([
    { match: /FROM support_dsa_notice_locator_amendments AS amendment/, result: noRows },
    { match: /FROM support_cases[\s\S]*FOR UPDATE/u, result: { rowCount: 1, rows: [incomplete] } },
    {
      match: /INSERT INTO support_dsa_notice_locator_amendments/,
      check: ({ params }) => {
        assert.equal(params[1], incomplete.id);
        assert.equal(params[2], incomplete.dsa_notice_number);
        assert.equal(params[3], 'user-1');
        assert.equal(params[4], 'message:message-9');
        assert.equal(params[5], 'message_reference');
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /UPDATE support_cases/,
      result: {
        rowCount: 1,
        rows: [caseRow({
          ...incomplete,
          dsa_notice_locator_status: 'complete',
          dsa_notice_locator_kind: 'message_reference',
          waiting_on: 'support_owner',
          lock_version: 2,
        })],
      },
    },
    {
      match: /INSERT INTO support_case_events/,
      check: ({ params }) => {
        assert.deepEqual(JSON.parse(params[5]), {
          locatorStatus: 'complete',
          locatorKind: 'message_reference',
        });
        assert.equal(params[5].includes('message-9'), false);
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        assert.equal(params[2], 'support.dsa_notice_locator_completed');
        assert.equal(params[4].includes('message-9'), false);
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);

  const result = await completeDsaNoticeLocator(client, {
    actor: { id: 'user-1', role: 'user' },
    caseId: incomplete.id,
    raw: { contentLocator: 'message:message-9', expectedVersion: 1 },
    idempotencyKey: 'locator-key-1',
    now,
  });

  assert.equal(result.replayed, false);
  assert.equal(result.supportCase.dsaNoticeLocatorStatus, 'complete');
  assert.equal(result.supportCase.dsaNoticeLocatorMaySubmit, false);
  assert.equal(result.supportCase.version, 2);
  client.done();
});

test('concurrent DSA locator replay is rechecked after the case lock', async () => {
  const complete = caseRow({
    case_type: 'moderation_content',
    case_subtype: 'illegal_content_notice',
    dsa_notice_number: 'SIT-N-ABCDEFGHJKLM',
    dsa_notice_evidence: { contentType: 'listing' },
    dsa_notice_locator_status: 'complete',
    dsa_notice_locator_kind: 'listing_reference',
  });
  const client = new ScriptedClient([
    { match: /FROM support_dsa_notice_locator_amendments AS amendment/, result: noRows },
    { match: /FROM support_cases[\s\S]*FOR UPDATE/u, result: { rowCount: 1, rows: [complete] } },
    {
      match: /SELECT 1 FROM support_dsa_notice_locator_amendments/,
      result: { rowCount: 1, rows: [{ '?column?': 1 }] },
    },
  ]);

  const result = await completeDsaNoticeLocator(client, {
    actor: { id: 'user-1', role: 'user' },
    caseId: complete.id,
    raw: { contentLocator: 'listing:listing-1', expectedVersion: 1 },
    idempotencyKey: 'locator-key-1',
    now,
  });
  assert.equal(result.replayed, true);
  client.done();
});

test('account-takeover intake invalidates live email-reset tokens and audits the count', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_cases/, result: noRows },
    {
      match: /AS booking_allowed/,
      result: {
        rowCount: 1,
        rows: [{
          booking_allowed: true,
          listing_exists: true,
          payment_allowed: true,
          refund_allowed: true,
          payout_allowed: true,
        }],
      },
    },
    {
      match: /SELECT id FROM users[\s\S]*FOR UPDATE/u,
      check: ({ params }) => assert.deepEqual(params, ['user-1']),
      result: { rowCount: 1, rows: [{ id: 'user-1' }] },
    },
    {
      match: /INSERT INTO support_cases/,
      result: ({ params }) => ({
        rowCount: 1,
        rows: [caseRow({
          id: params[0],
          human_readable_case_number: params[1],
          case_type: params[2],
          case_subtype: params[3],
          priority: params[4],
          severity: params[5],
          current_owner_role: params[11],
          approval_level: params[12],
          next_update_at: params[16],
          safety_flag: params[18],
          account_takeover_flag: params[24],
          created_at: params[36],
          updated_at: params[36],
        })],
      }),
    },
    {
      match: /UPDATE auth_action_tokens[\s\S]*kind = 'reset_password'/u,
      check: ({ params }) => assert.deepEqual(params, ['user-1', now]),
      result: { rowCount: 2, rows: [{ id: 'token-1' }, { id: 'token-2' }] },
    },
    { match: /INSERT INTO support_case_events/, result: { rowCount: 1, rows: [] } },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        const metadata = JSON.parse(params[4]);
        assert.equal(metadata.compromisedEmailResetBlocked, true);
        assert.equal(metadata.invalidatedEmailResetTokens, 2);
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);

  const result = await createSupportCase(client, {
    actor: { id: 'user-1', role: 'user' },
    raw: {
      caseType: 'trust_safety',
      caseSubType: 'account_takeover',
      summary: 'Moegliche Kontouebernahme sicher pruefen.',
      accountTakeover: true,
      immediateDanger: false,
      safetyTriage: safetyTriage(),
      issueScope: issueScope(),
    },
    idempotencyKey: 'account-takeover-token-invalidation',
    now,
  });

  assert.equal(result.supportCase.caseSubType, 'account_takeover');
  assert.equal(result.supportCase.priority, 'p0');
  client.done();
});

test('create rejects an inaccessible linked booking before any write', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_cases/, result: noRows },
    {
      match: /AS booking_allowed/,
      result: {
        rowCount: 1,
        rows: [{
          booking_allowed: false,
          listing_exists: true,
          payment_allowed: true,
          refund_allowed: true,
          payout_allowed: true,
        }],
      },
    },
  ]);
  await assert.rejects(
    createSupportCase(client, {
      actor: { id: 'user-1', role: 'user' },
      raw: {
        caseType: 'booking_pre_start',
        caseSubType: 'date_or_time_confirmation',
        summary: 'Fremde Buchung darf nicht verknüpft werden.',
        linkedBookingId: 'booking-other',
        safetyTriage: safetyTriage(),
        issueScope: issueScope(),
      },
      idempotencyKey: 'key-3',
      nextUpdateAt,
      now,
    }),
    /support_linked_booking_forbidden/,
  );
  client.done();
});

test('create turns a concurrent unique-key winner into an idempotent replay', async () => {
  const allowedLinks = {
    booking_allowed: true,
    listing_exists: true,
    payment_allowed: true,
    refund_allowed: true,
    payout_allowed: true,
  };
  const client = new ScriptedClient([
    { match: /FROM support_cases/, result: noRows },
    { match: /AS booking_allowed/, result: { rowCount: 1, rows: [allowedLinks] } },
    {
      match: /ON CONFLICT \(reporter_user_id, idempotency_key\) DO NOTHING/,
      result: noRows,
    },
    {
      match: /WHERE reporter_user_id = \$1 AND idempotency_key = \$2/,
      result: { rowCount: 1, rows: [caseRow()] },
    },
  ]);
  const result = await createSupportCase(client, {
    actor: { id: 'user-1', role: 'user' },
    raw: {
      caseType: 'general_help',
      caseSubType: 'general_how_to',
      summary: 'Gleicher paralleler Eingang wird nur einmal gespeichert.',
      safetyTriage: safetyTriage(),
      issueScope: issueScope(),
    },
    idempotencyKey: 'key-concurrent',
    now,
  });
  assert.equal(result.replayed, true);
  assert.equal(result.supportCase.id, 'case-1');
  client.done();
});

test('transition replays idempotently before locking the case', async () => {
  const client = new ScriptedClient([{
    match: /FROM support_case_events AS event/,
    check: ({ params }) => assert.deepEqual(params, [
      'support.case.transition:transition-1',
      'case-1',
    ]),
    result: {
      rowCount: 1,
      rows: [caseRow({
        status: 'under_review',
        lock_version: 2,
        current_owner_id: 'support-1',
      })],
    },
  }]);
  const result = await transitionSupportCase(client, {
    actor: { id: 'support-1', role: 'support' },
    caseId: 'case-1',
    raw: null,
    idempotencyKey: 'transition-1',
    now,
  });
  assert.equal(result.replayed, true);
  assert.equal(result.supportCase.status, 'under_review');
  assert.equal(result.supportCase.version, 2);
  client.done();
});

test('transition replay rechecks the current support assignment', async () => {
  const client = new ScriptedClient([{
    match: /FROM support_case_events AS event/,
    result: {
      rowCount: 1,
      rows: [caseRow({ current_owner_id: 'support-2' })],
    },
  }]);
  await assert.rejects(
    transitionSupportCase(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId: 'case-1',
      raw: null,
      idempotencyKey: 'transition-reassigned',
      now,
    }),
    /support_case_assignment_required/,
  );
  client.done();
});

test('transition rechecks idempotency after a concurrent row-lock wait', async () => {
  const updated = caseRow({
    status: 'under_review',
    lock_version: 2,
    current_owner_id: 'support-1',
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/, result: noRows },
    { match: /FOR UPDATE/, result: { rowCount: 1, rows: [updated] } },
    { match: /SELECT 1 FROM support_case_events/, result: { rowCount: 1, rows: [{ '?column?': 1 }] } },
  ]);
  const result = await transitionSupportCase(client, {
    actor: { id: 'support-1', role: 'support' },
    caseId: 'case-1',
    raw: null,
    idempotencyKey: 'transition-concurrent',
    now,
  });
  assert.equal(result.replayed, true);
  assert.equal(result.supportCase.status, 'under_review');
  assert.equal(result.supportCase.version, 2);
  client.done();
});

test('support cannot transition a case that was not explicitly assigned', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/, result: noRows },
    {
      match: /FOR UPDATE/,
      result: { rowCount: 1, rows: [caseRow({ current_owner_id: null })] },
    },
  ]);
  await assert.rejects(
    transitionSupportCase(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId: 'case-1',
      raw: {
        status: 'acknowledged',
        expectedVersion: 1,
        reason: 'Unberechtigter Bearbeitungsversuch.',
        nextAction: 'Dieser Schritt darf nicht ausgeführt werden.',
        nextUpdateAt,
      },
      idempotencyKey: 'transition-unassigned',
      now,
    }),
    /support_case_assignment_required/,
  );
  client.done();
});

test('transition uses optimistic versioning and appends event plus audit', async () => {
  const current = caseRow({
    status: 'acknowledged',
    priority: 'p1',
    severity: 'high',
    approval_level: 'yellow_human_review',
    current_owner_role: 'booking_operations_owner',
    current_owner_id: 'support-1',
    lock_version: 4,
  });
  const transitionAt = new Date('2026-08-21T10:05:00.000Z');
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/, result: noRows },
    { match: /FOR UPDATE/, result: { rowCount: 1, rows: [current] } },
    { match: /SELECT 1 FROM support_case_events/, result: noRows },
    { match: /SELECT id FROM users/, result: { rowCount: 1, rows: [{ id: 'support-1' }] } },
    {
      match: /UPDATE support_cases/,
      check: ({ params }) => {
        assert.equal(params[1], 'under_review');
        assert.equal(params[6], null);
        assert.equal(params[19], 4);
        assert.equal(params[17], transitionAt);
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [caseRow({
          ...current,
          status: params[1],
          waiting_on: params[2],
          waiting_reason: params[3],
          next_action: params[4],
          next_update_at: params[5],
          evidence_due_at: params[6],
          lock_version: 5,
          updated_at: params[17],
        })],
      }),
    },
    {
      match: /INSERT INTO support_case_events/,
      check: ({ params }) => {
        assert.equal(params[3], 'acknowledged');
        assert.equal(params[4], 'under_review');
        assert.equal(JSON.parse(params[6]).expectedVersion, 4);
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        assert.equal(params[2], 'support.case_transitioned');
        assert.deepEqual(JSON.parse(params[4]), {
          fromStatus: 'acknowledged',
          toStatus: 'under_review',
          userActionDueAt: null,
          expectedVersion: 4,
        });
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);
  const result = await transitionSupportCase(client, {
    actor: { id: 'support-1', role: 'support' },
    caseId: 'case-1',
    raw: {
      status: 'under_review',
      expectedVersion: 4,
      reason: 'Prüfung wurde übernommen.',
      nextAction: 'Interne Evidenz im Testmodus prüfen.',
      nextUpdateAt,
    },
    idempotencyKey: 'transition-2',
    now: transitionAt,
  });
  assert.equal(result.replayed, false);
  assert.equal(result.supportCase.status, 'under_review');
  assert.equal(result.supportCase.version, 5);
  assert.equal(result.supportCase.approvalLevel, 'yellow_human_review');
  client.done();
});

test('waiting-for-user transition persists and safely projects the confirmed response deadline', async () => {
  const current = caseRow({
    status: 'acknowledged',
    priority: 'p1',
    severity: 'high',
    approval_level: 'yellow_human_review',
    current_owner_role: 'booking_operations_owner',
    current_owner_id: 'support-1',
    lock_version: 4,
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/, result: noRows },
    { match: /FOR UPDATE/, result: { rowCount: 1, rows: [current] } },
    { match: /SELECT 1 FROM support_case_events/, result: noRows },
    { match: /SELECT id FROM users/, result: { rowCount: 1, rows: [{ id: 'support-1' }] } },
    {
      match: /evidence_due_at = \$7/,
      check: ({ params }) => assert.deepEqual(params[6], userActionDueAt),
      result: ({ params }) => ({
        rowCount: 1,
        rows: [caseRow({
          ...current,
          status: params[1],
          waiting_on: params[2],
          waiting_reason: params[3],
          next_action: params[4],
          next_update_at: params[5],
          evidence_due_at: params[6],
          lock_version: 5,
          updated_at: params[15],
        })],
      }),
    },
    {
      match: /INSERT INTO support_case_events/,
      check: ({ params }) => {
        assert.equal(JSON.parse(params[6]).userActionDueAt, userActionDueAt.toISOString());
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        assert.equal(JSON.parse(params[4]).userActionDueAt, userActionDueAt.toISOString());
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);
  const result = await transitionSupportCase(client, {
    actor: { id: 'support-1', role: 'support' },
    caseId: 'case-1',
    raw: {
      status: 'waiting_for_user',
      expectedVersion: 4,
      reason: 'Eine konkrete Angabe der meldenden Person fehlt.',
      waitingReason: 'App-Version und letzter Schritt fehlen.',
      nextAction: 'Bitte ergänze die App-Version und den letzten Schritt.',
      nextUpdateAt,
      userActionDueAt,
    },
    idempotencyKey: 'transition-user-deadline',
    now,
  });
  assert.equal(result.supportCase.userActionDueAt, userActionDueAt.toISOString());
  assert.match(result.supportCase.userActionDueDisplay, /23\.08\.2026/u);
  assert.match(result.supportCase.userActionDueDisplay, /20:00/u);
  client.done();
});

test('decision-pending transition requires the exact pending draft for the same case', async () => {
  const decisionId = '11111111-1111-4111-8111-111111111111';
  const current = caseRow({
    status: 'under_review',
    approval_level: 'yellow_human_review',
    current_owner_id: 'support-1',
    lock_version: 2,
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/, result: noRows },
    { match: /FOR UPDATE/, result: { rowCount: 1, rows: [current] } },
    { match: /SELECT 1 FROM support_case_events/, result: noRows },
    { match: /SELECT id FROM users/, result: { rowCount: 1, rows: [{ id: 'support-1' }] } },
    {
      match: /approval_status = 'pending'/,
      check: ({ params }) => assert.deepEqual(params, [decisionId, 'case-1']),
      result: noRows,
    },
  ]);
  await assert.rejects(
    transitionSupportCase(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId: 'case-1',
      raw: {
        status: 'decision_pending_approval',
        expectedVersion: 2,
        reason: 'Entwurf wurde zur Prüfung vorbereitet.',
        decisionId,
        nextAction: 'Unabhängige Freigabe des unveränderten Entwurfs prüfen.',
        nextUpdateAt,
      },
      idempotencyKey: 'transition-pending-draft',
      now,
    }),
    /support_decision_draft_unavailable/,
  );
  client.done();
});

test('decision-backed resolution requires verified implementation and exact communication', async () => {
  const decisionId = '11111111-1111-4111-8111-111111111111';
  const current = caseRow({
    status: 'decided',
    approval_level: 'red_explicit_decision',
    current_owner_id: 'support-1',
    decision_id: decisionId,
    lock_version: 4,
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/, result: noRows },
    { match: /FOR UPDATE/, result: { rowCount: 1, rows: [current] } },
    { match: /SELECT 1 FROM support_case_events/, result: noRows },
    { match: /SELECT id FROM users/, result: { rowCount: 1, rows: [{ id: 'support-1' }] } },
    {
      match: /implementation_status = 'succeeded'/,
      result: noRows,
    },
  ]);
  await assert.rejects(
    transitionSupportCase(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId: 'case-1',
      raw: {
        status: 'resolved',
        expectedVersion: 4,
        reason: 'Abschluss darf ohne Umsetzungserfolg nicht erfolgen.',
        resolutionReference: 'Nur ein unbestätigter Verweis.',
      },
      idempotencyKey: 'transition-unverified-resolution',
      now,
    }),
    /support_decision_publication_not_verified/,
  );
  client.done();
});

test('duplicate closure requires the immutable user-visible leading-case link', async () => {
  const current = caseRow({
    status: 'resolved',
    current_owner_id: 'support-1',
    lock_version: 6,
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/, result: noRows },
    { match: /FOR UPDATE/, result: { rowCount: 1, rows: [current] } },
    { match: /SELECT 1 FROM support_case_events/, result: noRows },
    { match: /SELECT id FROM users/, result: { rowCount: 1, rows: [{ id: 'support-1' }] } },
    {
      match: /FROM support_case_links AS link[\s\S]*case\.duplicate_link_recorded/u,
      result: noRows,
    },
  ]);
  await assert.rejects(
    transitionSupportCase(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId: 'case-1',
      raw: {
        status: 'closed',
        expectedVersion: 6,
        reason: 'Der bestätigte Duplikatfall soll nachvollziehbar geschlossen werden.',
        closureReason: 'duplicate_merged',
        appealAvailable: false,
      },
      idempotencyKey: 'transition-duplicate-without-link',
      now,
    }),
    /support_duplicate_case_link_required/u,
  );
  client.done();
});

test('duplicate closure succeeds only after the user-visible leading-case reference', async () => {
  const current = caseRow({
    status: 'resolved',
    current_owner_id: 'support-1',
    lock_version: 6,
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/, result: noRows },
    { match: /FOR UPDATE/, result: { rowCount: 1, rows: [current] } },
    { match: /SELECT 1 FROM support_case_events/, result: noRows },
    { match: /SELECT id FROM users/, result: { rowCount: 1, rows: [{ id: 'support-1' }] } },
    {
      match: /FROM support_case_links AS link[\s\S]*case\.duplicate_link_recorded/u,
      result: { rowCount: 1, rows: [{ id: 'link-1' }] },
    },
    {
      match: /UPDATE support_cases/u,
      result: ({ params }) => ({
        rowCount: 1,
        rows: [caseRow({
          ...current,
          status: 'closed',
          closure_reason: 'duplicate_merged',
          appeal_available: false,
          lock_version: 7,
          closed_at: params[17],
          updated_at: params[17],
        })],
      }),
    },
    { match: /INSERT INTO support_case_events/u, result: noRows },
    { match: /INSERT INTO audit_log/u, result: noRows },
  ]);
  const result = await transitionSupportCase(client, {
    actor: { id: 'support-1', role: 'support' },
    caseId: 'case-1',
    raw: {
      status: 'closed',
      expectedVersion: 6,
      reason: 'Der bestätigte Duplikatfall wird mit führendem Verweis geschlossen.',
      closureReason: 'duplicate_merged',
      appealAvailable: false,
    },
    idempotencyKey: 'transition-duplicate-with-link',
    now,
  });
  assert.equal(result.supportCase.status, 'closed');
  assert.equal(result.supportCase.closureReason, 'duplicate_merged');
  client.done();
});

test('case cannot leave pending approval until its draft is rejected or superseded', async () => {
  const decisionId = '11111111-1111-4111-8111-111111111111';
  const current = caseRow({
    status: 'decision_pending_approval',
    approval_level: 'yellow_human_review',
    current_owner_id: 'support-1',
    decision_id: decisionId,
    lock_version: 3,
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events AS event/, result: noRows },
    { match: /FOR UPDATE/, result: { rowCount: 1, rows: [current] } },
    { match: /SELECT 1 FROM support_case_events/, result: noRows },
    { match: /SELECT id FROM users/, result: { rowCount: 1, rows: [{ id: 'support-1' }] } },
    { match: /approval_status IN \('rejected', 'superseded'\)/, result: noRows },
  ]);
  await assert.rejects(
    transitionSupportCase(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId: 'case-1',
      raw: {
        status: 'under_review',
        expectedVersion: 3,
        reason: 'Pending review must not be bypassed.',
        nextAction: 'Wait for the independent review outcome.',
        nextUpdateAt,
      },
      idempotencyKey: 'transition-review-bypass',
      now,
    }),
    /support_decision_review_pending/,
  );
  client.done();
});

test('get keeps user access and event visibility fail closed', async () => {
  const client = new ScriptedClient([{
    match: /FROM support_cases/,
    check: ({ params }) => assert.deepEqual(params, ['case-other', false, false, 'user-1']),
    result: noRows,
  }]);
  await assert.rejects(
    getSupportCase(client, {
      actor: { id: 'user-1', role: 'user' },
      caseId: 'case-other',
    }),
    /support_case_not_found/,
  );
  client.done();
});

test('get omits staff transition reasons from the user-safe event projection', async () => {
  const client = new ScriptedClient([
    {
      match: /FROM support_cases/,
      result: { rowCount: 1, rows: [caseRow()] },
    },
    {
      match: /FROM support_case_events/,
      result: {
        rowCount: 1,
        rows: [{
          id: 'event-1',
          event_type: 'case.transitioned',
          actor_type: 'support',
          actor_id: 'support-1',
          from_status: 'received',
          to_status: 'acknowledged',
          transition_reason: 'Nur für die interne Fallakte.',
          created_at: now,
          visibility: 'user_visible',
        }],
      },
    },
    {
      match: /FROM support_messages/u,
      check: ({ params }) => assert.deepEqual(params, ['case-1', false, 'user-1']),
      result: {
        rowCount: 1,
        rows: [{
          id: '22222222-2222-4222-8222-222222222222',
          case_id: 'case-1',
          message_title: 'Fall eingegangen',
          rendered_content: 'Dein Fall ist eingegangen.',
          sent_at: now,
          created_at: now,
          corrects_message_id: null,
          template_id: 'T-001',
          rendered_content_sha256: 'a'.repeat(64),
        }],
      },
    },
  ]);
  const result = await getSupportCase(client, {
    actor: { id: 'user-1', role: 'user' },
    caseId: 'case-1',
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].toStatus, 'acknowledged');
  assert.equal('transitionReason' in result.events[0], false);
  assert.equal('actorId' in result.events[0], false);
  assert.equal(result.supportCase.finalDecisionAvailable, false);
  assert.equal(result.finalDecision, null);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].content, 'Dein Fall ist eingegangen.');
  assert.equal(result.messages[0].externalMessageSent, false);
  assert.equal('templateId' in result.messages[0], false);
  assert.equal('renderedContentSha256' in result.messages[0], false);
  client.done();
});

test('final user detail exposes only the approved publication fields', async () => {
  const decisionId = '11111111-1111-4111-8111-111111111111';
  const implementedAt = new Date('2026-08-21T14:30:00.000Z');
  const communicatedAt = new Date('2026-08-21T14:35:00.000Z');
  const client = new ScriptedClient([
    {
      match: /FROM support_cases/,
      result: {
        rowCount: 1,
        rows: [caseRow({
          status: 'resolved',
          approval_level: 'red_explicit_decision',
          decision_id: decisionId,
          waiting_on: 'none',
          next_action: null,
          next_update_at: null,
          resolved_at: implementedAt,
        })],
      },
    },
    { match: /FROM support_case_events/, result: noRows },
    { match: /FROM support_messages/u, result: noRows },
    {
      match: /FROM support_decisions/,
      check: ({ params }) => assert.deepEqual(params, [decisionId, 'case-1']),
      result: {
        rowCount: 1,
        rows: [{
          user_facing_decision: 'Die interne Prüfung ist abgeschlossen.',
          user_facing_effect: 'Dein Konto und deine Zahlung bleiben unverändert.',
          user_facing_reason: 'Der bestätigte technische Stand wurde geprüft.',
          user_facing_implementation_result:
            'Das bestätigte Ergebnis wurde im internen Testfall dokumentiert.',
          redress_route: 'Eine menschliche Überprüfung kann angefordert werden.',
          implemented_at: implementedAt,
          communicated_at: communicatedAt,
        }],
      },
    },
  ]);
  const result = await getSupportCase(client, {
    actor: { id: 'user-1', role: 'user' },
    caseId: 'case-1',
  });
  assert.equal(result.supportCase.finalDecisionAvailable, true);
  assert.deepEqual(result.finalDecision, {
    decision: 'Die interne Prüfung ist abgeschlossen.',
    effect: 'Dein Konto und deine Zahlung bleiben unverändert.',
    reason: 'Der bestätigte technische Stand wurde geprüft.',
    implementationResult:
      'Das bestätigte Ergebnis wurde im internen Testfall dokumentiert.',
    redressRoute: 'Eine menschliche Überprüfung kann angefordert werden.',
    implementedAt: implementedAt.toISOString(),
    implementedDisplay: '21.08.2026, 16:30',
    communicatedAt: communicatedAt.toISOString(),
    timezone: 'Europe/Berlin',
  });
  assert.equal('decisionCode' in result.finalDecision, false);
  assert.equal('implementationReference' in result.finalDecision, false);
  client.done();
});

test('staff detail is separate and denied support access is audited without revealing existence', async () => {
  const denied = new ScriptedClient([
    {
      match: /FROM support_cases/,
      check: ({ params }) => assert.deepEqual(params, ['case-other', true, false, 'support-1']),
      result: noRows,
    },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        assert.deepEqual(params.slice(0, 4), [
          'support-1',
          'support',
          'support.case_access_denied',
          'case-other',
        ]);
        assert.deepEqual(JSON.parse(params[4]), {
          accessPath: 'staff_detail',
          reason: 'not_assigned_or_not_found',
        });
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);
  await assert.rejects(
    getSupportCase(denied, {
      actor: { id: 'support-1', role: 'support' },
      caseId: 'case-other',
      staffAccess: true,
    }),
    /support_case_not_found/,
  );
  denied.done();

  const assigned = new ScriptedClient([
    {
      match: /FROM support_cases/,
      result: { rowCount: 1, rows: [caseRow({ current_owner_id: 'support-1' })] },
    },
    { match: /FROM support_case_events/, result: { rowCount: 0, rows: [] } },
    { match: /FROM support_messages/u, result: noRows },
  ]);
  const result = await getSupportCase(assigned, {
    actor: { id: 'support-1', role: 'support' },
    caseId: 'case-1',
    staffAccess: true,
  });
  assert.equal(result.supportCase.approvalLevel, 'green_automatic');
  assigned.done();
});

test('valid break-glass token opens only its P0 case and writes a use audit', async () => {
  const reviewDueAt = new Date('2099-08-21T10:05:00.000Z');
  const client = new ScriptedClient([
    { match: /FROM support_cases[\s\S]*current_owner_id = \$4/u, result: noRows },
    {
      match: /UPDATE support_break_glass_grants AS access_grant/u,
      check: ({ params }) => {
        assert.deepEqual(params.slice(0, 4), [
          'case-p0',
          'support-1',
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
        ]);
        assert.equal(params[4].length, 64);
      },
      result: {
        rowCount: 1,
        rows: [{
          id: '22222222-2222-4222-8222-222222222222',
          case_id: 'case-p0',
          actor_id: 'support-1',
          session_id: '33333333-3333-4333-8333-333333333333',
          staff_elevation_id: '44444444-4444-4444-8444-444444444444',
          reason_code: 'p0_immediate_safety_response',
          created_at: now,
          expires_at: reviewDueAt,
          last_used_at: now,
          revoked_at: null,
          review_due_at: reviewDueAt,
          review_status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
          review_outcome: null,
        }],
      },
    },
    {
      match: /SELECT \* FROM support_cases WHERE id::text = \$1/u,
      result: {
        rowCount: 1,
        rows: [caseRow({
          id: 'case-p0',
          priority: 'p0',
          severity: 'critical',
          current_owner_id: 'support-2',
          current_owner_role: 'trust_safety_owner',
        })],
      },
    },
    {
      match: /INSERT INTO audit_log/u,
      check: ({ params }) => {
        assert.equal(params[2], 'support.break_glass_case_accessed');
        assert.equal(params[3], 'case-p0');
        assert.deepEqual(JSON.parse(params[4]), {
          accessPath: 'staff_detail_break_glass',
          grantId: '22222222-2222-4222-8222-222222222222',
          reasonCode: 'p0_immediate_safety_response',
          reviewDueAt: reviewDueAt.toISOString(),
        });
      },
      result: { rowCount: 1, rows: [] },
    },
    { match: /FROM support_case_events/u, result: noRows },
    { match: /FROM support_messages/u, result: noRows },
  ]);
  const result = await getSupportCase(client, {
    actor: { id: 'support-1', role: 'support' },
    caseId: 'case-p0',
    staffAccess: true,
    breakGlassToken: 'x'.repeat(43),
    sessionId: '33333333-3333-4333-8333-333333333333',
    staffElevationId: '44444444-4444-4444-8444-444444444444',
  });
  assert.equal(result.supportCase.id, 'case-p0');
  assert.equal(result.supportCase.priority, 'p0');
  client.done();
});

test('staff queue is role-gated, filter-bounded and keeps internal fields', async () => {
  const denied = new ScriptedClient([]);
  await assert.rejects(
    listStaffSupportCases(denied, { actor: { id: 'user-1', role: 'user' } }),
    /support_staff_list_forbidden/,
  );
  const invalid = new ScriptedClient([]);
  await assert.rejects(
    listStaffSupportCases(invalid, {
      actor: { id: 'support-1', role: 'support' },
      limit: 201,
    }),
    /support_limit_invalid/,
  );
  const client = new ScriptedClient([{
    match: /ORDER BY priority, next_update_at NULLS LAST/,
    check: ({ params }) => assert.deepEqual(params, [
      'received',
      'p0',
      'trust_safety_owner',
      25,
      false,
      'support-1',
    ]),
    result: { rowCount: 1, rows: [caseRow({
      priority: 'p0',
      severity: 'critical',
      current_owner_role: 'trust_safety_owner',
      approval_level: 'red_explicit_decision',
      safety_flag: true,
      current_owner_id: 'support-1',
    })] },
  }]);
  const queue = await listStaffSupportCases(client, {
    actor: { id: 'support-1', role: 'support' },
    status: 'received',
    priority: 'p0',
    ownerRole: 'trust_safety_owner',
    limit: 25,
  });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].severity, 'critical');
  assert.equal(queue[0].flags.safety, true);
  client.done();
});

test('support migration defines fail-closed lifecycle, append-only truth and guarded rollback', async () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const up = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/032_support_case_foundation.up.sql'),
    'utf8',
  );
  const down = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/032_support_case_foundation.down.sql'),
    'utf8',
  );
  const approvalUp = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/033_support_decision_approval_guard.up.sql'),
    'utf8',
  );
  const approvalDown = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/033_support_decision_approval_guard.down.sql'),
    'utf8',
  );
  const userDeadlineUp = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/034_support_user_action_deadline.up.sql'),
    'utf8',
  );
  const userDeadlineDown = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/034_support_user_action_deadline.down.sql'),
    'utf8',
  );
  const publicationUp = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/035_support_final_decision_publication.up.sql'),
    'utf8',
  );
  const publicationDown = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/035_support_final_decision_publication.down.sql'),
    'utf8',
  );
  const appealUp = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/036_support_closed_case_appeal_submission.up.sql'),
    'utf8',
  );
  const appealDown = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/036_support_closed_case_appeal_submission.down.sql'),
    'utf8',
  );
  const privacyRightsUp = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/047_support_privacy_rights_control_plane.up.sql'),
    'utf8',
  );
  const privacyRightsDown = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/047_support_privacy_rights_control_plane.down.sql'),
    'utf8',
  );
  const messageGuardUp = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/038_support_message_template_guard.up.sql'),
    'utf8',
  );
  const messageGuardDown = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/038_support_message_template_guard.down.sql'),
    'utf8',
  );
  const feedbackPriorityUp = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/054_support_feedback_priority.up.sql'),
    'utf8',
  );
  const handoverExceptionUp = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/062_handover_exception_guard.up.sql'),
    'utf8',
  );
  for (const table of [
    'support_policy_snapshots',
    'support_cases',
    'support_decisions',
    'support_case_events',
    'support_evidence',
    'support_messages',
    'support_appeals',
  ]) assert.match(up, new RegExp(`CREATE TABLE ${table}\\b`));
  for (const table of [
    'support_privacy_rights_requests',
    'support_privacy_identity_verifications',
    'support_privacy_deadline_extensions',
  ]) assert.match(privacyRightsUp, new RegExp(`CREATE TABLE ${table}\\b`));
  assert.match(privacyRightsUp, /support_privacy_rights_requests_validate/);
  assert.match(privacyRightsUp, /support_privacy_identity_verification_append_only/);
  assert.match(privacyRightsUp, /support_privacy_extension_append_only/);
  assert.match(privacyRightsDown, /Privacy-rights rollback blocked: request data exists/);
  for (const [family, subtypes] of Object.entries(supportCaseFamilies)) {
    assert.match(up, new RegExp(`case_type = '${family}'`));
    for (const subtype of subtypes) {
      assert.ok(
        up.includes(`'${subtype}'`)
          || feedbackPriorityUp.includes(`'${subtype}'`)
          || handoverExceptionUp.includes(`'${subtype}'`),
        `${family}/${subtype}`,
      );
    }
  }
  assert.doesNotMatch(up, /'paused'/);
  assert.match(up, /support_case_events_append_only/);
  assert.match(up, /support_policy_snapshots_append_only/);
  assert.match(up, /support_case_lock_version_invalid/);
  assert.match(up, /approval_level <> 'green_automatic'/);
  assert.match(up, /next_action IS NULL AND next_update_at IS NULL AND waiting_on = 'none'/);
  assert.match(up, /OLD\.status = 'closed' AND NEW\.status = 'reopened'/);
  assert.match(up, /operating_mode IN \('simulation', 'internal_testing'\)/);
  assert.match(down, /Support rollback blocked: support data exists/);
  assert.ok(
    down.indexOf('ALTER TABLE support_cases DROP CONSTRAINT support_cases_appeal_fk')
      < down.indexOf('DROP TABLE support_appeals'),
  );
  assert.match(approvalUp, /support_cases_pending_decision_required/);
  assert.match(approvalUp, /approval_payload_sha256 = payload_sha256/);
  assert.match(approvalUp, /approved_by <> decided_by/);
  assert.match(approvalUp, /support_decisions_measure_scope_check/);
  assert.match(approvalUp, /support_decision_payload_immutable/);
  assert.match(approvalUp, /support_decision_approval_final/);
  assert.match(approvalUp, /support_decision_implementation_evidence_immutable/);
  assert.match(approvalUp, /support_decision_implementation_regression/);
  assert.match(approvalUp, /support_decision_case_not_pending_approval/);
  assert.match(approvalUp, /support_case_implementation_not_verified/);
  assert.match(approvalUp, /support_case_decision_id_mismatch/);
  assert.match(approvalUp, /support_case_decision_binding_invalid/);
  assert.match(approvalUp, /implementation_status = 'succeeded'/);
  assert.match(approvalUp, /OLD\.approval_level = 'green_automatic'/);
  assert.match(approvalDown, /Support decision approval rollback blocked: decision data exists/);
  assert.match(userDeadlineUp, /support_cases_user_action_deadline_state/);
  assert.match(userDeadlineUp, /status = 'waiting_for_user' AND evidence_due_at IS NOT NULL/);
  assert.match(userDeadlineUp, /status <> 'waiting_for_user' AND evidence_due_at IS NULL/);
  assert.match(userDeadlineDown, /DROP CONSTRAINT IF EXISTS support_cases_user_action_deadline_state/);
  assert.match(publicationUp, /support_decisions_user_publication_payload_check/);
  assert.match(publicationUp, /existing resolved decision requires manual review/);
  assert.match(publicationUp, /communication_payload_sha256 = payload_sha256/);
  assert.match(publicationUp, /support_decision_communication_final/);
  assert.match(publicationUp, /support_case_decision_not_communicated/);
  assert.match(publicationUp, /operating_mode IN \('simulation', 'internal_testing'\)/);
  assert.match(publicationDown, /Support final-decision rollback blocked: publication data exists/);
  assert.match(appealUp, /support_appeals_decision_submitter_unique/);
  assert.match(appealUp, /support_appeal_evidence_not_enabled/);
  assert.match(appealUp, /support_appeal_decision_not_published/);
  assert.match(appealUp, /support_appeal_submission_immutable/);
  assert.match(appealUp, /support_reopen_assignment_incomplete/);
  assert.match(appealDown, /Support appeal rollback blocked: appeal configuration or submissions exist/);
  assert.match(messageGuardUp, /rendered_content_sha256 <> encode\(digest\(NEW\.rendered_content/);
  assert.match(messageGuardUp, /Support message payload is immutable/);
  assert.match(messageGuardUp, /Support message review requires independent active admin/);
  assert.match(messageGuardUp, /approval_payload_sha256 = rendered_content_sha256/);
  assert.match(messageGuardUp, /notification_ids = '\{\}'/);
  assert.match(messageGuardUp, /operating_mode NOT IN \('simulation', 'internal_testing'\)/);
  assert.match(messageGuardDown, /Support message template-guard rollback blocked: message truth exists/);
});

test('support routes and personal-data lifecycle stay authenticated, non-live and fail closed', async () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const [app, rateLimitPolicy, privacyExport, retentionInventory] = await Promise.all([
    fs.readFile(path.resolve(currentDir, '../src/app.js'), 'utf8'),
    fs.readFile(path.resolve(currentDir, '../src/rate_limit_policy.js'), 'utf8'),
    fs.readFile(path.resolve(currentDir, '../src/privacy_export.js'), 'utf8'),
    fs.readFile(path.resolve(currentDir, '../src/retention_inventory.js'), 'utf8'),
  ]);
  for (const route of [
    "app.post('/v1/support/cases', supportIntakeRateLimiter, requireAuth, requireActiveAccount",
    "app.get('/v1/support/cases', requireAuth, requireActiveAccount",
    "app.get('/v1/support/cases/:id', requireAuth, requireActiveAccount",
    "app.post('/v1/support/cases/:id/appeals', requireAuth, requireActiveAccount, actionLimiter",
  ]) assert.ok(app.includes(route), route);
  assert.match(
    rateLimitPolicy,
    /supportIntake: Object\.freeze\(\{ windowMs: 15 \* 60_000, limit: 10 \}\)/u,
  );
  assert.match(
    rateLimitPolicy,
    /supportSafetyIntake: Object\.freeze\(\{ windowMs: 15 \* 60_000, limit: 30 \}\)/u,
  );
  assert.match(
    rateLimitPolicy,
    /isProtectedSupportSafetyIntake\(req\.body\)[\s\S]*supportSafetyIntakeLimiter/u,
  );
  for (const route of [
    "app.get('/v1/admin/support/message-templates', requireAuth, requireActiveAccount, requireStaffElevation",
    "app.post('/v1/admin/support/cases/:id/messages', requireAuth, requireActiveAccount, requireStaffElevation, supportMessageDraftLimiter",
    "app.post('/v1/admin/support/cases/:id/messages/:messageId/review', requireAuth, requireActiveAccount, requireAdminRole, requireStaffElevation, supportMessageReviewLimiter",
    "app.post('/v1/admin/support/cases/:id/messages/:messageId/publication', requireAuth, requireActiveAccount, requireStaffElevation, supportMessagePublishLimiter",
  ]) assert.ok(app.includes(route), route);
  for (const route of [
    "app.get('/v1/admin/support/cases/:id/decisions', requireAuth, requireActiveAccount, requireStaffElevation",
    "app.post('/v1/admin/support/cases/:id/decisions', requireAuth, requireActiveAccount, requireStaffElevation",
    "app.post('/v1/admin/support/cases/:id/decisions/:decisionId/review', requireAuth, requireActiveAccount, requireStaffElevation",
    "app.post('/v1/admin/support/cases/:id/decisions/:decisionId/implementation', requireAuth, requireActiveAccount, requireStaffElevation",
    "app.post('/v1/admin/support/cases/:id/decisions/:decisionId/communication', requireAuth, requireActiveAccount, requireStaffElevation",
  ]) assert.ok(app.includes(route), route);
  for (const route of [
    "app.get('/v1/admin/support/cases', requireAuth, requireActiveAccount, requireStaffElevation",
    "app.get('/v1/admin/support/cases/:id', requireAuth, requireActiveAccount, requireStaffElevation",
    "app.patch('/v1/admin/support/cases/:id/status', requireAuth, requireActiveAccount, requireStaffElevation",
  ]) assert.ok(app.includes(route), route);
  assert.match(app, /operatingMode: 'simulation'/);
  assert.match(app, /const retainedRecords = \[[\s\S]*support_case_records/);
  assert.doesNotMatch(
    app,
    /const definitions = \[[\s\S]*support_case_records[\s\S]*const blockers/u,
  );
  assert.match(app, /pseudonymous_support_case_records/);
  assert.match(app, /const supportCaseError = error instanceof SupportCaseError/);

  for (const table of [
    'support_cases',
    'support_case_events',
    'support_break_glass_grants',
    'support_messages',
    'support_decisions',
    'support_appeals',
    'support_evidence',
  ]) assert.match(privacyExport, new RegExp(`FROM ${table}(?: AS)?\\b`));
  assert.doesNotMatch(privacyExport, /support_case\.internal_summary/);
  assert.doesNotMatch(privacyExport, /decision\.internal_reason/);
  assert.match(privacyExport, /event\.visibility = 'user_visible'/);
  assert.match(privacyExport, /message\.recipient_user_id = \$1 AND message\.send_status = 'sent'/);
  assert.match(privacyExport, /message\.message_title/);
  assert.match(privacyExport, /message\.corrects_message_id/);
  assert.match(privacyExport, /decision\.communicated_at IS NOT NULL/);
  assert.match(privacyExport, /decision\.user_facing_decision/);
  assert.match(privacyExport, /decision\.user_facing_effect/);
  assert.match(privacyExport, /decision\.user_facing_implementation_result/);
  assert.match(privacyExport, /evidence\.access_level = 'user_visible'/);
  assert.match(privacyExport, /internalNotesExcluded: true/);
  assert.match(privacyExport, /'p0_emergency_case_access'::text AS access_purpose/);
  assert.match(privacyExport, /internalEmergencyAccessReasonsExcluded: true/);
  assert.match(privacyExport, /staffIdentifiersExcluded: true/);
  assert.doesNotMatch(privacyExport, /grant\.justification|grant\.actor_id|grant\.session_id/);

  for (const marker of [
    "'communications', 'support_cases'",
    "'communications', 'support_messages'",
    "'privacyRights', 'support_privacy_rights_requests'",
    "'privacyRights', 'support_privacy_identity_verifications'",
    "'privacyRights', 'support_privacy_deadline_extensions'",
    "'moderation', 'support_decisions'",
    "'moderation', 'support_evidence'",
    "'moderation', 'support_appeals'",
    "'securityAudit', 'support_case_events'",
    "'securityAudit', 'support_policy_snapshots'",
    "'securityAudit', 'support_break_glass_grants'",
  ]) assert.ok(retentionInventory.includes(marker), marker);
});
