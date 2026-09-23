import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/legal_privacy_screen.dart';
import 'package:lendify/screens/legal_terms_screen.dart';
import 'package:lendify/screens/register_screen.dart';
import 'package:lendify/utils/registration_consent_bundle.dart';

void main() {
  test('registration CTA wording resolves the action label and four facts', () {
    expect(
      registrationConsentActionText('Kostenlos registrieren'),
      'Mit Klick auf „Kostenlos registrieren“ bestätigst du, mindestens 18 Jahre alt zu sein und ShareItToo ausschließlich privat zu nutzen. Du akzeptierst die SIT-Plattformbedingungen und nimmst die Datenschutzerklärung zur Kenntnis.',
    );
  });

  testWidgets('registration has one action notice and no required checkboxes',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home: RegisterScreen()));
    await tester.pumpAndSettle();

    expect(find.byType(CheckboxListTile), findsNothing);
    expect(find.text('Kostenlos registrieren'), findsOneWidget);
    expect(find.text('Mit Google registrieren'), findsOneWidget);
    expect(find.text('Mit Apple registrieren'), findsOneWidget);
    expect(find.text('Mit Facebook registrieren'), findsOneWidget);
    expect(find.text('SIT-Plattformbedingungen'), findsWidgets);
    expect(find.text('Datenschutzerklärung'), findsWidgets);
    expect(
      find.bySemanticsLabel(
        registrationConsentActionText('Kostenlos registrieren'),
      ),
      findsOneWidget,
    );

    final termsLink = find.text('SIT-Plattformbedingungen').first;
    await tester.ensureVisible(termsLink);
    await tester.tap(termsLink);
    await tester.pumpAndSettle();
    expect(find.byType(LegalTermsScreen), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    await tester.pageBack();
    await tester.pumpAndSettle();

    final privacyLink = find.text('Datenschutzerklärung').first;
    await tester.ensureVisible(privacyLink);
    await tester.tap(privacyLink);
    await tester.pumpAndSettle();
    expect(find.byType(LegalPrivacyScreen), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('registration uses one strong password field with submit action',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home: RegisterScreen()));
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('Passwort'), findsOneWidget);
    expect(find.text('Passwort wiederholen'), findsNothing);
    expect(find.text('Passwörter müssen übereinstimmen'), findsNothing);
    expect(find.bySemanticsLabel('Passwort anzeigen'), findsOneWidget);

    final passwordSemantics = find.bySemanticsLabel('Passwort');
    final passwordField = find.descendant(
      of: passwordSemantics,
      matching: find.byType(EditableText),
    );
    expect(passwordField, findsOneWidget);
    final field = tester.widget<EditableText>(passwordField);
    expect(field.textInputAction, TextInputAction.done);
    expect(field.onSubmitted, isNotNull);
  });
}
