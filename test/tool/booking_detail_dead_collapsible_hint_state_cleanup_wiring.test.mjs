import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bookingDetail = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);

function sectionBetween(startMarker, endMarker, fromIndex = 0) {
  const start = bookingDetail.indexOf(startMarker, fromIndex);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = bookingDetail.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return {
    source: bookingDetail.slice(start, end),
    end,
  };
}

test('booking detail cannot regain obsolete collapsible hint state', () => {
  assert.doesNotMatch(bookingDetail, /\b_pickupHintOpen\b/);
  assert.doesNotMatch(bookingDetail, /\b_upcomingPrivacyOpen\b/);
});

test('active address privacy and fixed information cards stay wired', () => {
  assert.match(
    bookingDetail,
    /import 'package:lendify\/services\/address_privacy\.dart';/,
  );
  assert.match(
    bookingDetail,
    /class _AddressInfoCard extends StatelessWidget/,
  );
  assert.match(
    bookingDetail,
    /const _AddressInfoCard\(\{required this\.icon, required this\.text\}\);/,
  );

  const upcoming = sectionBetween(
    '// Approximate pickup map directly under the info card.',
    '// Pending: same self-pickup privacy map as upcoming.',
  );
  assert.match(
    upcoming.source,
    /AddressPrivacy\.nearbyShort\(kindLabel: 'Abholung'\)/,
  );
  assert.match(
    upcoming.source,
    /widget\.booking\['exactAddressRevealed'\] == true/,
  );
  assert.match(
    upcoming.source,
    /_AddressInfoCard\(\s*icon: revealExactAddress\s*\? Icons\.place_outlined\s*: Icons\.lock_outline,\s*text: revealExactAddress && fullAddress\.isNotEmpty\s*\? 'Abholort: \$fullAddress'\s*: 'Die genaue Adresse wird rechtzeitig vor der Übergabe angezeigt\.',\s*\)/,
  );

  const pending = sectionBetween(
    '// Pending: same self-pickup privacy map as upcoming.',
    '// Ongoing: self-return map.',
    upcoming.end,
  );
  assert.match(
    pending.source,
    /AddressPrivacy\.nearbyShort\(kindLabel: 'Abholung'\)/,
  );
  assert.match(
    pending.source,
    /_AddressInfoCard\(\s*icon: Icons\.lock_outline,\s*text: AddressPrivacy\.privacyNoticePickup\(\),\s*\)/,
  );
});

test('approximate location maps stay present for protected booking locations', () => {
  const mapCalls = bookingDetail.match(/\bApproxLocationMap\(/g) ?? [];
  assert.ok(mapCalls.length >= 4, 'expected all active approximate map branches');

  const upcoming = sectionBetween(
    '// Approximate pickup map directly under the info card.',
    '// Pending: same self-pickup privacy map as upcoming.',
  );
  const pending = sectionBetween(
    '// Pending: same self-pickup privacy map as upcoming.',
    '// Ongoing: self-return map.',
    upcoming.end,
  );
  const ongoing = sectionBetween(
    '// Ongoing: self-return map.',
    '// Old collapsible privacy card removed',
    pending.end,
  );
  assert.match(
    ongoing.source,
    /final label = AddressPrivacy\.nearbyShort\(kindLabel: 'Rückgabe'\);[\s\S]*?widget\.booking\['exactAddressRevealed'\] == true[\s\S]*?ApproxLocationMap\([\s\S]*?label: label/,
  );
  assert.match(
    ongoing.source,
    /_AddressInfoCard\(\s*icon: exactAddressRevealed\s*\? Icons\.place_outlined\s*: Icons\.lock_outline,\s*text: exactAddressRevealed && fullAddress\.isNotEmpty\s*\? 'Rückgabeort: \$fullAddress'/,
  );
});

test('pickup return and confirmed-time guards stay wired', () => {
  assert.match(
    bookingDetail,
    /Future<bool> _timeConfirmedForStart\(\{required bool isReturn\}\) async/,
  );
  assert.match(bookingDetail, /Future<void> _startPickupFlow\(\) async/);
  assert.match(bookingDetail, /Future<void> _startOwnerReturnFlow\(\) async/);
  assert.match(
    bookingDetail,
    /if \(!await _timeConfirmedForStart\(isReturn: false\)\) return;\s+await _startPickupFlow\(\);/,
  );
  assert.match(
    bookingDetail,
    /if \(!await _timeConfirmedForStart\(isReturn: true\)\) return;\s+await _startOwnerReturnFlow\(\);/,
  );
  const stepperCalls =
    bookingDetail.match(/ReturnHandoverStepperSheet\.push\(/g) ?? [];
  assert.equal(stepperCalls.length, 2);
});
