import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/screens/bookings_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'new pending renter request appears in Ausstehend, not Kommend',
    (tester) async {
      final renter = buildTestUser(
        'pending-ui-renter',
        name: 'Pending UI Renter',
        email: 'pending-ui-renter@example.invalid',
      );
      final owner = buildTestUser(
        'pending-ui-owner',
        name: 'Pending UI Owner',
        email: 'pending-ui-owner@example.invalid',
      );
      final item = buildTestItem(
        id: 'pending-ui-listing',
        ownerId: owner.id,
        title: 'Synthetischer Pending-Projektor',
      );

      SharedPreferences.setMockInitialValues({
        'currentUser': jsonEncode(renter.toJson()),
        'users': jsonEncode([renter.toJson(), owner.toJson()]),
        'items': jsonEncode([item.toJson()]),
        'rental_requests': jsonEncode(<Object>[]),
        'auth_session_v1': jsonEncode(<String, Object>{
          'userId': renter.id,
          'email': renter.email,
          'createdAt': '2026-10-26T09:00:00.000Z',
        }),
      });

      final created = await DataService.addRentalRequest(
        RentalRequest(
          id: 'local',
          itemId: item.id,
          ownerId: owner.id,
          renterId: renter.id,
          start: DateTime(2026, 11, 10),
          end: DateTime(2026, 11, 12),
          status: 'pending',
          expressRequested: false,
        ),
      );
      expect(created.status, 'pending');

      await tester.pumpWidget(
        const MaterialApp(home: BookingsScreen(initialTabIndex: 2)),
      );
      await tester.pumpAndSettle();

      expect(find.text('Meine Buchungen'), findsOneWidget);
      expect(find.text('Synthetischer Pending-Projektor'), findsOneWidget);
      expect(find.text('Wartet auf Bestätigung'), findsOneWidget);
      expect(find.text('Du hast keine ausstehenden Buchungen'), findsNothing);

      await tester.tap(find.text('Kommend'));
      await tester.pumpAndSettle();
      expect(find.text('Du hast keine kommenden Buchungen'), findsOneWidget);
      expect(find.text('Synthetischer Pending-Projektor'), findsNothing);

      await tester.tap(find.text('Ausstehend'));
      await tester.pumpAndSettle();
      expect(find.text('Synthetischer Pending-Projektor'), findsOneWidget);

      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
