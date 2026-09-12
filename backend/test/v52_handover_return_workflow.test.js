import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  bindV52ConditionEvidence,
  openV52ReturnCase,
} from '../src/v52_handover_return_workflow.js';

const migration = readFileSync(
  new URL('../sql/migrations/025_v52_handover_return_evidence.up.sql', import.meta.url),
  'utf8',
);
const calendarMigration = readFileSync(
  new URL('../sql/migrations/063_return_calendar_deadline_guard.up.sql', import.meta.url),
  'utf8',
);
const privacyExport = readFileSync(
  new URL('../src/privacy_export.js', import.meta.url),
  'utf8',
);
const retentionInventory = readFileSync(
  new URL('../src/retention_inventory.js', import.meta.url),
  'utf8',
);
const appSource = readFileSync(
  new URL('../src/app.js', import.meta.url),
  'utf8',
);
const dataServiceSource = readFileSync(
  new URL('../../lib/services/data_service.dart', import.meta.url),
  'utf8',
);
const reportIssueSource = readFileSync(
  new URL('../../lib/screens/report_issue_screen.dart', import.meta.url),
  'utf8',
);
const safetyActionServiceSource = readFileSync(
  new URL('../../lib/services/safety_action_service.dart', import.meta.url),
  'utf8',
);

const documentText = 'V5.2 handover return damage snapshot';
const documentSha256 = crypto.createHash('sha256').update(documentText).digest('hex');
const uploadId = '10000000-0000-4000-8000-000000000001';

function binding(overrides = {}) {
  return {
    id: 'booking-1',
    owner_id: 'owner-1',
    renter_id: 'renter-1',
    workflow_status: 'completed',
    ends_at: new Date('2026-08-20T10:00:00.000Z'),
    return_t0: new Date('2026-08-20T10:00:00.000Z'),
    quoted_total_minor: 5000,
    currency: 'EUR',
    rental_timezone: 'Europe/Berlin',
    booking_payload: {
      id: 'booking-1',
      end: '2026-08-20T10:00:00.000Z',
    },
    platform_contract_id: '20000000-0000-4000-8000-000000000001',
    contract_version: 'V5.2-2026-08-16',
    contract_locale: 'de',
    quote_id: 'quote_30000000-0000-4000-8000-000000000001',
    quote_hash: 'a'.repeat(64),
    handover_return_damage_snapshot_id: '40000000-0000-4000-8000-000000000001',
    document_key: 'handover_return_damage',
    document_version: 'V5.2-2026-08-16',
    document_locale: 'de',
    content_text: documentText,
    content_sha256: documentSha256,
    persisted_quote_id: 'quote_30000000-0000-4000-8000-000000000001',
    persisted_quote_hash: 'a'.repeat(64),
    quote_total_minor: 5000,
    ...overrides,
  };
}

function raw(overrides = {}) {
  return {
    reasonCode: 'damage',
    details: 'Konkreter dokumentierter Rueckgabemangel.',
    evidenceUploadIds: [uploadId],
    contestedAuthorizedMinor: 1200,
    ...overrides,
  };
}

