import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/services/session_transition_service.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final user = buildTestUser(
    'wp189-profile-owner',
    name: 'WP189 owner',
    email: 'wp189-owner@example.invalid',
  );
  final owner = SessionTransitionOwner(
    authOwner: AuthSessionOwner(
      userId: user.id,
      sessionId: 'wp189-session',
      email: user.email,
      createdAt: DateTime.utc(2026, 9, 17),
      epoch: 1,
    ),
    profileUserId: user.id,
  );
  final context = ProfileMutationContext(user: user, owner: owner);
  const draft = 'data:image/png;base64,AA==';
  const managedUrl =
      'https://shareittoo.com/api/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp';

  test('successful profile upload returns only the managed URL', () async {
    var uploadCalls = 0;
    final service = _TestProfileMutationService(
      remoteUploadEnabled: true,
      uploader: ({
        required AuthSessionOwner owner,
        required bytes,
        required String filename,
        required String purpose,
      }) async {
        uploadCalls += 1;
        expect(purpose, 'profile_image');
        expect(filename, 'profile-avatar.png');
        expect(bytes, isNotEmpty);
        return managedUrl;
      },
    );

    final result = await service.persistPhotoDraft(
      context: context,
      photoDraft: draft,
    );
    expect(result, managedUrl);
    expect(uploadCalls, 1);
  });

  test('upload failure is surfaced and cannot become a successful URL',
      () async {
    var oldAvatar = managedUrl;
    final service = _TestProfileMutationService(
      remoteUploadEnabled: true,
      uploader: ({
        required AuthSessionOwner owner,
        required bytes,
        required String filename,
        required String purpose,
      }) async {
        throw const BackendException(503, 'upload_unavailable');
      },
    );

    try {
      final nextAvatar = await service.persistPhotoDraft(
        context: context,
        photoDraft: draft,
      );
      oldAvatar = nextAvatar ?? oldAvatar;
      fail('upload failure must not return a profile URL');
    } catch (error) {
      expect(error, isA<BackendException>());
      expect((error as BackendException).code, 'upload_unavailable');
    }
    expect(oldAvatar, managedUrl);
  });

  test('stale principal is rejected after upload before profile binding',
      () async {
    var uploadCalls = 0;
    final service = _TestProfileMutationService(
      remoteUploadEnabled: true,
      flipAfterUpload: true,
      uploader: ({
        required AuthSessionOwner owner,
        required bytes,
        required String filename,
        required String purpose,
      }) async {
        uploadCalls += 1;
        return managedUrl;
      },
    );

    await expectLater(
      service.persistPhotoDraft(context: context, photoDraft: draft),
      throwsA(
        isA<ProfileMutationFailure>().having(
          (failure) => failure.kind,
          'kind',
          ProfileMutationFailureKind.principalChanged,
        ),
      ),
    );
    expect(uploadCalls, 1);
  });

  test('already managed or empty drafts do not upload', () async {
    var uploadCalls = 0;
    final service = _TestProfileMutationService(
      remoteUploadEnabled: true,
      uploader: ({
        required AuthSessionOwner owner,
        required bytes,
        required String filename,
        required String purpose,
      }) async {
        uploadCalls += 1;
        return managedUrl;
      },
    );
    expect(
      await service.persistPhotoDraft(context: context, photoDraft: managedUrl),
      managedUrl,
    );
    expect(
      await service.persistPhotoDraft(context: context, photoDraft: '  '),
      '',
    );
    expect(uploadCalls, 0);
  });
}

class _TestProfileMutationService extends ProfileMutationService {
  final bool flipAfterUpload;
  int _contextChecks = 0;

  _TestProfileMutationService({
    required ProfileImageUploader uploader,
    this.flipAfterUpload = false,
    bool remoteUploadEnabled = false,
  }) : super(
          profileImageUploader: uploader,
          remoteProfileImageUploadEnabled: remoteUploadEnabled,
        );

  @override
  Future<bool> isContextCurrent(ProfileMutationContext context) async {
    _contextChecks += 1;
    return !flipAfterUpload || _contextChecks < 2;
  }
}
