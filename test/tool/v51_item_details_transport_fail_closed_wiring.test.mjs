import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/widgets/item_details_overlay.dart', import.meta.url),
  'utf8',
);

const bottomBar = source.match(
  /class _BottomActionBar extends StatefulWidget[\s\S]*?Future<void> _showUnavailablePopup/u,
)?.[0] ?? '';

const pricingPrelude = bottomBar.match(
  /Widget build\(BuildContext context\)[\s\S]*?return Container\(/u,
)?.[0] ?? '';

const reserveStart = source.indexOf(
  'Future<void> _handleReserve(BuildContext context)',
);
const reserveEnd = source.indexOf(
  'Future<void> _showUnavailablePopup',
  reserveStart,
);
const reserveFlow = source.slice(reserveStart, reserveEnd);

test('every item-details booking surface hides legacy transport choices', () => {
  assert.equal(
    (source.match(/showDeliverySection: false/g) ?? []).length,
    2,
  );
  assert.match(bottomBar, /this\.showDeliverySection = false/u);
  assert.doesNotMatch(bottomBar, /getSavedDeliverySelection\(widget\.item\.id\)/u);
  assert.match(
    bottomBar,
    /clearSavedDeliverySelection\(widget\.item\.id\)/u,
  );
});

test('item-details fallback pricing is rent plus platform contribution only', () => {
  assert.match(
    pricingPrelude,
    /\(rentalSubtotal \+ platformFee\)\.toStringAsFixed\(2\)/u,
  );
  assert.doesNotMatch(
    pricingPrelude,
    /deliveryFee|pickupFee|expressFee|estimateDistance|dropSelected|pickSelected/u,
  );
  assert.match(bottomBar, /Text\('Inkl\. Plattformbeitrag\.'/u);
  assert.doesNotMatch(source, /TotalSubtitleHelper/u);
});

test('reservation writes cannot re-enable express or transport state', () => {
  assert.match(reserveFlow, /expressRequested: false/u);
  assert.match(reserveFlow, /expressStatus: null/u);
  assert.match(reserveFlow, /expressFee: 0\.0/u);
  assert.doesNotMatch(
    reserveFlow,
    /_wantExpress|estimateDistance|_showAddressGuardPopup|deliveryAddress/u,
  );
  assert.match(reserveFlow, /PrivatePilotCheckoutScreen/u);
  assert.match(reserveFlow, /DataService\.checkAvailability/u);
  assert.match(reserveFlow, /DataService\.addRentalRequest\(req\)/u);
});

test('availability guest and owner-preview guards remain active', () => {
  assert.match(bottomBar, /DataService\.checkAvailability/u);
  assert.match(bottomBar, /showGuestRestrictionSheet/u);
  assert.match(bottomBar, /GuestGateContext\.rentalRequest/u);
  assert.match(bottomBar, /_showOwnerPreviewBlockPopup/u);
  assert.match(bottomBar, /_showUnavailablePopup/u);
  assert.match(bottomBar, /onCanReserveChange/u);
});
