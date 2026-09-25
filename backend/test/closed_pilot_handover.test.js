import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CLOSED_PILOT_HANDOVER_SLOTS,
  closedPilotHandoverPlan,
  completeClosedPilotHandover,
} from '../ops/closed_pilot_handover.mjs';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createHandoverApi({
  qrPayload = 'shareittoo:v3:pickup:owner:challenge:123456:booking-1',
  verification = {
    replayed: false,
    confirmation: {
      verificationVersion: 3,
      presenterRole: 'owner',
      confirmedByRole: 'renter',
    },
  },
} = {}) {
  const calls = [];
  let uploadIndex = 0;
  const api = async (route, options = {}) => {
    calls.push({ route, options });
    if (route === '/message-threads/booking/booking-1') {
      return { value: { thread: { id: 'thread-1' } } };
    }
    if (route === '/uploads') {
      uploadIndex += 1;
      return { value: { id: `upload-${uploadIndex}` } };
    }
    if (route === '/message-threads/thread-1/messages') {
      return { value: { message: { id: `message-${calls.length}` } } };
    }
    if (route === '/bookings/booking-1/condition-confirmations') {
      return { value: { confirmation: { id: 'confirmation-1' } } };
    }
    if (route === '/bookings/booking-1/confirmation-challenges') {
      return { value: { challenge: { qrPayload } } };
    }
    if (route === '/bookings/booking-1/confirmation-challenges/verify') {
      return { value: verification };
    }
    throw new Error(`unexpected_route:${route}`);
  };
  return { api, calls };
}

test('closed-pilot V5.2 handover plan fixes exact slots, roles and purposes', () => {
  assert.deepEqual(CLOSED_PILOT_HANDOVER_SLOTS, [
    'overview',
    'detail',
    'accessories',
    'critical',
  ]);
  assert.deepEqual(closedPilotHandoverPlan('pickup'), {
    segment: 'pickup',
    presenterRole: 'owner',
    verifierRole: 'renter',
    uploadPurpose: 'handover_evidence',
    slots: CLOSED_PILOT_HANDOVER_SLOTS,
  });
  assert.deepEqual(closedPilotHandoverPlan('return'), {
    segment: 'return',
    presenterRole: 'renter',
    verifierRole: 'owner',
    uploadPurpose: 'return_evidence',
    slots: CLOSED_PILOT_HANDOVER_SLOTS,
  });
  assert.throws(
    () => closedPilotHandoverPlan('unknown'),
    /closed_pilot_handover_segment_invalid/u,
  );
});

test('handover helper creates four distinct slot messages before confirmation and QR-v3 verification', async () => {
  const users = {
    owner: { id: 'owner-1', token: 'owner-token' },
    renter: { id: 'renter-1', token: 'renter-token' },
  };
  const { api, calls } = createHandoverApi();

  const result = await completeClosedPilotHandover({
    api,
    bookingId: 'booking-1',
    runId: 'b8-test-run',
    users,
    segment: 'pickup',
  });
  assert.equal(result.threadId, 'thread-1');
  assert.equal(result.presenterRole, 'owner');
  assert.equal(result.verifierRole, 'renter');
  assert.equal(result.uploadPurpose, 'handover_evidence');
  assert.equal(result.uploadCount, 4);
  assert.deepEqual(result.slots, CLOSED_PILOT_HANDOVER_SLOTS);
  assert.equal(result.verified, true);

  const uploads = calls.filter((call) => call.route === '/uploads');
  assert.equal(uploads.length, 4);
  assert.deepEqual(
    uploads.map((call) => call.options.body.get('purpose')),
    Array(4).fill('handover_evidence'),
  );
  assert.deepEqual(
    uploads.map((call) => call.options.body.get('threadId')),
    Array(4).fill('thread-1'),
  );
  const messages = calls.filter((call) => call.route === '/message-threads/thread-1/messages');
  assert.deepEqual(
    messages.map((call) => call.options.body.conditionEvidence),
    CLOSED_PILOT_HANDOVER_SLOTS.map((semanticSlot) => ({
      segment: 'pickup',
      kind: 'presenter_photo',
      source: 'gallery',
      semanticSlot,
    })),
  );
  assert.equal(
    new Set(messages.map((call) => call.options.body.attachmentIds[0])).size,
    4,
  );
  assert.ok(messages.every((call) => call.options.body.text.startsWith('[SIT TEST / NON-AUTHENTIC]')));
  const confirmationIndex = calls.findIndex((call) => call.route.endsWith('/condition-confirmations'));
  const challengeIndex = calls.findIndex((call) => call.route.endsWith('/confirmation-challenges'));
  const verifyIndex = calls.findIndex((call) => call.route.endsWith('/confirmation-challenges/verify'));
  assert.ok(messages.every((_, index) => calls.indexOf(messages[index]) < confirmationIndex));
  assert.ok(confirmationIndex < challengeIndex);
  assert.ok(challengeIndex < verifyIndex);
});

