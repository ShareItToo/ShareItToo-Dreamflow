import crypto from 'node:crypto';

import { enqueueV51WithdrawalNotifications } from './notifications.js';
import { evaluateV51WithdrawalEffect } from './v51_termination_domain.js';
import { v51ContractDocument } from './v51_contract_workflow.js';

export class V51WithdrawalError extends Error {
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

function text(value, max, code) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > max) throw new V51WithdrawalError(400, code);
  return normalized;
}

function key(value) {
  const normalized = text(value, 240, 'invalid_idempotency_key');
  if (!/^[A-Za-z0-9_.:-]{8,240}$/.test(normalized)) {
    throw new V51WithdrawalError(400, 'invalid_idempotency_key');
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

function actorName(profile, email) {
  const candidate = typeof profile?.displayName === 'string'
    ? profile.displayName.trim()
    : '';
  if (candidate) return candidate.slice(0, 240);
  const local = typeof email === 'string' ? email.split('@')[0].trim() : '';
  return (local || 'SIT-Nutzer').slice(0, 240);
}

function publicRefund(row) {
  const resolvedAmount = row.calculated_amount_due_minor == null
    ? row.amount_due_minor
    : row.calculated_amount_due_minor;
  return Object.freeze({
    id: row.id,
    type: row.refund_type,
    debtorRole: row.debtor_role,
    currency: row.currency,
    status: row.calculated_amount_due_minor == null ? row.status : 'required',
    amountDueMinor: resolvedAmount == null ? null : Number(resolvedAmount),
    maximumMinor: Number(row.maximum_minor),
    calculationBasis: row.calculation_basis ?? {},
  });
}

async function v51WithdrawalDocument(client, at) {
  const result = await client.query(
    `SELECT id, document_version, content_type, content_text, content_sha256
       FROM legal_document_snapshots
      WHERE document_key = 'withdrawal'
        AND document_version = $1
        AND locale = $2
        AND effective_at <= $3
      ORDER BY effective_at DESC, created_at DESC
      LIMIT 1`,
    [v51ContractDocument.version, v51ContractDocument.locale, at],
  );
  if (!result.rowCount) {
    throw new V51WithdrawalError(409, 'v51_withdrawal_document_unavailable');
  }
  const document = result.rows[0];
  if (sha256(document.content_text) !== document.content_sha256) {
    throw new V51WithdrawalError(409, 'v51_withdrawal_document_integrity_failed');
  }
  return document;
}

function contractWithdrawalDocument(row) {
  if (!String(row.contract_version ?? '').startsWith('V5.2-')) return null;
  if (!row.withdrawal_document_snapshot_id
      || row.withdrawal_document_key !== 'imprint_withdrawal_shorttexts'
      || row.withdrawal_document_version !== row.contract_version
      || row.withdrawal_document_locale !== row.contract_locale
      || sha256(row.withdrawal_document_content_text ?? '')
        !== row.withdrawal_document_content_sha256) {
    throw new V51WithdrawalError(409, 'v52_withdrawal_contract_binding_invalid');
  }
  return Object.freeze({
    id: row.withdrawal_document_snapshot_id,
    document_version: row.withdrawal_document_version,
    content_type: row.withdrawal_document_content_type,
    content_text: row.withdrawal_document_content_text,
    content_sha256: row.withdrawal_document_content_sha256,
  });
}

function effectConsequences(effect) {
  if (effect.manualReviewRequired) {
    return 'Die elektronische Erklärung wurde empfangen. Das garantierte vertragliche 14-Tage-Fenster ist abgelaufen; mögliche längere gesetzliche Rechte werden geprüft. Buchung und Erstattungen werden bis dahin nicht automatisch verändert.';
  }
  if (effect.phase === 'account_only') {
    return 'Der Widerruf des Kontovertrags wurde empfangen. Betroffene Buchungen werden nicht stillschweigend verändert.';
  }
  if (effect.phase === 'before_handover') {
    return 'Die Buchung wird kostenfrei beendet. Mietpreis und SIT-Plattformgebühr werden getrennt vollständig zur Erstattung vorgemerkt.';
  }
  return effect.returnRequired
    ? 'Die Nutzung endet. Die dokumentierte Rückgabe muss jetzt abgeschlossen werden. Die SIT-Plattformgebühr wird vollständig erstattet; der übrige Mietpreis wird nach bestätigter Rückgabe zeitanteilig berechnet.'
    : 'Die Rückgabe ist bestätigt. Die SIT-Plattformgebühr wird vollständig und der übrige Mietpreis zeitanteilig getrennt zur Erstattung vorgemerkt.';
}

export function renderV51WithdrawalReceipt({
  withdrawalId,
  scope,
  actorName: name,
  bookingId,
  platformContractId,
  submittedAt,
  electronicChannel,
  eligibilityStatus = 'automatic_14_day',
  rightExpiresAt = null,
  effect,
  withdrawalDocument: document,
  refunds,
}) {
  const refundHtml = refunds.length
    ? refunds.map((refund) => `<li>${escapeHtml(refund.type)} · Schuldner ${escapeHtml(refund.debtorRole)} · Status ${escapeHtml(refund.status)} · Betrag ${refund.amountDueMinor == null ? 'nach Rückgabebestätigung zu berechnen' : `${refund.amountDueMinor} ${escapeHtml(refund.currency)}-Cent`}</li>`).join('')
    : '<li>Keine buchungsbezogene Erstattung ausgelöst.</li>';
  return `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ShareItToo Widerrufsbestätigung</title></head>
<body><main>
<h1>ShareItToo Widerrufsbestätigung</h1>
<dl>
<dt>Widerruf</dt><dd>${escapeHtml(withdrawalId)}</dd>
<dt>Bereich</dt><dd>${escapeHtml(scope)}</dd>
<dt>Name</dt><dd>${escapeHtml(name)}</dd>
<dt>Buchung</dt><dd>${escapeHtml(bookingId ?? 'nicht buchungsbezogen')}</dd>
<dt>Plattformvertrag</dt><dd>${escapeHtml(platformContractId ?? 'Kontovertrag')}</dd>
<dt>Eingang</dt><dd>${escapeHtml(new Date(submittedAt).toISOString())}</dd>
<dt>Empfangskanal</dt><dd>${escapeHtml(electronicChannel)}</dd>
<dt>Prüfstatus</dt><dd>${escapeHtml(eligibilityStatus)}</dd>
<dt>Vertragliches Lösungsfenster bis</dt><dd>${escapeHtml(rightExpiresAt ?? 'nicht buchungsbezogen')}</dd>
<dt>Dokumentversion</dt><dd>${escapeHtml(document.document_version)}</dd>
<dt>Dokument-Hash</dt><dd>${escapeHtml(document.content_sha256)}</dd>
</dl>
<h2>Folgen</h2><p>${escapeHtml(effectConsequences(effect))}</p>
<h2>Getrennte Erstattungsobjekte</h2><ul>${refundHtml}</ul>
<h2>Widerrufsinformation</h2><pre>${escapeHtml(document.content_text)}</pre>
</main></body></html>`;
}

async function shapeWithdrawal(client, withdrawalId, userId, { replayed = false } = {}) {
  const result = await client.query(
    `SELECT withdrawal.id, withdrawal.scope, withdrawal.booking_id,
            withdrawal.platform_contract_id, withdrawal.actor_name,
            withdrawal.electronic_channel, withdrawal.effect_phase,
            withdrawal.effect_status, withdrawal.eligibility_status,
            withdrawal.right_expires_at, withdrawal.submitted_at,
            receipt.id AS receipt_id, receipt.artifact_sha256,
            booking.owner_id, booking.renter_id, booking.status,
            booking.workflow_status
       FROM v51_withdrawals AS withdrawal
       LEFT JOIN v51_withdrawal_receipts AS receipt
         ON receipt.withdrawal_id = withdrawal.id
       LEFT JOIN bookings AS booking ON booking.id = withdrawal.booking_id
      WHERE withdrawal.id = $1 AND withdrawal.user_id = $2`,
    [withdrawalId, userId],
  );
  if (!result.rowCount) throw new V51WithdrawalError(404, 'v51_withdrawal_not_found');
  const row = result.rows[0];
  const obligations = await client.query(
    `SELECT obligation.id, obligation.refund_type, obligation.debtor_role,
            obligation.currency, obligation.status, obligation.amount_due_minor,
            obligation.maximum_minor,
            COALESCE(calculation.calculation_basis,
                     obligation.calculation_basis) AS calculation_basis,
            calculation.amount_due_minor AS calculated_amount_due_minor
       FROM v51_refund_obligations AS obligation
       LEFT JOIN LATERAL (
         SELECT event.amount_due_minor, event.calculation_basis
           FROM v51_refund_obligation_events AS event
          WHERE event.obligation_id = obligation.id
          ORDER BY event.occurred_at DESC, event.id DESC LIMIT 1
       ) AS calculation ON true
      WHERE obligation.withdrawal_id = $1 ORDER BY obligation.refund_type`,
    [withdrawalId],
  );
  const refunds = obligations.rows.map(publicRefund);
  return Object.freeze({
    withdrawal: Object.freeze({
      id: row.id,
      scope: row.scope,
      bookingId: row.booking_id,
      platformContractId: row.platform_contract_id,
      actorName: row.actor_name,
      electronicChannel: row.electronic_channel,
      effectPhase: row.effect_phase,
      effectStatus: row.effect_status,
      eligibilityStatus: row.eligibility_status,
      rightExpiresAt: row.right_expires_at
        ? new Date(row.right_expires_at).toISOString()
        : null,
      submittedAt: new Date(row.submitted_at).toISOString(),
      receipt: row.receipt_id ? Object.freeze({
        id: row.receipt_id,
        artifactSha256: row.artifact_sha256,
        downloadPath: `/v1/withdrawals/${encodeURIComponent(row.id)}/receipt`,
      }) : null,
    }),
    booking: row.booking_id ? Object.freeze({
      id: row.booking_id,
      ownerId: row.owner_id,
      renterId: row.renter_id,
      status: row.status,
      workflowStatus: row.workflow_status,
    }) : null,
    rentRefund: refunds.find((entry) => entry.type === 'rent_refund') ?? null,
    sitFeeRefund: refunds.find((entry) => entry.type === 'sit_fee_refund') ?? null,
    replayed,
  });
}

export async function recordV51Withdrawal(client, {
  actor,
  bookingId = null,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  const scope = raw?.scope === 'account_contract'
    ? 'account_contract'
    : 'booking_contract';
  const commandKey = key(idempotencyKey);
  if (raw?.acknowledgedConsequences !== true) {
    throw new V51WithdrawalError(400, 'v51_withdrawal_consequences_acknowledgement_required');
  }
  if (raw?.reason != null) {
    throw new V51WithdrawalError(400, 'v51_withdrawal_reason_must_not_be_requested');
  }
  const electronicChannel = raw?.electronicChannel ?? 'in_app_download';
  if (electronicChannel !== 'in_app_download') {
    throw new V51WithdrawalError(409, 'v51_withdrawal_email_delivery_not_available');
  }
  const submittedAt = new Date(now);
  if (!Number.isFinite(submittedAt.getTime())) {
    throw new V51WithdrawalError(400, 'v51_withdrawal_time_invalid');
  }

  const replay = await client.query(
    'SELECT id FROM v51_withdrawals WHERE idempotency_key = $1 AND user_id = $2',
    [commandKey, actor.id],
  );
  if (replay.rowCount) {
    return shapeWithdrawal(client, replay.rows[0].id, actor.id, { replayed: true });
  }

  const user = await client.query(
    'SELECT email, profile FROM users WHERE id = $1',
    [actor.id],
  );
  if (!user.rowCount) throw new V51WithdrawalError(404, 'user_not_found');
  const name = actorName(user.rows[0].profile, user.rows[0].email);
  let document = scope === 'account_contract'
    ? await v51WithdrawalDocument(client, submittedAt)
    : null;

  let row = null;
  let effect = Object.freeze({
    phase: 'account_only',
    bookingWorkflowStatus: null,
    returnRequired: false,
  });
  let normalizedBookingId = null;
  let eligibilityStatus = 'account_contract_received';
  let rightExpiresAt = null;
  if (scope === 'booking_contract') {
    normalizedBookingId = text(bookingId ?? raw?.bookingId, 120, 'v51_withdrawal_booking_required');
    const existing = await client.query(
      `SELECT id FROM v51_withdrawals
        WHERE booking_id = $1 AND user_id = $2 AND scope = 'booking_contract'
        ORDER BY submitted_at DESC LIMIT 1`,
      [normalizedBookingId, actor.id],
    );
    if (existing.rowCount) {
      return shapeWithdrawal(client, existing.rows[0].id, actor.id, { replayed: true });
    }
    const booking = await client.query(
      `SELECT booking.id, booking.owner_id, booking.renter_id,
              booking.status, booking.workflow_status, booking.starts_at,
              booking.ends_at, booking.returned_at, booking.currency,
              booking.rental_subtotal_minor, booking.platform_fee_minor,
              booking.workflow_revision, request.payload,
              contract.id AS platform_contract_id,
              contract.accepted_at AS platform_contract_accepted_at,
              contract.contract_version, contract.locale AS contract_locale,
              withdrawal_document.id AS withdrawal_document_snapshot_id,
              withdrawal_document.document_key AS withdrawal_document_key,
              withdrawal_document.document_version AS withdrawal_document_version,
              withdrawal_document.locale AS withdrawal_document_locale,
              withdrawal_document.content_type AS withdrawal_document_content_type,
              withdrawal_document.content_text AS withdrawal_document_content_text,
              withdrawal_document.content_sha256 AS withdrawal_document_content_sha256
         FROM bookings AS booking
         JOIN rental_requests AS request ON request.id = booking.id
         JOIN platform_contracts AS contract ON contract.booking_id = booking.id
         LEFT JOIN legal_document_snapshots AS withdrawal_document
           ON withdrawal_document.id = contract.imprint_withdrawal_shorttexts_snapshot_id
        WHERE booking.id = $1
        FOR UPDATE OF booking, request`,
      [normalizedBookingId],
    );
    if (!booking.rowCount) throw new V51WithdrawalError(404, 'v51_booking_contract_not_found');
    row = booking.rows[0];
    if (row.renter_id !== actor.id) {
      throw new V51WithdrawalError(403, 'v51_withdrawal_forbidden');
    }
    if (['declined', 'refunded'].includes(row.workflow_status)) {
      throw new V51WithdrawalError(409, 'v51_withdrawal_booking_not_eligible');
    }
    document = contractWithdrawalDocument(row)
      ?? await v51WithdrawalDocument(client, submittedAt);
    effect = evaluateV51WithdrawalEffect({
      workflowStatus: row.workflow_status,
      rentalStartAt: row.starts_at,
      rentalEndAt: row.ends_at,
      confirmedReturnAt: row.returned_at,
      rentalSubtotalMinor: Number(row.rental_subtotal_minor),
      platformFeeMinor: Number(row.platform_fee_minor),
      now: submittedAt,
    });
    rightExpiresAt = new Date(
      new Date(row.platform_contract_accepted_at).getTime()
        + (14 * 24 * 60 * 60 * 1000),
    );
    if (!Number.isFinite(rightExpiresAt.getTime())) {
      throw new V51WithdrawalError(409, 'v51_withdrawal_contract_time_invalid');
    }
    eligibilityStatus = submittedAt <= rightExpiresAt
      ? 'automatic_14_day'
      : 'manual_review_required';
    if (eligibilityStatus === 'manual_review_required') {
      effect = Object.freeze({
        phase: effect.phase,
        bookingWorkflowStatus: row.workflow_status,
        returnRequired: false,
        manualReviewRequired: true,
      });
    }
  }

  if (!document) throw new V51WithdrawalError(409, 'v51_withdrawal_document_unavailable');

  const inserted = await client.query(
    `INSERT INTO v51_withdrawals (
       user_id, scope, platform_contract_id, booking_id,
       withdrawal_document_snapshot_id, actor_name, electronic_channel,
       effect_phase, effect_status, eligibility_status, right_expires_at,
       submitted_at, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (booking_id) WHERE scope = 'booking_contract' DO NOTHING
     RETURNING id`,
    [
      actor.id,
      scope,
      row?.platform_contract_id ?? null,
      normalizedBookingId,
      document.id,
      name,
      electronicChannel,
      effect.phase,
      effect.phase === 'before_handover'
        ? (effect.manualReviewRequired
            ? 'manual_review_required'
            : 'booking_cancelled')
        : (effect.phase === 'after_handover'
            ? (effect.manualReviewRequired
                ? 'manual_review_required'
                : (effect.returnRequired ? 'return_required' : 'return_completed'))
            : 'received'),
      eligibilityStatus,
      rightExpiresAt,
      submittedAt,
      commandKey,
    ],
  );
  if (!inserted.rowCount && normalizedBookingId) {
    const concurrent = await client.query(
      `SELECT id FROM v51_withdrawals
        WHERE booking_id = $1 AND scope = 'booking_contract'
        ORDER BY submitted_at DESC LIMIT 1`,
      [normalizedBookingId],
    );
    if (concurrent.rowCount) {
      return shapeWithdrawal(client, concurrent.rows[0].id, actor.id, { replayed: true });
    }
  }
  const withdrawalId = inserted.rows[0]?.id;
  if (!withdrawalId) throw new V51WithdrawalError(500, 'v51_withdrawal_not_created');

  const refunds = [];
  if (row && !effect.manualReviewRequired) {
    for (const [refundType, refund] of [
      ['rent_refund', effect.rentRefund],
      ['sit_fee_refund', effect.sitFeeRefund],
    ]) {
      const calculationBasis = {
        phase: effect.phase,
        workflowStatusAtWithdrawal: row.workflow_status,
        ...(refund.usedRentMinor == null ? {} : { usedRentMinor: refund.usedRentMinor }),
        ...(refund.confirmedReturnAt == null ? {} : { confirmedReturnAt: refund.confirmedReturnAt }),
      };
      const created = await client.query(
        `INSERT INTO v51_refund_obligations (
           withdrawal_id, booking_id, refund_type, debtor_role, currency,
           status, amount_due_minor, maximum_minor, calculation_basis,
           idempotency_key
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         RETURNING id, refund_type, debtor_role, currency, status,
                   amount_due_minor, maximum_minor, calculation_basis`,
        [
          withdrawalId,
          row.id,
          refundType,
          refund.debtorRole,
          row.currency,
          refund.status,
          refund.amountDueMinor,
          refund.maximumMinor,
          JSON.stringify(calculationBasis),
          `${commandKey}:${refundType}`,
        ],
      );
      refunds.push(publicRefund(created.rows[0]));
    }

    const nextLegacyStatus = effect.bookingWorkflowStatus === 'cancelled'
      ? 'cancelled'
      : (['returned', 'completed'].includes(effect.bookingWorkflowStatus)
          ? row.status
          : 'running');
    await client.query(
      `UPDATE bookings
          SET status = $2, workflow_status = $3,
              workflow_revision = workflow_revision + 1,
              version = version + 1,
              cancelled_at = CASE WHEN $3 = 'cancelled'
                THEN COALESCE(cancelled_at, $4) ELSE cancelled_at END
        WHERE id = $1`,
      [row.id, nextLegacyStatus, effect.bookingWorkflowStatus, submittedAt],
    );
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    payload.status = nextLegacyStatus;
    payload.workflowStatus = effect.bookingWorkflowStatus;
    payload.workflowRevision = Number(row.workflow_revision) + 1;
    payload.platformWithdrawal = {
      id: withdrawalId,
      receivedAt: submittedAt.toISOString(),
      phase: effect.phase,
      returnRequired: effect.returnRequired,
      rentRefund: refunds.find((entry) => entry.type === 'rent_refund'),
      sitFeeRefund: refunds.find((entry) => entry.type === 'sit_fee_refund'),
    };
    await client.query(
      'UPDATE rental_requests SET status = $2, payload = $3::jsonb WHERE id = $1',
      [row.id, nextLegacyStatus, JSON.stringify(payload)],
    );
    await client.query(
      `INSERT INTO booking_events (
         booking_id, actor_id, event_type, from_status, to_status,
         idempotency_key, metadata
       ) VALUES ($1, $2, 'platform.withdrawal_effect_applied', $3, $4, $5, $6::jsonb)`,
      [
        row.id,
        actor.id,
        row.workflow_status,
        effect.bookingWorkflowStatus,
        `${commandKey}:booking-event`,
        JSON.stringify({
          withdrawalId,
          phase: effect.phase,
          returnRequired: effect.returnRequired,
          refundObligationIds: refunds.map((entry) => entry.id),
        }),
      ],
    );
    await enqueueV51WithdrawalNotifications(client, {
      bookingId: row.id,
      withdrawalId,
      eventKey: `withdrawal:${withdrawalId}:received`,
      phase: effect.phase,
      returnRequired: effect.returnRequired,
    });
  } else if (row) {
    await enqueueV51WithdrawalNotifications(client, {
      bookingId: row.id,
      withdrawalId,
      eventKey: `withdrawal:${withdrawalId}:manual-review`,
      phase: effect.phase,
      returnRequired: false,
      manualReviewRequired: true,
    });
  }

  const receiptHtml = renderV51WithdrawalReceipt({
    withdrawalId,
    scope,
    actorName: name,
    bookingId: normalizedBookingId,
    platformContractId: row?.platform_contract_id ?? null,
    submittedAt,
    electronicChannel,
    eligibilityStatus,
    rightExpiresAt: rightExpiresAt?.toISOString() ?? null,
    effect,
    withdrawalDocument: document,
    refunds,
  });
  const artifactSha256 = sha256(receiptHtml);
  const receipt = await client.query(
    `INSERT INTO v51_withdrawal_receipts (
       withdrawal_id, artifact_format, content_html, artifact_sha256,
       generated_at, idempotency_key
     ) VALUES ($1, 'html', $2, $3, $4, $5)
     RETURNING id`,
    [withdrawalId, receiptHtml, artifactSha256, submittedAt, `${commandKey}:receipt`],
  );
  for (const [eventType, suffix] of [
    ['generated', 'generated'],
    ['delivery_attempted', 'available'],
  ]) {
    await client.query(
      `INSERT INTO v51_withdrawal_receipt_events (
         withdrawal_id, event_type, artifact_sha256, delivery_channel,
         occurred_at, idempotency_key, metadata
       ) VALUES ($1, $2, $3, 'in_app_download', $4, $5, $6::jsonb)`,
      [
        withdrawalId,
        eventType,
        artifactSha256,
        submittedAt,
        `${commandKey}:receipt:${suffix}`,
        JSON.stringify({ authenticatedDownload: true }),
      ],
    );
  }
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, 'platform.withdrawal_received', 'withdrawal', $3, $4::jsonb)`,
    [actor.id, actor.role, withdrawalId, JSON.stringify({ scope, bookingId: normalizedBookingId })],
  );

  return Object.freeze({
    withdrawal: Object.freeze({
      id: withdrawalId,
      scope,
      bookingId: normalizedBookingId,
      platformContractId: row?.platform_contract_id ?? null,
      actorName: name,
      electronicChannel,
      effectPhase: effect.phase,
      effectStatus: effect.phase === 'before_handover'
        ? (effect.manualReviewRequired
            ? 'manual_review_required'
            : 'booking_cancelled')
        : (effect.phase === 'after_handover'
            ? (effect.manualReviewRequired
                ? 'manual_review_required'
                : (effect.returnRequired ? 'return_required' : 'return_completed'))
            : 'received'),
      eligibilityStatus,
      rightExpiresAt: rightExpiresAt?.toISOString() ?? null,
      submittedAt: submittedAt.toISOString(),
      receipt: Object.freeze({
        id: receipt.rows[0].id,
        artifactSha256,
        downloadPath: `/v1/withdrawals/${encodeURIComponent(withdrawalId)}/receipt`,
      }),
    }),
    booking: row ? Object.freeze({
      id: row.id,
      ownerId: row.owner_id,
      renterId: row.renter_id,
      status: effect.bookingWorkflowStatus === 'cancelled' ? 'cancelled' : row.status,
      workflowStatus: effect.bookingWorkflowStatus,
    }) : null,
    rentRefund: refunds.find((entry) => entry.type === 'rent_refund') ?? null,
    sitFeeRefund: refunds.find((entry) => entry.type === 'sit_fee_refund') ?? null,
    replayed: false,
  });
}

export async function settleV51WithdrawalRefundAtReturn(client, {
  bookingId,
  confirmedReturnAt = new Date(),
  idempotencyKey,
}) {
  const commandKey = key(idempotencyKey);
  const result = await client.query(
    `SELECT obligation.id AS obligation_id, obligation.withdrawal_id,
            obligation.maximum_minor, booking.starts_at, booking.ends_at,
            booking.rental_subtotal_minor, booking.platform_fee_minor,
            booking.workflow_status
       FROM v51_refund_obligations AS obligation
       JOIN v51_withdrawals AS withdrawal ON withdrawal.id = obligation.withdrawal_id
       JOIN bookings AS booking ON booking.id = obligation.booking_id
      WHERE obligation.booking_id = $1
        AND obligation.refund_type = 'rent_refund'
        AND obligation.status = 'calculation_pending'
        AND withdrawal.effect_phase = 'after_handover'
        AND NOT EXISTS (
          SELECT 1 FROM v51_refund_obligation_events AS event
           WHERE event.obligation_id = obligation.id
             AND event.event_type = 'calculation_completed'
        )
      ORDER BY withdrawal.submitted_at DESC
      LIMIT 1
      FOR UPDATE OF obligation`,
    [bookingId],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  const effect = evaluateV51WithdrawalEffect({
    workflowStatus: row.workflow_status,
    rentalStartAt: row.starts_at,
    rentalEndAt: row.ends_at,
    confirmedReturnAt,
    rentalSubtotalMinor: Number(row.rental_subtotal_minor),
    platformFeeMinor: Number(row.platform_fee_minor),
    now: confirmedReturnAt,
  });
  const refund = effect.rentRefund;
  const basis = {
    phase: 'after_handover',
    confirmedReturnAt: refund.confirmedReturnAt,
    usedRentMinor: refund.usedRentMinor,
    source: 'verified_return_transition',
  };
  await client.query(
    `INSERT INTO v51_refund_obligation_events (
       obligation_id, event_type, amount_due_minor, calculation_basis,
       occurred_at, idempotency_key
     ) VALUES ($1, 'calculation_completed', $2, $3::jsonb, $4, $5)
     ON CONFLICT (obligation_id, event_type) DO NOTHING`,
    [
      row.obligation_id,
      refund.amountDueMinor,
      JSON.stringify(basis),
      confirmedReturnAt,
      `${commandKey}:withdrawal-rent-refund`,
    ],
  );
  const shaped = {
    id: row.obligation_id,
    type: 'rent_refund',
    debtorRole: 'owner',
    status: 'required',
    amountDueMinor: refund.amountDueMinor,
    maximumMinor: Number(row.maximum_minor),
    calculationBasis: basis,
  };
  await client.query(
    `UPDATE rental_requests
        SET payload = jsonb_set(
          COALESCE(payload, '{}'::jsonb),
          '{platformWithdrawal,rentRefund}', $2::jsonb, true
        )
      WHERE id = $1 AND payload ? 'platformWithdrawal'`,
    [bookingId, JSON.stringify(shaped)],
  );
  await client.query(
    `INSERT INTO booking_events (
       booking_id, event_type, from_status, to_status,
       idempotency_key, metadata
     ) VALUES ($1, 'platform.withdrawal_refund_calculated', $2, 'returned',
               $3, $4::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      bookingId,
      row.workflow_status,
      `${commandKey}:withdrawal-refund-event`,
      JSON.stringify({
        withdrawalId: row.withdrawal_id,
        obligationId: row.obligation_id,
        amountDueMinor: refund.amountDueMinor,
      }),
    ],
  );
  return Object.freeze(shaped);
}

export async function getV51WithdrawalReceipt(client, {
  actorId,
  withdrawalId,
  deliveredAt = new Date(),
}) {
  const result = await client.query(
    `SELECT receipt.id, receipt.content_html, receipt.artifact_sha256
       FROM v51_withdrawal_receipts AS receipt
       JOIN v51_withdrawals AS withdrawal ON withdrawal.id = receipt.withdrawal_id
      WHERE withdrawal.id = $1 AND withdrawal.user_id = $2`,
    [withdrawalId, actorId],
  );
  if (!result.rowCount) throw new V51WithdrawalError(404, 'v51_withdrawal_receipt_not_found');
  const receipt = result.rows[0];
  if (sha256(receipt.content_html) !== receipt.artifact_sha256) {
    throw new V51WithdrawalError(409, 'v51_withdrawal_receipt_integrity_failed');
  }
  await client.query(
    `INSERT INTO v51_withdrawal_receipt_events (
       withdrawal_id, event_type, artifact_sha256, delivery_channel,
       occurred_at, idempotency_key, metadata
     ) VALUES ($1, 'delivered', $2, 'in_app_download', $3, $4, $5::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      withdrawalId,
      receipt.artifact_sha256,
      deliveredAt,
      `${withdrawalId}:receipt:first-download`,
      JSON.stringify({ authenticated: true }),
    ],
  );
  return Object.freeze({
    contentHtml: receipt.content_html,
    artifactSha256: receipt.artifact_sha256,
  });
}
