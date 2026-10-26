import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lendify/screens/profile_info_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

const _managedAvatar =
    'https://shareittoo.com/api/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp';
final _png = Uint8List.fromList(base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(const <String, Object>{});
  });

  testWidgets(
    'picker result survives same-session profile refresh and saves managed avatar',
    (tester) async {
      final uploadProbe = _UploadProbe();
      final service = _PickerProfileService(uploadProbe);
      final pendingRefresh = Completer<ProfileMutationContext?>();
      service.pendingRefresh = pendingRefresh;
      final pickerResult = Completer<XFile?>();
      var pickerCalls = 0;
      await _openProfile(tester, service, (source) {
        pickerCalls += 1;
        expect(source, ImageSource.gallery);
        return pickerResult.future;
      });

      await tester.tap(find.text('Foto ändern'));
      await _pumpUi(tester);
      await tester.tap(find.text('Foto aus Galerie wählen'));
      await _pumpUi(tester);
      expect(pickerCalls, 1);

      // Model the focus refresh racing the browser picker: the same-principal
      // reload starts first but remains pending while the picker resolves.
      SharedPersistenceSync.notify(SharedPersistenceSync.profileStateKey);
      await tester.pump();
      expect(service.loadCalls, 2);

      pickerResult.complete(_MemoryXFile());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(service.contextCheckCalls, greaterThan(0));
      expect(find.byType(Image), findsOneWidget,
          reason: 'the selected PNG should be visible as the local preview');

      // A late /auth/me response contains the stale server avatar. It may
      // refresh the rest of the profile but must not erase the newer draft.
      pendingRefresh.complete(service.refreshedContext());
      await _pumpUi(tester);
      expect(find.byType(Image), findsOneWidget,
          reason: 'late same-session refresh must preserve the selected photo');

      await tester.tap(find.text('Speichern'));
      await _pumpUi(tester);
      expect(uploadProbe.calls, 1);
      expect(uploadProbe.lastPurpose, 'profile_image');
      expect(uploadProbe.lastFilename, 'profile-avatar.png');
      expect(uploadProbe.lastBytes, _png);
      expect(service.profilePatchCalls, 1);
      expect(service.patchedPhotoUrl, _managedAvatar);
      expect(find.text('Gespeichert'), findsOneWidget);
      expect(
        find.byWidgetPredicate(
          (widget) => widget is AppImage && widget.url == _managedAvatar,
        ),
        findsOneWidget,
        reason: 'authoritative managed avatar is rendered after readback',
      );
    },
  );

  testWidgets('picker result is discarded when the authenticated owner changes',
      (tester) async {
    final uploadProbe = _UploadProbe();
    final service = _PickerProfileService(uploadProbe);
    final pickerResult = Completer<XFile?>();
    var pickerCalls = 0;
    await _openProfile(tester, service, (_) {
      pickerCalls += 1;
      return pickerResult.future;
    });

    await tester.tap(find.text('Foto ändern'));
    await _pumpUi(tester);
    await tester.tap(find.text('Foto aus Galerie wählen'));
    await _pumpUi(tester);
    expect(pickerCalls, 1);

    service.switchPrincipal();
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await _pumpUi(tester);
    pickerResult.complete(_MemoryXFile());
    await _pumpUi(tester);

    expect(uploadProbe.calls, 0);
    expect(service.profilePatchCalls, 0);
    expect(find.byType(Image), findsNothing);
  });

  testWidgets('same principal preview survives a refreshed session epoch',
      (tester) async {
    final service = _PickerProfileService(_UploadProbe());
    final pickerResult = Completer<XFile?>();
    await _openProfile(tester, service, (_) => pickerResult.future);
    await _openGalleryPicker(tester);

    final staleOwner = service.refreshedContext(epoch: service.sessionEpoch);
    service.sessionEpoch += 1;
    expect(await service.isContextCurrent(staleOwner), isFalse,
        reason: 'the original session epoch is now stale');

    pickerResult.complete(_MemoryXFile());
    await _pumpUi(tester);

    expect(service.contextCheckCalls, greaterThan(0));
    expect(find.byType(Image), findsOneWidget,
        reason: 'same user id and normalized email retain local preview');
  });

  testWidgets('principal switch or logout before bytes discards selection',
      (tester) async {
    for (final transition in ['account switch', 'logout']) {
      final service = _PickerProfileService(_UploadProbe());
      final pickerResult = Completer<XFile?>();
      final file = _MemoryXFile();
      await _openProfile(tester, service, (_) => pickerResult.future);
      await _openGalleryPicker(tester);

      if (transition == 'account switch') {
        service.switchPrincipal();
      } else {
        service.signOut();
      }
      SharedPersistenceSync.notify(
        SharedPersistenceSync.accountSecurityStateKey,
      );
      pickerResult.complete(file);
      await _pumpUi(tester);

      expect(file.readCalls, 0, reason: '$transition must fail before reading');
      expect(find.byType(Image), findsNothing);
      expect(service.profilePatchCalls, 0);
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });

  testWidgets('principal switch or logout during bytes discards selection',
      (tester) async {
    for (final transition in ['account switch', 'logout']) {
      final service = _PickerProfileService(_UploadProbe());
      final pickerResult = Completer<XFile?>();
      final bytesRead = Completer<void>();
      final bytes = Completer<Uint8List>();
      final file = _MemoryXFile(
        bytesFuture: bytes.future,
        onRead: () => bytesRead.complete(),
      );
      await _openProfile(tester, service, (_) => pickerResult.future);
      await _openGalleryPicker(tester);

      pickerResult.complete(file);
      await tester.pump();
      await bytesRead.future;
      expect(file.readCalls, 1);

      if (transition == 'account switch') {
        service.switchPrincipal();
      } else {
        service.signOut();
      }
      SharedPersistenceSync.notify(
        SharedPersistenceSync.accountSecurityStateKey,
      );
      bytes.complete(Uint8List.fromList(_png));
      await _pumpUi(tester);

      expect(find.byType(Image), findsNothing,
          reason: '$transition during byte read must discard local preview');
      expect(service.profilePatchCalls, 0);
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });

  testWidgets(
      'late profile refresh cannot restore photo draft after account change',
      (tester) async {
    final uploadProbe = _UploadProbe();
    final service = _PickerProfileService(uploadProbe);
    final pendingRefresh = Completer<ProfileMutationContext?>();
    service.pendingRefresh = pendingRefresh;
    await _openProfile(tester, service, (_) async => _MemoryXFile());

    await tester.tap(find.text('Foto ändern'));
    await _pumpUi(tester);
    await tester.tap(find.text('Foto aus Galerie wählen'));
    await _pumpUi(tester);
    await tester.pump(const Duration(milliseconds: 50));

    service.holdNextLoad();
    SharedPersistenceSync.notify(SharedPersistenceSync.profileStateKey);
    await tester.pump();
    expect(service.pendingLoadCalls, 1);
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(Image), findsOneWidget,
        reason: 'selected photo is visible before the security transition');

    service.switchPrincipal();
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await _pumpUi(tester);
    expect(find.byType(Image), findsNothing);

    pendingRefresh.complete(service.refreshedContext());
    await _pumpUi(tester);
    expect(find.byType(Image), findsNothing,
        reason:
            'a previous owner refresh must not restore private photo state');
    expect(uploadProbe.calls, 0);
    expect(service.profilePatchCalls, 0);
  });
}

