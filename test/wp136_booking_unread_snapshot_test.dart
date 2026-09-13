import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final renter = buildTestUser(
    'wp136-renter',
    name: 'WP136 Renter',
    email: 'wp136-renter@example.invalid',
  );
  final owner = buildTestUser(
    'wp136-owner',
    name: 'WP136 Owner',
    email: 'wp136-owner@example.invalid',
  );
  final outsider = buildTestUser(
    'wp136-outsider',
    name: 'WP136 Outsider',
    email: 'wp136-outsider@example.invalid',
  );

  Future<void> useAccount() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('currentUser', jsonEncode(renter.toJson()));
    await prefs.setString(
      'auth_session_v1',
      jsonEncode(<String, Object>{
        'userId': renter.id,
        'email': renter.email,
        'createdAt': '2026-09-13T09:00:00.000Z',
      }),
    );
  }

  List<RentalRequest> participantRequests(int count) => <RentalRequest>[
    for (var index = 0; index < count; index++)
      buildTestRequest(
        id: 'wp136-request-$index',
        itemId: 'wp136-item-$index',
        ownerId: owner.id,
        renterId: renter.id,
        status: 'cancelled',
      ),
  ];

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[
        renter.toJson(),
        owner.toJson(),
        outsider.toJson(),
      ]),
      'items': '[]',
    });
  });

  test(
    'counts a large authoritative snapshot from one local marker read',
    () async {
      await useAccount();
      final requests = participantRequests(500);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'read_requests_v1',
        jsonEncode(<String, Object>{
          renter.id: <String>[
            for (var index = 0; index < 125; index++) 'wp136-request-$index',
          ],
        }),
      );

      expect(
        await DataService.getUnreadCountForCategory(
          userId: renter.id,
          category: 'completed',
          requests: requests,
        ),
        375,
      );
    },
  );

  test('rejects a foreign request in the supplied snapshot', () async {
    await useAccount();
    final foreign = buildTestRequest(
      id: 'wp136-foreign',
      itemId: 'wp136-foreign-item',
      ownerId: owner.id,
      renterId: outsider.id,
    );

    await expectLater(
      DataService.getUnreadCountForCategory(
        userId: renter.id,
        category: 'completed',
        requests: <RentalRequest>[foreign],
      ),
      throwsStateError,
    );
  });

  test(
    'corrupt account marker fails closed instead of returning empty truth',
    () async {
      await useAccount();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'read_requests_v1',
        jsonEncode(<String, Object>{renter.id: 'not-a-list'}),
      );

      await expectLater(
        DataService.getUnreadCountForCategory(
          userId: renter.id,
          category: 'completed',
          requests: participantRequests(1),
        ),
        throwsFormatException,
      );
    },
  );
}
