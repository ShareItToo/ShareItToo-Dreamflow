import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BookingGroupDomainError,
  buildBookingGroupQuote,
} from '../src/booking_group_domain.js';

const firstQuoteId = '11111111-1111-4111-8111-111111111111';
const counterQuoteId = '22222222-2222-4222-8222-222222222222';

function item(overrides = {}) {
  return {
    groupPositionId: 'booking_group_position_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    listingId: 'listing-camera',
    bookingQuoteId: 'quote_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    bookingQuoteHash: 'a'.repeat(64),
    currency: 'EUR',
    rentalSubtotalMinor: 3000,
    platformFeeMinor: 300,
    totalMinor: 3300,
    ownerPayoutMinor: 3000,
    securityDepositMinor: 0,
    ...overrides,
  };
}

function initial(overrides = {}) {
  return {
    bookingGroupId: 'booking_group_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    quoteRevision: 1,
    proposalKind: 'initial',
    predecessorQuoteId: null,
    proposedById: 'renter',
    proposedByRole: 'renter',
    compatibilityHash: 'b'.repeat(64),
    currency: 'EUR',
    items: [
      item(),
      item({
        groupPositionId: 'booking_group_position_cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        listingId: 'listing-lens',
        bookingQuoteId: 'quote_cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        bookingQuoteHash: 'c'.repeat(64),
        rentalSubtotalMinor: 1200,
        platformFeeMinor: 120,
        totalMinor: 1320,
        ownerPayoutMinor: 1200,
      }),
    ],
    ...overrides,
  };
}

test('group quote deterministically sums immutable server item allocations', () => {
  const quote = buildBookingGroupQuote(initial(), { idFactory: () => firstQuoteId });
  assert.equal(quote.id, `booking_group_quote_${firstQuoteId}`);
  assert.equal(quote.itemCount, 2);
  assert.equal(quote.rentalSubtotalMinor, 4200);
  assert.equal(quote.platformFeeMinor, 420);
  assert.equal(quote.totalMinor, 4620);
  assert.equal(quote.ownerPayoutMinor, 4200);
  assert.equal(quote.securityDepositMinor, 0);
  assert.match(quote.quoteHash, /^[0-9a-f]{64}$/u);
  assert.ok(Object.isFrozen(quote));
  assert.ok(Object.isFrozen(quote.items));
  assert.ok(quote.items.every(Object.isFrozen));

  const replay = buildBookingGroupQuote(initial(), { idFactory: () => counterQuoteId });
  assert.equal(replay.quoteHash, quote.quoteHash);
});

test('counter-offer is a new revision with predecessor and may contain one retained item', () => {
  const quote = buildBookingGroupQuote(initial({
    quoteRevision: 2,
    proposalKind: 'owner_counteroffer',
    predecessorQuoteId: `booking_group_quote_${firstQuoteId}`,
    proposedById: 'owner',
    proposedByRole: 'owner',
    items: [item()],
  }), { idFactory: () => counterQuoteId });
  assert.equal(quote.quoteRevision, 2);
  assert.equal(quote.itemCount, 1);
  assert.equal(quote.predecessorQuoteId, `booking_group_quote_${firstQuoteId}`);
});

test('group quote rejects client-shaped allocation drift and duplicate evidence', () => {
  for (const [candidate, code] of [
    [initial({ proposedByRole: 'owner' }), 'booking_group_quote_actor_mismatch'],
    [initial({ items: [item({ totalMinor: 9999 })] }), 'invalid_booking_group_item_allocation'],
    [initial({ items: [item({ securityDepositMinor: 1 })] }), 'invalid_booking_group_item_allocation'],
    [initial({ items: [item(), item()] }), 'duplicate_booking_group_quote_item'],
    [initial({ items: [item({ currency: 'USD' })] }), 'booking_group_quote_currency_mismatch'],
  ]) {
    assert.throws(
      () => buildBookingGroupQuote(candidate, { idFactory: () => firstQuoteId }),
      (error) => error instanceof BookingGroupDomainError && error.code === code,
    );
  }
});

test('G3C migration binds immutable quotes, positions, transitions and rollback', async () => {
  const [up, down] = await Promise.all([
    readFile(new URL('../sql/migrations/029_g3c_booking_group_quote_state.up.sql', import.meta.url), 'utf8'),
    readFile(new URL('../sql/migrations/029_g3c_booking_group_quote_state.down.sql', import.meta.url), 'utf8'),
  ]);
  for (const table of [
    'booking_group_quotes',
    'booking_group_quote_positions',
    'booking_group_state_events',
    'booking_group_commands',
  ]) assert.match(up, new RegExp(`CREATE TABLE ${table}`, 'u'));
  assert.match(up, /booking_group_quote_balance_mismatch/u);
  assert.match(up, /to_jsonb\(NEW\)->>'group_quote_id'/u);
  assert.match(up, /booking_group_event_transition_mismatch/u);
  assert.match(up, /booking_group_quotes_append_only/u);
  assert.match(up, /booking_group_quote_positions_append_only/u);
  assert.match(up, /booking_group_state_events_append_only/u);
  assert.doesNotMatch(up, /ALTER TABLE (?:bookings|booking_quotes|platform_contracts)/u);
  assert.match(down, /G3C rollback blocked: booking group quote or state data exists/u);
});

test('G3C workflow requotes on the server and requires explicit exact consent', async () => {
  const [workflow, app] = await Promise.all([
    readFile(new URL('../src/booking_group_workflow.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(workflow, /await quoteBooking\(client, \{/u);
  assert.match(workflow, /privatePilot: true/u);
  assert.match(workflow, /rental_start_date::text AS rental_start_date_text/u);
  assert.match(workflow, /booking_group_counteroffer_item_set_unchanged/u);
  assert.match(workflow, /silent_partial_booking_group_acceptance_forbidden/u);
  assert.match(workflow, /explicit_booking_group_counteroffer_consent_required/u);
  assert.match(workflow, /candidate\.accepted !== true/u);
  assert.match(workflow, /assertCurrentQuote\(candidate, current\.quote\)/u);
  assert.match(workflow, /booking_group_predecessor_quote_not_found/u);
  assert.match(workflow, /previousQuote = publicQuote/u);
  assert.doesNotMatch(workflow, /candidate\.(?:totalMinor|platformFeeMinor|ownerPayoutMinor)/u);
  assert.match(app, /assertBookingGroupsEnabled\(config\)/u);
  assert.match(app, /app\.post\('\/v1\/booking-groups'/u);
  assert.match(app, /owner-decision/u);
  assert.match(app, /counteroffer-consent/u);
});
