import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/booking_time_snapshot.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/screens/private_pilot_checkout_screen.dart';
import 'package:lendify/widgets/private_pilot_owner_acceptance_dialog.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('opening checkout keeps submit blocked until exact times exist',
      (tester) async {
    final item = buildTestItem(
      id: 'pilot-item',
      ownerId: 'owner',
      pricePerDay: 40,
    );
    SharedPreferences.setMockInitialValues({
      'items': jsonEncode([item.toJson()]),
      'rental_requests': jsonEncode([]),
    });

    await tester.pumpWidget(
      MaterialApp(
        home: PrivatePilotCheckoutScreen(
          item: item,
          range: DateTimeRange(
            start: DateTime(2026, 9, 1),
            end: DateTime(2026, 9, 2),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Preisaufschlüsselung'), findsOneWidget);
    expect(find.text('Gesamtpreis'), findsOneWidget);
    expect(find.text('44,00 €'), findsOneWidget);
    final prefs = await SharedPreferences.getInstance();
    expect(jsonDecode(prefs.getString('rental_requests')!) as List, isEmpty);

    final scrollable = find.byType(Scrollable).first;
    final platformTermsLink = find.textContaining('Teil A · V5.2-2026-08-16');
    await tester.scrollUntilVisible(
      platformTermsLink,
      200,
      scrollable: scrollable,
    );
    expect(platformTermsLink, findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Bestätigen und bezahlen'),
      300,
      scrollable: scrollable,
    );
    final submit = tester.widget<FilledButton>(
      find.widgetWithText(
        FilledButton,
        'Bestätigen und bezahlen',
      ),
    );
    expect(submit.onPressed, isNull);
    expect(find.byType(CheckboxListTile), findsNWidgets(2));

    for (var index = 0; index < 2; index += 1) {
      final checkbox = find.byType(Checkbox).at(index);
      await tester.ensureVisible(checkbox);
      await tester.pumpAndSettle();
      await tester.tap(checkbox);
      await tester.pump();
    }

    await tester.scrollUntilVisible(
      find.text('Bestätigen und bezahlen'),
      300,
      scrollable: scrollable,
    );
    final enabledSubmit = tester.widget<FilledButton>(
      find.widgetWithText(
        FilledButton,
        'Bestätigen und bezahlen',
      ),
    );
    expect(enabledSubmit.onPressed, isNull);
    await tester.scrollUntilVisible(
      find.text('Abhol- und Rückgabezeit'),
      -300,
      scrollable: scrollable,
    );
    expect(find.textContaining('Ohne beide Zeiten bleibt die Anfrage gesperrt'),
        findsOneWidget);
  });

  testWidgets('owner acceptance detail shows the immutable local times',
      (tester) async {
    final snapshot = BookingTimeSnapshot.fromLocal(
      handover: DateTime.utc(2026, 9, 1, 9),
      returned: DateTime.utc(2026, 9, 2, 17),
    );
    final request = RentalRequest(
      id: 'request-owner-detail',
      itemId: 'item-owner-detail',
      ownerId: 'owner',
      renterId: 'renter',
      start: DateTime.utc(2026, 9, 1),
      end: DateTime.utc(2026, 9, 2),
      timeSnapshot: snapshot,
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: buildPrivatePilotOwnerAcceptanceDialog(
            request: request,
            dismiss: (_) {},
          ),
        ),
      ),
    );
    expect(find.textContaining('01.09.2026, 09:00 Uhr'), findsOneWidget);
    expect(find.textContaining('02.09.2026, 17:00 Uhr'), findsOneWidget);
  });
}
