import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<AuthSessionOwner> _useSession(String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    'auth_session_v1',
    jsonEncode({
      'userId': 'snapshot-$suffix',
      'sessionId': 'snapshot-session-$suffix',
      'email': 'snapshot-$suffix@example.invalid',
      'createdAt': '2026-09-04T00:00:00Z',
      'accessToken': 'snapshot-access-$suffix',
      'refreshToken': 'snapshot-refresh-$suffix',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    }),
  );
  return AuthService.captureSessionOwner((await AuthService.readSession())!);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  if (!BackendConfig.enabled) {
    test('snapshot reads fail closed when backend is disabled', () async {
      await _useSession('disabled');
      await expectLater(
        BackendRepository.getRentalRequests(),
        throwsA(isA<Exception>()),
      );
    });
    return;
  }

  test('concurrent listing snapshots share only their in-flight GETs',
      () async {
    await _useSession('listings');
    final release = Completer<void>();
    final firstListingRequest = Completer<void>();
    final counts = <String, int>{};

    await http.runWithClient(() async {
      final first = BackendRepository.getListings();
      await firstListingRequest.future;
      final others = List.generate(4, (_) => BackendRepository.getListings());
      release.complete();
      await Future.wait([first, ...others]);

      expect(counts['/api/v1/listings'], 1);
      expect(counts['/api/v1/listings/mine'], 1);

      await BackendRepository.getListings();
      expect(counts['/api/v1/listings'], 2);
      expect(counts['/api/v1/listings/mine'], 2);
    },
        () => MockClient((request) async {
              final path = request.url.path;
              counts.update(path, (count) => count + 1, ifAbsent: () => 1);
              if (path == '/api/v1/listings') {
                if (!firstListingRequest.isCompleted)
                  firstListingRequest.complete();
                await release.future;
                return http.Response('{"listings":[]}', 200);
              }
              if (path == '/api/v1/listings/mine') {
                expect(
                  request.headers['Authorization'],
                  'Bearer snapshot-access-listings',
                );
                return http.Response('{"listings":[]}', 200);
              }
              throw StateError('Unexpected snapshot request: $path');
            }));
  });

  test('listing flight cannot adopt a successor principal after public GET',
      () async {
    await _useSession('listing-a');
    final release = Completer<void>();
    final publicStarted = <int, Completer<void>>{
      1: Completer<void>(),
      2: Completer<void>(),
    };
    var publicCalls = 0;
    final privateTokens = <String>[];

    await http.runWithClient(() async {
      final readA = BackendRepository.getListings();
      await publicStarted[1]!.future;
      await AuthService.clearSession();
      await _useSession('listing-b');
      final readB = BackendRepository.getListings();
      await publicStarted[2]!.future;

      release.complete();
      await expectLater(readA, throwsA(isA<StateError>()));
      await readB;
      expect(publicCalls, 2);
      expect(privateTokens, ['Bearer snapshot-access-listing-b']);
    },
        () => MockClient((request) async {
              final path = request.url.path;
              if (path == '/api/v1/listings') {
                publicCalls++;
                publicStarted[publicCalls]!.complete();
                await release.future;
                return http.Response('{"listings":[]}', 200);
              }
              if (path == '/api/v1/listings/mine') {
                privateTokens.add(request.headers['Authorization']!);
                return http.Response('{"listings":[]}', 200);
              }
              throw StateError('Unexpected listing request: $path');
            }));
  });

  test('generic and owner rental reads share one current-principal flight',
      () async {
    final owner = await _useSession('rental');
    final release = Completer<void>();
    final requestStarted = Completer<void>();
    var calls = 0;

    await http.runWithClient(() async {
      final ownerRead = BackendRepository.getRentalRequestsForOwner(owner);
      await requestStarted.future;
      final genericRead = BackendRepository.getRentalRequests();
      release.complete();
      await Future.wait([ownerRead, genericRead]);
      expect(calls, 1);

      await BackendRepository.getRentalRequestsForOwner(owner);
      expect(calls, 2);
    },
        () => MockClient((request) async {
              expect(request.url.path, '/api/v1/rental-requests');
              expect(request.headers['Authorization'],
                  'Bearer snapshot-access-rental');
              calls++;
              if (!requestStarted.isCompleted) requestStarted.complete();
              await release.future;
              return http.Response('{"requests":[]}', 200);
            }));
  });

  test('rental snapshots from different session epochs never share', () async {
    final ownerA = await _useSession('a');
    final release = Completer<void>();
    final firstStarted = Completer<void>();
    final secondStarted = Completer<void>();
    final tokens = <String>[];

    await http.runWithClient(() async {
      final readA = BackendRepository.getRentalRequestsForOwner(ownerA);
      await firstStarted.future;

      await AuthService.clearSession();
      final ownerB = await _useSession('b');
      final readB = BackendRepository.getRentalRequestsForOwner(ownerB);
      await secondStarted.future;
      expect(tokens, ['Bearer snapshot-access-a', 'Bearer snapshot-access-b']);

      release.complete();
      await expectLater(readA, throwsA(isA<Exception>()));
      await readB;
    },
        () => MockClient((request) async {
              tokens.add(request.headers['Authorization']!);
              if (tokens.length == 1) {
                firstStarted.complete();
              } else if (tokens.length == 2) {
                secondStarted.complete();
              }
              await release.future;
              return http.Response('{"requests":[]}', 200);
            }));
  });

  test('concurrent message-thread GET snapshots coalesce per owner', () async {
    final owner = await _useSession('threads');
    final release = Completer<void>();
    final started = Completer<void>();
    var calls = 0;

    await http.runWithClient(() async {
      final first = BackendRepository.getMessageThreadsForOwner(owner);
      await started.future;
      final second = BackendRepository.getMessageThreadsForOwner(owner);
      release.complete();
      await Future.wait([first, second]);
      expect(calls, 1);

      await BackendRepository.getMessageThreadsForOwner(owner);
      expect(calls, 2);
    },
        () => MockClient((request) async {
              expect(request.url.path, '/api/v1/message-threads');
              expect(
                request.headers['Authorization'],
                'Bearer snapshot-access-threads',
              );
              calls++;
              if (!started.isCompleted) started.complete();
              await release.future;
              return http.Response('{"threads":[]}', 200);
            }));
  });
}
