import crypto from 'node:crypto';

import { v52ActualLossAmounts } from './v51_termination_domain.js';

export class V52ActualLossError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function text(value, maximum, code) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > maximum) {
    throw new V52ActualLossError(400, code);
  }
  return normalized;
}

function key(value) {
  const normalized = text(value, 240, 'invalid_idempotency_key');
  if (!/^[A-Za-z0-9_.:-]{8,240}$/.test(normalized)) {
    throw new V52ActualLossError(400, 'invalid_idempotency_key');
  }
  return normalized;
}

function minor(value, code) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new V52ActualLossError(400, code);
  }
  return parsed;
}

function nullableMinor(value) {
  return value == null ? null : Number(value);
}

function instant(value, code) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new V52ActualLossError(400, code);
  }
  return parsed;
}

function optionalText(value, maximum, code) {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new V52ActualLossError(400, code);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new V52ActualLossError(400, code);
  }
  return normalized || null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uploadIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new V52ActualLossError(400, 'v52_actual_loss_evidence_required');
  }
  const normalized = value
    .map((entry) => text(entry, 80, 'v52_actual_loss_evidence_invalid'))
    .sort();
  if (new Set(normalized).size !== normalized.length
      || normalized.some((entry) => !UUID_PATTERN.test(entry))) {
    throw new V52ActualLossError(400, 'v52_actual_loss_evidence_invalid');
  }
  return normalized;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function assertV52Document(row) {
  if (!String(row.contract_version ?? '').startsWith('V5.2-')
      || row.document_key !== 'cancellation_refund'
      || row.document_version !== row.contract_version
      || row.document_locale !== row.contract_locale
      || sha256(row.content_text ?? '') !== row.content_sha256) {
    throw new V52ActualLossError(409, 'v52_cancellation_contract_binding_invalid');
  }
}

function publicStatement(row) {
  if (!row?.id) return null;
  return Object.freeze({
    id: row.id,
    actorRole: row.actor_role,
    statementType: row.statement_type,
    ownerClaimedLossMinor: row.owner_claimed_loss_minor == null
      ? null
      : Number(row.owner_claimed_loss_minor),
    savedExpenseMinor: row.saved_expense_minor == null
      ? null
      : Number(row.saved_expense_minor),
    replacementRentalMinor: row.replacement_rental_minor == null
      ? null
      : Number(row.replacement_rental_minor),
    provenLowerLossMinor: row.proven_lower_loss_minor == null
      ? null
      : Number(row.proven_lower_loss_minor),
    evidenceReferences: row.evidence_references ?? [],
    statementText: row.statement_text ?? null,
    submittedAt: new Date(row.submitted_at).toISOString(),
  });
}

async function shapeCase(client, caseId, actor, { replayed = false } = {}) {
  const result = await client.query(
    `SELECT loss_case.*, booking.owner_id, booking.renter_id,
            resolution.id AS resolution_id, resolution.reason_code,
            resolution.renter_lower_loss_accepted,
            resolution.rent_refund_minor, resolution.rent_retained_minor,
            resolution.sit_fee_refund_minor, resolution.sit_fee_retained_minor,
            resolution.resolved_at, receipt.id AS receipt_id,
            receipt.artifact_sha256
       FROM v52_actual_loss_cases AS loss_case
       JOIN bookings AS booking ON booking.id = loss_case.booking_id
       LEFT JOIN v52_actual_loss_resolutions AS resolution
         ON resolution.case_id = loss_case.id
       LEFT JOIN v52_actual_loss_receipts AS receipt
         ON receipt.resolution_id = resolution.id
      WHERE loss_case.id = $1`,
    [caseId],
  );
  if (!result.rowCount) throw new V52ActualLossError(404, 'v52_actual_loss_case_not_found');
  const row = result.rows[0];
  if (![row.owner_id, row.renter_id].includes(actor.id)
      && !['support', 'admin'].includes(actor.role)) {
    throw new V52ActualLossError(403, 'v52_actual_loss_case_forbidden');
  }
  const statements = await client.query(
    `SELECT * FROM v52_actual_loss_statements
      WHERE case_id = $1 ORDER BY submitted_at ASC, id ASC`,
    [caseId],
  );
  return Object.freeze({
    actualLossCase: Object.freeze({
      id: row.id,
      bookingId: row.booking_id,
      cause: row.cause,
      status: row.resolution_id ? 'resolved' : 'evidence_pending',
      contractVersion: row.contract_version,
      locale: row.locale,
      quoteId: row.quote_id,
      quoteHash: row.quote_hash,
      rentalSubtotalMinor: Number(row.rental_subtotal_minor),
      platformFeeMinor: Number(row.platform_fee_minor),
      currency: row.currency,
      openedAt: new Date(row.opened_at).toISOString(),
      statements: statements.rows.map(publicStatement),
      resolution: row.resolution_id ? Object.freeze({
        id: row.resolution_id,
        reasonCode: row.reason_code,
        renterLowerLossAccepted: row.renter_lower_loss_accepted,
        rentRefund: Object.freeze({
          type: 'rent_refund',
          debtorRole: 'owner',
          amountMinor: Number(row.rent_refund_minor),
        }),
        rentRetainedMinor: Number(row.rent_retained_minor),
        sitFeeRefund: Object.freeze({
          type: 'sit_fee_refund',
          debtorRole: 'sit',
          amountMinor: Number(row.sit_fee_refund_minor),
        }),
        sitFeeRetainedMinor: Number(row.sit_fee_retained_minor),
        resolvedAt: new Date(row.resolved_at).toISOString(),
        receipt: row.receipt_id ? Object.freeze({
          id: row.receipt_id,
          artifactSha256: row.artifact_sha256,
          downloadPath: `/v1/actual-loss-resolutions/${encodeURIComponent(row.resolution_id)}/receipt`,
        }) : null,
      }) : null,
    }),
    participantUserIds: Object.freeze([row.owner_id, row.renter_id]),
    replayed,
  });
}

