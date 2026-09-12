import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pricing = readFileSync(
  new URL('../../lib/services/private_pilot_pricing.dart', import.meta.url),
  'utf8',
);
const checkout = readFileSync(
  new URL('../../lib/screens/private_pilot_checkout_screen.dart', import.meta.url),
  'utf8',
);

test('checkout parses the binding server response through the strict quote parser', () => {
  assert.match(checkout, /PrivatePilotQuote\.fromServerJson\(/u);
  assert.match(checkout, /_displayQuote = parsedQuote/u);
  assert.match(checkout, /_checkoutQuote = Map<String, dynamic>\.from\(envelope\)/u);
});

test('server quote parser accepts only the EUR launch boundary and valid days', () => {
  assert.match(pricing, /if \(currency != 'EUR'\)/u);
  assert.match(pricing, /if \(days < 1 \|\| days > 365\)/u);
});

test('server quote parser rejects every inconsistent binding sum', () => {
  assert.match(pricing, /pricePerDayMinor \* days != baseRentalMinor/u);
  assert.match(
    pricing,
    /baseRentalMinor - discountMinor != rentalSubtotalMinor/u,
  );
  assert.match(
    pricing,
    /PrivatePilotPricing\.platformFeeMinor\(rentalSubtotalMinor\) !=\s+platformFeeMinor/u,
  );
  assert.match(
    pricing,
    /rentalSubtotalMinor \+ platformFeeMinor != totalMinor/u,
  );
});

test('invalid server quotes stay outside checkout state', () => {
  const parseIndex = checkout.indexOf('PrivatePilotQuote.fromServerJson(');
  const stateIndex = checkout.indexOf('_displayQuote = parsedQuote;');
  const catchIndex = checkout.indexOf('} catch (_)', parseIndex);
  assert.ok(parseIndex >= 0);
  assert.ok(stateIndex > parseIndex);
  assert.ok(catchIndex > stateIndex);
  assert.match(
    checkout.slice(catchIndex),
    /Der verbindliche Serverpreis konnte nicht geladen werden/u,
  );
});
