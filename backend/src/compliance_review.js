import { moderationIdempotencyKey } from './moderation_domain.js';

export const professionalReviewThresholdMinor = 500_000;

export class ComplianceReviewError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function text(value, maximum = 8000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function nonNegativeMinor(value, code) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new ComplianceReviewError(400, code);
  }
  return amount;
}

export function evaluateProfessionalReviewTrigger({
  receivedPlatformFeeMinor,
  refundedPlatformFeeMinor,
  reserveAttestation = null,
  incidentTrigger = null,
}) {
  const received = nonNegativeMinor(
    receivedPlatformFeeMinor,
    'compliance_received_fee_invalid',
  );
  const refunded = nonNegativeMinor(
    refundedPlatformFeeMinor,
    'compliance_refunded_fee_invalid',
  );
  const netReceived = Math.max(0, received - refunded);
  const thresholdReached = netReceived >= professionalReviewThresholdMinor;
  const reserveDue = reserveAttestation
    ? nonNegativeMinor(reserveAttestation.operationsDueMinor, 'compliance_operations_due_invalid')
      + nonNegativeMinor(reserveAttestation.taxDueMinor, 'compliance_tax_due_invalid')
      + nonNegativeMinor(reserveAttestation.refundDueMinor, 'compliance_refund_due_invalid')
    : null;
  const reserveAvailable = reserveAttestation
    ? nonNegativeMinor(
        reserveAttestation.availableReserveMinor,
        'compliance_available_reserve_invalid',
      )
    : null;
  const reservesCovered = reserveDue !== null
    && reserveAvailable !== null
    && reserveAvailable >= reserveDue;
  const reviewRequired = Boolean(incidentTrigger)
    || (thresholdReached && reservesCovered);
  let status = 'monitoring';
  if (incidentTrigger) status = 'professional_review_required_earlier_incident';
  else if (reviewRequired) status = 'professional_review_required';
  else if (thresholdReached) status = 'threshold_reached_reserve_evidence_open';
  return Object.freeze({
    status,
    currency: 'EUR',
    thresholdMinor: professionalReviewThresholdMinor,
    receivedPlatformFeeMinor: received,
    refundedPlatformFeeMinor: refunded,
    netReceivedPlatformFeeMinor: netReceived,
    thresholdReached,
    reserveEvidencePresent: reserveAttestation !== null,
    reserveDueMinor: reserveDue,
    reserveAvailableMinor: reserveAvailable,
    reservesCovered,
    earlierIncidentTriggerPresent: Boolean(incidentTrigger),
    reviewRequired,
    activationAllowed: false,
    professionalReviewCompleted: false,
  });
}

async function audit(client, { actor, action, resourceType, resourceId, metadata = {} }) {
  await client.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actor.id, actor.role, action, resourceType, resourceId, JSON.stringify(metadata)],
  );
}

export async function getProfessionalReviewStatus(client) {
  const fees = await client.query(
    `SELECT
       COALESCE(sum(payment.platform_fee_minor), 0)::bigint AS received_platform_fee_minor,
       COALESCE((
         SELECT sum(refund.platform_share_minor)
           FROM refunds AS refund
           JOIN payments AS refunded_payment ON refunded_payment.id = refund.payment_id
          WHERE refund.status = 'succeeded'
            AND refund.livemode = true
            AND refunded_payment.livemode = true
       ), 0)::bigint AS refunded_platform_fee_minor
     FROM payments AS payment
     WHERE payment.livemode = true
       AND payment.status IN ('captured', 'partially_refunded', 'refunded')
       AND payment.captured_minor = payment.amount_minor`,
  );
  const reserve = await client.query(
    `SELECT * FROM compliance_reserve_attestations
     WHERE currency = 'EUR'
     ORDER BY recorded_at DESC, id DESC LIMIT 1`,
  );
  const incident = await client.query(
    `SELECT id, reason_code, evidence_reference, recorded_at
     FROM compliance_professional_review_incidents
     ORDER BY recorded_at DESC, id DESC LIMIT 1`,
  );
  const feeRow = fees.rows[0] ?? {};
  const reserveRow = reserve.rows[0];
  const incidentRow = incident.rows[0];
  return Object.freeze({
    ...evaluateProfessionalReviewTrigger({
      receivedPlatformFeeMinor: Number(feeRow.received_platform_fee_minor ?? 0),
      refundedPlatformFeeMinor: Number(feeRow.refunded_platform_fee_minor ?? 0),
      reserveAttestation: reserveRow
        ? {
            operationsDueMinor: Number(reserveRow.operations_due_minor),
            taxDueMinor: Number(reserveRow.tax_due_minor),
            refundDueMinor: Number(reserveRow.refund_due_minor),
            availableReserveMinor: Number(reserveRow.available_reserve_minor),
          }
        : null,
      incidentTrigger: incidentRow ?? null,
    }),
    reserveAttestation: reserveRow
      ? Object.freeze({
          id: reserveRow.id,
          evidenceReference: reserveRow.evidence_reference,
          recordedAt: new Date(reserveRow.recorded_at).toISOString(),
        })
      : null,
    incidentTrigger: incidentRow
      ? Object.freeze({
          id: incidentRow.id,
          reasonCode: incidentRow.reason_code,
          evidenceReference: incidentRow.evidence_reference,
          recordedAt: new Date(incidentRow.recorded_at).toISOString(),
        })
      : null,
  });
}