Future<void> _openProfile(
  WidgetTester tester,
  _PickerProfileService service,
  Future<XFile?> Function(ImageSource source) picker,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<LocalizationController>(
      create: (_) => LocalizationController(),
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push<void>(
                MaterialPageRoute<void>(
                  builder: (_) => ProfileInfoScreen(
                    profileMutationService: service,
                    imagePicker: picker,
                  ),
                ),
              ),
              child: const Text('profile picker test'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('profile picker test'));
  await _pumpUi(tester);
  expect(find.byType(ProfileInfoScreen), findsOneWidget);
}

Future<void> _openGalleryPicker(WidgetTester tester) async {
  await tester.tap(find.text('Foto ändern'));
  await _pumpUi(tester);
  await tester.tap(find.text('Foto aus Galerie wählen'));
  await _pumpUi(tester);
}

Future<void> _pumpUi(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 350));
  await tester.pump();
}

final _user = buildTestUser(
  'profile-picker-owner',
  name: 'Picker Owner',
  email: 'profile-picker@example.invalid',
).copyWith(photoURL: null);
final _userB = buildTestUser(
  'profile-picker-owner-b',
  name: 'Picker Owner B',
  email: 'profile-picker-b@example.invalid',
).copyWith(photoURL: null);

final _authOwner = AuthSessionOwner(
  userId: _user.id,
  sessionId: 'profile-picker-session',
  email: _user.email,
  createdAt: DateTime.utc(2026, 10, 26),
  epoch: 9,
);

