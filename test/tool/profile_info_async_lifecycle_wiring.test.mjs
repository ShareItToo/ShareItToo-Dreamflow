import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/profile_info_screen.dart', import.meta.url),
  'utf8',
);
const compactSource = source.replace(/\s+/gu, ' ');
const mutationService = readFileSync(
  new URL('../../lib/services/profile_mutation_service.dart', import.meta.url),
  'utf8',
);
const thread = readFileSync(
  new URL('../../lib/screens/message_thread_screen.dart', import.meta.url),
  'utf8',
);
const booking = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);

test('late profile-load failure cannot update disposed state', () => {
  assert.match(
    source,
    /catch \(e\) \{\s+\/\/ just fallback[\s\S]*?if \(!mounted \|\| revision != _loadRevision\) return;\s+setState\(\(\) \{\s+_loading = false;/u,
  );
});

test('profile editor does not wait for optional rental statistics', () => {
  const profileReady = source.indexOf('_loading = false;');
  const statsKickoff = source.indexOf('unawaited(_loadMembershipStats');
  assert.ok(profileReady >= 0, 'profile readiness state is present');
  assert.ok(statsKickoff > profileReady, 'stats start after the editor is ready');
  assert.match(source, /Future\.wait<List<RentalRequest>>\([\s\S]*?\.timeout\(const Duration\(seconds: 5\)\)/u);
  assert.match(source, /Buchungszahlen sind gerade nicht verfügbar\./u);
  assert.match(source, /child: const Text\('Erneut versuchen'\)/u);
});

test('profile save bounds photo persistence and restores user retry', () => {
  assert.match(
    source,
    /persistPhotoDraft\([\s\S]*?updateProfile\([\s\S]*?\}\)\(\)\.timeout\(const Duration\(seconds: 15\)\)/u,
  );
  assert.match(source, /e is TimeoutException/u);
  assert.match(source, /Speichern nicht abgeschlossen/u);
  assert.match(source, /remoteMutationMayHaveStarted = true/u);
  assert.match(source, /Speicherstatus ist unklar/u);
  assert.match(source, /versuche es erneut\./u);
});

test('profile save coalesces its own projection event without stranding busy state', () => {
  assert.match(
    source,
    /key == SharedPersistenceSync\.profileStateKey[\s\S]*?if \(_saving\) \{\s+_profileRefreshPending = true;[\s\S]*?unawaited\(_load\(\)\);/u,
  );
  assert.match(
    source,
    /_user = result\.user;[\s\S]*?_profileRefreshPending = false;[\s\S]*?_profileActions\.replaceContext/u,
  );
  assert.match(
    source,
    /void _finishSave\(\)[\s\S]*?if \(_saving\) setState\(\(\) => _saving = false\);[\s\S]*?if \(refreshPending\) unawaited\(_load\(\)\);/u,
  );
  assert.match(source, /finally \{[\s\S]*?_finishSave\(\);\s+\}/u);
  assert.match(
    source,
    /_isActionCurrentForFeedback[\s\S]*?\.timeout\(const Duration\(seconds: 3\), onTimeout: \(\) => false\)/u,
  );
});

test('successful profile patch rechecks exact owner and refreshes local state', () => {
  assert.match(
    compactSource,
    /persistPhotoDraft\( context: owner\.context, photoDraft: _photoDraft, \)/u,
  );
  assert.match(
    compactSource,
    /final result = await _profileMutationService\.updateProfile\( context: owner\.context,/u,
  );
  assert.equal(
    [...compactSource.matchAll(/if \(!await _profileActions\.isCurrent\( _profileMutationService, owner, \)\) \{ throw const ProfileMutationFailure\.principalChanged\(\); \}/gu)].length,
    2,
  );
  assert.match(
    compactSource,
    /return result; \}\)\(\)\.timeout[\s\S]*?setState\(\(\) \{ _user = result\.user; _photoDraftRevision \+= 1; _photoDraft = result\.user\.photoURL;/u,
  );
  assert.match(
    compactSource,
    /_profileActions\.replaceContext\([\s\S]*?owner: owner\.context\.owner[\s\S]*?final refreshedOwner = _profileActions\.capture\(\);[\s\S]*?_showOwnedStatus\( refreshedOwner,[\s\S]*?if \(!await _isActionCurrentForFeedback\(refreshedOwner\)\) \{ return; \}[\s\S]*?_profileActions\.removeOwnedNavigationRoute\(screenRoute\);/u,
  );
  assert.match(source, /on ProfileMutationFailure catch \(failure\)/u);
  assert.doesNotMatch(source, /DataService\.updateCurrentUserProfile\(/u);
  assert.doesNotMatch(source, /Navigator\.of\(context\)\.maybePop\(\);/u);
  assert.doesNotMatch(source, /DataService\.setCurrentUser\(/u);
});

test('late same-principal profile reload preserves a newer photo draft', () => {
  assert.match(
    compactSource,
    /Future<void> _load\(\) async \{ final revision = \+\+_loadRevision; final photoDraftRevision = _photoDraftRevision;[\s\S]*?if \(photoDraftRevision == _photoDraftRevision\) \{ _photoDraft = \(u\.photoURL != null && u\.photoURL!\.trim\(\)\.isNotEmpty\) \? u\.photoURL : null; \}/u,
  );
  assert.match(
    compactSource,
    /void _clearDraft\(\) \{[\s\S]*?_photoDraftRevision \+= 1; _photoDraft = null;/u,
  );
});

test('profile lifecycle fix contains no timing or lint accommodation', () => {
  assert.doesNotMatch(source, /ignore:\s*use_build_context_synchronously/u);
  assert.doesNotMatch(source, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});

test('profile save reads the authenticated projection back before reporting success', () => {
  assert.match(
    mutationService,
    /performProfileMutation\([\s\S]*?syncCurrentUserForSessionOwner\([\s\S]*?context\.owner\.authOwner/u,
  );
  assert.match(
    mutationService,
    /ProfileMutationFailure\.outcomeUnknown\([\s\S]*?remoteAccepted/u,
  );
  assert.match(
    mutationService,
    /ProfileMutationFailure\.localUnavailable\([\s\S]*?remoteAccepted: remoteAccepted/u,
  );
});

test('Web gallery picker starts in the tap gesture before dismissing the sheet', () => {
  const galleryAction = compactSource.indexOf("title: 'Foto aus Galerie wählen'");
  const pickerLaunch = compactSource.indexOf(
    'unawaited(_pickPhoto(ImageSource.gallery, owner));',
    galleryAction,
  );
  const sheetDismiss = compactSource.indexOf(
    'Navigator.of(context).pop(_ProfilePhotoChoice.gallery);',
    galleryAction,
  );
  assert.ok(galleryAction >= 0 && pickerLaunch > galleryAction);
  assert.ok(sheetDismiss > pickerLaunch,
      'Web picker must open before the async sheet result loses browser activation');

  const pickerRoutine = compactSource.slice(
    compactSource.indexOf('Future<void> _pickPhoto('),
  );
  const syncOwnerCheck = pickerRoutine.indexOf(
    'if (!_profileActions.isSynchronouslyCurrent(owner)) { return; }',
  );
  const pickerDispatch = pickerRoutine.indexOf(
    'final XFile? shot = widget.imagePicker != null ? await widget.imagePicker!(source) : await ImagePicker().pickImage(',
  );
  assert.ok(syncOwnerCheck >= 0 && pickerDispatch > syncOwnerCheck);
  assert.doesNotMatch(
    pickerRoutine.slice(syncOwnerCheck, pickerDispatch),
    /await (?:_profileActions\.isCurrent|_isPickerOwnerCurrent)/u,
    'no async owner check may precede the browser file-input click',
  );
  assert.match(
    pickerRoutine,
    /if \(!_profileActions\.isSynchronouslyCurrent\(owner\)\) \{ return; \} final XFile\? shot = widget\.imagePicker != null \? await widget\.imagePicker!\(source\) : await ImagePicker\(\)\.pickImage\(source: source, imageQuality: 85\); if \(shot == null \|\| !await _isPickerPrincipalCurrent\(owner\)\) \{ return; \} final bytes = await shot\.readAsBytes\(\); if \(!await _isPickerPrincipalCurrent\(owner\)\) \{ return; \}/u,
    'picker activation is synchronous, then a freshly captured same principal is required before and after reading bytes',
  );
  assert.match(
    pickerRoutine,
    /Future<bool> _isPickerPrincipalCurrent\([\s\S]*?loadCurrentContext\(\)[\s\S]*?_samePickerPrincipal\(owner\.context, current\)[\s\S]*?isContextCurrent\(current\)/u,
  );
  assert.match(
    pickerRoutine,
    /_samePickerPrincipal\([\s\S]*?userId\?\.trim\(\)[\s\S]*?email\.trim\(\)\.toLowerCase\(\)/u,
  );
});

test('remote profile save cannot report success while a data URI remains unuploaded', () => {
  const updateProfile = mutationService.slice(
    mutationService.indexOf('Future<AccountProfileMutationResult> updateProfile('),
  );
  const remotePhotoGuard = updateProfile.indexOf(
    "photoUrl.trim().toLowerCase().startsWith('data:')",
  );
  const profileMutation = updateProfile.indexOf('performProfileMutation(');
  assert.ok(remotePhotoGuard >= 0 && remotePhotoGuard < profileMutation);
  assert.match(mutationService, /profile_photo_upload_required/u);

  const remoteSave = source.indexOf(
    'await _profileMutationService.updateProfile(',
  );
  const successDialog = source.indexOf("title: l10n.t('Gespeichert')");
  const failureHandler = source.indexOf(
    'on ProfileMutationFailure catch (failure)',
  );
  assert.ok(remoteSave >= 0 && remoteSave < successDialog);
  assert.ok(successDialog < failureHandler);
  assert.match(source.slice(failureHandler), /'Speichern fehlgeschlagen'/u);
});

test('open identity surfaces refresh the authoritative avatar after profile changes', () => {
  assert.match(
    thread,
    /key == SharedPersistenceSync\.accountSecurityStateKey[\s\S]*?_clearSensitiveThreadState\(\)[\s\S]*?_sharedPersistenceRefresh\.schedule\(_load\)/u,
  );
  assert.match(
    booking,
    /key != SharedPersistenceSync\.accountSecurityStateKey[\s\S]*?_reloadFromSharedPersistence/u,
  );
  assert.match(
    booking,
    /counterparty = counterpartyId\.isEmpty[\s\S]*?DataService\.getUserById\(counterpartyId\)/u,
  );
});

test('regression permanently executes managed avatar ownership with the exact enabled backend origin', () => {
  const regression = readFileSync(new URL('../../scripts/technical_regression_check.sh', import.meta.url), 'utf8');
  const expected = [
    'flutter', 'test', '--reporter', 'expanded',
    '--dart-define=SIT_BACKEND_ENABLED=true',
    '--dart-define=SIT_API_BASE_URL=http://127.0.0.1:1/api/v1',
    'test/managed_avatar_refresh_test.dart',
  ];
  const validate = (script) => {
    const commands = script.replace(/\\\r?\n[ \t]*/gu, ' ').split(/\r?\n/u)
      .filter((line) => /^flutter test\b/u.test(line) && line.includes(expected.at(-1)));
    assert.equal(commands.length, 1);
    assert.deepEqual(commands[0].trim().split(/\s+/u), expected);
  };
  validate(regression);
  const start = regression.indexOf('# Managed avatar ownership/restart');
  const end = regression.indexOf(expected.at(-1), start);
  for (const flag of expected.slice(4, 6)) {
    for (const replacement of ['', `${flag}-wrong`, `${flag} ${flag}`]) {
      const mutated = regression.slice(0, start)
        + regression.slice(start, end).replace(flag, replacement) + regression.slice(end);
      assert.throws(() => validate(mutated));
    }
  }
  assert.throws(() => validate(regression.replace(expected.at(-1), 'test/other_test.dart')));
});