export async function recordComplianceReserveAttestation(client, {
  actor,
  raw,
  idempotencyKey,
}) {
  if (actor.role !== 'admin') throw new ComplianceReviewError(403, 'admin_role_required');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ComplianceReviewError(400, 'compliance_reserve_attestation_invalid');
  }
  const currency = text(raw.currency, 3).toUpperCase();
  if (currency !== 'EUR') throw new ComplianceReviewError(400, 'compliance_reserve_currency_must_be_eur');
  const values = {
    operationsDueMinor: nonNegativeMinor(raw.operationsDueMinor, 'compliance_operations_due_invalid'),
    taxDueMinor: nonNegativeMinor(raw.taxDueMinor, 'compliance_tax_due_invalid'),
    refundDueMinor: nonNegativeMinor(raw.refundDueMinor, 'compliance_refund_due_invalid'),
    availableReserveMinor: nonNegativeMinor(raw.availableReserveMinor, 'compliance_available_reserve_invalid'),
  };
  const evidenceReference = text(raw.evidenceReference, 500);
  if (evidenceReference.length < 3) {
    throw new ComplianceReviewError(400, 'compliance_reserve_evidence_required');
  }
  const key = moderationIdempotencyKey(idempotencyKey, 'compliance.reserve.attestation');
  const existing = await client.query(
    'SELECT * FROM compliance_reserve_attestations WHERE idempotency_key = $1',
    [key],
  );
  if (existing.rowCount) return { attestationId: existing.rows[0].id, replayed: true };
  const inserted = await client.query(
    `INSERT INTO compliance_reserve_attestations (
       recorded_by, currency, operations_due_minor, tax_due_minor,
       refund_due_minor, available_reserve_minor, evidence_reference,
       idempotency_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      actor.id,
      currency,
      values.operationsDueMinor,
      values.taxDueMinor,
      values.refundDueMinor,
      values.availableReserveMinor,
      evidenceReference,
      key,
    ],
  );
  await audit(client, {
    actor,
    action: 'compliance.reserve_attested',
    resourceType: 'compliance_reserve_attestation',
    resourceId: inserted.rows[0].id,
    metadata: {
      currency,
      reservesCovered: values.availableReserveMinor >= (
        values.operationsDueMinor + values.taxDueMinor + values.refundDueMinor
      ),
    },
  });
  return { attestationId: inserted.rows[0].id, replayed: false };
}

export async function recordProfessionalReviewIncident(client, {
  actor,
  raw,
  idempotencyKey,
}) {
  if (actor.role !== 'admin') throw new ComplianceReviewError(403, 'admin_role_required');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ComplianceReviewError(400, 'professional_review_incident_invalid');
  }
  const reasonCode = text(raw.reasonCode, 120).toLowerCase();
  if (!/^[a-z0-9_.:-]{3,120}$/u.test(reasonCode)) {
    throw new ComplianceReviewError(400, 'professional_review_incident_reason_required');
  }
  const summary = text(raw.summary, 8000);
  const evidenceReference = text(raw.evidenceReference, 500);
  if (summary.length < 3 || evidenceReference.length < 3) {
    throw new ComplianceReviewError(400, 'professional_review_incident_evidence_required');
  }
  const key = moderationIdempotencyKey(idempotencyKey, 'compliance.professional_review.incident');
  const existing = await client.query(
    'SELECT id FROM compliance_professional_review_incidents WHERE idempotency_key = $1',
    [key],
  );
  if (existing.rowCount) return { incidentId: existing.rows[0].id, replayed: true };
  const inserted = await client.query(
    `INSERT INTO compliance_professional_review_incidents (
       recorded_by, reason_code, summary, evidence_reference, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [actor.id, reasonCode, summary, evidenceReference, key],
  );
  await audit(client, {
    actor,
    action: 'compliance.professional_review_incident_recorded',
    resourceType: 'compliance_professional_review_incident',
    resourceId: inserted.rows[0].id,
    metadata: { reasonCode, activationAllowed: false },
  });
  return { incidentId: inserted.rows[0].id, replayed: false };
}
