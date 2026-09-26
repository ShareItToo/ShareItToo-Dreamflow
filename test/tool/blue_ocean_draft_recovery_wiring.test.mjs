import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screen = readFileSync(
  new URL('../../lib/screens/create_listing_screen.dart', import.meta.url),
  'utf8',
);
const auth = readFileSync(
  new URL('../../lib/services/auth_service.dart', import.meta.url),
  'utf8',
);
const recovery = readFileSync(
  new URL(
    '../../lib/services/blue_ocean_draft_recovery_service.dart',
    import.meta.url,
  ),
  'utf8',
);
const backend = readFileSync(
  new URL('../../backend/src/app.js', import.meta.url),
  'utf8',
);
const editableSnapshot = screen.match(
  /Map<String, dynamic> _blueOceanRecoveryEditableFields\(\)[\s\S]*?(?=\n  BlueOceanDraftRecoverySnapshot\?)/u,
)?.[0];

assert.ok(editableSnapshot, 'expected the bounded editable recovery snapshot');

test('recovery payload uses secure storage with a bounded owner-scoped TTL', () => {
  assert.match(recovery, /package:flutter_secure_storage/u);
  assert.match(recovery, /retention = Duration\(hours: 24\)/u);
  assert.match(recovery, /_maximumEncodedBytes = 128 \* 1024/u);
  assert.match(recovery, /payload\['ownerId'\] != normalizedOwnerId/u);
  assert.match(recovery, /age\.isNegative \|\| age > retention/u);
  assert.match(recovery, /candidate\.startsWith\('data:'\)/u);
});

test('snapshot excludes credentials, raw photo bytes, and owner gates', () => {
  assert.doesNotMatch(
    editableSnapshot,
    /accessToken|refreshToken|password|ownerConfirmations|readyFingerprint|pickedImages|readAsBytes|base64/u,
  );
  assert.match(screen, /_blueOceanPhotoUrls\.any\([\s\S]*!BackendConfig\.isManagedListingImageUrl/u);
});

test('restore fails closed and requires a complete fresh owner review', () => {
  assert.match(screen, /revisionDraftId != snapshot\.draftId/u);
  assert.match(screen, /_blueOceanConsentAccepted = false/u);
  assert.match(screen, /_blueOceanAnsweredQuestions\.clear\(\)/u);
  assert.match(screen, /_blueOceanReplacementBandConfirmed = false/u);
  assert.match(
    screen,
    /for \(final key in _blueOceanConfirmations\.keys\) \{\s+_blueOceanConfirmations\[key\] = false;\s+\}/u,
  );
  assert.match(screen, /_blueOceanReadyFingerprint = null/u);
});

test('recovery clears on logout, photo mutation, and successful publication', () => {
  assert.match(
    auth,
    /await prefs\.remove\(_sessionKey\);[\s\S]*await BlueOceanDraftRecoveryService\(\)\.clear\(\)/u,
  );
  assert.match(
    screen,
    /void _clearBlueOceanDraftForPhotoChange\(\)[\s\S]*_clearBlueOceanRecoverySnapshot\(\)/u,
  );
  assert.match(
    screen,
    /_listingMutationService\.execute\([\s\S]*ListingMutationCommand\.create[\s\S]*await _clearBlueOceanRecoverySnapshot\(\);[\s\S]*Navigator\.of\(context\)/u,
  );
});

test('backgrounding and restored managed photos remain lifecycle-safe', () => {
  assert.match(screen, /with WidgetsBindingObserver/u);
  assert.match(screen, /AppLifecycleState\.paused/u);
  assert.match(screen, /unawaited\(_persistBlueOceanRecoverySnapshot\(\)\)/u);
  assert.match(screen, /for \(final url in restoredBlueOceanPhotos\)[\s\S]*AppImage\(/u);
  assert.match(
    screen,
    /_pickedImages\.isNotEmpty &&\s+_blueOceanPhotoUrls\.length != _pickedImages\.length/u,
  );
});

test('double taps and interrupted publication retries cannot duplicate a listing', () => {
  assert.match(
    screen,
    /Future<void> _submit[\s\S]*if \(_submitBusy\) return;[\s\S]*await _performSubmit/u,
  );
  assert.match(
    screen,
    /onPressed:\s+_submitBusy \|\| _blueOceanBusy \? null : _submit/u,
  );
  assert.match(
    backend,
    /stored\.row\.status === 'published'[\s\S]*listing_ai_publication_receipts[\s\S]*replayed: true/u,
  );
  assert.match(
    backend,
    /Cache-Control', 'private, no-store'/u,
  );
});

test('backend and price-review failures preserve the manual editor state', () => {
  assert.match(
    screen,
    /Future<void> _startBlueOceanAssistant\(\)[\s\S]*on ListingMutationFailure catch \(failure\)[\s\S]*Fotos und '[\s\S]*'Eingaben bleiben erhalten; arbeite manuell weiter/u,
  );
  assert.match(
    screen,
    /Future<void> _reviewBlueOceanAssistant\(\)[\s\S]*on ListingMutationFailure catch \(failure\)[\s\S]*Die Vorschau ist noch nicht bereit/u,
  );
  assert.doesNotMatch(
    screen,
    /on ListingMutationFailure catch \(failure\)[\s\S]{0,600}_pickedImages\.clear\(\)/u,
  );
});