class _PickerProfileService extends ProfileMutationService {
  int loadCalls = 0;
  int contextCheckCalls = 0;
  int profilePatchCalls = 0;
  String? patchedPhotoUrl;
  bool _accountBActive = false;
  bool _signedOut = false;
  int sessionEpoch = 9;
  Completer<ProfileMutationContext?>? pendingRefresh;
  bool _holdNextLoad = false;
  int pendingLoadCalls = 0;

  _PickerProfileService(_UploadProbe uploadProbe)
      : super(
          remoteProfileImageUploadEnabled: true,
          profileImageUploader: uploadProbe.upload,
        );

  @override
  Future<ProfileMutationContext?> loadCurrentContext() async {
    loadCalls += 1;
    if (_signedOut) return null;
    final context = refreshedContext();
    if (_holdNextLoad && pendingRefresh != null) {
      _holdNextLoad = false;
      pendingLoadCalls += 1;
      return pendingRefresh!.future;
    }
    return context;
  }

  ProfileMutationContext refreshedContext({
    int? epoch,
    bool? accountB,
  }) {
    final selectedUser = (accountB ?? _accountBActive) ? _userB : _user;
    final selectedEpoch = epoch ?? sessionEpoch;
    return ProfileMutationContext(
      user: selectedUser,
      // Auth refresh/readback can create a new owner value for the same
      // principal with a refreshed session owner and epoch.
      owner: SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: selectedUser.id,
          sessionId: 'profile-picker-session-$selectedEpoch',
          email: selectedUser.email,
          createdAt: _authOwner.createdAt,
          epoch: selectedEpoch,
        ),
        profileUserId: selectedUser.id,
      ),
    );
  }

  @override
  Future<bool> isContextCurrent(ProfileMutationContext context) async {
    contextCheckCalls += 1;
    if (_signedOut) return false;
    final current = refreshedContext();
    final owner = context.owner.authOwner;
    final currentOwner = current.owner.authOwner;
    return context.user.id == current.user.id &&
        context.user.email.trim().toLowerCase() ==
            current.user.email.trim().toLowerCase() &&
        owner.userId == currentOwner.userId &&
        owner.sessionId == currentOwner.sessionId &&
        owner.email.trim().toLowerCase() ==
            currentOwner.email.trim().toLowerCase() &&
        owner.createdAt == currentOwner.createdAt &&
        owner.epoch == currentOwner.epoch;
  }

  @override
  Future<AccountProfileMutationResult> performProfileMutation({
    required ProfileMutationContext context,
    required Map<CurrentUserProfileField, Object?> updates,
  }) async {
    profilePatchCalls += 1;
    patchedPhotoUrl = updates[CurrentUserProfileField.photoURL] as String?;
    return AccountProfileMutationResult(
      user: context.user.copyWith(photoURL: patchedPhotoUrl),
      remoteAccepted: true,
    );
  }

  void switchPrincipal() {
    _accountBActive = true;
  }

  void signOut() {
    _signedOut = true;
  }

  void holdNextLoad() => _holdNextLoad = true;
}

class _UploadProbe {
  int calls = 0;
  String? lastFilename;
  String? lastPurpose;
  Uint8List? lastBytes;

  Future<String> upload({
    required AuthSessionOwner owner,
    required Uint8List bytes,
    required String filename,
    required String purpose,
  }) async {
    calls += 1;
    lastFilename = filename;
    lastPurpose = purpose;
    lastBytes = bytes;
    return _managedAvatar;
  }
}

class _MemoryXFile extends XFile {
  final Future<Uint8List>? bytesFuture;
  final VoidCallback? onRead;
  int readCalls = 0;

  _MemoryXFile({this.bytesFuture, this.onRead}) : super.fromData(_png);

  @override
  String get name => 'synthetic.png';

  @override
  Future<Uint8List> readAsBytes() async {
    readCalls += 1;
    onRead?.call();
    return bytesFuture == null ? Uint8List.fromList(_png) : await bytesFuture!;
  }
}