for (const [label, options, expectedError] of [
  [
    'rejects a wrong QR segment/role prefix',
    { qrPayload: 'shareittoo:v3:return:renter:challenge:123456:booking-1' },
    /closed_pilot_handover_qr_invalid/u,
  ],
  [
    'rejects a wrong verification version',
    {
      verification: {
        replayed: false,
        confirmation: {
          verificationVersion: 2,
          presenterRole: 'owner',
          confirmedByRole: 'renter',
        },
      },
    },
    /closed_pilot_handover_verification_invalid/u,
  ],
  [
    'rejects wrong presenter and verifier roles',
    {
      verification: {
        replayed: false,
        confirmation: {
          verificationVersion: 3,
          presenterRole: 'renter',
          confirmedByRole: 'owner',
        },
      },
    },
    /closed_pilot_handover_verification_invalid/u,
  ],
]) {
  test(`handover helper ${label} fail closed`, async () => {
    const { api } = createHandoverApi(options);
    await assert.rejects(
      completeClosedPilotHandover({
        api,
        bookingId: 'booking-1',
        runId: 'b8-negative-test',
        users: {
          owner: { id: 'owner-1', token: 'owner-token' },
          renter: { id: 'renter-1', token: 'renter-token' },
        },
        segment: 'pickup',
      }),
      expectedError,
    );
  });
}

test('B8 and B9 use the shared handover helper before guarded transitions', async () => {
  const b8 = await fs.readFile(path.join(backendRoot, 'ops/staging_b8_acceptance.mjs'), 'utf8');
  const b9 = await fs.readFile(path.join(backendRoot, 'ops/staging_b9_acceptance.mjs'), 'utf8');
  assert.match(b8, /completeClosedPilotHandover\(/u);
  const b8Pickup = b8.indexOf("segment: 'pickup'");
  const b8Active = b8.indexOf("body: { status: 'active' }");
  const b8Return = b8.indexOf("segment: 'return'");
  const b8Completed = b8.indexOf("body: { status: 'completed' }");
  assert.ok(b8Pickup >= 0 && b8Active > b8Pickup && b8Return > b8Active && b8Completed > b8Return);

  assert.match(b9, /completeClosedPilotHandover\(/u);
  const b9Pickup = b9.indexOf("segment: 'pickup'");
  const b9Active = b9.indexOf("body: { status: 'active' }");
  const b9Return = b9.indexOf("segment: 'return'");
  const b9Running = b9.indexOf("body: { status: 'running' }");
  const b9Completed = b9.indexOf("body: { status: 'completed' }");
  assert.ok(b9Pickup >= 0 && b9Active > b9Pickup && b9Return > b9Active
    && b9Completed > b9Return);
  assert.equal((b9.match(/body: \{ status: '(?:active|running)' \}/gu) ?? []).length, 1);
  assert.equal((b9.match(/body: \{ status: 'active' \}/gu) ?? []).length, 1);
  assert.equal(b9Running, -1);
});

test('B8 stops at the authentic payout boundary without time or trigger bypasses', async () => {
  const b8 = await fs.readFile(path.join(backendRoot, 'ops/staging_b8_acceptance.mjs'), 'utf8');
  assert.match(b8, /payout_hold_active/u);
  assert.match(b8, /postWindowFlow: 'not_proven'/u);
  assert.match(b8, /cleanup_required: true/u);
  assert.match(b8, /cleanup: \{ required: true, scope: 'isolated_clone'/u);
  assert.doesNotMatch(b8, /payout_blocked_by_dispute/u);
  assert.doesNotMatch(b8, /payout_instruction_due_at\s*=\s*now\(\)/u);
  assert.doesNotMatch(b8, /completed_at\s*=\s*now\(\)/u);
  assert.doesNotMatch(b8, /\/payments\/\$\{paymentId\}\/refunds/u);
  assert.doesNotMatch(b8, /\/account\/deletion/u);
  assert.doesNotMatch(b8, /UPDATE ledger_entries/u);
});
