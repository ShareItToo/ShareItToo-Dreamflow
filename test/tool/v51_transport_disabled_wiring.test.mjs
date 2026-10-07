import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const workflow = read('backend/src/booking_workflow.js');
const domain = read('backend/src/v51_transport_domain.js');
const app = read('backend/src/app.js');
const checkout = read('lib/screens/private_pilot_checkout_screen.dart');
const privacy = read('lib/screens/privacy_info_screen.dart');
const contact = read('lib/screens/contact_data_screen.dart');

test('authoritative booking quote fails closed for all disabled transport modes', () => {
  assert.match(workflow, /function v51DisabledTransportQuote\(candidate\)/u);
  assert.match(workflow, /const disabledCode = v51DisabledTransportCode\(candidate\)/u);
  assert.match(workflow, /throw new BookingWorkflowError\(409, disabledCode\)/u);
  assert.match(workflow, /return v51ZeroTransportQuote\(\)/u);
  assert.match(workflow, /const extras = v51DisabledTransportQuote\(candidate\)/u);
  assert.doesNotMatch(workflow, /function deliveryQuote/u);
  assert.doesNotMatch(workflow, /deliveryFeeForDistanceMinor/u);
  assert.doesNotMatch(workflow, /distanceKm/u);
  assert.match(domain, /delivery_booking_not_enabled/u);
  assert.match(domain, /pickup_booking_not_enabled/u);
  assert.match(domain, /express_booking_not_enabled/u);
  assert.match(domain, /return \{ deliveryFeeMinor: 0, pickupFeeMinor: 0 \}/u);
});

test('current checkout explicitly requests no transport service', () => {
  assert.match(checkout, /'ownerDeliversAtDropoffChosen': false/u);
  assert.match(checkout, /'ownerPicksUpAtReturnChosen': false/u);
  assert.match(checkout, /'expressRequested': false/u);
});

test('legacy sync cannot reintroduce transport or express state', () => {
  assert.match(
    app,
    /const disabledTransportCode = v51DisabledTransportCode\(candidate\);[\s\S]*?new HttpError\(409, disabledTransportCode\)/u,
  );
  assert.match(app, /merged\.expressRequested = false/u);
  assert.match(app, /merged\.expressRequestedAt = null/u);
  assert.match(app, /merged\.expressStatus = null/u);
  assert.match(app, /merged\.expressConfirmedAt = null/u);
  assert.doesNotMatch(app, /merged\.expressStatus = candidate\.expressStatus/u);
});

test('privacy and contact copy no longer promise delivery services or fees', () => {
  for (const source of [privacy, contact]) {
    assert.doesNotMatch(source, /Liefergebühr/iu);
    assert.doesNotMatch(source, /mögliche Liefer/iu);
  }
  assert.match(privacy, /für Übergabe oder Rückgabe sichtbar/u);
  assert.match(contact, /für sichere Übergaben und Rückgaben/u);
});
