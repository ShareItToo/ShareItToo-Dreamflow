import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final renter = buildTestUser(
    'bookings-truth-renter',
    name: 'Bookings Truth Renter',
    email: 'bookings-truth-renter@example.invalid',
  );
  final owner = buildTestUser(
    'bookings-truth-owner',
    name: 'Bookings Truth Owner',
    email: 'bookings-truth-owner@example.invalid',
  );
  final cachedRequest = buildTestRequest(
    id: 'cached-request-must-not-be-truth',
    itemId: 'cached-listing',
    ownerId: owner.id,
    renterId: renter.id,
  );

  Map<String, Object> cachedState() => <String, Object>{
        'currentUser': jsonEncode(renter.toJson()),
        'users': jsonEncode(<Object>[renter.toJson(), owner.toJson()]),
        'items': '[]',
        'rental_requests': jsonEncode(<Object>[cachedRequest.toJson()]),
        'qa_messages_notifs_seeded_v3_for_${renter.id}': true,
        'auth_session_v1': jsonEncode(<String, Object>{
          'userId': renter.id,
          'sessionId': 'bookings-truth-session',
          'email': renter.email,
          'createdAt': '2026-09-11T00:00:00.000Z',
          'accessToken': 'bookings-truth-access',
          'refreshToken': 'bookings-truth-refresh',
          'accessTokenExpiresAt': '2099-01-01T00:00:00.000Z',
        }),
      };

  test('bookings screen binds load, empty, error and account-switch states',
      () async {
    final source =
        await File('lib/screens/bookings_screen.dart').readAsString();
    final loadStart = source.indexOf('Future<void> _load() async');
    final mapStart =
        source.indexOf('Future<Map<String, dynamic>> _toBookingMap', loadStart);
    expect(loadStart, greaterThanOrEqualTo(0));
    expect(mapStart, greaterThan(loadStart));
    final loadSource = source.substring(loadStart, mapStart);

    expect(source, contains('SharedPersistenceSync.accountSecurityStateKey'));
    expect(source, contains('LocalStateErrorPanel'));
    expect(source, contains('Buchungen werden geladen'));
    expect(source, contains('Buchungen konnten nicht geladen werden'));
    expect(source, contains('_hasLoadedSnapshot'));
    expect(loadSource, contains('LocalPrincipalActionOwner.capture()'));
    expect(loadSource, contains('await actionOwner.assertCurrent()'));
    expect(loadSource, contains('revision != _loadRevision'));
    expect(
      loadSource,
      contains('_hasLoadedSnapshot = true'),
      reason: 'Only a completed authoritative read may unlock empty-state UI.',
    );
    expect(
      loadSource,
      contains('Eine gebuchte Anzeige ist nicht verfügbar.'),
      reason: 'A dangling booking must fail closed instead of disappearing.',
    );
    expect(source, contains('_safeBookingAddressVisibility'));
    expect(source, contains("'result': 'hidden'"));
    expect(source, contains("'reason': 'optional_enrichment_unavailable'"));
    expect(source, contains('_safeHandoverReturnState'));
    expect(source, contains('return const <String, dynamic>{};'));
    expect(source, contains('_safeReviewSubmittedState'));
    expect(
      source,
      contains('return true;'),
      reason: 'Unknown review truth must suppress, never enable, its CTA.',
    );
  });

  if (!BackendConfig.enabled) {
    test('backend truth checks require the backend-enabled test profile', () {
      expect(BackendConfig.enabled, isFalse);
    });
    return;
  }

  setUp(() => SharedPreferences.setMockInitialValues(cachedState()));

  test('backend transport failure never falls back to cached booking truth',
      () async {
    var calls = 0;
    await http.runWithClient(() async {
      await expectLater(
        DataService.getRentalRequestsForRenter(renter.id),
        throwsA(isA<BackendException>()),
      );
    },
        () => MockClient((request) async {
              calls++;
              expect(request.method, 'GET');
              expect(request.url.path, '/api/v1/rental-requests');
              return http.Response('{"error":"synthetic_unavailable"}', 503);
            }));

    expect(calls, 2);
    final raw =
        (await SharedPreferences.getInstance()).getString('rental_requests');
    expect(raw, contains(cachedRequest.id));
  });

  test('malformed successful response is an error, never confirmed empty',
      () async {
    await http.runWithClient(() async {
      await expectLater(
        DataService.getRentalRequestsForRenter(renter.id),
        throwsA(
          isA<BackendException>().having(
            (error) => error.code,
            'code',
            'invalid_server_response',
          ),
        ),
      );
    },
        () => MockClient((request) async {
              expect(request.url.path, '/api/v1/rental-requests');
              return http.Response('{"requests":{"unexpected":true}}', 200);
            }));

    final raw =
        (await SharedPreferences.getInstance()).getString('rental_requests');
    expect(raw, contains(cachedRequest.id));
  });

  test('only an explicit server list may confirm and persist empty truth',
      () async {
    await http.runWithClient(() async {
      expect(
        await DataService.getRentalRequestsForRenter(renter.id),
        isEmpty,
      );
    },
        () => MockClient((request) async {
              expect(request.url.path, '/api/v1/rental-requests');
              return http.Response('{"requests":[]}', 200);
            }));

    expect(
      (await SharedPreferences.getInstance()).getString('rental_requests'),
      '[]',
    );
  });
}
