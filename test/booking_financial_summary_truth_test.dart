import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/booking_detail_screen.dart';

void main() {
  for (final owner in [false, true]) {
    for (final simulation in [false, true]) {
      testWidgets(
          'completed booking owner=$owner simulation=$simulation never invents receipts',
          (tester) async {
        await tester.pumpWidget(MaterialApp(
          theme: ThemeData.dark(),
          home: BookingDetailScreen(
            viewerIsOwner: owner,
            booking: {
              'requestId': '',
              'itemId': '',
              'rawStatus': 'completed',
              'workflowStatus': 'completed',
              'simulationOnly': simulation,
              'title': 'Synthetischer Abschlusstest',
              'status': 'Abgeschlossen',
              'images': const <String>[],
              'listerName': 'Test Vermieter',
              'pricePaid': '66,00 €',
              'dates': '15. Nov – 17. Nov',
              'startIso': DateTime(2026, 11, 15).toIso8601String(),
              'endIso': DateTime(2026, 11, 17).toIso8601String(),
            },
          ),
        ));
        await tester.pump();
        await tester.drag(
            find.byType(Scrollable).first, const Offset(0, -2500));
        await tester.pump();
        expect(find.text('Ausgezahlt am'), findsNothing);
        expect(find.text('Rückgabe bestätigt'), findsNothing);
        expect(find.textContaining('Auszahlung am '), findsNothing);
        expect(find.text('Erstattung gem. Richtlinien'), findsNothing);
        if (simulation) {
          expect(find.text('Unverbindliche Pilot-Simulation'), findsWidgets);
          expect(find.text('Abschluss-Zusammenfassung'), findsNothing);
          expect(find.text('Zahlungsstatus'), findsNothing);
        } else {
          expect(find.text('Abschluss-Zusammenfassung'), findsOneWidget);
          expect(find.text('Geplantes Mietende'), findsOneWidget);
          if (owner) {
            expect(find.text('Auszahlungsstatus'), findsOneWidget);
            expect(
                find.textContaining(
                    'Rückgabe allein bestätigt keine Auszahlung'),
                findsOneWidget);
          }
        }
      });
    }
  }
}
