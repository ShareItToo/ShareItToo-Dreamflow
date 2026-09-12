import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);
const contact = read('lib/screens/contact_data_screen.dart');
const login = read('lib/screens/login_screen.dart');
const coordinator = read('lib/services/contact_verification_service.dart');
const auth = read('lib/services/auth_service.dart');
const tracked = read('lib/widgets/tracked_dialog_route.dart');
const backend = read('backend/src/app.js');
const phoneBackend = read('backend/src/firebase_phone_verification.js');
const regression = read('scripts/technical_regression_check.sh');

const method = (source, start, end) => source.slice(
  source.indexOf(start),
  source.indexOf(end, source.indexOf(start)),
);

test('contact coordinator retains exact token-free owner and checks both sides of remote awaits', () => {
  assert.match(coordinator, /class ContactVerificationContext[\s\S]*?SessionTransitionOwner owner/u);
  assert.doesNotMatch(
    method(
      coordinator,
      'class ContactVerificationContext',
      'class EmailChangeRequestReceipt',
    ),
    /accessToken|refreshToken/u,
  );
  const emailChange = method(
    coordinator,
    'Future<EmailChangeRequestReceipt> requestEmailChange(',
    'Future<EmailVerificationRequestReceipt> requestContactEmailVerification(',
  );
  assert.match(
    emailChange,
    /_requireContextCurrent\(context\)[\s\S]*?accessTokenForOwner[\s\S]*?_requireContextCurrent\(context\)[\s\S]*?sendEmailChangeRemote[\s\S]*?_requireContextCurrent/u,
  );
  assert.match(emailChange, /remoteAcceptedOrConfirmed:\s*true/u);
});

test('email outcomes use exact allowlists and no legacy bool mutation entry point remains', () => {
  for (const marker of [
    "400: <String>{'invalid_email', 'email_unchanged'}",
    "409: <String>{'email_in_use'}",
    "429: <String>{'rate_limit_exceeded'}",
    'ContactActionFailureKind.outcomeUnknown',
    "response['accepted'] != true",
  ]) assert.match(coordinator, new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(coordinator, /408:\s*<String>/u);
  assert.doesNotMatch(auth, /Future<bool> requestEmailVerification/u);
  assert.doesNotMatch(auth, /Future<AuthResult> requestEmailChange/u);
});

test('phone challenge, backend confirmation and cleanup are bound to exact owner and attempt', () => {
  for (const marker of [
    'required AuthSessionOwner owner',
    'required int attemptEpoch',
    '_phoneVerificationAttemptGeneration',
    'accessTokenForOwner(owner)',
    'shouldCleanUpPhoneIdentity(',
    'signedInUid',
    'currentUid',
    'confirmedLocalIdentityCleanupFailed',
    'remoteAcceptedOrConfirmed: remoteConfirmed',
  ]) assert.match(auth, new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(
    auth,
    /attemptEpoch == currentAttemptEpoch[\s\S]*?currentUid == signedInUid/u,
  );
  const confirmation = method(
    auth,
    'static Future<void> _confirmPhoneCredential(',
    'static Future<void> _requirePhoneVerificationOwner(',
  );
  assert.doesNotMatch(
    confirmation,
    /FirebaseAuth\.instance\.signOut\(\);[\s\S]*?catch \(_\) \{\}/u,
  );
});

test('phone safe-rejection map matches checked-in backend status and code pairs', () => {
  for (const [status, code] of [
    [400, 'invalid_phone'],
    [401, 'invalid_phone_verification_token'],
    [401, 'invalid_phone_verification_provider'],
    [409, 'phone_already_verified'],
    [409, 'phone_identity_cleanup_unsafe'],
    [422, 'phone_verification_mismatch'],
    [502, 'phone_identity_cleanup_failed'],
    [503, 'phone_verification_unavailable'],
  ]) {
    const clientPair = new RegExp(
      `${status}:[\\s\\S]*?'${code}'`,
      'u',
    );
    assert.match(auth, clientPair);
    assert.match(`${backend}\n${phoneBackend}`, new RegExp(code, 'u'));
  }
  assert.doesNotMatch(auth, /408:\s*<String, PhoneVerificationFailure>/u);
});

test('contact UI captures action epoch and rechecks before mutation, result and route changes', () => {
  assert.match(contact, /epoch:\s*\+\+_contactEpoch/u);
  assert.match(contact, /accountSecurityStateKey[\s\S]*?_dismissActiveContactRoute\?\.call\(\)/u);
  for (const marker of [
    '_isInteractionOwnerCurrent(owner)',
    'requestEmailChange(',
    'requestPhoneVerification(',
    'confirmPhoneVerification(',
    'requestContactEmailVerification(',
    'refreshVerifiedProfile(',
    'ContactActionFailureKind.outcomeUnknown',
    'ContactProfileRefreshKind.refreshed',
  ]) assert.match(contact, new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(coordinator, /confirmedRefreshDeferred/u);
  assert.match(contact, /Der Serverstatus konnte nicht geladen werden[\s\S]*?weder/u);
});

test('login verification binds normalized input and epoch through resend and presentation', () => {
  assert.match(coordinator, /class LoginEmailVerificationOwner[\s\S]*?normalizedEmail[\s\S]*?actionEpoch/u);
  assert.match(login, /final loginOwner = _captureLoginEmailOwner\(\);/u);
  assert.match(
    login,
    /_isLoginEmailOwnerCurrent\(loginOwner\)[\s\S]*?signInWithEmailPassword[\s\S]*?_isLoginEmailOwnerCurrent\(loginOwner\)/u,
  );
  assert.match(login, /requestLoginEmailVerification[\s\S]*?loginOwner\.normalizedEmail/u);
  assert.match(login, /clearSessionOwnerIfMatches/u);
  assert.match(
    login,
    /_retainSuccessfulLoginOwner[\s\S]*?clearSessionOwnerIfMatches/u,
  );
  assert.ok(
    [...login.matchAll(/_retainSuccessfulLoginOwner\(/gu)].length >= 5,
    'every post-login await boundary must use exact stale-session cleanup',
  );
  assert.match(
    login,
    /catch \(e\)[\s\S]*?completedOwner[\s\S]*?clearSessionOwnerIfMatches\([\s\S]*?isSessionClearReceiptCurrent\(receipt\)[\s\S]*?Anmeldung nicht abgeschlossen\./u,
    'post-authentication local failures must clear only the exact completed session before presenting failure',
  );
  assert.match(login, /_activeVerificationResultRoute\?\.dismiss\(\)/u);
});

test('exact dialog and modal identities plus supported regression retain RW18', () => {
  assert.match(tracked, /class TrackedDialogRouteHandle/u);
  assert.match(tracked, /Future<T\?> showTrackedModalBottomSheet<T>/u);
  assert.match(tracked, /ModalBottomSheetRoute<T>/u);
  assert.match(tracked, /navigator\.removeRoute\(route/u);
  assert.match(contact, /showTrackedDialog<T>/u);
  assert.match(contact, /showTrackedModalBottomSheet<T>/u);
  assert.doesNotMatch(contact, /_dismissActiveContactRoute\s*=\s*\(\)\s*=>\s*Navigator/u);
  for (const marker of [
    'test/rw18_contact_verification_principal_epoch_transaction_test.dart',
    'test/tool/rw18_contact_verification_principal_epoch_transaction_wiring.test.mjs',
    'test/tool/validate_rw18_contact_verification_principal_epoch_transaction.test.mjs',
  ]) assert.match(regression, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});
