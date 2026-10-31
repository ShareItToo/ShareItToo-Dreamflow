import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/screens/booking_detail_screen.dart';
import 'package:lendify/widgets/return_handover_stepper_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('accepted simulation exposes handover only in exact Stage-A',
      (tester) async {
    final now = DateTime.now();
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(),
        home: BookingDetailScreen(
          viewerIsOwner: true,
          booking: {
            'requestId': 'stage-a-upcoming',
            'itemId': 'stage-a-item',
            'ownerId': 'stage-a-owner',
            'listerId': 'stage-a-renter',
            'rawStatus': 'accepted',
            'workflowStatus': 'accepted',
            'simulationOnly': true,
            'title': 'SIT Stage-A Übergabe',
            'dates': '15. Nov – 17. Nov',
            'status': 'Akzeptiert',
            'category': 'upcoming',
            'images': const <String>[],
            'listerName': 'SIT Test Mieter',
            'startIso': now.add(const Duration(days: 2)).toIso8601String(),
            'endIso': now.add(const Duration(days: 4)).toIso8601String(),
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Unverbindliche Pilot-Simulation'),
      280,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Unverbindliche Pilot-Simulation'), findsOneWidget);
    expect(find.textContaining('ohne Vertrag'), findsOneWidget);
    if (PrivatePilotConfig.stageANonBindingPilotAvailable) {
      await tester.scrollUntilVisible(
        find.text('Übergabe starten'),
        360,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Übergabe starten'), findsOneWidget);
      expect(find.text('Übergabezeit'), findsOneWidget);
    } else {
      for (var index = 0; index < 8; index += 1) {
        await tester.drag(find.byType(ListView).first, const Offset(0, -420));
        await tester.pumpAndSettle();
      }
      expect(find.text('Übergabe starten'), findsNothing);
      expect(find.text('Übergabezeit'), findsNothing);
    }
  });

  testWidgets('completed simulation never exposes Staging review',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(),
        home: BookingDetailScreen(
          booking: {
            'requestId': 'stage-a-completed',
            'itemId': 'stage-a-item',
            'rawStatus': 'completed',
            'workflowStatus': 'completed',
            'simulationOnly': true,
            'title': 'SIT Stage-A Rückgabe',
            'dates': '15. Nov – 17. Nov',
            'status': 'Abgeschlossen',
            'category': 'completed',
            'images': const <String>[],
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
        find.text('Pilot-Simulation · Abgeschlossene Buchung'), findsOneWidget);
    expect(find.text('Bewerten'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('Unverbindliche Pilot-Simulation').first,
      280,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.textContaining('Erstattung'), findsWidgets);
  });

  testWidgets(
      'simulation return stepper keeps photos and QR but omits damage case',
      (tester) async {
    final owner = buildTestUser('stage-stepper-owner', name: 'Pilot Vermieter');
    final renter = buildTestUser('stage-stepper-renter', name: 'Pilot Mieter');
    final item = buildTestItem(id: 'stage-stepper-item', ownerId: owner.id);
    final now = DateTime.now();
    final request = RentalRequest(
      id: 'stage-stepper-return',
      itemId: item.id,
      ownerId: owner.id,
      renterId: renter.id,
      start: now.subtract(const Duration(hours: 1)),
      end: now.add(const Duration(days: 1)),
      status: 'running',
      simulationOnly: true,
    );
    await _seed(owner: owner, renter: renter, item: item, request: request);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'handover_return_state_v1',
      jsonEncode({
        request.id: {
          'returnPresenterPhotos': 4,
          'returnCounterpartyConfirmation': {
            'decision': 'confirmed',
            'verifierUserId': owner.id,
          },
        },
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(),
        home: ReturnHandoverStepperPage(
          item: item,
          request: request,
          renterName: renter.displayName,
          ownerName: owner.displayName,
          handoverCode: '',
          viewerIsOwner: true,
          mode: ReturnFlowMode.returnFlow,
          allowDamageCase: !request.simulationOnly,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('1/2'), findsOneWidget);
    expect(find.text('Rückgabe Fotos'), findsOneWidget);
    expect(find.text('Schaden melden'), findsNothing);
    expect(find.textContaining('von 4 Pflichtfotos'), findsOneWidget);
    await tester.tap(find.text('Weiter'));
    await tester.pumpAndSettle();
    expect(find.text('2/2'), findsOneWidget);
    expect(find.text('Rückgabe-QR'), findsOneWidget);
    expect(find.text('QR‑Code scannen'), findsOneWidget);
    expect(find.text('Schaden melden'), findsNothing);
  });
}

Future<void> _seed({
  required dynamic owner,
  required dynamic renter,
  required dynamic item,
  required RentalRequest request,
}) async {
  SharedPreferences.setMockInitialValues({
    'users': jsonEncode([owner.toJson(), renter.toJson()]),
    'items': jsonEncode([item.toJson()]),
    'rental_requests': jsonEncode([request.toJson()]),
    'currentUser': jsonEncode(owner.toJson()),
    'auth_session_v1': jsonEncode({
      'userId': owner.id,
      'email': owner.email,
      'createdAt': '2026-09-01T00:00:00.000Z',
    }),
  });
}
