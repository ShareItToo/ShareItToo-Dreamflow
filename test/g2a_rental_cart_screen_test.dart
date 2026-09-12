import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Mietkorb exposes Gemerkt as non-binding and accessible',
      (tester) async {
    final item = buildTestItem(id: 'item-1', ownerId: 'owner-1');
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': jsonEncode(<Object>[item.toJson()]),
      'wishlists_meta_v1': jsonEncode(<Map<String, Object>>[
        <String, Object>{
          'id': 'wl_soon',
          'name': 'Demnächst benötigt',
          'system': true,
        },
        <String, Object>{
          'id': 'wl_later',
          'name': 'Für später',
          'system': true,
        },
        <String, Object>{
          'id': 'wl_again',
          'name': 'Wieder mieten',
          'system': true,
        },
      ]),
      'wishlist_assign_v1': '{}',
    });

    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: const MaterialApp(home: RentalCartScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Mietkorb'), findsOneWidget);
    expect(find.text('Gemerkt'), findsOneWidget);
    expect(
      find.textContaining('Unverbindlich gespeichert – keine Reservierung.'),
      findsOneWidget,
    );
    expect(
      find.bySemanticsLabel(
        'Gemerkt. Unverbindlich gespeichert. Keine Reservierung.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Projektkorb'), findsNothing);
    expect(find.text('Technische Mehrfachanfrage'), findsNothing);
    semantics.dispose();
  });

  testWidgets(
      'guest Mietkorb shows persisted intent without a reservation claim',
      (tester) async {
    final item = buildTestItem(id: 'item-2', ownerId: 'owner-1');
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': jsonEncode(<Object>[item.toJson()]),
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'rental_cart_v1': jsonEncode(<String, dynamic>{
        'schemaVersion': 1,
        'revision': 1,
        'reservationCreated': false,
        'items': <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 'cartitem_test_1',
            'listingId': item.id,
            'startDate': '2026-09-01',
            'endDate': '2026-09-04',
            'quoteStatus': 'needs_recheck',
            'listing': item.toJson(),
          },
        ],
      }),
      'project_cart_v1': jsonEncode(<String, dynamic>{
        'schemaVersion': 1,
        'revision': 1,
        'projects': <dynamic>[],
      }),
    });

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: const MaterialApp(home: RentalCartScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Im Mietkorb – noch nicht reserviert'), findsOneWidget);
    expect(find.text(item.title), findsOneWidget);
    expect(find.text('Anmelden & synchronisieren'), findsOneWidget);
    expect(find.textContaining('Reservierung erstellt'), findsNothing);
    expect(find.text('Technische Mehrfachanfrage'), findsNothing);
  });

  testWidgets(
      'torn legacy cart stays preserved behind a persistent retryable load error',
      (tester) async {
    const itemsRaw =
        '{"schemaVersion":1,"revision":4,"items":[],"reservationCreated":false}';
    const projectsRaw = '{"schemaVersion":1,"revision":3,"projects":[]}';
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': '[]',
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'rental_cart_v1': itemsRaw,
      'project_cart_v1': projectsRaw,
    });

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: const MaterialApp(home: RentalCartScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(
      find.text('Gespeicherte Daten konnten nicht geladen werden'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Die lokale Kopie bleibt unverändert.'),
      findsOneWidget,
    );
    expect(find.widgetWithText(OutlinedButton, 'Erneut laden'), findsOneWidget);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('rental_cart_v1'), itemsRaw);
    expect(prefs.getString('project_cart_v1'), projectsRaw);

    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
  });
}
