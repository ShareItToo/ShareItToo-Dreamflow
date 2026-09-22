import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/register_screen.dart';

void main() {
  test('registration consent feedback names each missing rule', () {
    expect(
      registrationConsentFeedback(
        minimumAgeConfirmed: false,
        privateUseConfirmed: true,
        termsAccepted: true,
        privacyAccepted: true,
      ),
      'Bitte bestätige noch: 18 Jahre oder älter.',
    );
    expect(
      registrationConsentFeedback(
        minimumAgeConfirmed: true,
        privateUseConfirmed: false,
        termsAccepted: true,
        privacyAccepted: true,
      ),
      'Bitte bestätige noch: Privatnutzung im Privat-Pilot.',
    );
    expect(
      registrationConsentFeedback(
        minimumAgeConfirmed: true,
        privateUseConfirmed: true,
        termsAccepted: false,
        privacyAccepted: true,
      ),
      'Bitte bestätige noch: AGB.',
    );
    expect(
      registrationConsentFeedback(
        minimumAgeConfirmed: true,
        privateUseConfirmed: true,
        termsAccepted: true,
        privacyAccepted: false,
      ),
      'Bitte bestätige noch: Datenschutz.',
    );
  });

  test(
      'registration consent feedback lists all missing rules and passes through when complete',
      () {
    expect(
      registrationConsentFeedback(
        minimumAgeConfirmed: false,
        privateUseConfirmed: false,
        termsAccepted: false,
        privacyAccepted: false,
      ),
      'Bitte bestätige noch: 18 Jahre oder älter, Privatnutzung im Privat-Pilot, AGB, Datenschutz.',
    );
    expect(
      registrationConsentFeedback(
        minimumAgeConfirmed: true,
        privateUseConfirmed: true,
        termsAccepted: true,
        privacyAccepted: true,
      ),
      isNull,
    );
  });

  testWidgets('registration shows four separate unchecked confirmations',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home: RegisterScreen()));
    await tester.pumpAndSettle();

    expect(
      find.text('Ich bin 18 Jahre oder älter.'),
      findsOneWidget,
    );
    expect(find.text('Ich akzeptiere die AGB.'), findsOneWidget);
    expect(
      find.textContaining('nutze ShareItToo im Privat-Pilot'),
      findsOneWidget,
    );
    expect(
      find.text('Ich akzeptiere die Datenschutzbestimmungen.'),
      findsOneWidget,
    );

    final confirmations = tester.widgetList<CheckboxListTile>(
      find.byType(CheckboxListTile),
    );
    expect(confirmations, hasLength(4));
    expect(confirmations.every((checkbox) => checkbox.value == false), isTrue);
  });
}
