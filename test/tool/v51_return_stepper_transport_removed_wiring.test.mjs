import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/widgets/return_handover_stepper_sheet.dart', import.meta.url),
  'utf8',
);
const bookingDetail = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);
const ownerDetail = readFileSync(
  new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
  'utf8',
);

test('handover stepper cannot regain transport compensation', () => {
  assert.doesNotMatch(
    source,
    /rideConfirm|Fahrtvergütung|setRideCompensationDecision|ownerDeliversAtDropoffChosen|ownerPicksUpAtReturnChosen|Geolocator|LocationPermission/u,
  );
  assert.match(source, /enum _StepKind \{ photos, damage, codes \}/u);
});

test('pickup and return keep the minimal safe step sequence', () => {
  const steps = source.match(
    /List<_StepKind> _buildSteps\(\)[\s\S]*?return base;\s*\}/u,
  )?.[0] ?? '';
  assert.match(steps, /base\.add\(_StepKind\.photos\)/u);
  assert.match(steps, /if \(isReturn && widget\.allowDamageCase\) base\.add\(_StepKind\.damage\)/u);
  assert.match(bookingDetail, /allowDamageCase: !_simulationOnly/u);
  assert.match(ownerDetail, /allowDamageCase: !req\.simulationOnly/u);
  assert.match(steps, /base\.add\(_StepKind\.codes\)/u);
  assert.doesNotMatch(steps, /request\./u);
});

test('four-photo role binding and counterparty confirmation remain required', () => {
  assert.match(
    source,
    /_presenterEvidenceCount \+ _checkoutPhotos\.length >= 4/u,
  );
  assert.match(source, /if \(_presenterEvidenceCount < 4\) return false/u);
  assert.match(source, /_counterpartyDecision == 'confirmed'/u);
  assert.match(source, /_counterpartyDecision == 'deviation_recorded'/u);
  assert.match(source, /_otherPartyConfirmed/u);
});

test('challenge qr and manual code stay available while simulations omit damage', () => {
  assert.match(source, /confirmationVerifier/u);
  assert.match(source, /qrPayload/u);
  assert.match(source, /_manualCodeCtrl/u);
  assert.match(source, /_showManualEntry/u);
  assert.match(source, /_hasDamage/u);
  assert.match(source, /_damagePhotos/u);
  assert.match(source, /_damageNotesCtrl/u);
  assert.match(source, /ReturnHandoverStepResult/u);
});
