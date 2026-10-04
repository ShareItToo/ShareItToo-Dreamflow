import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/profile_info_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/profile_wire.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final value in <Object>[
    '1996-01-01',
    '1996-01-01T00:00:00.000',
    '1996-01-01T00:00:00+14:00',
    '1996-01-01T23:59:59-12:00',
    DateTime(1996),
    DateTime.utc(1996),
  ]) {
    test('calendar date is preserved: $value', () {
      final input = <String, dynamic>{'birthDate': value, 'bio': 'unchanged'};
      expect(profileForWire(input),
          {'birthDate': '1996-01-01', 'bio': 'unchanged'});
      expect(input['birthDate'], value);
    });
  }
  test('null, absent date and leap day retain their meaning', () {
    expect(profileForWire({'birthDate': null}), {'birthDate': null});
    expect(profileForWire({'bio': 'only'}), {'bio': 'only'});
    expect(profileForWire({'birthDate': '2000-02-29T12:34:56.123456Z'}),
        {'birthDate': '2000-02-29'});
  });
  for (final invalid in <Object>[
    '',
    ' 1996-01-01',
    '1996-01-01\n',
    '1996-1-1',
    '1900-02-29',
    '2001-02-29',
    '1996-02-30',
    '1996-00-01',
    '1996-13-01',
    '0000-01-01',
    '1996-01-01T24:00:00',
    '1996-01-01T00:60:00',
    '1996-01-01T00:00:60',
    '1996-01-01T00:00:00+24:00',
    '1996-01-01T00:00:00+01:60',
    '1996-01-01garbage',
    1996,
    true,
    <String>[],
    <String, dynamic>{},
    DateTime.utc(10000),
  ]) {
    test('invalid birth date fails closed: $invalid', () {
      expect(
          () => profileForWire({'birthDate': invalid}), throwsFormatException);
    });
  }

  for (final owned in [false, true]) {
    test(
        'repository owned=$owned normalizes before transport and rejects invalid input',
        () async {
      final user = buildTestUser('wire-user', name: 'Wire User');
      seed(user);
      final owner =
          AuthService.captureSessionOwner((await AuthService.readSession())!);
      var calls = 0;
      await http.runWithClient(() async {
        for (final date in <Object?>['1996-01-01T00:00:00.000', null]) {
          final input = {'birthDate': date};
          if (owned) {
            await BackendRepository.updateCurrentProfileForOwner(owner, input);
          } else {
            await BackendRepository.updateCurrentProfile(input);
          }
        }
        final invalid = {'birthDate': '1996-02-30'};
        await expectLater(
            owned
                ? BackendRepository.updateCurrentProfileForOwner(owner, invalid)
                : BackendRepository.updateCurrentProfile(invalid),
            throwsFormatException);
      },
          () => MockClient((request) async {
                expect(request.method, 'PATCH');
                expect(request.url.path, endsWith('/profile'));
                final profile =
                    (jsonDecode(request.body) as Map)['profile'] as Map;
                expect(profile['birthDate'], calls == 0 ? '1996-01-01' : null);
                calls++;
                return http.Response(jsonEncode({'user': user.toJson()}), 200);
              }));
      expect(calls, 2);
    });
  }

  testWidgets(
      'real form through PATCH and backend validator persists and reloads adult year',
      (tester) async {
    final initial = buildTestUser('wire-form-user', name: 'Wire Form');
    seed(initial);
    var remote = initial.toJson();
    var patches = 0;
    var readsAfterPatch = 0;
    await http.runWithClient(() async {
      Future<void> open() async {
        await tester.pumpWidget(ChangeNotifierProvider(
            create: (_) => LocalizationController(),
            child: const MaterialApp(home: ProfileInfoScreen())));
        await tester.pumpAndSettle();
      }

      await open();
      final year = find.byType(TextFormField).at(2);
      await tester.ensureVisible(year);
      await tester.enterText(year, '1996');
      await tester.ensureVisible(find.text('Speichern'));
      await tester.tap(find.text('Speichern'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('Gespeichert'), findsOneWidget);
      expect(patches, 1);
      expect(readsAfterPatch, greaterThan(0));
      final prefs = await SharedPreferences.getInstance();
      final persisted =
          User.fromJson(jsonDecode(prefs.getString('currentUser')!));
      expect(persisted.birthDate, DateTime(1996));
      expect(persisted.toJson()['birthDate'], '1996-01-01T00:00:00.000');
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox.shrink());
      await open();
      expect(
          tester
              .widget<TextFormField>(find.byType(TextFormField).at(2))
              .controller!
              .text,
          '1996');
      await tester.pumpWidget(const SizedBox.shrink());
    },
        () => MockClient((request) async {
              if (request.method == 'PATCH' &&
                  request.url.path.endsWith('/profile')) {
                final body =
                    (jsonDecode(request.body) as Map)['profile'] as Map;
                expect(body['birthDate'], '1996-01-01');
                // Execute the real backend sanitizer + age validator, never a server.
                expect(backendAccepts(body['birthDate']), true);
                remote = Map<String, dynamic>.from(body);
                patches++;
                return http.Response(jsonEncode({'user': remote}), 200);
              }
              if (request.method == 'GET' &&
                  request.url.path.endsWith('/auth/me')) {
                if (patches > 0) readsAfterPatch++;
                return http.Response(jsonEncode({'user': remote}), 200);
              }
              if (request.method == 'GET' &&
                  request.url.path.endsWith('/rental-requests')) {
                return http.Response(jsonEncode({'requests': []}), 200);
              }
              throw StateError(
                  'Unexpected mock route: ${request.method} ${request.url.path}');
            }));
  }, skip: !BackendConfig.enabled);

  test('real backend age restriction stays intact after wire normalization',
      () {
    expect(
        backendAccepts(
            profileForWire({'birthDate': DateTime(1996)})['birthDate']),
        true);
    expect(
        backendAccepts(
            profileForWire({'birthDate': DateTime.now()})['birthDate']),
        false);
    expect(backendAccepts(null), true);
    expect(backendAccepts('1996-01-01T00:00:00.000'), false);
    expect(
        backendAccepts(
            profileForWire({'birthDate': '2000-02-29'})['birthDate']),
        true);
  });
}

bool backendAccepts(Object? date) {
  final result = Process.runSync('node', [
    '--input-type=module',
    '-e',
    '''
    import {isValidBirthDate, sanitizeProfileUpdate} from './backend/src/security.js';
    const value = JSON.parse(process.argv[1]);
    process.stdout.write(JSON.stringify(isValidBirthDate(sanitizeProfileUpdate({birthDate:value}).birthDate)));
  ''',
    jsonEncode(date)
  ], environment: {
    'JWT_SECRET': 'synthetic-profile-wire-test-secret-not-for-use',
    'DATABASE_URL': 'postgres://example:example@localhost:5432/example',
  });
  expect(result.exitCode, 0, reason: result.stderr.toString());
  return jsonDecode(result.stdout as String) as bool;
}

void seed(User user) {
  SharedPreferences.setMockInitialValues({
    'qa_messages_notifs_seeded_v3_for_${user.id}': true,
    'users': jsonEncode([user.toJson()]),
    'currentUser': jsonEncode(user.toJson()),
    'auth_session_v1': jsonEncode({
      'userId': user.id,
      'email': user.email,
      'sessionId': 'synthetic-wire-session',
      'createdAt': '2026-01-01T00:00:00Z',
      'accessToken': 'synthetic-access',
      'refreshToken': 'synthetic-refresh',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    }),
  });
}
