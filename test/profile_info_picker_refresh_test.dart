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

      // The picker is still pending while the profile screen performs the
      // same-principal current-user refresh seen after Auth refresh/readback.
      SharedPersistenceSync.notify(SharedPersistenceSync.profileStateKey);
      await _pumpUi(tester);
      expect(service.loadCalls, 2);

      pickerResult.complete(_MemoryXFile());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(service.contextCheckCalls, greaterThan(0));
      expect(find.byType(Image), findsOneWidget,
          reason: 'the selected PNG should be visible as the local preview');

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
    expect(find.text('Kein Benutzer geladen'), findsOneWidget);
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
  bool _principalChanged = false;

  _PickerProfileService(_UploadProbe uploadProbe)
      : super(
          remoteProfileImageUploadEnabled: true,
          profileImageUploader: uploadProbe.upload,
        );

  @override
  Future<ProfileMutationContext?> loadCurrentContext() async {
    loadCalls += 1;
    if (_principalChanged) return null;
    return ProfileMutationContext(
      user: _user,
      owner: SessionTransitionOwner(
          authOwner: _authOwner, profileUserId: _user.id),
    );
  }

  @override
  Future<bool> isContextCurrent(ProfileMutationContext context) async {
    contextCheckCalls += 1;
    return !_principalChanged && identical(context.owner.authOwner, _authOwner);
  }

  @override
  Future<AccountProfileMutationResult> performProfileMutation({
    required ProfileMutationContext context,
    required Map<CurrentUserProfileField, Object?> updates,
  }) async {
    profilePatchCalls += 1;
    patchedPhotoUrl = updates[CurrentUserProfileField.photoURL] as String?;
    return AccountProfileMutationResult(
      user: _user.copyWith(photoURL: patchedPhotoUrl),
      remoteAccepted: true,
    );
  }

  void switchPrincipal() {
    _principalChanged = true;
  }
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
  _MemoryXFile() : super.fromData(_png);

  @override
  String get name => 'synthetic.png';

  @override
  Future<Uint8List> readAsBytes() async => Uint8List.fromList(_png);
}