export async function openV52ActualLossCase(client, {
  actor,
  bookingId,
  cause,
  rentRefundObligationId,
  sitFeeRefundObligationId,
  idempotencyKey,
  now = new Date(),
}) {
  const commandKey = key(idempotencyKey);
  const openedAt = instant(now, 'v52_actual_loss_opened_at_invalid');
  if (!['after_start', 'renter_no_show'].includes(cause)) {
    throw new V52ActualLossError(400, 'v52_actual_loss_cause_invalid');
  }
  const binding = await client.query(
    `SELECT booking.id, booking.owner_id, booking.renter_id, booking.currency,
            booking.rental_subtotal_minor, booking.platform_fee_minor,
            contract.id AS platform_contract_id, contract.contract_version,
            contract.locale AS contract_locale, contract.quote_id, contract.quote_hash,
            contract.cancellation_refund_snapshot_id,
            document.document_key, document.document_version,
            document.locale AS document_locale, document.content_text,
            document.content_sha256
       FROM bookings AS booking
       JOIN platform_contracts AS contract ON contract.booking_id = booking.id
       JOIN legal_document_snapshots AS document
         ON document.id = contract.cancellation_refund_snapshot_id
      WHERE booking.id = $1 FOR UPDATE OF booking`,
    [bookingId],
  );
  if (!binding.rowCount) return null;
  const row = binding.rows[0];
  if (!String(row.contract_version).startsWith('V5.2-')) return null;
  assertV52Document(row);
  const obligations = await client.query(
    `SELECT id, refund_type, debtor_role, status, maximum_minor
       FROM v51_cancellation_refund_obligations
      WHERE booking_id = $1 AND id = ANY($2::uuid[])
      ORDER BY refund_type`,
    [bookingId, [rentRefundObligationId, sitFeeRefundObligationId]],
  );
  if (obligations.rowCount !== 2
      || obligations.rows.some((entry) => entry.status !== 'pending_actual_loss_assessment')
      || !obligations.rows.some((entry) => entry.id === rentRefundObligationId
        && entry.refund_type === 'rent_refund' && entry.debtor_role === 'owner')
      || !obligations.rows.some((entry) => entry.id === sitFeeRefundObligationId
        && entry.refund_type === 'sit_fee_refund' && entry.debtor_role === 'sit')) {
    throw new V52ActualLossError(409, 'v52_actual_loss_obligations_invalid');
  }
  const inserted = await client.query(
    `INSERT INTO v52_actual_loss_cases (
       booking_id, platform_contract_id, cancellation_refund_snapshot_id,
       rent_refund_obligation_id, sit_fee_refund_obligation_id, cause,
       contract_version, locale, quote_id, quote_hash,
       rental_subtotal_minor, platform_fee_minor, currency,
       opened_by, opened_at, idempotency_key
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
     ) ON CONFLICT (booking_id) DO NOTHING RETURNING id`,
    [
      bookingId,
      row.platform_contract_id,
      row.cancellation_refund_snapshot_id,
      rentRefundObligationId,
      sitFeeRefundObligationId,
      cause,
      row.contract_version,
      row.contract_locale,
      row.quote_id,
      row.quote_hash,
      row.rental_subtotal_minor,
      row.platform_fee_minor,
      row.currency,
      actor.id,
      openedAt,
      commandKey,
    ],
  );
  const created = Boolean(inserted.rows[0]?.id);
  let caseId = inserted.rows[0]?.id;
  if (!caseId) {
    const replay = await client.query(
      `SELECT id, cause, rent_refund_obligation_id, sit_fee_refund_obligation_id,
              idempotency_key
         FROM v52_actual_loss_cases WHERE booking_id = $1`,
      [bookingId],
    );
    const existing = replay.rows[0];
    if (existing && (existing.cause !== cause
        || existing.rent_refund_obligation_id !== rentRefundObligationId
        || existing.sit_fee_refund_obligation_id !== sitFeeRefundObligationId
        || existing.idempotency_key !== commandKey)) {
      throw new V52ActualLossError(409, 'v52_actual_loss_case_conflict');
    }
    caseId = existing?.id;
  }
  if (!caseId) throw new V52ActualLossError(500, 'v52_actual_loss_case_not_created');
  if (created) {
    await client.query(
      `INSERT INTO audit_log (
         actor_id, actor_role, action, resource_type, resource_id, metadata
       ) VALUES ($1, $2, 'booking.actual_loss_case_opened', 'actual_loss_case', $3, $4::jsonb)`,
      [actor.id, actor.role, caseId, JSON.stringify({ bookingId, cause, liveMoneyExecuted: false })],
    );
  }
  return Object.freeze({ id: caseId, status: 'evidence_pending', cause });
}

