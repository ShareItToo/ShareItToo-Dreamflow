import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BookingGroupDomainError,
  buildBookingGroupFoundation,
} from '../src/booking_group_domain.js';

const uuids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];

function candidate(overrides = {}) {
  return {
    ownerId: 'owner',
    renterId: 'renter',
    marketplaceContext: 'private_c2c',
    countryCode: 'Deutschland',
    currency: 'eur',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    timezone: 'Europe/Berlin',
    startsAt: '2026-09-30T22:00:00.000Z',
    endsAt: '2026-10-02T22:00:00.000Z',
    handoverLocationKey: 'a'.repeat(64),
    handoverPolicyVersion: 'private_owner_pickup_v1',
    legalDocumentSetVersion: 'G3L-DRAFT-2026-08-20.1',
    cancellationPolicyVersion: 'v52_private_cancellation',
    paymentConfigurationKey: 'disabled_test_only',
    items: [
      { listingId: 'listing-camera', ownerId: 'owner', countryCode: 'DE', currency: 'EUR' },
      { listingId: 'listing-lens', ownerId: 'owner', countryCode: 'Germany', currency: 'eur' },
    ],
    ...overrides,
  };
}

test('same-owner foundation is deterministic, normalized, versioned, and immutable', () => {
  let index = 0;
  const group = buildBookingGroupFoundation(candidate(), {
    idFactory: () => uuids[index++],
  });
  assert.equal(group.id, `booking_group_${uuids[2]}`);
  assert.equal(group.aggregateVersion, 1);
  assert.equal(group.countryCode, 'DE');
  assert.equal(group.currency, 'EUR');
  assert.match(group.compatibilityHash, /^[0-9a-f]{64}$/u);
  assert.deepEqual(group.positions.map((position) => position.id), [
    `booking_group_position_${uuids[0]}`,
    `booking_group_position_${uuids[1]}`,
  ]);
  assert.ok(Object.isFrozen(group));
  assert.ok(Object.isFrozen(group.positions));
  assert.ok(group.positions.every(Object.isFrozen));

  let replayIndex = 0;
  const replay = buildBookingGroupFoundation(candidate(), {
    idFactory: () => uuids[replayIndex++],
  });
  assert.equal(replay.compatibilityHash, group.compatibilityHash);
});

test('mixed owner, country, currency, and duplicate listings fail closed', () => {
  for (const [items, expected] of [
    [
      [candidate().items[0], { ...candidate().items[1], ownerId: 'other-owner' }],
      'booking_group_item_owner_mismatch',
    ],
    [
      [candidate().items[0], { ...candidate().items[1], countryCode: 'FR' }],
      'booking_group_country_not_allowed',
    ],
    [
      [candidate().items[0], { ...candidate().items[1], currency: 'USD' }],
      'booking_group_item_currency_mismatch',
    ],
    [
      [candidate().items[0], { ...candidate().items[1], listingId: 'listing-camera' }],
      'duplicate_booking_group_listing',
    ],
  ]) {
    assert.throws(
      () => buildBookingGroupFoundation(candidate({ items })),
      (error) => error instanceof BookingGroupDomainError && error.code === expected,
    );
  }
  assert.throws(
    () => buildBookingGroupFoundation(candidate({ items: [candidate().items[0]] })),
    (error) => error.code === 'invalid_booking_group_item_count',
  );
});

test('G3B migration is additive, normalized, constrained, and reversibly gated', () => {
  const up = readFileSync(
    new URL('../sql/migrations/028_g3b_booking_group_foundation.up.sql', import.meta.url),
    'utf8',
  );
  const down = readFileSync(
    new URL('../sql/migrations/028_g3b_booking_group_foundation.down.sql', import.meta.url),
    'utf8',
  );
  assert.match(up, /CREATE TABLE IF NOT EXISTS booking_groups/u);
  assert.match(up, /CREATE TABLE IF NOT EXISTS booking_group_positions/u);
  assert.match(up, /UNIQUE \(booking_group_id, listing_id\)/u);
  assert.match(up, /booking_group_position_owner_mismatch/u);
  assert.match(up, /booking_group_position_quote_mismatch/u);
  assert.match(up, /booking_group_position_booking_mismatch/u);
  assert.match(up, /booking_groups_append_only/u);
  assert.match(up, /booking_group_positions_append_only/u);
  assert.doesNotMatch(up, /ALTER TABLE (?:bookings|booking_quotes|platform_contracts)/u);
  assert.doesNotMatch(up, /(?:UPDATE|DELETE FROM) (?:bookings|booking_quotes|platform_contracts)/u);
  assert.match(down, /rollback blocked: booking group data exists/u);
  assert.match(down, /DROP TABLE booking_group_positions/u);
  assert.match(down, /DROP TABLE booking_groups/u);
});

test('G3B is disabled by default and cannot be enabled in production', () => {
  const config = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const productionCompose = readFileSync(
    new URL('../compose.prod.yml', import.meta.url),
    'utf8',
  );
  const stagingCompose = readFileSync(
    new URL('../compose.staging.yml', import.meta.url),
    'utf8',
  );
  assert.match(config, /process\.env\.BOOKING_GROUPS_ENABLED \?\? 'false'/u);
  assert.match(config, /booking groups cannot be enabled in production before the release gate/u);
  for (const compose of [productionCompose, stagingCompose]) {
    assert.match(compose, /BOOKING_GROUPS_ENABLED: \$\{BOOKING_GROUPS_ENABLED:-false\}/u);
  }
});
