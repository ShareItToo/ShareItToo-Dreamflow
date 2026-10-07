import assert from 'node:assert/strict';
import test from 'node:test';
import { createBookingReview } from '../src/moderation_workflow.js';

const actor = { id: 'review-renter', role: 'user' };
const reviewInput = {
  direction: 'renter_to_owner',
  criteria: [
    { key: 'communication', stars: 5, note: null },
    { key: 'reliability', stars: 4, note: null },
    { key: 'article_as_described', stars: 5, note: null },
    { key: 'handover_return', stars: 4, note: null },
  ],
};

function fakeReviewClient() {
  const commands = new Map();
  let review = null;
  let reviewInsertCount = 0;
  let auditCount = 0;
  const booking = {
    id: 'booking-review-1', owner_id: 'review-owner', renter_id: actor.id,
    listing_id: 'listing-review-1', resolved_listing_id: 'listing-review-1',
    workflow_status: 'completed', status: 'completed',
  };
  return {
    get reviewInsertCount() { return reviewInsertCount; },
    get auditCount() { return auditCount; },
    async query(sql, params = []) {
      if (sql.startsWith('INSERT INTO booking_commands')) {
        const key = params[0];
        if (commands.has(key)) return { rowCount: 0, rows: [] };
        commands.set(key, {
          actor_id: params[1], command_type: params[2], request_hash: params[3],
          response_payload: null, completed_at: null,
        });
        return { rowCount: 1, rows: [{ idempotency_key: key }] };
      }
      if (sql.includes('FROM booking_commands WHERE idempotency_key')) {
        const command = commands.get(params[0]);
        return { rowCount: command ? 1 : 0, rows: command ? [command] : [] };
      }
      if (sql.startsWith('UPDATE booking_commands')) {
        const command = commands.get(params[0]);
        command.response_payload = JSON.parse(params[2]);
        command.completed_at = new Date();
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('FROM bookings AS booking JOIN listings')) {
        return { rowCount: 1, rows: [booking] };
      }
      if (sql.includes('FROM reports')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT * FROM reviews')) {
        return { rowCount: review ? 1 : 0, rows: review ? [review] : [] };
      }
      if (sql.startsWith('INSERT INTO reviews')) {
        reviewInsertCount += 1;
        review = {
          id: `review-${reviewInsertCount}`,
          booking_id: booking.id,
          listing_id: booking.listing_id,
          reviewer_id: actor.id,
          reviewee_id: booking.owner_id,
          direction: 'renter_to_owner',
          rating: 4.5,
          criteria: reviewInput.criteria,
          created_at: new Date('2026-09-19T10:00:00Z'),
        };
        return { rowCount: 1, rows: [review] };
      }
      if (sql.startsWith('UPDATE users AS account')) return { rowCount: 1, rows: [] };
      if (sql.startsWith('INSERT INTO audit_log')) {
        auditCount += 1;
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test('booking review idempotency replays, rejects payload drift, and never inserts twice', async () => {
  const client = fakeReviewClient();
  const first = await createBookingReview(client, {
    actor, bookingId: 'booking-review-1', raw: reviewInput, idempotencyKey: 'review-key-1',
  });
  assert.equal(first.replayed, false);
  const same = await createBookingReview(client, {
    actor, bookingId: 'booking-review-1', raw: reviewInput, idempotencyKey: 'review-key-1',
  });
  assert.equal(same.replayed, true);
  await assert.rejects(
    createBookingReview(client, {
      actor,
      bookingId: 'booking-review-1',
      raw: { ...reviewInput, criteria: reviewInput.criteria.map((entry) => ({ ...entry, stars: 1 })) },
      idempotencyKey: 'review-key-1',
    }),
    (error) => error.code === 'idempotency_key_reused',
  );
  const differentKey = await createBookingReview(client, {
    actor, bookingId: 'booking-review-1', raw: reviewInput, idempotencyKey: 'review-key-2',
  });
  assert.equal(differentKey.replayed, true);
  assert.equal(client.reviewInsertCount, 1);
  assert.equal(client.auditCount, 1);
});