export async function getV52ActualLossCase(client, { actor, bookingId }) {
  const result = await client.query(
    'SELECT id FROM v52_actual_loss_cases WHERE booking_id = $1',
    [bookingId],
  );
  if (!result.rowCount) throw new V52ActualLossError(404, 'v52_actual_loss_case_not_found');
  return shapeCase(client, result.rows[0].id, actor);
}

export async function recordV52ActualLossStatement(client, {
  actor,
  bookingId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  const commandKey = key(idempotencyKey);
  const submittedAt = instant(now, 'v52_actual_loss_submitted_at_invalid');
  const lossCase = await client.query(
    `SELECT loss_case.*, booking.owner_id, booking.renter_id,
            resolution.id AS resolution_id
       FROM v52_actual_loss_cases AS loss_case
       JOIN bookings AS booking ON booking.id = loss_case.booking_id
       LEFT JOIN v52_actual_loss_resolutions AS resolution
         ON resolution.case_id = loss_case.id
      WHERE loss_case.booking_id = $1 FOR UPDATE OF loss_case`,
    [bookingId],
  );
  if (!lossCase.rowCount) throw new V52ActualLossError(404, 'v52_actual_loss_case_not_found');
  const row = lossCase.rows[0];
  const actorRole = actor.id === row.owner_id
    ? 'owner'
    : (actor.id === row.renter_id ? 'renter' : null);
  if (!actorRole) throw new V52ActualLossError(403, 'v52_actual_loss_statement_forbidden');
  if (row.resolution_id) throw new V52ActualLossError(409, 'v52_actual_loss_already_resolved');
  const evidenceUploadIds = uploadIds(raw?.evidenceUploadIds);
  const evidence = await client.query(
    `SELECT id FROM uploads
      WHERE owner_id = $1 AND visibility = 'private'
        AND purpose IN ('handover_evidence', 'return_evidence', 'report_evidence')
        AND id::text = ANY($2::text[])
      FOR UPDATE`,
    [actor.id, evidenceUploadIds],
  );
  if (evidence.rowCount !== evidenceUploadIds.length) {
    throw new V52ActualLossError(400, 'v52_actual_loss_evidence_not_owned');
  }
  const values = actorRole === 'owner'
    ? {
        statementType: 'owner_loss_statement',
        ownerClaimedLossMinor: minor(raw?.ownerClaimedLossMinor, 'v52_owner_claimed_loss_invalid'),
        savedExpenseMinor: minor(raw?.savedExpenseMinor, 'v52_saved_expense_invalid'),
        replacementRentalMinor: minor(raw?.replacementRentalMinor, 'v52_replacement_rental_invalid'),
        provenLowerLossMinor: null,
      }
    : {
        statementType: 'renter_lower_loss_statement',
        ownerClaimedLossMinor: null,
        savedExpenseMinor: null,
        replacementRentalMinor: null,
        provenLowerLossMinor: minor(raw?.provenLowerLossMinor, 'v52_proven_lower_loss_invalid'),
      };
  const statementText = optionalText(
    raw?.statementText,
    4000,
    'v52_actual_loss_statement_text_invalid',
  );
  const replay = await client.query(
    `SELECT id, case_id, actor_role, statement_type, owner_claimed_loss_minor,
            saved_expense_minor, replacement_rental_minor,
            proven_lower_loss_minor, evidence_references, statement_text
       FROM v52_actual_loss_statements
      WHERE idempotency_key = $1 AND actor_id = $2`,
    [commandKey, actor.id],
  );
  if (replay.rowCount) {
    const existing = replay.rows[0];
    const existingEvidence = Array.isArray(existing.evidence_references)
      ? existing.evidence_references.map(String).sort()
      : [];
    if (existing.case_id !== row.id
        || existing.actor_role !== actorRole
        || existing.statement_type !== values.statementType
        || nullableMinor(existing.owner_claimed_loss_minor) !== values.ownerClaimedLossMinor
        || nullableMinor(existing.saved_expense_minor) !== values.savedExpenseMinor
        || nullableMinor(existing.replacement_rental_minor) !== values.replacementRentalMinor
        || nullableMinor(existing.proven_lower_loss_minor) !== values.provenLowerLossMinor
        || JSON.stringify(existingEvidence) !== JSON.stringify(evidenceUploadIds)
        || (existing.statement_text ?? null) !== statementText) {
      throw new V52ActualLossError(409, 'v52_actual_loss_idempotency_conflict');
    }
    return shapeCase(client, row.id, actor, { replayed: true });
  }
  const inserted = await client.query(
    `INSERT INTO v52_actual_loss_statements (
       case_id, actor_id, actor_role, statement_type,
       owner_claimed_loss_minor, saved_expense_minor,
       replacement_rental_minor, proven_lower_loss_minor,
       evidence_references, statement_text, submitted_at, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
     RETURNING id`,
    [
      row.id,
      actor.id,
      actorRole,
      values.statementType,
      values.ownerClaimedLossMinor,
      values.savedExpenseMinor,
      values.replacementRentalMinor,
      values.provenLowerLossMinor,
      JSON.stringify(evidenceUploadIds),
      statementText,
      submittedAt,
      commandKey,
    ],
  );
  await client.query(
    `INSERT INTO v52_actual_loss_statement_evidence (statement_id, upload_id)
     SELECT $1, unnest($2::uuid[])`,
    [inserted.rows[0].id, evidenceUploadIds],
  );
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, 'booking.actual_loss_statement_recorded',
       'actual_loss_case', $3, $4::jsonb)`,
    [
      actor.id,
      actor.role,
      row.id,
      JSON.stringify({ bookingId, actorRole, evidenceCount: evidenceUploadIds.length }),
    ],
  );
  return shapeCase(client, row.id, actor);
}

export function renderV52ActualLossReceipt({ lossCase, resolutionId, resolvedAt, reasonCode, amounts, document }) {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ShareItToo Stornoabrechnung</title></head>
<body><main><h1>ShareItToo Stornoabrechnung</h1><dl>
<dt>Abrechnung</dt><dd>${escapeHtml(resolutionId)}</dd>
<dt>Buchung</dt><dd>${escapeHtml(lossCase.booking_id)}</dd>
<dt>Anlass</dt><dd>${escapeHtml(lossCase.cause)}</dd>
<dt>Zeitpunkt</dt><dd>${escapeHtml(new Date(resolvedAt).toISOString())}</dd>
<dt>Grundlage</dt><dd>${escapeHtml(reasonCode)}</dd>
<dt>Vertrag</dt><dd>${escapeHtml(lossCase.contract_version)}</dd>
<dt>Quote-ID</dt><dd>${escapeHtml(lossCase.quote_id)}</dd>
<dt>Quote-Hash</dt><dd>${escapeHtml(lossCase.quote_hash)}</dd>
<dt>Dokument-Hash</dt><dd>${escapeHtml(document.content_sha256)}</dd>
</dl><h2>Tatsächlicher Verlust</h2><ul>
<li>Behaupteter Mietausfall: ${amounts.ownerClaimedLossMinor} ${escapeHtml(lossCase.currency)}-Cent</li>
<li>Ersparte Aufwendungen: ${amounts.savedExpenseMinor} ${escapeHtml(lossCase.currency)}-Cent</li>
<li>Tatsächliche Ersatzvermietung: ${amounts.replacementRentalMinor} ${escapeHtml(lossCase.currency)}-Cent</li>
<li>Berücksichtigter geringerer/fehlender Schaden: ${amounts.provenLowerLossMinor == null ? 'nicht angewendet' : `${amounts.provenLowerLossMinor} ${escapeHtml(lossCase.currency)}-Cent`}</li>
</ul><h2>Getrennte Erstattungen</h2><ul>
<li>Mietpreis-Erstattung · Schuldner owner: ${amounts.rentRefundMinor} ${escapeHtml(lossCase.currency)}-Cent</li>
<li>SIT-Gebühren-Erstattung · Schuldner sit: ${amounts.sitFeeRefundMinor} ${escapeHtml(lossCase.currency)}-Cent</li>
</ul><p>Dieser Beleg dokumentiert nur die Berechnung. Er bestätigt keine echte Zahlung oder Auszahlung.</p>
<h2>Vertragsgrundlage</h2><pre>${escapeHtml(document.content_text)}</pre></main></body></html>`;
}

