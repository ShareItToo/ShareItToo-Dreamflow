import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  HandoverExceptionError,
  reportHandoverException,
} from '../src/handover_exception_workflow.js';

const now = new Date('2026-10-14T16:05:00.000Z');
const confirmedPickup = Object.freeze({
  handoverTimeIso: '2026-10-14T16:00:00.000Z',
  handoverTimeRequestedByUserId: 'owner-1',
  handoverTimeConfirmed: true,
  handoverTimeConfirmedByUserId: 'renter-1',
  handoverTimeConfirmedAt: '2026-10-14T08:30:00.000Z',
});

function raw(kind) {
  return {
    kind,
    details: 'Der vorgezeigte Gegenstand weicht bei Modell und Zubehör ab.',
    immediateDanger: false,
    safeAbortGuidanceAcknowledged: kind === 'item_mismatch',
    doNotPayGuidanceAcknowledged: kind === 'offplatform_deposit_request',
    contactAttemptAcknowledged: kind === 'party_no_show',
  };
}

function caseRow(params) {
  return {
    id: params[0],
    human_readable_case_number: 'SIT-ABCDEFGHJKLM',
    dsa_notice_number: null,
    dsa_notice_locator_status: null,
    product_safety_notice_number: null,
    product_safety_triage_due_at: null,
    feedback_context: null,
    case_type: params[2],
    case_subtype: params[3],
    status: 'received',
    priority: params[4],
    severity: params[5],
    source_channel: params[6],
    operating_mode: params[7],
    locale: params[8],
    reporter_user_id: params[9],
    reporter_role: params[10],
    linked_booking_id: params[25],
    linked_listing_id: params[26],
    current_owner_role: params[11],
    approval_level: params[12],
    waiting_on: params[13],
    waiting_reason: params[14],
    next_action: params[15],
    next_update_at: params[16],
    user_facing_summary: params[17],
    safety_flag: params[18],
    privacy_flag: params[19],
    dsa_flag: params[20],
    authority_flag: params[21],
    article18_candidate_flag: params[22],
    money_flag: params[23],
    account_takeover_flag: params[24],
    appeal_available: false,
    lock_version: 1,
    created_at: params[36],
    updated_at: params[36],
  };
}

class HandoverClient {
  constructor({ contactAttemptCount = 1 } = {}) {
    this.contactAttemptCount = contactAttemptCount;
    this.specializedAudits = [];
  }

  async query(sql, params = []) {
    const compact = sql.replace(/\s+/gu, ' ').trim();
    if (compact.startsWith('SELECT resource_id, metadata FROM audit_log')) {
      return { rowCount: 0, rows: [] };
    }
    if (compact.startsWith('SELECT booking.id, booking.owner_id')) {
      return {
        rowCount: 1,
        rows: [{
          id: 'booking-1',
          owner_id: 'owner-1',
          renter_id: 'renter-1',
          listing_id: 'listing-1',
          workflow_status: 'confirmed',
          workflow_version: 1,
          rental_start_date_text: '2026-10-14',
          rental_timezone: 'Europe/Berlin',
          payload: confirmedPickup,
        }],
      };
    }
    if (compact.startsWith('SELECT count(*)::integer AS contact_attempt_count')) {
      return {
        rowCount: 1,
        rows: [{ contact_attempt_count: this.contactAttemptCount }],
      };
    }
    if (compact.startsWith('SELECT * FROM support_cases')) {
      return { rowCount: 0, rows: [] };
    }
    if (compact.includes('AS booking_allowed')) {
      return {
        rowCount: 1,
        rows: [{
          booking_allowed: true,
          listing_exists: true,
          payment_allowed: true,
          refund_allowed: true,
          payout_allowed: true,
        }],
      };
    }
    if (compact.startsWith('INSERT INTO support_cases')) {
      return { rowCount: 1, rows: [caseRow(params)] };
    }
    if (compact.startsWith('INSERT INTO support_case_events')) {
      return { rowCount: 1, rows: [] };
    }
    if (compact.startsWith('INSERT INTO audit_log')) {
      if (params[2]?.startsWith('booking.handover_exception:')) {
        this.specializedAudits.push(JSON.parse(params[3]));
      }
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected query: ${compact}`);
  }
}

test('item mismatch creates a neutral server-routed P1 case and minimized receipt', async () => {
  const client = new HandoverClient();
  const result = await reportHandoverException(client, {
    actor: { id: 'renter-1', role: 'user' },
    bookingId: 'booking-1',
    raw: raw('item_mismatch'),
    idempotencyKey: 'handover-item-1',
    now,
  });
  assert.equal(result.replayed, false);
  assert.equal(result.supportCase.caseType, 'active_handover');
  assert.equal(result.supportCase.caseSubType, 'item_not_as_listed');
  assert.equal(result.supportCase.priority, 'p1');
  assert.equal(client.specializedAudits.length, 1);
  assert.equal(result.exceptionReceipt.safeAbortGuidanceAcknowledged, true);
  assert.equal(result.exceptionReceipt.moneyOutcomeDecided, false);
  assert.equal(result.exceptionReceipt.guiltDetermined, false);
});

test('no-show requires server-visible contact after the reached confirmed appointment', async () => {
  await assert.rejects(
    reportHandoverException(new HandoverClient({ contactAttemptCount: 0 }), {
      actor: { id: 'renter-1', role: 'user' },
      bookingId: 'booking-1',
      raw: raw('party_no_show'),
      idempotencyKey: 'handover-no-show-1',
      now,
    }),
    (error) => error instanceof HandoverExceptionError
      && error.code === 'handover_exception_in_app_contact_required',
  );

  const result = await reportHandoverException(new HandoverClient(), {
    actor: { id: 'renter-1', role: 'user' },
    bookingId: 'booking-1',
    raw: raw('party_no_show'),
    idempotencyKey: 'handover-no-show-2',
    now,
  });
  assert.equal(result.supportCase.caseType, 'cancellation_no_show');
  assert.equal(result.supportCase.caseSubType, 'handover_no_show');
  assert.equal(result.supportCase.priority, 'p1');
  assert.equal(result.exceptionReceipt.counterpartyConfirmedAppointment, true);
  assert.equal(result.exceptionReceipt.contactAttemptCount, 1);
});

test('authenticated HTTP wiring keeps the specialized route on the existing safety intake limiter', async () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const appSource = await fs.readFile(
    path.resolve(currentDir, '../src/app.js'),
    'utf8',
  );
  assert.match(
    appSource,
    /app\.post\('\/v1\/bookings\/:id\/handover-exceptions', supportSafetyIntakeLimiter, requireAuth, requireActiveAccount/u,
  );
  assert.match(
    appSource,
    /reportHandoverException\(client, \{[\s\S]*bookingId: req\.params\.id,[\s\S]*idempotencyKey: req\.get\('Idempotency-Key'\)/u,
  );
});
