import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ownerDetail = readFileSync(
  new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
  'utf8',
);
const returnStepper = readFileSync(
  new URL('../../lib/widgets/return_handover_stepper_sheet.dart', import.meta.url),
  'utf8',
);
const dataService = readFileSync(
  new URL('../../lib/services/data_service.dart', import.meta.url),
  'utf8',
);

function sourceSectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function sectionBetween(startMarker, endMarker) {
  return sourceSectionBetween(ownerDetail, startMarker, endMarker);
}

test('owner detail cannot regain obsolete manual-handover visibility state', () => {
  assert.doesNotMatch(ownerDetail, /\b_showManualHandover\b/);
});

test('upcoming owner action keeps its confirmed-time pickup guard', () => {
  const upcoming = sectionBetween(
    "if (category == 'upcoming') ...[",
    "] else if (category == 'ongoing' && !req.needsReview) ...[",
  );
  assert.match(upcoming, /_manageBookingTime\(req: req, isReturn: false\)/);
  assert.match(
    upcoming,
    /if \(!await _timeConfirmedForStart\(\s*req: req,\s*isReturn: false,\s*\)\) \{\s*return;\s*\}/,
  );
  assert.match(
    upcoming,
    /await _startPickupFlowOwner\(\s*context,\s*req,\s*item,\s*renter,\s*\);/,
  );
  assert.match(upcoming, /label: const Text\('Übergabe starten'\)/);
});