export async function resolveV52ActualLossCase(client, {
  actor,
  bookingId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor.role !== 'admin') throw new V52ActualLossError(403, 'admin_role_required');
  const commandKey = key(idempotencyKey);
  const resolvedAt = instant(now, 'v52_actual_loss_resolved_at_invalid');
  const acceptLower = raw?.renterLowerLossAccepted === true;
  const reasonCode = text(raw?.reasonCode, 120, 'v52_actual_loss_reason_required');
  const result = await client.query(
    `SELECT loss_case.*, booking.owner_id, booking.renter_id,
            document.document_key, document.document_version,
            document.locale AS document_locale, document.content_text,
            document.content_sha256,
            owner_statement.id AS owner_statement_id,
            owner_statement.owner_claimed_loss_minor,
            owner_statement.saved_expense_minor,
            owner_statement.replacement_rental_minor,
            renter_statement.id AS renter_statement_id,
            renter_statement.proven_lower_loss_minor,
            resolution.id AS existing_resolution_id
       FROM v52_actual_loss_cases AS loss_case
       JOIN bookings AS booking ON booking.id = loss_case.booking_id
       JOIN legal_document_snapshots AS document
         ON document.id = loss_case.cancellation_refund_snapshot_id
       LEFT JOIN LATERAL (
         SELECT * FROM v52_actual_loss_statements
          WHERE case_id = loss_case.id AND actor_role = 'owner'
          ORDER BY submitted_at DESC, id DESC LIMIT 1
       ) AS owner_statement ON true
       LEFT JOIN LATERAL (
         SELECT * FROM v52_actual_loss_statements
          WHERE case_id = loss_case.id AND actor_role = 'renter'
          ORDER BY submitted_at DESC, id DESC LIMIT 1
       ) AS renter_statement ON true
       LEFT JOIN v52_actual_loss_resolutions AS resolution
         ON resolution.case_id = loss_case.id
      WHERE loss_case.booking_id = $1 FOR UPDATE OF loss_case`,
    [bookingId],
  );
  if (!result.rowCount) throw new V52ActualLossError(404, 'v52_actual_loss_case_not_found');
  const row = result.rows[0];
  assertV52Document({
    ...row,
    contract_locale: row.locale,
    contract_version: row.contract_version,
  });
  if (row.existing_resolution_id) {
    const replay = await client.query(
      `SELECT id, renter_lower_loss_accepted, reason_code
         FROM v52_actual_loss_resolutions
        WHERE case_id = $1 AND idempotency_key = $2`,
      [row.id, commandKey],
    );
    if (!replay.rowCount) throw new V52ActualLossError(409, 'v52_actual_loss_already_resolved');
    if (replay.rows[0].renter_lower_loss_accepted !== acceptLower
        || replay.rows[0].reason_code !== reasonCode) {
      throw new V52ActualLossError(409, 'v52_actual_loss_idempotency_conflict');
    }
    return shapeCase(client, row.id, actor, { replayed: true });
  }
  if (!row.owner_statement_id) {
    throw new V52ActualLossError(409, 'v52_owner_loss_statement_required');
  }
  if (acceptLower && !row.renter_statement_id) {
    throw new V52ActualLossError(409, 'v52_renter_lower_loss_statement_required');
  }
  const amounts = v52ActualLossAmounts({
    rentalSubtotalMinor: Number(row.rental_subtotal_minor),
    platformFeeMinor: Number(row.platform_fee_minor),
    ownerClaimedLossMinor: Number(row.owner_claimed_loss_minor),
    savedExpenseMinor: Number(row.saved_expense_minor),
    replacementRentalMinor: Number(row.replacement_rental_minor),
    provenLowerLossMinor: acceptLower ? Number(row.proven_lower_loss_minor) : null,
  });
  const calculationBasis = {
    modelVersion: 'V5.2-actual-loss-v1',
    quoteId: row.quote_id,
    quoteHash: row.quote_hash,
    contractVersion: row.contract_version,
    cancellationDocumentSha256: row.content_sha256,
    ownerStatementId: row.owner_statement_id,
    renterStatementId: acceptLower ? row.renter_statement_id : null,
    renterLowerLossAccepted: acceptLower,
    liveMoneyExecuted: false,
    ...amounts,
  };
  const inserted = await client.query(
    `INSERT INTO v52_actual_loss_resolutions (
       case_id, owner_statement_id, renter_statement_id,
       renter_lower_loss_accepted, resolved_by, resolver_role, reason_code,
       calculation_basis, rent_refund_minor, rent_retained_minor,
       sit_fee_refund_minor, sit_fee_retained_minor, resolved_at, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5, 'admin', $6, $7::jsonb, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      row.id,
      row.owner_statement_id,
      acceptLower ? row.renter_statement_id : null,
      acceptLower,
      actor.id,
      reasonCode,
      JSON.stringify(calculationBasis),
      amounts.rentRefundMinor,
      amounts.rentRetainedMinor,
      amounts.sitFeeRefundMinor,
      amounts.sitFeeRetainedMinor,
      resolvedAt,
      commandKey,
    ],
  );
  const resolutionId = inserted.rows[0].id;
  for (const [obligationId, refundType, debtorRole, amountDueMinor] of [
    [row.rent_refund_obligation_id, 'rent_refund', 'owner', amounts.rentRefundMinor],
    [row.sit_fee_refund_obligation_id, 'sit_fee_refund', 'sit', amounts.sitFeeRefundMinor],
  ]) {
    await client.query(
      `INSERT INTO v52_cancellation_refund_resolution_events (
         resolution_id, obligation_id, refund_type, debtor_role,
         amount_due_minor, calculation_basis, occurred_at, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        resolutionId,
        obligationId,
        refundType,
        debtorRole,
        amountDueMinor,
        JSON.stringify(calculationBasis),
        resolvedAt,
        `${commandKey}:${refundType}`,
      ],
    );
  }
  const receiptHtml = renderV52ActualLossReceipt({
    lossCase: row,
    resolutionId,
    resolvedAt,
    reasonCode,
    amounts,
    document: row,
  });
  const artifactSha256 = sha256(receiptHtml);
  await client.query(
    `INSERT INTO v52_actual_loss_receipts (
       resolution_id, artifact_format, content_html, artifact_sha256,
       generated_at, idempotency_key
     ) VALUES ($1, 'html', $2, $3, $4, $5)`,
    [resolutionId, receiptHtml, artifactSha256, resolvedAt, `${commandKey}:receipt`],
  );
  for (const [eventType, suffix] of [
    ['generated', 'generated'],
    ['delivery_attempted', 'available'],
  ]) {
    await client.query(
      `INSERT INTO v52_actual_loss_receipt_events (
         resolution_id, event_type, artifact_sha256, occurred_at,
         idempotency_key, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        resolutionId,
        eventType,
        artifactSha256,
        resolvedAt,
        `${commandKey}:receipt:${suffix}`,
        JSON.stringify({ authenticatedDownload: true }),
      ],
    );
  }
  const request = await client.query(
    'SELECT payload FROM rental_requests WHERE id = $1 FOR UPDATE',
    [bookingId],
  );
  const payload = request.rows[0]?.payload && typeof request.rows[0].payload === 'object'
    ? request.rows[0].payload
    : {};
  payload.cancellationOutcome = {
    calculationStatus: 'final_actual_loss_assessment',
    requiresActualLossAssessment: false,
    actualLossCaseId: row.id,
    actualLossResolutionId: resolutionId,
    rentRefund: {
      type: 'rent_refund',
      debtorRole: 'owner',
      status: 'required',
      amountMinor: amounts.rentRefundMinor,
      maximumMinor: Number(row.rental_subtotal_minor),
    },
    sitFeeRefund: {
      type: 'sit_fee_refund',
      debtorRole: 'sit',
      status: 'required',
      amountMinor: amounts.sitFeeRefundMinor,
      maximumMinor: Number(row.platform_fee_minor),
    },
    refundMinor: amounts.rentRefundMinor + amounts.sitFeeRefundMinor,
    retainedMinor: amounts.rentRetainedMinor + amounts.sitFeeRetainedMinor,
    calculationBasis,
    calculatedAt: resolvedAt.toISOString(),
    modelVersion: 'V5.2-actual-loss-v1',
    receipt: {
      artifactSha256,
      downloadPath: `/v1/actual-loss-resolutions/${encodeURIComponent(resolutionId)}/receipt`,
    },
  };
  await client.query(
    'UPDATE rental_requests SET payload = $2::jsonb WHERE id = $1',
    [bookingId, JSON.stringify(payload)],
  );
  await client.query(
    `INSERT INTO booking_events (
       booking_id, actor_id, event_type, from_status, to_status,
       idempotency_key, metadata
     ) VALUES ($1, $2, 'booking.actual_loss_resolved', 'cancelled', 'cancelled', $3, $4::jsonb)`,
    [
      bookingId,
      actor.id,
      `${commandKey}:booking-event`,
      JSON.stringify({ resolutionId, calculationBasis, liveMoneyExecuted: false }),
    ],
  );
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, 'booking.actual_loss_resolved',
       'actual_loss_resolution', $3, $4::jsonb)`,
    [actor.id, actor.role, resolutionId, JSON.stringify({ bookingId, calculationBasis })],
  );
  return shapeCase(client, row.id, actor);
}

