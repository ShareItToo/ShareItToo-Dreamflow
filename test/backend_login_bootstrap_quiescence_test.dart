import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('concurrent owner hydration settles without profile write feedback',
      () async {
    if (!BackendConfig.enabled) return;

    final user = User.fromJson(
      buildTestUser(
        'synthetic-bootstrap-owner',
        name: 'Synthetic Bootstrap Owner',
        email: 'bootstrap-owner@example.invalid',
      ).toJson(),
    );
    final prefs = await SharedPreferences.getInstance();
    final sessionJson = jsonEncode(<String, Object?>{
      'userId': user.id,
      'sessionId': 'synthetic-bootstrap-session',
      'email': user.email,
      'createdAt': '2026-10-31T10:00:00Z',
      'accessToken': 'synthetic-bootstrap-access',
      'refreshToken': 'synthetic-bootstrap-refresh',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    });
    final userJson = jsonEncode(user.toJson());
    await prefs.setString('auth_session_v1', sessionJson);
    await prefs.setString('currentUser', userJson);
    await prefs.setString(
        'users',
        jsonEncode(<Map<String, dynamic>>[
          user.toJson(),
        ]));
    final owner = AuthService.captureSessionOwner(
      (await AuthService.readSession())!,
    );

    var profileReads = 0;
    var profileWrites = 0;
    var remoteUser = user;
    final releaseRead = Completer<void>();
    final readStarted = Completer<void>();
    final changes = <String>[];
    final subscription = SharedPersistenceSync.changes.listen(changes.add);
    addTearDown(subscription.cancel);

    await http.runWithClient(() async {
      final bootstrapReads = Future.wait(List.generate(
        8,
        (_) => DataService.syncCurrentUserForSessionOwner(owner),
      ));
      await readStarted.future;
      await Future<void>.delayed(const Duration(milliseconds: 10));
      releaseRead.complete();
      await bootstrapReads;

      expect(profileReads, 1);
      expect(profileWrites, 0);
      expect(changes, isEmpty);

      // Completion releases the read flight: the next independent operation
      // performs a fresh GET, while the exact profile read stays silent.
      await DataService.syncCurrentUserForSessionEmail(user.email);
      expect(profileReads, 2);
      expect(profileWrites, 0);
      expect(changes, isEmpty);

      final changed = User.fromJson(user.toJson()).copyWith(bio: 'Updated');
      remoteUser = changed;
      // A real authoritative profile change must still notify its listeners.
      await DataService.syncCurrentUserForSessionOwner(
        owner,
        notificationKey: SharedPersistenceSync.profileStateKey,
      );
      expect(changes, <String>[SharedPersistenceSync.profileStateKey]);
      expect(profileReads, 3);
      expect(profileWrites, 0);
    },
        () => MockClient((request) async {
              expect(request.url.path, '/api/v1/auth/me');
              if (request.method == 'GET') {
                profileReads++;
                if (!readStarted.isCompleted) readStarted.complete();
                await releaseRead.future;
                return http.Response(
                  jsonEncode({'user': remoteUser.toJson()}),
                  200,
                );
              }
              if (request.method == 'PATCH') profileWrites++;
              throw StateError('Unexpected profile method ${request.method}');
            }));
  });
}
