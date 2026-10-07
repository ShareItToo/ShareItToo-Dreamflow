import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/widgets/item_details_overlay.dart', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);
const sheetState = source.match(
  /class _ItemDetailsSheetState[\s\S]*?class _ItemDetailsPageState/u,
)?.[0] ?? '';
const pageState = source.match(
  /class _ItemDetailsPageState[\s\S]*?class _ItemMetaSection/u,
)?.[0] ?? '';
const bottomBar = source.match(
  /class _BottomActionBar extends StatefulWidget[\s\S]*?class _CancellationPolicyBookingCard/u,
)?.[0] ?? '';

test('item-details sheet cannot regain its duplicate request path', () => {
  assert.doesNotMatch(sheetState, /Future<void> _sendRequest\s*\(\)/u);
  assert.match(pageState, /Future<void> _sendRequest\s*\(\)/u);
  assert.match(pageState, /DataService\.checkAvailability\(/u);
  assert.match(pageState, /PrivatePilotCheckoutScreen/u);
  assert.match(pageState, /DataService\.addRentalRequest\(req\)/u);
});

test('analyzer-confirmed unused item-details elements stay absent', () => {
  const removedNames = [
    '_buildPriceSummary',
    '_MetaLine',
    '_DeliveryMetaChips',
    '_OwnerRow',
    '_ListerDetailsCard',
    '_baseRentalTotal',
    '_isValidAddressLine',
    '_showAddressGuardPopup',
    '_LineRow',
    '_CancellationPolicySection',
    '_GlassButton',
    '_TwoLineCenteredButtonContent',
  ];
  for (const name of removedNames) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`, 'u'));
  }
});

test('active booking delivery and cancellation boundaries remain intact', () => {
  assert.match(bottomBar, /Future<void> _handleReserve\(BuildContext context\)/u);
  assert.match(bottomBar, /DataService\.checkAvailability\(/u);
  assert.match(bottomBar, /PrivatePilotCheckoutScreen/u);
  assert.match(bottomBar, /DataService\.addRentalRequest\(req\)/u);
  assert.match(bottomBar, /item\.offersDeliveryAtDropoff/u);
  assert.match(bottomBar, /item\.offersPickupAtReturn/u);
  assert.match(source, /class _NoDeliveryParagraph extends StatelessWidget/u);
  assert.match(source, /class _CancellationPolicyBookingCard extends StatefulWidget/u);
  assert.match(source, /CancellationPolicyText\.(?:header|body)/u);
});

test('dead-code ratchet has no lint suppression or timing accommodation', () => {
  assert.doesNotMatch(source, /ignore:\s*unused_(?:element|element_parameter)/u);
  assert.doesNotMatch(sheetState, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
  assert.match(
    regression,
    /node --test test\/tool\/item_details_dead_code_ratchet_wiring\.test\.mjs/u,
  );
});