export async function getV52ActualLossReceipt(client, {
  actor,
  resolutionId,
  deliveredAt = new Date(),
}) {
  const delivered = instant(deliveredAt, 'v52_actual_loss_delivered_at_invalid');
  if (!UUID_PATTERN.test(String(resolutionId ?? ''))) {
    throw new V52ActualLossError(400, 'v52_actual_loss_resolution_id_invalid');
  }
  const result = await client.query(
    `SELECT receipt.content_html, receipt.artifact_sha256,
            resolution.id AS resolution_id, loss_case.booking_id,
            booking.owner_id, booking.renter_id
       FROM v52_actual_loss_receipts AS receipt
       JOIN v52_actual_loss_resolutions AS resolution
         ON resolution.id = receipt.resolution_id
       JOIN v52_actual_loss_cases AS loss_case ON loss_case.id = resolution.case_id
       JOIN bookings AS booking ON booking.id = loss_case.booking_id
      WHERE resolution.id = $1`,
    [resolutionId],
  );
  if (!result.rowCount) throw new V52ActualLossError(404, 'v52_actual_loss_receipt_not_found');
  const row = result.rows[0];
  if (![row.owner_id, row.renter_id].includes(actor.id) && actor.role !== 'admin') {
    throw new V52ActualLossError(404, 'v52_actual_loss_receipt_not_found');
  }
  if (sha256(row.content_html) !== row.artifact_sha256) {
    throw new V52ActualLossError(409, 'v52_actual_loss_receipt_integrity_failed');
  }
  await client.query(
    `INSERT INTO v52_actual_loss_receipt_events (
       resolution_id, event_type, artifact_sha256, occurred_at,
       idempotency_key, metadata
     ) VALUES ($1, 'delivered', $2, $3, $4, $5::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      resolutionId,
      row.artifact_sha256,
      delivered,
      `actual-loss-receipt:${resolutionId}:delivered:${actor.id}`,
      JSON.stringify({ authenticatedDownload: true, actorId: actor.id }),
    ],
  );
  return Object.freeze({
    contentHtml: row.content_html,
    artifactSha256: row.artifact_sha256,
  });
}