function returnCaseClient({ bindingRow = binding(), evidenceRows = null } = {}) {
  const state = { writes: [] };
  return {
    state,
    async query(sql, values) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      if (compact.startsWith('SELECT return_case.*, booking.owner_id')) {
        return { rowCount: 0, rows: [] };
      }
      if (compact.includes('LEFT JOIN platform_contracts AS contract')) {
        return { rowCount: 1, rows: [{ ...bindingRow }] };
      }
      if (compact.startsWith('SELECT upload.id, upload.content_sha256')) {
        const rows = evidenceRows ?? [{ id: uploadId, content_sha256: 'b'.repeat(64) }];
        return { rowCount: rows.length, rows };
      }
      if (compact.startsWith('SELECT id FROM booking_cases')) {
        return { rowCount: 0, rows: [] };
      }
      if (compact.startsWith('SELECT id FROM v52_return_cases')) {
        return { rowCount: 0, rows: [] };
      }
      if (compact.startsWith('SELECT id FROM reports')) {
        return { rowCount: 0, rows: [] };
      }
      state.writes.push({ compact, values });
      if (compact.startsWith('INSERT INTO v52_return_cases')) {
        return {
          rowCount: 1,
          rows: [{
            id: values[0],
            booking_case_id: values[1],
            report_id: values[2],
            booking_id: values[3],
            reason_code: values[12],
            reason_details: values[13],
            t0: values[14],
            t1: values[15],
            report_deadline: values[16],
            response_due_at: values[17],
            next_status_update_due_at: values[18],
            deadline_timezone: values[19],
            deadline_policy_version: 2,
            authorized_booking_minor: values[20],
            contested_authorized_minor: values[21],
            undisputed_releasable_minor: values[22],
          }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
  };
}

test('migration keeps V5.1 rows and adds immutable V5.2 evidence and no-charge case bindings', () => {
  for (const table of [
    'v52_condition_evidence_bindings',
    'v52_condition_confirmation_bindings',
    'v52_confirmation_challenge_bindings',
    'v52_confirmation_verification_events',
    'v52_return_cases',
    'v52_return_case_evidence',
    'v52_return_case_events',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'u'));
    assert.match(migration, new RegExp(`'${table}'`, 'u'));
  }
  assert.match(migration, /additional_charge_minor BIGINT NOT NULL DEFAULT 0 CHECK \(additional_charge_minor = 0\)/u);
  assert.match(migration, /report_deadline = t0 \+ INTERVAL '48 hours'/u);
  assert.match(migration, /response_due_at = t1 \+ INTERVAL '5 days'/u);
  assert.match(migration, /next_status_update_due_at = t1 \+ INTERVAL '7 days'/u);
  assert.match(migration, /upload_purpose TEXT NOT NULL CHECK \(upload_purpose = 'report_evidence'\)/u);
  assert.doesNotMatch(migration, /ALTER TABLE booking_condition_evidence\s+RENAME/u);
});

test('S4M migration preserves legacy rows and guards new calendar-bound deadlines', () => {
  assert.match(calendarMigration, /deadline_policy_version SMALLINT NOT NULL DEFAULT 1/u);
  assert.match(calendarMigration, /deadline_timezone TEXT NOT NULL DEFAULT 'Europe\/Berlin'/u);
  assert.match(calendarMigration, /deadline_policy_version = 2[\s\S]*AT TIME ZONE deadline_timezone/u);
  assert.match(calendarMigration, /INTERVAL '5 days'/u);
  assert.match(calendarMigration, /INTERVAL '7 days'/u);
});

test('account export and retention inventory cover every new C1F dataset', () => {
  for (const table of [
    'v52_condition_evidence_bindings',
    'v52_condition_confirmation_bindings',
    'v52_confirmation_challenge_bindings',
    'v52_confirmation_verification_events',
    'v52_return_cases',
    'v52_return_case_evidence',
    'v52_return_case_events',
  ]) {
    assert.match(privacyExport, new RegExp(`FROM ${table}`, 'u'));
    assert.match(retentionInventory, new RegExp(`'${table}'`, 'u'));
  }
  assert.match(privacyExport, /content_sha256,\s+content_scan_status/u);
  assert.doesNotMatch(privacyExport, /code_digest/u);
});

test('V5.2 direct metadata attempts fail closed and callers use the authorized endpoint', () => {
  assert.match(appSource, /app\.post\('\/v1\/bookings\/:id\/return-cases'/u);
  assert.match(appSource, /requestsV52ReturnCaseMutation\(candidate, storedPayload\)[\s\S]*startsWith\('V5\.2-'\)[\s\S]*v52_return_case_requires_authorized_endpoint/u);
  assert.match(appSource, /V52_RETURN_CASE_SERVER_FIELDS/u);
  assert.match(appSource, /openV52ReturnCase\(client/u);
});

test('client requires an explicit already-authorized contested amount without a full-rent fallback', () => {
  assert.match(reportIssueSource, /_contestedAmountMinor\(\)/u);
  assert.match(reportIssueSource, /contestedAuthorizedMinor: contestedAmountMinor/u);
  assert.match(
    safetyActionServiceSource,
    /final contested = contestedAuthorizedMinor;[\s\S]*contested == null \|\| contested <= 0[\s\S]*v52_return_case_contested_amount_invalid/u,
  );
  assert.match(dataServiceSource, /contestedAuthorizedMinor <= 0/u);
  assert.doesNotMatch(dataServiceSource, /requestedMinor[\s\S]{0,200}quotedTotalMinor/u);
});

test('V5.2 presenter evidence requires a processed hash and an exact semantic slot', async () => {
  const queries = [];
  const client = {
    async query(sql) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      queries.push(compact);
      if (compact.includes('LEFT JOIN platform_contracts AS contract')) {
        return { rowCount: 1, rows: [binding({ workflow_status: 'accepted' })] };
      }
      return { rowCount: 1, rows: [{ evidence_id: 'evidence-1' }] };
    },
  };
  await assert.rejects(
    bindV52ConditionEvidence(client, {
      evidenceId: '50000000-0000-4000-8000-000000000001',
      bookingId: 'booking-1',
      actorId: 'owner-1',
      evidence: {
        segment: 'pickup',
        kind: 'presenter_photo',
        actorRole: 'owner',
        source: 'camera',
        semanticSlot: '',
        requiredUploadPurpose: 'handover_evidence',
      },
      attachment: {
        id: uploadId,
        contentScanStatus: 'passed',
        contentSha256: 'b'.repeat(64),
      },
    }),
    (error) => error.code === 'v52_presenter_evidence_slot_required',
  );
  await assert.rejects(
    bindV52ConditionEvidence(client, {
      evidenceId: '50000000-0000-4000-8000-000000000001',
      bookingId: 'booking-1',
      actorId: 'owner-1',
      evidence: {
        segment: 'pickup',
        kind: 'presenter_photo',
        actorRole: 'owner',
        source: 'camera',
        semanticSlot: 'overview',
        requiredUploadPurpose: 'handover_evidence',
      },
      attachment: {
        id: uploadId,
        contentScanStatus: 'legacy',
        contentSha256: null,
      },
    }),
    (error) => error.code === 'v52_condition_evidence_not_processed',
  );
  await assert.rejects(
    bindV52ConditionEvidence(client, {
      evidenceId: '50000000-0000-4000-8000-000000000001',
      bookingId: 'booking-1',
      actorId: 'owner-1',
      evidence: {
        segment: 'pickup',
        kind: 'presenter_photo',
        actorRole: 'owner',
        source: 'camera',
        semanticSlot: 'overview',
        requiredUploadPurpose: 'return_evidence',
      },
      attachment: {
        id: uploadId,
        contentScanStatus: 'passed',
        contentSha256: 'b'.repeat(64),
      },
    }),
    (error) => error.code === 'v52_condition_evidence_purpose_mismatch',
  );
  assert.equal(queries.some((query) => query.startsWith('INSERT INTO v52_condition_evidence_bindings')), false);
});

test('return case rejects before T0 and after the inclusive 48-hour boundary', async () => {
  for (const [now, code] of [
    ['2026-08-20T09:59:59.999Z', 'v52_return_report_window_not_open'],
    ['2026-08-22T10:00:00.001Z', 'v52_return_report_window_closed'],
  ]) {
    const client = returnCaseClient();
    await assert.rejects(
      openV52ReturnCase(client, {
        actor: { id: 'owner-1', role: 'user' },
        bookingId: 'booking-1',
        raw: raw(),
        idempotencyKey: `return-case-${code}`,
        now: new Date(now),
      }),
      (error) => error.code === code,
    );
    assert.equal(client.state.writes.length, 0);
  }
});

test('exact T0+48h opens one substantiated case and cannot create an additional charge', async () => {
  const client = returnCaseClient();
  const result = await openV52ReturnCase(client, {
    actor: { id: 'owner-1', role: 'user' },
    bookingId: 'booking-1',
    raw: raw(),
    idempotencyKey: 'return-case-inclusive-deadline',
    now: new Date('2026-08-22T10:00:00.000Z'),
  });
  assert.equal(result.replayed, false);
  assert.equal(result.returnCase.contestedAuthorizedMinor, 1200);
  assert.equal(result.returnCase.undisputedReleasableMinor, 3800);
  assert.equal(result.returnCase.additionalChargeMinor, 0);
  assert.equal(result.returnCase.deadlineTimezone, 'Europe/Berlin');
  assert.equal(result.returnCase.deadlinePolicyVersion, 2);
  assert.equal(result.returnCase.reportDeadline, '2026-08-22T10:00:00.000Z');
  assert.ok(client.state.writes.some((entry) => entry.compact.startsWith('INSERT INTO v52_return_case_events')));
  assert.ok(client.state.writes.some((entry) => entry.compact.includes("'booking.v52_return_case_opened'")));
});

test('V5.2 response and update deadlines use calendar days in the booking timezone', async () => {
  const openedAt = new Date('2026-03-27T11:00:00.000Z');
  const client = returnCaseClient({
    bindingRow: binding({
      ends_at: openedAt,
      return_t0: openedAt,
    }),
  });
  const result = await openV52ReturnCase(client, {
    actor: { id: 'owner-1', role: 'user' },
    bookingId: 'booking-1',
    raw: raw(),
    idempotencyKey: 'return-case-calendar-dst',
    now: openedAt,
  });
  assert.equal(result.returnCase.responseDueAt, '2026-04-01T10:00:00.000Z');
  assert.equal(result.returnCase.nextStatusUpdateDueAt, '2026-04-03T10:00:00.000Z');
});

test('changed return T0 requires distinct participant proposal and confirmation', async () => {
  const client = returnCaseClient({
    bindingRow: binding({
      return_t0: null,
      booking_payload: {
        returnTimeConfirmed: true,
        returnTimeRequested: '20.08.2026, 14:00',
        returnTimeIso: '2026-08-20T12:00:00.000Z',
        returnTimeRequestedByUserId: 'owner-1',
        returnTimeConfirmedByUserId: 'owner-1',
        returnTimeConfirmedAt: '2026-08-20T09:00:00.000Z',
      },
    }),
  });
  const result = await openV52ReturnCase(client, {
    actor: { id: 'owner-1', role: 'user' },
    bookingId: 'booking-1',
    raw: raw(),
    idempotencyKey: 'return-case-untrusted-reschedule',
    now: new Date('2026-08-20T10:00:00.000Z'),
  });
  assert.equal(result.returnCase.t0, '2026-08-20T10:00:00.000Z');
});

test('changed return T0 accepts a complete distinct-participant confirmation', async () => {
  const client = returnCaseClient({
    bindingRow: binding({
      return_t0: null,
      booking_payload: {
        returnTimeConfirmed: true,
        returnTimeRequested: '20.08.2026, 14:00',
        returnTimeIso: '2026-08-20T12:00:00.000Z',
        returnTimeRequestedByUserId: 'owner-1',
        returnTimeConfirmedByUserId: 'renter-1',
        returnTimeConfirmedAt: '2026-08-20T09:00:00.000Z',
      },
    }),
  });
  const result = await openV52ReturnCase(client, {
    actor: { id: 'owner-1', role: 'user' },
    bookingId: 'booking-1',
    raw: raw(),
    idempotencyKey: 'return-case-trusted-reschedule',
    now: new Date('2026-08-20T12:00:00.000Z'),
  });
  assert.equal(result.returnCase.t0, '2026-08-20T12:00:00.000Z');
});

test('return case rejects unowned evidence and amounts above the immutable quote', async () => {
  const unowned = returnCaseClient({ evidenceRows: [] });
  await assert.rejects(
    openV52ReturnCase(unowned, {
      actor: { id: 'owner-1', role: 'user' },
      bookingId: 'booking-1',
      raw: raw(),
      idempotencyKey: 'return-case-unowned-evidence',
      now: new Date('2026-08-20T10:00:00.000Z'),
    }),
    (error) => error.code === 'v52_return_case_evidence_not_owned',
  );

  const overCap = returnCaseClient();
  await assert.rejects(
    openV52ReturnCase(overCap, {
      actor: { id: 'owner-1', role: 'user' },
      bookingId: 'booking-1',
      raw: raw({ contestedAuthorizedMinor: 5001 }),
      idempotencyKey: 'return-case-over-cap',
      now: new Date('2026-08-20T10:00:00.000Z'),
    }),
    (error) => error.code === 'v52_return_case_amount_exceeds_authorization',
  );
});

test('tampered V5.2 handover document hash fails closed before evidence access', async () => {
  const client = returnCaseClient({
    bindingRow: binding({ content_sha256: 'f'.repeat(64) }),
  });
  await assert.rejects(
    openV52ReturnCase(client, {
      actor: { id: 'owner-1', role: 'user' },
      bookingId: 'booking-1',
      raw: raw(),
      idempotencyKey: 'return-case-tampered-document',
      now: new Date('2026-08-20T10:00:00.000Z'),
    }),
    (error) => error.code === 'v52_handover_contract_binding_invalid',
  );
  assert.equal(client.state.writes.length, 0);
});
