import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/search_header.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

final _ownerA = buildTestUser(
  'search-header-owner-a',
  name: 'Search Header Owner A',
  email: 'search-header-owner-a@example.invalid',
);
final _ownerB = buildTestUser(
  'search-header-owner-b',
  name: 'Search Header Owner B',
  email: 'search-header-owner-b@example.invalid',
);

String _session(User user, String suffix) => jsonEncode(<String, Object?>{
      'userId': user.id,
      'sessionId': 'search-header-session-$suffix',
      'email': user.email,
      'createdAt': '2026-10-31T10:00:00Z',
      'accessToken': 'search-header-access-$suffix',
      'refreshToken': 'search-header-refresh-$suffix',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    });

Future<void> _setOwner(User user, String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('currentUser', jsonEncode(user.toJson()));
  await prefs.setString(
      'users', jsonEncode(<Object>[_ownerA.toJson(), _ownerB.toJson()]));
  await prefs.setString('auth_session_v1', _session(user, suffix));
  final session = await AuthService.readSession();
  AuthService.captureSessionOwner(session!);
}

class _RequestFixture {
  final Map<String, int> readsByOwner = <String, int>{};

  MockClient client() => MockClient((request) async {
        final authorization = request.headers['Authorization'] ?? '';
        final owner = authorization.contains('owner-b') ? _ownerB : _ownerA;
        if (request.method == 'GET' && request.url.path == '/api/v1/auth/me') {
          return http.Response(
            jsonEncode(<String, Object>{'user': owner.toJson()}),
            200,
          );
        }
        if (request.method == 'GET' &&
            request.url.path == '/api/v1/rental-requests') {
          readsByOwner.update(owner.id, (count) => count + 1,
              ifAbsent: () => 1);
          final requests = owner.id == _ownerA.id
              ? <Object>[
                  buildTestRequest(
                    id: 'synthetic-pending-owner-request',
                    itemId: 'synthetic-item',
                    ownerId: _ownerA.id,
                    renterId: _ownerB.id,
                    status: 'pending',
                  ).toJson(),
                ]
              : <Object>[];
          return http.Response(
            jsonEncode(<String, Object>{'requests': requests}),
            200,
          );
        }
        if (request.method == 'GET' &&
            (request.url.path == '/api/v1/listings' ||
                request.url.path == '/api/v1/listings/mine')) {
          return http.Response('{"listings":[]}', 200);
        }
        throw StateError(
          'Unexpected request ${request.method} ${request.url.path}',
        );
      });
}

Future<void> _pumpUntil(
  WidgetTester tester,
  bool Function() condition,
) async {
  for (var i = 0; i < 100; i++) {
    await tester.pump(const Duration(milliseconds: 20));
    if (condition()) return;
  }
  fail('Search header request badge did not settle');
}

Widget _headerApp({required Widget child}) => ChangeNotifierProvider(
      create: (_) => LocalizationController(),
      child: MaterialApp(home: Scaffold(body: child)),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{}));

  testWidgets('parent layout and animation rebuilds do not refetch requests',
      (tester) async {
    if (!BackendConfig.enabled) return;
    await _setOwner(_ownerA, 'stable');
    final fixture = _RequestFixture();
    late StateSetter rebuild;
    var tick = 0;

    await http.runWithClient(() async {
      await tester.pumpWidget(_headerApp(
        child: StatefulBuilder(
          builder: (context, setState) {
            rebuild = setState;
            return SingleChildScrollView(
              child: SizedBox(
                width: tick.isEven ? 500 : 501,
                child: Column(
                  children: [
                    Text('parent-$tick'),
                    SearchHeader(
                      onFiltersPressed: () {},
                      onSearchTap: () {},
                    ),
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 1),
                      height: 2 + (tick % 3).toDouble(),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ));
      await _pumpUntil(
        tester,
        () =>
            fixture.readsByOwner[_ownerA.id] == 2 &&
            find
                .byKey(
                    const Key('search-header-pending-owner-request-indicator'))
                .evaluate()
                .isNotEmpty,
      );

      for (var i = 0; i < 12; i++) {
        rebuild(() => tick++);
        await tester.pump(const Duration(milliseconds: 16));
      }
      expect(fixture.readsByOwner[_ownerA.id], 2);

      SharedPersistenceSync.notify(SharedPersistenceSync.rentalRequestsKey);
      await _pumpUntil(tester, () => fixture.readsByOwner[_ownerA.id] == 4);
      expect(fixture.readsByOwner[_ownerA.id], 4);
      expect(
        find
            .byKey(const Key('search-header-pending-owner-request-indicator'))
            .evaluate(),
        isNotEmpty,
      );
      await tester.pumpWidget(const SizedBox());
      SharedPersistenceSync.notify(SharedPersistenceSync.rentalRequestsKey);
      await tester.pump();
      expect(fixture.readsByOwner[_ownerA.id], 4);
    }, fixture.client);
  });

  testWidgets('account transition hides old badge and loads only new owner',
      (tester) async {
    if (!BackendConfig.enabled) return;
    await _setOwner(_ownerA, 'owner-a');
    final fixture = _RequestFixture();

    await http.runWithClient(() async {
      await tester.pumpWidget(_headerApp(
        child: const SingleChildScrollView(
          child: SearchHeader(onFiltersPressed: _noop, onSearchTap: _noop),
        ),
      ));
      final badge = find.byKey(
        const Key('search-header-pending-owner-request-indicator'),
      );
      await _pumpUntil(
        tester,
        () =>
            fixture.readsByOwner[_ownerA.id] == 2 &&
            badge.evaluate().isNotEmpty,
      );

      await _setOwner(_ownerB, 'owner-b');
      SharedPersistenceSync.notify(
          SharedPersistenceSync.accountSecurityStateKey);
      await tester.pump();
      expect(badge, findsNothing);
      await _pumpUntil(tester, () => fixture.readsByOwner[_ownerB.id] == 2);
      expect(fixture.readsByOwner[_ownerA.id], 2);
      expect(fixture.readsByOwner[_ownerB.id], 2);
      expect(badge, findsNothing);
      await tester.pumpWidget(const SizedBox());
    }, fixture.client);
  });
}

void _noop() {}
