import crypto from 'node:crypto';

export const bookingGroupEvidenceSlots = Object.freeze([
  'overview',
  'detail',
  'accessories',
  'critical',
]);

export const bookingGroupHandoverPolicies = Object.freeze({
  evidence: 'v52_item_specific_four_slots_v1',
  chat: 'v52_item_booking_threads_only',
  timers: 'v52_item_booking_timers_only',
  address: 'v52_exact_address_in_item_thread_only',
});

function iso(value, code) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(code);
  return parsed.toISOString();
}

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (!value || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, freeze(entry)]),
  ));
}

export function buildSharedBookingGroupAppointments(candidate, {
  idFactory = crypto.randomUUID,
} = {}) {
  const shared = {
    bookingGroupId: candidate.bookingGroupId,
    groupQuoteId: candidate.groupQuoteId,
    groupQuoteHash: candidate.groupQuoteHash,
    timezone: candidate.timezone,
    handoverLocationKey: candidate.handoverLocationKey,
    createdById: candidate.createdById,
    commandKey: candidate.commandKey,
    policies: bookingGroupHandoverPolicies,
  };
  return freeze([
    {
      ...shared,
      id: `booking_group_appointment_${idFactory()}`,
      appointmentType: 'pickup',
      scheduledAt: iso(candidate.startsAt, 'invalid_booking_group_pickup_time'),
    },
    {
      ...shared,
      id: `booking_group_appointment_${idFactory()}`,
      appointmentType: 'return',
      scheduledAt: iso(candidate.endsAt, 'invalid_booking_group_return_time'),
    },
  ]);
}

export function deriveBookingGroupOperationalState({
  systemRiskHold,
  requiredItemCount,
  boundItemCount,
  appointmentCount,
}) {
  if (systemRiskHold === true) return 'held_system_risk';
  if (boundItemCount < requiredItemCount) return 'awaiting_item_booking_bindings';
  if (appointmentCount !== 2) return 'awaiting_shared_appointments';
  return 'ready';
}

export function buildBookingGroupItemHandoverState({
  position,
  evidenceRows = [],
  confirmationRows = [],
  returnCase = null,
}) {
  const evidenceFor = (segment) => evidenceRows
    .filter((row) => row.segment === segment)
    .map((row) => ({
      evidenceId: row.evidence_id,
      kind: row.evidence_kind,
      semanticSlot: row.semantic_slot,
      uploadId: row.upload_id,
      uploadSha256: row.upload_sha256,
      observedAt: iso(row.observed_at, 'invalid_item_evidence_time'),
    }));
  const confirmationFor = (segment) => {
    const row = confirmationRows.find((entry) => entry.segment === segment);
    return row ? {
      confirmationId: row.confirmation_id,
      decision: row.decision,
      presenterEvidenceSetSha256: row.presenter_evidence_set_sha256,
      presenterPhotoCount: Number(row.presenter_photo_count),
      deviationPhotoCount: Number(row.deviation_photo_count),
      confirmedAt: iso(row.confirmed_at, 'invalid_item_confirmation_time'),
    } : null;
  };
  const segment = (name) => {
    const evidence = evidenceFor(name);
    return {
      requiredPresenterSlots: bookingGroupEvidenceSlots,
      presenterEvidence: evidence.filter((entry) => entry.kind === 'presenter_photo'),
      deviationEvidence: evidence.filter((entry) => entry.kind === 'counterparty_deviation'),
      accessories: {
        required: true,
        evidenceId: evidence.find((entry) => (
          entry.kind === 'presenter_photo' && entry.semanticSlot === 'accessories'
        ))?.evidenceId ?? null,
      },
      counterpartyConfirmation: confirmationFor(name),
    };
  };
  const bound = Boolean(position.booking_id);
  const needsReview = position.return_state === 'needsReview';
  return freeze({
    groupPositionId: position.group_position_id,
    groupQuotePositionId: position.group_quote_position_id,
    listingId: position.listing_id,
    bookingId: position.booking_id ?? null,
    platformContractId: position.platform_contract_id ?? null,
    bindingState: bound ? 'bound_v52' : 'awaiting_item_booking_binding',
    operationalState: !bound
      ? 'awaiting_item_booking_binding'
      : (needsReview ? 'needs_review' : 'independent'),
    bookingWorkflowStatus: position.workflow_status ?? null,
    pickup: segment('pickup'),
    return: segment('return'),
    damage: {
      needsReview,
      returnState: position.return_state ?? null,
      returnCase: returnCase ? {
        id: returnCase.id,
        reasonCode: returnCase.reason_code,
        contestedAuthorizedMinor: Number(returnCase.contested_authorized_minor),
        undisputedReleasableMinor: Number(returnCase.undisputed_releasable_minor),
      } : null,
    },
    timers: {
      returnT0: position.return_t0 ? iso(position.return_t0, 'invalid_item_return_t0') : null,
      reportDeadline: position.return_report_deadline
        ? iso(position.return_report_deadline, 'invalid_item_report_deadline')
        : null,
      clarificationDeadline: position.return_clarification_deadline
        ? iso(position.return_clarification_deadline, 'invalid_item_clarification_deadline')
        : null,
      responseDueAt: returnCase?.response_due_at
        ? iso(returnCase.response_due_at, 'invalid_item_response_due_at')
        : null,
      nextStatusUpdateDueAt: returnCase?.next_status_update_due_at
        ? iso(returnCase.next_status_update_due_at, 'invalid_item_status_update_due_at')
        : null,
    },
    chat: {
      scope: 'item_booking_only',
      threadId: position.thread_id ?? null,
    },
  });
}
