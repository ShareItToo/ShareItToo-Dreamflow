import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/screens/private_pilot_checkout_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Stage-A creates only an acknowledged non-binding simulation',
      (tester) async {
    expect(PrivatePilotConfig.stageANonBindingPilotEnabled, isTrue);
    expect(PrivatePilotConfig.bindingCheckoutEnabled, isFalse);

    final item = buildTestItem(
      id: 'stage-a-item',
      ownerId: 'owner',
      pricePerDay: 40,
    );
    final owner = buildTestUser('owner', name: 'Vermieter');
    final renter = buildTestUser('renter', name: 'Mieter');
    SharedPreferences.setMockInitialValues({
      'users': jsonEncode([owner.toJson(), renter.toJson()]),
      'currentUser': jsonEncode(renter.toJson()),
      'auth_session_v1': jsonEncode({
        'userId': renter.id,
        'email': renter.email,
        'createdAt': '2026-09-01T00:00:00.000Z',
      }),
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

    expect(find.text('Unverbindliche Stage-A-Vorschau'), findsOneWidget);
    expect(find.text('Unverbindliche Preisvorschau'), findsOneWidget);
    expect(find.text('Simulierte Gesamtsumme'), findsOneWidget);
    expect(
      find.text(PrivatePilotConfig.blueOceanStageANonBindingNotice),
      findsOneWidget,
    );
    expect(
        find.textContaining('verbindliche Buchungsanfrage ab'), findsNothing);

    final buttonFinder = find.widgetWithText(
      FilledButton,
      'Test-Mietanfrage senden',
    );
    await tester.scrollUntilVisible(
      buttonFinder,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    final button = tester.widget<FilledButton>(buttonFinder);
    expect(button.onPressed, isNull);
    expect(find.byType(CheckboxListTile), findsOneWidget);

    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    final enabledButton = tester.widget<FilledButton>(buttonFinder);
    expect(enabledButton.onPressed, isNotNull);
    await tester.tap(buttonFinder);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    final prefs = await SharedPreferences.getInstance();
    final requests = jsonDecode(prefs.getString('rental_requests')!) as List;
    final simulations = requests
        .map((entry) => Map<String, dynamic>.from(entry as Map))
        .where((entry) => entry['simulationOnly'] == true)
        .toList(growable: false);
    expect(simulations, hasLength(1));
    final request = simulations.single;
    expect(request['simulationOnly'], isTrue);
    expect(request['platformContract'], isNull);
    expect(request['bindingExpiresAt'], isNull);
    await tester.pump(const Duration(seconds: 3));
  });
}
