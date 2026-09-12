import crypto from 'node:crypto';

import {
  newHumanReadableCaseNumber,
  newHumanReadableDsaNoticeNumber,
  newHumanReadableProductSafetyNoticeNumber,
  normalizeDsaNoticeLocatorCompletion,
  normalizeSupportCaseInput,
  normalizeSupportCaseTransition,
  SupportCaseError,
  supportCaseStatuses,
  supportCaseIdempotencyKey,
  supportOwnerRoles,
  supportPriorities,
} from './support_case_domain.js';
import { normalizeSupportPrivacyRightsRequest } from './support_privacy_rights_domain.js';
import { createPrivacyRightsRequestForCase } from './support_privacy_rights_workflow.js';
import { createPrivacyIncidentForCase } from './support_privacy_incident_workflow.js';
import { getSupportAppealForCase } from './support_appeal_workflow.js';
import { verifySupportBreakGlassGrant } from './support_break_glass_workflow.js';
import { shapeSupportMessage } from './support_message_workflow.js';

export { SupportCaseError };

function iso(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

const supportCaseTimeZone = 'Europe/Berlin';

function supportCaseDateTimeDisplay(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: supportCaseTimeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function shapeFinalDecision(row) {
  return Object.freeze({
    decision: row.user_facing_decision,
    effect: row.user_facing_effect,
    reason: row.user_facing_reason,
    implementationResult: row.user_facing_implementation_result,
    redressRoute: row.redress_route,
    implementedAt: iso(row.implemented_at),
    implementedDisplay: supportCaseDateTimeDisplay(row.implemented_at),
    communicatedAt: iso(row.communicated_at),
    timezone: supportCaseTimeZone,
  });
}

export function shapeSupportCase(row, { staff = false, actorId = null, now = new Date() } = {}) {
  const appealConfigured = row.appeal_configured_at != null
    && row.appeal_configured_by != null;
  const deadline = row.appeal_deadline ? new Date(row.appeal_deadline) : null;
  let appealState = 'not_applicable';
  if (row.appeal_id) appealState = 'submitted';
  else if (row.status === 'closed' && !appealConfigured) appealState = 'unconfigured';
  else if (row.status === 'closed' && row.appeal_available !== true) appealState = 'unavailable';
  else if (row.status === 'closed' && (!deadline || deadline <= now)) appealState = 'expired';
  else if (row.status === 'closed') appealState = 'available';
  const actorMaySubmitAppeal = appealState === 'available'
    && actorId != null
    && row.reporter_user_id === actorId;
  const dsaLocatorVisible = staff
    || (actorId != null && row.reporter_user_id === actorId);
  const dsaLocatorStatus = dsaLocatorVisible
    ? row.dsa_notice_locator_status ?? null
    : null;
  const base = {
    id: row.id,
    caseNumber: row.human_readable_case_number,
    dsaNoticeNumber: row.dsa_notice_number ?? null,
    dsaNoticeLocatorStatus: dsaLocatorStatus,
    dsaNoticeLocatorPrompt: dsaLocatorStatus === 'needs_clarification'
      ? 'Bitte ergänze einen exakten Fundort: eine vollständige http(s)-URL oder eine zur Inhaltsart passende Referenz.'
      : null,
    dsaNoticeLocatorMaySubmit: actorId != null
      && row.reporter_user_id === actorId
      && dsaLocatorStatus === 'needs_clarification',
    productSafetyNoticeNumber: row.product_safety_notice_number ?? null,
    productSafetyTriageDueAt: iso(row.product_safety_triage_due_at),
    productSafetyTriageDueDisplay: supportCaseDateTimeDisplay(
      row.product_safety_triage_due_at,
    ),
    caseType: row.case_type,
    caseSubType: row.case_subtype,
    status: row.status,
    priority: row.priority,
    sourceChannel: row.source_channel,
    operatingMode: row.operating_mode,
    locale: row.locale,
    linkedBookingId: row.linked_booking_id ?? null,
    linkedListingId: row.linked_listing_id ?? null,
    feedbackContext: row.feedback_context ?? null,
    waitingOn: row.waiting_on,
    nextAction: row.next_action ?? null,
    nextUpdateAt: iso(row.next_update_at),
    nextUpdateDisplay: supportCaseDateTimeDisplay(row.next_update_at),
    userActionDueAt: row.status === 'waiting_for_user' ? iso(row.evidence_due_at) : null,
    userActionDueDisplay: row.status === 'waiting_for_user'
      ? supportCaseDateTimeDisplay(row.evidence_due_at)
      : null,
    timezone: supportCaseTimeZone,
    userFacingSummary: row.user_facing_summary,
    finalDecisionAvailable: ['resolved', 'closed', 'reopened'].includes(row.status)
      && row.decision_id != null,
    appealConfigurationRecorded: appealConfigured,
    appealState,
    appealAvailable: actorMaySubmitAppeal,
    appealDeadline: iso(row.appeal_deadline),
    appealDeadlineDisplay: supportCaseDateTimeDisplay(row.appeal_deadline),
    closureReason: row.closure_reason ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    resolvedAt: iso(row.resolved_at),
    closedAt: iso(row.closed_at),
    version: Number(row.lock_version),
  };
  if (!staff) return Object.freeze(base);
  return Object.freeze({
    ...base,
    severity: row.severity,
    reporterUserId: row.reporter_user_id,
    reporterRole: row.reporter_role,
    affectedUserIds: row.affected_user_ids ?? [],
    linkedPaymentId: row.linked_payment_id ?? null,
    linkedRefundId: row.linked_refund_id ?? null,
    linkedPayoutId: row.linked_payout_id ?? null,
    currentOwnerId: row.current_owner_id ?? null,
    currentOwnerRole: row.current_owner_role,
    escalationTargetRole: row.escalation_target_role ?? null,
    approvalLevel: row.approval_level,
    waitingReason: row.waiting_reason ?? null,
    responseDueAt: iso(row.response_due_at),
    evidenceDueAt: iso(row.evidence_due_at),
    internalSummary: row.internal_summary ?? null,
    productSafetyEvidence: row.product_safety_evidence ?? null,
    flags: Object.freeze({
      safety: row.safety_flag === true,
      privacy: row.privacy_flag === true,
      dsa: row.dsa_flag === true,
      authority: row.authority_flag === true,
      article18Candidate: row.article18_candidate_flag === true,
      money: row.money_flag === true,
      accountTakeover: row.account_takeover_flag === true,
    }),
    policySnapshotId: row.policy_snapshot_id ?? null,
    decisionId: row.decision_id ?? null,
    implementationPendingAction: row.implementation_pending_action ?? null,
    resolutionReference: row.resolution_reference ?? null,
    reopenReason: row.reopen_reason ?? null,
  });
}

function shapeSupportEvent(row, { staff = false } = {}) {
  const event = {
    id: row.id,
    eventType: row.event_type,
    fromStatus: row.from_status ?? null,
    toStatus: row.to_status ?? null,
    createdAt: iso(row.created_at),
  };
  if (!staff) return Object.freeze(event);
  return Object.freeze({
    ...event,
    actorType: row.actor_type,
    actorId: row.actor_id ?? null,
    transitionReason: row.transition_reason ?? null,
    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
    correlationId: row.correlation_id ?? null,
    structuredPayload: row.structured_payload ?? {},
    automationUsed: row.automation_used === true,
    modelVersion: row.model_version ?? null,
    templateVersion: row.template_version ?? null,
    approvalId: row.approval_id ?? null,
    visibility: row.visibility,
    sourceSystem: row.source_system,
  });
}

async function writeAudit(client, { actor, action, resourceId, metadata = {} }) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, $3, 'support_case', $4, $5::jsonb)`,
    [
      actor?.id ?? null,
      actor?.role ?? 'system',
      action,
      resourceId,
      JSON.stringify(metadata),
    ],
  );
}

async function validateSupportLinks(client, actorId, links) {
  const result = await client.query(
    `SELECT
       CASE WHEN $2::text IS NULL THEN true ELSE EXISTS (
         SELECT 1 FROM bookings
          WHERE id = $2 AND (owner_id = $1 OR renter_id = $1)
            AND ($3::text IS NULL OR listing_id = $3)
       ) END AS booking_allowed,
       CASE WHEN $3::text IS NULL THEN true ELSE EXISTS (
         SELECT 1 FROM listings WHERE id = $3
       ) END AS listing_exists,
       CASE WHEN $4::uuid IS NULL THEN true ELSE EXISTS (
         SELECT 1 FROM payments AS payment
         JOIN bookings AS booking ON booking.id = payment.booking_id
         WHERE payment.id = $4 AND (booking.owner_id = $1 OR booking.renter_id = $1)
           AND ($2::text IS NULL OR booking.id = $2)
           AND ($3::text IS NULL OR booking.listing_id = $3)
       ) END AS payment_allowed,
       CASE WHEN $5::uuid IS NULL THEN true ELSE EXISTS (
         SELECT 1 FROM refunds AS refund
         JOIN payments AS payment ON payment.id = refund.payment_id
         JOIN bookings AS booking ON booking.id = payment.booking_id
         WHERE refund.id = $5 AND (booking.owner_id = $1 OR booking.renter_id = $1)
           AND ($2::text IS NULL OR booking.id = $2)
           AND ($3::text IS NULL OR booking.listing_id = $3)
           AND ($4::uuid IS NULL OR payment.id = $4)
       ) END AS refund_allowed,
       CASE WHEN $6::uuid IS NULL THEN true ELSE EXISTS (
         SELECT 1 FROM payouts AS payout
         JOIN bookings AS booking ON booking.id = payout.booking_id
         WHERE payout.id = $6 AND (booking.owner_id = $1 OR booking.renter_id = $1)
           AND ($2::text IS NULL OR booking.id = $2)
           AND ($3::text IS NULL OR booking.listing_id = $3)
       ) END AS payout_allowed`,
    [
      actorId,
      links.linkedBookingId,
      links.linkedListingId,
      links.linkedPaymentId,
      links.linkedRefundId,
      links.linkedPayoutId,
    ],
  );
  const allowed = result.rows[0] ?? {};
  for (const [field, code] of [
    ['booking_allowed', 'support_linked_booking_forbidden'],
    ['listing_exists', 'support_linked_listing_not_found'],
    ['payment_allowed', 'support_linked_payment_forbidden'],
    ['refund_allowed', 'support_linked_refund_forbidden'],
    ['payout_allowed', 'support_linked_payout_forbidden'],
  ]) {
    if (allowed[field] !== true) throw new SupportCaseError(403, code);
  }
}

export async function createSupportCase(client, {
  actor,
  raw,
  idempotencyKey,
  nextUpdateAt,
  sourceChannel = 'app',
  operatingMode = 'simulation',
  specializedIntakeAuthority = null,
  now = new Date(),
}) {
  if (!actor?.id || !['user', 'support', 'admin'].includes(actor.role)) {
    throw new SupportCaseError(403, 'support_case_reporter_forbidden');
  }
  const key = supportCaseIdempotencyKey(idempotencyKey, 'support.case.create');
  const existing = await client.query(
    `SELECT * FROM support_cases
      WHERE reporter_user_id = $1 AND idempotency_key = $2`,
    [actor.id, key],
  );
  if (existing.rowCount) {
    return {
      supportCase: shapeSupportCase(existing.rows[0], {
        staff: actor.role !== 'user',
        actorId: actor.id,
        now,
      }),
      replayed: true,
    };
  }
  const normalized = normalizeSupportCaseInput(raw, {
    sourceChannel,
    operatingMode,
    specializedIntakeAuthority,
    nextUpdateAt,
    now,
  });
  const privacyRightsRequest = normalizeSupportPrivacyRightsRequest(
    raw.privacyRightsRequest,
    {
      caseType: normalized.caseType,
      caseSubType: normalized.caseSubType,
    },
  );
  await validateSupportLinks(client, actor.id, normalized);
  if (normalized.accountTakeoverFlag) {
    const target = await client.query(
      `SELECT id FROM users
        WHERE id = $1 AND deactivated_at IS NULL
        FOR UPDATE`,
      [actor.id],
    );
    if (!target.rowCount) {
      throw new SupportCaseError(409, 'support_case_reporter_account_unavailable');
    }
  }

  let dsaNoticeNumber = null;
  let dsaNoticeEvidence = null;
  let dsaNoticeLocatorStatus = null;
  let dsaNoticeLocatorKind = null;
  if (normalized.dsaNotice) {
    const reporter = await client.query(
      `SELECT email,
              NULLIF(BTRIM(profile ->> 'displayName'), '') AS display_name
         FROM users
        WHERE id = $1`,
      [actor.id],
    );
    const reporterEmail = reporter.rows[0]?.email?.trim();
    const reporterName = reporter.rows[0]?.display_name?.trim();
    if (!reporterEmail || !reporterName) {
      throw new SupportCaseError(
        409,
        'support_dsa_notice_reporter_identity_incomplete',
      );
    }
    dsaNoticeNumber = newHumanReadableDsaNoticeNumber();
    const {
      locatorStatus,
      locatorKind,
      ...noticeEvidence
    } = normalized.dsaNotice;
    dsaNoticeLocatorStatus = locatorStatus;
    dsaNoticeLocatorKind = locatorKind;
    dsaNoticeEvidence = Object.freeze({
      ...noticeEvidence,
      reporterName,
      reporterEmail,
      sourceChannel: normalized.sourceChannel,
      submittedAt: now.toISOString(),
    });
  }

  let productSafetyNoticeNumber = null;
  let productSafetyEvidence = null;
  let productSafetyTriageDueAt = null;
  if (normalized.productSafetyNotice) {
    productSafetyNoticeNumber = newHumanReadableProductSafetyNoticeNumber();
    productSafetyEvidence = Object.freeze({
      ...normalized.productSafetyNotice,
      sourceChannel: normalized.sourceChannel,
      submittedAt: now.toISOString(),
    });
    productSafetyTriageDueAt = normalized.nextUpdateAt;
  }

  const id = crypto.randomUUID();
  const caseNumber = newHumanReadableCaseNumber();
  const inserted = await client.query(
    `INSERT INTO support_cases (
       id, human_readable_case_number, case_type, case_subtype, status,
       priority, severity, source_channel, operating_mode, locale,
       reporter_user_id, reporter_role, current_owner_role, approval_level,
       waiting_on, waiting_reason, next_action, next_update_at,
       user_facing_summary, safety_flag, privacy_flag, dsa_flag,
       authority_flag, article18_candidate_flag, money_flag,
       account_takeover_flag,
       linked_booking_id, linked_listing_id, linked_payment_id,
       linked_refund_id, linked_payout_id, idempotency_key,
       intake_scope_evidence, dsa_notice_number, dsa_notice_evidence,
       dsa_notice_locator_status, dsa_notice_locator_kind,
       created_at, updated_at, product_safety_notice_number,
       product_safety_evidence, product_safety_triage_due_at,
       feedback_context
     ) VALUES (
       $1, $2, $3, $4, 'received',
       $5, $6, $7, $8, $9,
       $10, $11, $12, $13,
       $14, $15, $16, $17,
       $18, $19, $20, $21,
       $22, $23, $24, $25,
       $26, $27, $28,
       $29, $30, $31,
       $32::jsonb, $33, $34::jsonb,
       $35, $36,
       $37, $37, $38, $39::jsonb, $40,
       $41::jsonb
     ) ON CONFLICT (reporter_user_id, idempotency_key) DO NOTHING
     RETURNING *`,
    [
      id,
      caseNumber,
      normalized.caseType,
      normalized.caseSubType,
      normalized.priority,
      normalized.severity,
      normalized.sourceChannel,
      normalized.operatingMode,
      normalized.locale,
      actor.id,
      actor.role,
      normalized.ownerRole,
      normalized.approvalLevel,
      dsaNoticeLocatorStatus === 'needs_clarification'
        ? 'reporter'
        : normalized.waitingOn,
      dsaNoticeLocatorStatus === 'needs_clarification'
        ? 'Für die sorgfältige DSA-Prüfung fehlt ein exakter elektronischer Fundort.'
        : normalized.waitingReason,
      dsaNoticeLocatorStatus === 'needs_clarification'
        ? 'Bitte ergänze eine vollständige http(s)-URL oder eine zur Inhaltsart passende Referenz.'
        : normalized.nextAction,
      normalized.nextUpdateAt,
      normalized.userFacingSummary,
      normalized.safetyFlag,
      normalized.privacyFlag,
      normalized.dsaFlag,
      normalized.authorityFlag,
      normalized.article18CandidateFlag,
      normalized.moneyFlag,
      normalized.accountTakeoverFlag,
      normalized.linkedBookingId,
      normalized.linkedListingId,
      normalized.linkedPaymentId,
      normalized.linkedRefundId,
      normalized.linkedPayoutId,
      key,
      JSON.stringify(normalized.issueScope),
      dsaNoticeNumber,
      dsaNoticeEvidence == null ? null : JSON.stringify(dsaNoticeEvidence),
      dsaNoticeLocatorStatus,
      dsaNoticeLocatorKind,
      now,
      productSafetyNoticeNumber,
      productSafetyEvidence == null ? null : JSON.stringify(productSafetyEvidence),
      productSafetyTriageDueAt,
      normalized.feedbackContext == null
        ? null
        : JSON.stringify(normalized.feedbackContext),
    ],
  );
  if (!inserted.rowCount) {
    const concurrentReplay = await client.query(
      `SELECT * FROM support_cases
        WHERE reporter_user_id = $1 AND idempotency_key = $2`,
      [actor.id, key],
    );
    if (!concurrentReplay.rowCount) {
      throw new SupportCaseError(409, 'support_case_concurrent_replay_unavailable');
    }
    return {
      supportCase: shapeSupportCase(concurrentReplay.rows[0], {
        staff: actor.role !== 'user',
        actorId: actor.id,
        now,
      }),
      replayed: true,
    };
  }
  let invalidatedEmailResetTokens = 0;
  if (normalized.accountTakeoverFlag) {
    const invalidated = await client.query(
      `UPDATE auth_action_tokens
       SET consumed_at = COALESCE(consumed_at, $2)
       WHERE user_id = $1
         AND kind = 'reset_password'
         AND consumed_at IS NULL
       RETURNING id`,
      [actor.id, now],
    );
    invalidatedEmailResetTokens = invalidated.rowCount;
  }
  await createPrivacyRightsRequestForCase(client, {
    caseRecord: inserted.rows[0],
    privacyRightsRequest,
    subjectUserId: actor.id,
    now,
  });
  await createPrivacyIncidentForCase(client, {
    caseRecord: inserted.rows[0],
    now,
  });
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, to_status,
       transition_reason, structured_payload, automation_used, visibility,
       idempotency_key, source_system, created_at
     ) VALUES (
       $1, 'case.created', $2, $3, 'received',
       'Supportfall eingegangen', $4::jsonb, false, 'user_visible',
       $5, 'sit-api', $6
     )`,
    [
      id,
      actor.role,
      actor.id,
      JSON.stringify({
        caseType: normalized.caseType,
        caseSubType: normalized.caseSubType,
        priority: normalized.priority,
        operatingMode: normalized.operatingMode,
        safetyTriage: normalized.safetyTriage,
        issueScope: normalized.issueScope,
        ...(dsaNoticeEvidence == null ? {} : {
          dsaNotice: {
            noticeNumber: dsaNoticeNumber,
            version: dsaNoticeEvidence.version,
            contentType: dsaNoticeEvidence.contentType,
            locatorStatus: dsaNoticeLocatorStatus,
            locatorKind: dsaNoticeLocatorKind,
          },
        }),
        ...(productSafetyEvidence == null ? {} : {
          productSafetyNotice: {
            noticeNumber: productSafetyNoticeNumber,
            version: productSafetyEvidence.version,
            contactPointVersion: productSafetyEvidence.contactPointVersion,
            issueKind: productSafetyEvidence.issueKind,
            triageDueAt: productSafetyTriageDueAt.toISOString(),
          },
        }),
        ...(normalized.feedbackContext == null ? {} : {
          feedbackContext: normalized.feedbackContext,
        }),
        ...(privacyRightsRequest == null ? {} : {
          privacyRightsRequest: {
            version: privacyRightsRequest.version,
            requestKind: privacyRightsRequest.requestKind,
            identityStatus: 'pending',
            deadlineShiftedByIdentityVerification: false,
            disclosureAllowed: false,
            erasureExecutionAllowed: false,
          },
        }),
      }),
      `${key}:event`,
      now,
    ],
  );
  await writeAudit(client, {
    actor,
    action: 'support.case_created',
    resourceId: id,
    metadata: {
      caseType: normalized.caseType,
      caseSubType: normalized.caseSubType,
      priority: normalized.priority,
      operatingMode: normalized.operatingMode,
      safetyTriageVersion: normalized.safetyTriage.version,
      safetyGuidanceShown: normalized.safetyTriage.guidanceShown,
      ...(normalized.article18CandidateFlag ? { article18Candidate: true } : {}),
      issueScopeVersion: normalized.issueScope.version,
      separationGuidanceShown: normalized.issueScope.separationGuidanceShown,
      ...(dsaNoticeEvidence == null ? {} : {
        dsaNoticeNumber,
        dsaNoticeVersion: dsaNoticeEvidence.version,
        dsaNoticeContentType: dsaNoticeEvidence.contentType,
        dsaNoticeLocatorStatus,
        dsaNoticeLocatorKind,
      }),
      ...(productSafetyEvidence == null ? {} : {
        productSafetyNoticeNumber,
        productSafetyNoticeVersion: productSafetyEvidence.version,
        productSafetyContactPointVersion: productSafetyEvidence.contactPointVersion,
        productSafetyIssueKind: productSafetyEvidence.issueKind,
        productSafetyTriageDueAt: productSafetyTriageDueAt.toISOString(),
      }),
      ...(normalized.feedbackContext == null ? {} : {
        feedbackContextVersion: normalized.feedbackContext.version,
        feedbackKind: normalized.feedbackContext.feedbackKind,
        feedbackProductArea: normalized.feedbackContext.productArea,
        feedbackNonUrgentConfirmed: true,
      }),
      ...(privacyRightsRequest == null ? {} : {
        privacyRightsRequestVersion: privacyRightsRequest.version,
        privacyRightsRequestKind: privacyRightsRequest.requestKind,
        privacyRightsIdentityStatus: 'pending',
        disclosureAllowed: false,
        erasureExecutionAllowed: false,
      }),
      ...(normalized.accountTakeoverFlag ? {
        compromisedEmailResetBlocked: true,
        invalidatedEmailResetTokens,
      } : {}),
    },
  });
  return {
    supportCase: shapeSupportCase(inserted.rows[0], {
      staff: actor.role !== 'user',
      actorId: actor.id,
      now,
    }),
    replayed: false,
  };
}

