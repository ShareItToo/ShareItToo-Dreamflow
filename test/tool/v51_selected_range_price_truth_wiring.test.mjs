import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/select_rental_duration_screen.dart', import.meta.url),
  'utf8',
);
const checkout = readFileSync(
  new URL('../../lib/screens/private_pilot_checkout_screen.dart', import.meta.url),
  'utf8',
);

test('remote duration selection never presents the local preview as binding price', () => {
  assert.match(
    source,
    /bool get _usesRemoteBackend =>\s*BackendConfig\.enabled && !QaRuntimeService\.isEnabled;/,
  );
  assert.match(
    source,
    /_usesRemoteBackend\s*\? 'Der verbindliche Gesamtbetrag wird im nächsten Schritt direkt vom Server geladen\.'/,
  );
  assert.match(
    source,
    /if \(_usesRemoteBackend\)[\s\S]*?'Verbindlicher Serverpreis'[\s\S]*?'Nach „Weiter“ lädt SIT einen frischen, zeitlich begrenzten Quote\./,
  );
  assert.match(
    source,
    /if \(!_usesRemoteBackend\)\s*Text\('\$\{preview\.total\.toStringAsFixed\(2\)\} €'/,
  );
  assert.match(
    source,
    /_usesRemoteBackend\s*\? 'Ändert sich der Serverpreis, musst du den neuen Gesamtbetrag im Checkout erneut bestätigen\.'/,
  );
});

test('local preview is explicitly limited to the isolated QA branch', () => {
  assert.match(
    source,
    /: 'Lokale QA-Vorschau der preisrelevanten Bestandteile\.'/,
  );
  assert.match(
    source,
    /else \.\.\.\[[\s\S]*?value: preview\.rentalSubtotal[\s\S]*?value: preview\.platformFee/,
  );
  assert.match(
    source,
    /\(rentalSubtotal \+ platformFee\)\.toStringAsFixed\(2\)/,
  );
  assert.doesNotMatch(
    source,
    /deliveryFeeForDistanceKm|estimateDistanceKm|deliveryFee:|pickupFee:/,
  );
});

test('duration selection is permanently self-pickup for the private pilot', () => {
  assert.match(source, /'Persönliche Abholung und Rückgabe'/);
  assert.match(
    source,
    /'Lieferung und Versand sind im Privat-Pilot deaktiviert\.'/,
  );
  assert.match(source, /step: '3',\s*title: 'Übersicht & Preis'/);
  assert.match(source, /clearSavedDeliverySelection\(widget\.item\.id\)/);
  assert.doesNotMatch(
    source,
    /getSavedDeliverySelection|setSavedDeliverySelection|_ChoiceCard|_AddressSection|_hinwegLandlord|_rueckwegLandlord|Liefergebühr|Abholgebühr/,
  );
});

test('checkout remains the only binding remote price surface', () => {
  assert.match(checkout, /BackendRepository\.quoteBooking\(/);
  assert.match(checkout, /_checkoutQuote = Map<String, dynamic>\.from\(envelope\);/);
  assert.match(
    checkout,
    /bool get _freshQuoteAvailable =>[\s\S]*?_quoteExpiresAt!\.isAfter\(DateTime\.now\(\)\)/,
  );
  assert.match(
    checkout,
    /_allConfirmed &&\s*_freshQuoteAvailable &&\s*_paymentMethodAvailable/,
  );
  assert.match(checkout, /'Bestätigen und bezahlen'/);
});

test('remote quote request excludes delivery, return pickup and express', () => {
  assert.match(checkout, /'ownerDeliversAtDropoffChosen': false/);
  assert.match(checkout, /'ownerPicksUpAtReturnChosen': false/);
  assert.match(checkout, /'expressRequested': false/);
});