test('pickup flow keeps secure challenge and pickup stepper wiring', () => {
  const pickup = sectionBetween(
    'Future<void> _startPickupFlowOwner(',
    'Future<void> _showReviewSheet(',
  );
  assert.match(pickup, /DataService\.issueBookingConfirmationChallenge\(/);
  assert.match(pickup, /segment: HandoverCodeService\.segmentPickup/);
  assert.match(pickup, /ReturnHandoverStepperSheet\.push\(/);
  assert.match(pickup, /handoverCode: challenge\['code'\]/);
  assert.match(pickup, /qrPayload: challenge\['qrPayload'\]/);
  assert.match(pickup, /mode: ReturnFlowMode\.pickupFlow/);
});

test('ongoing owner action keeps its confirmed-time return guard', () => {
  const ongoing = sectionBetween(
    "] else if (category == 'ongoing' && !req.needsReview) ...[",
    '\n              ],\n            ),',
  );
  assert.match(ongoing, /_manageBookingTime\(req: req, isReturn: true\)/);
  assert.match(
    ongoing,
    /if \(!await _timeConfirmedForStart\(\s*req: req,\s*isReturn: true,\s*\)\) \{\s*return;\s*\}/,
  );
  assert.match(
    ongoing,
    /await _startReturnFlow\(context, req, item, renter\);/,
  );
  assert.match(ongoing, /label: const Text\('Rückgabe starten'\)/);
});

test('return flow keeps counterparty challenge verification and return stepper', () => {
  const returnFlow = sectionBetween(
    'Future<void> _startReturnFlow(',
    'Future<void> _completeOwnerReturnWithSideEffects(',
  );
  assert.match(returnFlow, /ReturnHandoverStepperSheet\.push\(/);
  assert.match(returnFlow, /confirmationVerifier: \(\{qrPayload, code\}\) =>/);
  assert.match(
    returnFlow,
    /DataService\.verifyBookingConfirmationChallenge\(/,
  );
  assert.match(returnFlow, /segment: HandoverCodeService\.segmentReturn/);
  assert.match(
    returnFlow,
    /presenterRole: HandoverCodeService\.presenterRenter/,
  );
  assert.match(returnFlow, /mode: ReturnFlowMode\.returnFlow/);

  const stepperCalls =
    ownerDetail.match(/ReturnHandoverStepperSheet\.push\(/g) ?? [];
  assert.equal(stepperCalls.length, 2);
});

test('return completion keeps photo evidence and verified transition guards', () => {
  const completion = sectionBetween(
    'Future<void> _completeOwnerReturnWithSideEffects(',
    'Future<void> _startPickupFlowOwner(',
  );
  assert.match(completion, /_guardRequiredReturnPhotos\(req\.id\)/);
  assert.match(
    completion,
    /_acknowledgeGalleryEvidenceIfNeeded\(\s*req\.id,\s*isReturn: true,\s*\)/,
  );
  assert.match(completion, /DataService\.confirmReturnTransition\(/);
  assert.match(completion, /confirmedByUserId: ownerUserId/);
  assert.match(completion, /method: 'stepper'/);
  assert.match(completion, /confirmationContextVerified: true/);
  assert.match(completion, /galleryAcknowledged: galleryAcknowledged/);

  const returnPhotoGuard = sectionBetween(
    'Future<bool> _guardRequiredReturnPhotos(',
    'Future<bool> _acknowledgeGalleryEvidenceIfNeeded(',
  );
  assert.match(
    returnPhotoGuard,
    /DataService\.getReturnPhotoCount\(requestId\)/,
  );
  assert.match(
    returnPhotoGuard,
    /returnPhotos >= DataService\.minimumRequiredPhotos/,
  );
  assert.match(
    dataService,
    /static const int minimumRequiredPhotos = 4;/,
  );

  assert.match(returnStepper, /enum _StepKind \{ photos, damage, codes \}/);
  assert.doesNotMatch(
    returnStepper,
    /rideConfirm|Fahrtvergütung|setRideCompensationDecision/,
  );
  const renderedStep = sourceSectionBetween(
    returnStepper,
    'Widget _buildStep() {',
    'Widget _card({required Widget child})',
  );
  assert.match(
    renderedStep,
    /case _StepKind\.photos:\s*return _stepCheckoutPhotos\(\);/,
  );
  const canContinue = sourceSectionBetween(
    returnStepper,
    'bool get _canContinue {',
    'Future<void> _next() async',
  );
  assert.match(
    canContinue,
    /case _StepKind\.photos:\s*if \(_savingEvidence\) return false;/,
  );
  assert.match(
    canContinue,
    /if \(_viewerIsPresenter\) \{\s*return _presenterEvidenceCount \+ _checkoutPhotos\.length >= 4;/,
  );
  assert.match(
    canContinue,
    /if \(_presenterEvidenceCount < 4\) return false;/,
  );
  assert.match(
    canContinue,
    /if \(_counterpartyDecision == 'confirmed'\) \{\s*return _deviationEvidenceCount == 0 && _checkoutPhotos\.isEmpty;/,
  );
  assert.match(
    canContinue,
    /if \(_counterpartyDecision == 'deviation_recorded'\) \{\s*return _deviationEvidenceCount \+ _checkoutPhotos\.length >= 1;/,
  );
  const builtSteps = sourceSectionBetween(
    returnStepper,
    'List<_StepKind> _buildSteps() {',
    'void _openImagePreview(',
  );
  assert.match(
    builtSteps,
    /final List<_StepKind> base = \[\];\s*base\.add\(_StepKind\.photos\);/,
  );
  const photoStep = sourceSectionBetween(
    returnStepper,
    'Widget _stepCheckoutPhotos() {',
    'Widget _stepDamage() {',
  );
  assert.match(
    photoStep,
    /final presenterLabel = isReturn \? 'Mieter' : 'Vermieter';/,
  );
  assert.match(
    photoStep,
    /'Bitte mindestens 4 aktuelle Fotos hinzufügen\./,
  );
  assert.match(
    photoStep,
    /label: 'Fotos stimmen überein'/,
  );
  assert.match(
    photoStep,
    /label: 'Abweichung dokumentieren'/,
  );
  assert.match(
    photoStep,
    /'Mindestens ein eigenes Gegenfoto ist erforderlich\.'/,
  );
});

test('owner cancellation remains actor-bound inside the cancel action', () => {
  const cancellation = sectionBetween(
    'final cat = _categoryFor(req);',
    '                  default:',
  );
  assert.match(
    cancellation,
    /if \(cat == 'upcoming'\)\s*const SitMenuOption\([\s\S]*?label: 'Stornieren',\s*value: 'cancel',\s*\)/,
  );
  assert.match(cancellation, /case 'cancel':/);
  assert.match(cancellation, /title: 'Buchung stornieren\?'/);
  assert.match(
    cancellation,
    /DataService\s*\.updateRentalRequestStatusWithActor\(/,
  );
  assert.match(cancellation, /requestId: req\.id/);
  assert.match(cancellation, /status: 'cancelled'/);
  assert.match(cancellation, /cancelledBy: 'owner'/);
  assert.match(cancellation, /type: 'cancelled'/);
  assert.match(cancellation, /title: 'Buchung storniert'/);
});

test('owner review remains direction-bound inside the review action', () => {
  const reviewEntry = sectionBetween(
    '// Bottom-anchored review button for completed rentals (owner -> renter)',
    '      body: (req == null || item == null || renter == null)',
  );
  assert.match(
    reviewEntry,
    /final isTrulyCompleted = \(cat == 'completed'\) &&\s*r\.status != 'cancelled' &&\s*r\.status != 'declined';/,
  );
  assert.match(
    reviewEntry,
    /if \(!isTrulyCompleted \|\| r\.needsReview \|\| r\.simulationOnly\) \{\s*return const SizedBox\.shrink\(\);\s*\}/,
  );
  assert.match(
    reviewEntry,
    /onPressed: \(\) => _showReviewSheet\(context, rn\)/,
  );
  assert.match(reviewEntry, /label: const Text\('Bewerten'\)/);

  const review = sectionBetween(
    'Future<void> _showReviewSheet(',
    '\n}\n\n/// Small non-collapsible card',
  );
  assert.match(review, /ReviewPromptSheet\.show\(/);
  assert.match(review, /requestId: request\.id/);
  assert.match(review, /reviewerId: owner\.id/);
  assert.match(review, /reviewedUserId: renter\.id/);
  assert.match(review, /direction: 'owner_to_renter'/);
  assert.match(review, /title: 'Danke für deine Bewertung!'/);
  assert.match(review, /title: 'Bewertung abgegeben'/);
  assert.doesNotMatch(ownerDetail, /\b_reviewAlreadySubmitted\b/);
});