export async function completeDsaNoticeLocator(client, {
  actor,
  caseId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (!actor?.id || !['user', 'support', 'admin'].includes(actor.role)) {
    throw new SupportCaseError(403, 'support_dsa_notice_locator_forbidden');
  }
  const key = supportCaseIdempotencyKey(
    idempotencyKey,
    'support.dsa_notice.locator.complete',
  );
  const prior = await client.query(
    `SELECT amendment.case_id, support_case.*
       FROM support_dsa_notice_locator_amendments AS amendment
       JOIN support_cases AS support_case ON support_case.id = amendment.case_id
      WHERE amendment.reporter_user_id = $1
        AND amendment.idempotency_key = $2`,
    [actor.id, key],
  );
  if (prior.rowCount) {
    if (prior.rows[0].case_id.toString() !== caseId) {
      throw new SupportCaseError(409, 'support_idempotency_scope_mismatch');
    }
    return {
      supportCase: shapeSupportCase(prior.rows[0], {
        staff: actor.role !== 'user',
        actorId: actor.id,
        now,
      }),
      replayed: true,
    };
  }

  const current = await client.query(
    `SELECT * FROM support_cases
      WHERE id::text = $1 AND reporter_user_id = $2
      FOR UPDATE`,
    [caseId, actor.id],
  );
  if (!current.rowCount) {
    throw new SupportCaseError(404, 'support_case_not_found');
  }
  const row = current.rows[0];
  if (row.case_type !== 'moderation_content'
      || row.case_subtype !== 'illegal_content_notice'
      || !row.dsa_notice_number
      || !row.dsa_notice_evidence) {
    throw new SupportCaseError(409, 'support_dsa_notice_locator_not_applicable');
  }
  if (row.dsa_notice_locator_status !== 'needs_clarification') {
    const replayAfterLock = await client.query(
      `SELECT 1 FROM support_dsa_notice_locator_amendments
        WHERE case_id = $1 AND reporter_user_id = $2 AND idempotency_key = $3`,
      [row.id, actor.id, key],
    );
    if (replayAfterLock.rowCount) {
      return {
        supportCase: shapeSupportCase(row, {
          staff: actor.role !== 'user',
          actorId: actor.id,
          now,
        }),
        replayed: true,
      };
    }
    throw new SupportCaseError(409, 'support_dsa_notice_locator_already_complete');
  }
  if (['decision_pending_approval', 'decided', 'resolved', 'closed'].includes(row.status)) {
    throw new SupportCaseError(409, 'support_dsa_notice_locator_case_finalizing');
  }
  const normalized = normalizeDsaNoticeLocatorCompletion(raw, {
    contentType: row.dsa_notice_evidence.contentType,
  });
  if (normalized.expectedVersion !== Number(row.lock_version)) {
    throw new SupportCaseError(409, 'support_case_version_conflict', {
      currentVersion: Number(row.lock_version),
    });
  }

  const amendmentId = crypto.randomUUID();
  await client.query(
    `INSERT INTO support_dsa_notice_locator_amendments (
       id, case_id, dsa_notice_number, reporter_user_id, content_locator,
       locator_kind, idempotency_key, submitted_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      amendmentId,
      row.id,
      row.dsa_notice_number,
      actor.id,
      normalized.contentLocator,
      normalized.locatorKind,
      key,
      now,
    ],
  );
  const nextUpdateAt = new Date(now.getTime() + (4 * 60 * 60 * 1000));
  const updated = await client.query(
    `UPDATE support_cases
        SET dsa_notice_locator_status = 'complete',
            dsa_notice_locator_kind = $2,
            waiting_on = 'support_owner',
            waiting_reason = 'Exakter Fundort ergänzt; fachliche Prüfung ausstehend.',
            next_action = 'Ergänzten Fundort sorgfältig und nicht automatisch prüfen.',
            next_update_at = $3,
            lock_version = lock_version + 1,
            updated_at = GREATEST($4, updated_at + INTERVAL '1 microsecond')
      WHERE id = $1
      RETURNING *`,
    [row.id, normalized.locatorKind, nextUpdateAt, now],
  );
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, from_status, to_status,
       transition_reason, entity_type, entity_id, structured_payload,
       automation_used, visibility, idempotency_key, source_system, created_at
     ) VALUES (
       $1, 'dsa_notice.locator_completed', $2, $3, $4, $4,
       'Exakter DSA-Fundort ergänzt', 'dsa_notice_locator_amendment', $5,
       $6::jsonb, false, 'user_visible', $7, 'sit-api', $8
     )`,
    [
      row.id,
      actor.role,
      actor.id,
      row.status,
      amendmentId,
      JSON.stringify({ locatorStatus: 'complete', locatorKind: normalized.locatorKind }),
      `${key}:event`,
      now,
    ],
  );
  await writeAudit(client, {
    actor,
    action: 'support.dsa_notice_locator_completed',
    resourceId: row.id,
    metadata: {
      dsaNoticeNumber: row.dsa_notice_number,
      locatorStatus: 'complete',
      locatorKind: normalized.locatorKind,
      expectedVersion: normalized.expectedVersion,
    },
  });
  return {
    supportCase: shapeSupportCase(updated.rows[0], {
      staff: actor.role !== 'user',
      actorId: actor.id,
      now,
    }),
    replayed: false,
  };
}

export async function transitionSupportCase(client, {
  actor,
  caseId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (!['support', 'admin', 'system'].includes(actor?.role)) {
    throw new SupportCaseError(403, 'support_transition_forbidden');
  }
  const key = supportCaseIdempotencyKey(idempotencyKey, 'support.case.transition');
  const replay = await client.query(
    `SELECT target.*
      FROM support_case_events AS event
       JOIN support_cases AS target ON target.id = event.case_id
      WHERE event.idempotency_key = $1 AND event.case_id::text = $2`,
    [key, caseId],
  );
  if (replay.rowCount) {
    if (actor.role === 'support' && replay.rows[0].current_owner_id !== actor.id) {
      throw new SupportCaseError(403, 'support_case_assignment_required');
    }
    return { supportCase: shapeSupportCase(replay.rows[0], { staff: true }), replayed: true };
  }
  const current = await client.query(
    'SELECT * FROM support_cases WHERE id::text = $1 FOR UPDATE',
    [caseId],
  );
  if (!current.rowCount) throw new SupportCaseError(404, 'support_case_not_found');
  const row = current.rows[0];
  if (actor.role === 'support' && row.current_owner_id !== actor.id) {
    throw new SupportCaseError(403, 'support_case_assignment_required');
  }
  const concurrentReplay = await client.query(
    `SELECT 1 FROM support_case_events
      WHERE case_id = $1 AND idempotency_key = $2`,
    [row.id, key],
  );
  if (concurrentReplay.rowCount) {
    return { supportCase: shapeSupportCase(row, { staff: true }), replayed: true };
  }
  const transition = normalizeSupportCaseTransition(row, raw, {
    actorRole: actor.role,
    now,
  });
  if (transition.currentOwnerId) {
    const owner = await client.query(
      `SELECT id FROM users
        WHERE id = $1 AND role IN ('support', 'admin')
          AND account_status = 'active' AND deactivated_at IS NULL`,
      [transition.currentOwnerId],
    );
    if (!owner.rowCount) throw new SupportCaseError(400, 'support_owner_invalid');
  }
  if (transition.decisionId && transition.status === 'decision_pending_approval') {
    const decision = await client.query(
      `SELECT id FROM support_decisions
        WHERE id = $1 AND case_id = $2 AND approval_status = 'pending'`,
      [transition.decisionId, row.id],
    );
    if (!decision.rowCount) throw new SupportCaseError(409, 'support_decision_draft_unavailable');
  }
  if (transition.decisionId && transition.status === 'decided') {
    const decision = await client.query(
      `SELECT id FROM support_decisions
        WHERE id = $1 AND case_id = $2
          AND approval_status = 'approved'
          AND approved_by IS NOT NULL
          AND approval_payload_sha256 = payload_sha256`,
      [transition.decisionId, row.id],
    );
    if (!decision.rowCount) throw new SupportCaseError(409, 'support_decision_not_approved');
  }
  if (row.status === 'decision_pending_approval' && transition.status === 'under_review') {
    const decision = await client.query(
      `SELECT id FROM support_decisions
        WHERE id = $1 AND case_id = $2
          AND approval_status IN ('rejected', 'superseded')`,
      [row.decision_id, row.id],
    );
    if (!decision.rowCount) throw new SupportCaseError(409, 'support_decision_review_pending');
  }
  if (transition.status === 'resolved') {
    if (!row.decision_id) {
      throw new SupportCaseError(409, 'support_resolution_requires_approved_decision');
    }
    const implementation = await client.query(
      `SELECT id FROM support_decisions
        WHERE id = $1 AND case_id = $2
          AND approval_status = 'approved'
          AND approval_payload_sha256 = payload_sha256
          AND implementation_status = 'succeeded'
          AND implementation_verified_by IS NOT NULL
          AND implementation_verified_at IS NOT NULL
          AND communicated_at IS NOT NULL
          AND communicated_by IS NOT NULL
          AND communication_payload_sha256 = payload_sha256`,
      [row.decision_id, row.id],
    );
    if (!implementation.rowCount) {
      throw new SupportCaseError(409, 'support_decision_publication_not_verified');
    }
  }
  if (transition.status === 'closed' && transition.appealAvailable) {
    const published = await client.query(
      `SELECT id FROM support_decisions
        WHERE id = $1 AND case_id = $2
          AND approval_status = 'approved'
          AND approval_payload_sha256 = payload_sha256
          AND implementation_status = 'succeeded'
          AND implementation_verified_by IS NOT NULL
          AND implementation_verified_at IS NOT NULL
          AND communicated_at IS NOT NULL
          AND communicated_by IS NOT NULL
          AND communication_payload_sha256 = payload_sha256`,
      [row.decision_id, row.id],
    );
    if (!published.rowCount) {
      throw new SupportCaseError(409, 'support_appeal_requires_published_decision');
    }
  }
  if (transition.status === 'closed'
      && transition.closureReason === 'duplicate_merged') {
    const duplicateLink = await client.query(
      `SELECT link.id
         FROM support_case_links AS link
        WHERE link.case_id = $1
          AND link.object_type = 'another_support_case'
          AND link.relation_type = 'duplicate_of'
          AND EXISTS (
            SELECT 1 FROM support_case_events AS event
             WHERE event.case_id = link.case_id
               AND event.entity_type = 'support_case_link'
               AND event.entity_id = link.id::text
               AND event.event_type = 'case.duplicate_link_recorded'
               AND event.visibility = 'user_visible'
          )`,
      [row.id],
    );
    if (!duplicateLink.rowCount) {
      throw new SupportCaseError(409, 'support_duplicate_case_link_required');
    }
  }

  const updated = await client.query(
    `UPDATE support_cases
        SET status = $2,
            waiting_on = $3,
            waiting_reason = $4,
            next_action = $5,
            next_update_at = $6,
            evidence_due_at = $7,
            current_owner_role = $8,
            current_owner_id = $9,
            escalation_target_role = $10,
            decision_id = $11,
            implementation_pending_action = $12,
            resolution_reference = COALESCE($13, resolution_reference),
            closure_reason = $14,
            reopen_reason = $15,
            appeal_available = $16,
            appeal_deadline = $17,
            appeal_configured_at = CASE
              WHEN $2 = 'closed' THEN $18
              ELSE appeal_configured_at
            END,
            appeal_configured_by = CASE
              WHEN $2 = 'closed' THEN $19
              ELSE appeal_configured_by
            END,
            resolved_at = CASE
              WHEN $2 = 'resolved' THEN $18
              WHEN $2 = 'reopened' THEN NULL
              ELSE resolved_at
            END,
            closed_at = CASE
              WHEN $2 = 'closed' THEN $18
              WHEN $2 = 'reopened' THEN NULL
              ELSE closed_at
            END,
            lock_version = lock_version + 1,
            updated_at = $18
      WHERE id = $1 AND lock_version = $20
      RETURNING *`,
    [
      row.id,
      transition.status,
      transition.waitingOn,
      transition.waitingReason,
      transition.nextAction,
      transition.nextUpdateAt,
      transition.userActionDueAt,
      transition.currentOwnerRole,
      transition.currentOwnerId,
      transition.escalationTargetRole,
      transition.decisionId,
      transition.implementationPendingAction,
      transition.resolutionReference,
      transition.closureReason,
      transition.reopenReason,
      transition.appealAvailable,
      transition.appealDeadline,
      now,
      actor.id,
      Number(row.lock_version),
    ],
  );
  if (!updated.rowCount) throw new SupportCaseError(409, 'support_case_version_conflict');
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, from_status, to_status,
       transition_reason, structured_payload, automation_used, visibility,
       idempotency_key, source_system, created_at
     ) VALUES (
       $1, 'case.transitioned', $2, $3, $4, $5,
       $6, $7::jsonb, $8, $9,
       $10, 'sit-api', $11
     )`,
    [
      row.id,
      actor.role === 'system' ? 'system' : actor.role,
      actor.id ?? null,
      row.status,
      transition.status,
      transition.transitionReason,
      JSON.stringify({
        waitingOn: transition.waitingOn,
        currentOwnerRole: transition.currentOwnerRole,
        escalationTargetRole: transition.escalationTargetRole,
        userActionDueAt: transition.userActionDueAt
          ? transition.userActionDueAt.toISOString()
          : null,
        expectedVersion: Number(row.lock_version),
      }),
      actor.role === 'system',
      actor.role === 'system' ? 'internal' : 'user_visible',
      key,
      now,
    ],
  );
  await writeAudit(client, {
    actor,
    action: 'support.case_transitioned',
    resourceId: row.id,
    metadata: {
      fromStatus: row.status,
      toStatus: transition.status,
      userActionDueAt: transition.userActionDueAt
        ? transition.userActionDueAt.toISOString()
        : null,
      expectedVersion: Number(row.lock_version),
    },
  });
  return { supportCase: shapeSupportCase(updated.rows[0], { staff: true }), replayed: false };
}

export async function listMySupportCases(client, actorId) {
  const result = await client.query(
    `SELECT * FROM support_cases
      WHERE reporter_user_id = $1 OR $1 = ANY(affected_user_ids)
      ORDER BY updated_at DESC, id DESC
      LIMIT 200`,
    [actorId],
  );
  return result.rows.map((row) => shapeSupportCase(row, { actorId }));
}

export async function listStaffSupportCases(client, {
  actor,
  status = null,
  priority = null,
  ownerRole = null,
  limit = 100,
} = {}) {
  if (!['support', 'admin'].includes(actor?.role)) {
    throw new SupportCaseError(403, 'support_staff_list_forbidden');
  }
  if (status && !supportCaseStatuses.includes(status)) {
    throw new SupportCaseError(400, 'support_status_invalid');
  }
  if (priority && !supportPriorities.includes(priority)) {
    throw new SupportCaseError(400, 'support_priority_invalid');
  }
  if (ownerRole && !supportOwnerRoles.includes(ownerRole)) {
    throw new SupportCaseError(400, 'support_owner_role_invalid');
  }
  const parsedLimit = Number(limit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
    throw new SupportCaseError(400, 'support_limit_invalid');
  }
  const result = await client.query(
    `SELECT * FROM support_cases
      WHERE ($1::text IS NULL OR status = $1)
        AND ($2::text IS NULL OR priority = $2)
        AND ($3::text IS NULL OR current_owner_role = $3)
        AND ($5::boolean OR current_owner_id = $6)
      ORDER BY priority, next_update_at NULLS LAST, updated_at, id
      LIMIT $4`,
    [status, priority, ownerRole, parsedLimit, actor.role === 'admin', actor.id],
  );
  return result.rows.map((row) => shapeSupportCase(row, { staff: true }));
}

export async function getSupportCase(client, {
  actor,
  caseId,
  staffAccess = false,
  breakGlassToken = null,
  sessionId = null,
  staffElevationId = null,
}) {
  const staff = staffAccess && ['support', 'admin'].includes(actor?.role);
  if (staffAccess && !staff) throw new SupportCaseError(403, 'support_staff_detail_forbidden');
  let result = await client.query(
    `SELECT * FROM support_cases
      WHERE id::text = $1
        AND (
          ($2::boolean AND ($3::boolean OR current_owner_id = $4))
          OR
          (NOT $2::boolean AND (reporter_user_id = $4 OR $4 = ANY(affected_user_ids)))
        )`,
    [caseId, staffAccess, actor?.role === 'admin', actor?.id ?? null],
  );
  let breakGlassGrant = null;
  if (!result.rowCount && staffAccess && actor?.role === 'support') {
    breakGlassGrant = await verifySupportBreakGlassGrant(client, {
      actor,
      sessionId,
      staffElevationId,
      caseId,
      token: breakGlassToken,
    });
    if (breakGlassGrant) {
      result = await client.query(
        'SELECT * FROM support_cases WHERE id::text = $1',
        [caseId],
      );
    }
  }
  if (!result.rowCount) {
    if (staffAccess && actor?.role === 'support') {
      await writeAudit(client, {
        actor,
        action: 'support.case_access_denied',
        resourceId: caseId,
        metadata: {
          accessPath: 'staff_detail',
          reason: 'not_assigned_or_not_found',
        },
      });
    }
    throw new SupportCaseError(404, 'support_case_not_found');
  }
  if (breakGlassGrant) {
    await writeAudit(client, {
      actor,
      action: 'support.break_glass_case_accessed',
      resourceId: result.rows[0].id,
      metadata: {
        accessPath: 'staff_detail_break_glass',
        grantId: breakGlassGrant.id,
        reasonCode: breakGlassGrant.reasonCode,
        reviewDueAt: breakGlassGrant.reviewDueAt,
      },
    });
  }
  const events = await client.query(
    `SELECT * FROM support_case_events
      WHERE case_id = $1
        AND ($2::boolean OR visibility = 'user_visible')
      ORDER BY created_at, id`,
    [result.rows[0].id, staff],
  );
  const messages = await client.query(
    `SELECT * FROM support_messages
      WHERE case_id = $1
        AND ($2::boolean OR (recipient_user_id = $3 AND send_status = 'sent'))
      ORDER BY created_at, id`,
    [result.rows[0].id, staff, actor.id],
  );
  const caseRow = result.rows[0];
  let finalDecision = null;
  if (['resolved', 'closed', 'reopened'].includes(caseRow.status) && caseRow.decision_id) {
    const published = await client.query(
      `SELECT user_facing_decision, user_facing_effect, user_facing_reason,
              user_facing_implementation_result, redress_route,
              implemented_at, communicated_at
         FROM support_decisions
        WHERE id = $1 AND case_id = $2
          AND approval_status = 'approved'
          AND approval_payload_sha256 = payload_sha256
          AND implementation_status = 'succeeded'
          AND implementation_verified_by IS NOT NULL
          AND implementation_verified_at IS NOT NULL
          AND communicated_at IS NOT NULL
          AND communicated_by IS NOT NULL
          AND communication_payload_sha256 = payload_sha256`,
      [caseRow.decision_id, caseRow.id],
    );
    if (!published.rowCount) {
      throw new SupportCaseError(409, 'support_case_final_decision_unavailable');
    }
    finalDecision = shapeFinalDecision(published.rows[0]);
  }
  const appeal = await getSupportAppealForCase(client, {
    actor,
    supportCase: caseRow,
    staff,
  });
  return Object.freeze({
    supportCase: shapeSupportCase(caseRow, { staff, actorId: actor.id }),
    finalDecision,
    appeal,
    messages: messages.rows.map((row) => shapeSupportMessage(row, { staff })),
    events: events.rows.map((row) => shapeSupportEvent(row, { staff })),
  });
}
