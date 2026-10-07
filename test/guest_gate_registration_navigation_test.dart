import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/register_screen.dart';
import 'package:lendify/widgets/login_nudge_sheet.dart';

void main() {
  testWidgets('listing guest gate closes before registration opens',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () => showGuestRestrictionSheet(
                  context,
                  gateContext: GuestGateContext.listing,
                ),
                child: const Text('Gast-Hinweis öffnen'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Gast-Hinweis öffnen'));
    await tester.pumpAndSettle();
    expect(find.text('Anzeige erstellen'), findsOneWidget);

    await tester.tap(find.text('Kostenlos registrieren'));
    await tester.pumpAndSettle();

    expect(find.byType(RegisterScreen), findsOneWidget);
    expect(find.text('Anzeige erstellen'), findsNothing);
  });
}
