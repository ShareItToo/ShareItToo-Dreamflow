import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/services/data_service.dart', import.meta.url),
  'utf8',
);

const addRequestStart = source.indexOf('static Future<RentalRequest> addRentalRequest(');
const addRequestEnd = source.indexOf(
  'static Future<void> updateRentalRequestStatus(',
  addRequestStart,
);
assert.ok(addRequestStart >= 0 && addRequestEnd > addRequestStart);
const addRequest = source.slice(addRequestStart, addRequestEnd);

test('local and QA persistence copies the complete immutable quote snapshot', () => {
  for (const field of [
    'quotedQuoteVersion',
    'quotedDays',
    'quotedPricePerDayMinor',
    'quotedBaseRentalMinor',
    'quotedDiscountPercent',
    'quotedDiscountId',
    'quotedDiscountLabel',
    'quotedDiscountFundingSource',
    'quotedDiscountThresholdDays',
    'quotedDiscountMinor',
    'quotedRentalSubtotalMinor',
    'quotedPlatformFeeMinor',
    'quotedTotalMinor',
    'quotedOwnerPayoutMinor',
    'quotedCurrency',
  ]) {
    assert.match(
      addRequest,
      new RegExp(`${field}: req\\.${field}`, 'u'),
      `${field} must survive the local RentalRequest copy`,
    );
  }
});

test('remote create still replaces local input with the authenticated server booking', () => {
  assert.match(addRequest, /BackendRepository\.createBooking\(/u);
  assert.match(addRequest, /toStore = RentalRequest\.fromJson\(remote\)/u);
});

test('QA remains isolated from the remote create branch', () => {
  assert.match(
    addRequest,
    /if \(BackendConfig\.enabled && !QaRuntimeService\.isEnabled\)/u,
  );
  assert.match(addRequest, /else \{\s+all\.add\(toStore\)/u);
});
