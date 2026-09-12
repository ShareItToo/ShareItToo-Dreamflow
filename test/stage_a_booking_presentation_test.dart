import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/booking_detail_screen.dart';

void main() {
  testWidgets('accepted simulation stays visibly non-binding on renter detail',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(),
        home: BookingDetailScreen(
          booking: {
            'requestId': '',
            'itemId': '',
            'rawStatus': 'accepted',
            'workflowStatus': 'accepted',
            'simulationOnly': true,
            'title': 'SIT Rollenprüfung',
            'dates': '15. Nov – 17. Nov',
            'status': 'Akzeptiert',
            'images': const <String>[],
            'listerName': 'SIT Test Vermieter',
            'startIso': DateTime(2026, 11, 15).toIso8601String(),
            'endIso': DateTime(2026, 11, 17).toIso8601String(),
          },
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Pilot-Simulation · Kommende Buchung'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Unverbindliche Pilot-Simulation'),
      500,
    );
    expect(find.text('Unverbindliche Pilot-Simulation'), findsOneWidget);
    expect(
      find.textContaining('keinen Vertrag, keine Reservierung'),
      findsWidgets,
    );
    expect(find.text('Zahlungsstatus'), findsNothing);
  });
}
