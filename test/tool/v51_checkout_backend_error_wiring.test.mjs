import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const checkout = readFileSync(
  new URL('../../lib/screens/private_pilot_checkout_screen.dart', import.meta.url),
  'utf8',
);
const backend = readFileSync(
  new URL('../../backend/src/booking_workflow.js', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('quote loading translates known server booking gates without exposing codes', () => {
  assert.match(checkout, /services\/backend_http\.dart/u);
  assert.match(
    checkout,
    /on BackendException catch \(error\)[\s\S]*?_quoteLoadMessage\(error\.code\)/u,
  );
  for (const code of [
    'listing_not_found',
    'cannot_rent_own_listing',
    'rental_duration_not_allowed',
    'booking_notice_too_short',
    'listing_period_blocked',
    'booking_period_unavailable',
    'listing_day_unavailable',
    'booking_blocked_by_user_block',
    'booking_blocked_by_moderation',
    'booking_pilot_not_enabled',
  ]) {
    assert.match(checkout, new RegExp(`'${code}'`, 'u'));
    assert.match(backend, new RegExp(`'${code}'`, 'u'));
  }
  assert.match(
    checkout,
    /Der verbindliche Serverpreis konnte nicht geladen werden/u,
  );
});

test('stale or changed binding quotes are cleared and reloaded after a centered popup', () => {
  for (const code of [
    'fresh_booking_quote_required',
    'booking_quote_not_found',
    'booking_quote_expired',
    'booking_quote_changed',
  ]) {
    assert.match(checkout, new RegExp(`'${code}'`, 'u'));
    assert.match(backend, new RegExp(`'${code}'`, 'u'));
  }
  assert.match(
    checkout,
    /failure\.refreshQuote[\s\S]*?_checkoutQuote = null;[\s\S]*?_quoteExpiresAt = null;[\s\S]*?_paymentMethodAvailable = false/u,
  );
  assert.match(
    checkout,
    /AppPopup\.error\([\s\S]*?title: failure\.title,[\s\S]*?message: failure\.message/u,
  );
  assert.match(
    checkout,
    /if \(failure\.refreshQuote && mounted\)[\s\S]*?await _loadFreshQuote\(\)/u,
  );
  assert.match(checkout, /bitte prüfe und bestätige ihn erneut/u);
});

test('every binding quote reload and timer expiry clears both confirmations', () => {
  assert.match(
    checkout,
    /Future<void> _loadFreshQuote\(\)[\s\S]*?_loadingQuote = true;[\s\S]*?_privateAndTermsConfirmed = false;[\s\S]*?_earlyPerformanceAndWithdrawalConfirmed = false;/u,
  );
  assert.match(
    checkout,
    /_quoteExpiryTimer = Timer\([\s\S]*?_privateAndTermsConfirmed = false;[\s\S]*?_earlyPerformanceAndWithdrawalConfirmed = false;[\s\S]*?_checkoutQuote = null;/u,
  );
  assert.match(
    checkout,
    /bool get _canSubmit =>[\s\S]*?_allConfirmed[\s\S]*?_freshQuoteAvailable/u,
  );
});

test('non-price conflicts receive bounded honest messages and no false success', () => {
  for (const message of [
    'Zeitraum nicht mehr verfügbar',
    'Anfrage bereits vorhanden',
    'Buchung nicht möglich',
    'Anmeldung erforderlich',
    'Anfrage wird verarbeitet',
    'Buchung vorübergehend nicht verfügbar',
    'Es wurde nichts belastet',
  ]) {
    assert.match(checkout, new RegExp(message, 'u'));
  }
  assert.match(
    checkout,
    /on BackendException catch \(error\)[\s\S]*?_submissionFailure\(error\.code\)/u,
  );
  assert.match(
    checkout,
    /catch \(_\)[\s\S]*?Buchungsanfrage nicht gesendet[\s\S]*?Bitte prüfe deine Verbindung/u,
  );
});

test('the permanent regression gate runs the checkout error mapping contract', () => {
  assert.match(
    regression,
    /node --test test\/tool\/v51_checkout_backend_error_wiring\.test\.mjs/u,
  );
});
