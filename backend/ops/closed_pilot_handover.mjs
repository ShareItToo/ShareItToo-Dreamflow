import sharp from 'sharp';

const SLOT_COLORS = Object.freeze({
  overview: Object.freeze({ r: 32, g: 96, b: 180 }),
  detail: Object.freeze({ r: 42, g: 150, b: 110 }),
  accessories: Object.freeze({ r: 210, g: 136, b: 32 }),
  critical: Object.freeze({ r: 170, g: 58, b: 72 }),
});

export const CLOSED_PILOT_HANDOVER_SLOTS = Object.freeze([
  'overview',
  'detail',
  'accessories',
  'critical',
]);

const SEGMENT_CONTRACT = Object.freeze({
  pickup: Object.freeze({
    presenterRole: 'owner',
    verifierRole: 'renter',
    uploadPurpose: 'handover_evidence',
  }),
  return: Object.freeze({
    presenterRole: 'renter',
    verifierRole: 'owner',
    uploadPurpose: 'return_evidence',
  }),
});

export function closedPilotHandoverPlan(segment) {
  const contract = SEGMENT_CONTRACT[segment];
  if (!contract) throw new Error('closed_pilot_handover_segment_invalid');
  return Object.freeze({
    segment,
    ...contract,
    slots: CLOSED_PILOT_HANDOVER_SLOTS,
  });
}

async function syntheticEvidenceImage(slot) {
  const background = SLOT_COLORS[slot];
  return sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background,
    },
  }).png().toBuffer();
}

function requireUser(users, role) {
  const user = users?.[role];
  if (!user?.id || !user?.token) throw new Error(`closed_pilot_handover_${role}_missing`);
  return user;
}

export async function completeClosedPilotHandover({
  api,
  bookingId,
  runId,
  users,
  segment,
  threadId = null,
}) {
  if (typeof api !== 'function') throw new Error('closed_pilot_handover_api_invalid');
  if (typeof bookingId !== 'string' || !bookingId.trim()) {
    throw new Error('closed_pilot_handover_booking_invalid');
  }
  if (typeof runId !== 'string' || !runId.trim()) {
    throw new Error('closed_pilot_handover_run_invalid');
  }

  const plan = closedPilotHandoverPlan(segment);
  const presenter = requireUser(users, plan.presenterRole);
  const verifier = requireUser(users, plan.verifierRole);
  let resolvedThreadId = threadId;
  if (!resolvedThreadId) {
    const threadResponse = await api(`/message-threads/booking/${bookingId}`, {
      method: 'POST',
      token: users.renter?.token,
      expected: [201],
    });
    resolvedThreadId = threadResponse.value?.thread?.id;
  }
  if (typeof resolvedThreadId !== 'string' || !resolvedThreadId.trim()) {
    throw new Error('closed_pilot_handover_thread_missing');
  }

  const uploadIds = [];
  for (const slot of plan.slots) {
    const form = new FormData();
    form.append('purpose', plan.uploadPurpose);
    form.append('threadId', resolvedThreadId);
    form.append(
      'file',
      new Blob([await syntheticEvidenceImage(slot)], { type: 'image/png' }),
      `sit-test-${segment}-${slot}.png`,
    );
    const upload = await api('/uploads', {
      method: 'POST',
      token: presenter.token,
      body: form,
      expected: [201],
    });
    if (typeof upload.value?.id !== 'string' || upload.value.id.length === 0) {
      throw new Error('closed_pilot_handover_upload_missing');
    }
    uploadIds.push(upload.value.id);
    const message = await api(`/message-threads/${resolvedThreadId}/messages`, {
      method: 'POST',
      token: presenter.token,
      headers: { 'Idempotency-Key': `${runId}-handover-${segment}-${slot}` },
      body: {
        text: `[SIT TEST / NON-AUTHENTIC] Synthetic ${segment} condition evidence: ${slot}.`,
        attachmentIds: [upload.value.id],
        conditionEvidence: {
          segment,
          kind: 'presenter_photo',
          source: 'gallery',
          semanticSlot: slot,
        },
      },
      expected: [201],
    });
    if (typeof message.value?.message?.id !== 'string') {
      throw new Error('closed_pilot_handover_message_missing');
    }
  }

  const confirmation = await api(`/bookings/${bookingId}/condition-confirmations`, {
    method: 'POST',
    token: verifier.token,
    headers: { 'Idempotency-Key': `${runId}-handover-${segment}-confirmation` },
    body: { segment, decision: 'confirmed' },
    expected: [200, 201],
  });
  if (!confirmation.value?.confirmation) {
    throw new Error('closed_pilot_handover_confirmation_missing');
  }

  const challenge = await api(`/bookings/${bookingId}/confirmation-challenges`, {
    method: 'POST',
    token: presenter.token,
    headers: { 'Idempotency-Key': `${runId}-handover-${segment}-challenge` },
    body: { segment },
    expected: [201],
  });
  const qrPayload = challenge.value?.challenge?.qrPayload;
  const qrPrefix = `shareittoo:v3:${segment}:${plan.presenterRole}:`;
  if (typeof qrPayload !== 'string' || !qrPayload.startsWith(qrPrefix)) {
    throw new Error('closed_pilot_handover_qr_invalid');
  }

  const verification = await api(`/bookings/${bookingId}/confirmation-challenges/verify`, {
    method: 'POST',
    token: verifier.token,
    headers: { 'Idempotency-Key': `${runId}-handover-${segment}-verify` },
    body: { qrPayload },
    expected: [200],
  });
  const verificationConfirmation = verification.value?.confirmation;
  if (
    verification.value?.rejected === true
    || verificationConfirmation?.verificationVersion !== 3
    || verificationConfirmation.presenterRole !== plan.presenterRole
    || verificationConfirmation.confirmedByRole !== plan.verifierRole
  ) {
    throw new Error('closed_pilot_handover_verification_invalid');
  }

  return Object.freeze({
    threadId: resolvedThreadId,
    segment,
    presenterRole: plan.presenterRole,
    verifierRole: plan.verifierRole,
    uploadPurpose: plan.uploadPurpose,
    slots: plan.slots,
    uploadCount: uploadIds.length,
    verified: true,
  });
}
