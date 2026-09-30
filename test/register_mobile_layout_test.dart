import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/register_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/utils/registration_consent_bundle.dart';
import 'package:lendify/widgets/social_auth_button.dart';

Future<void> pumpRegistration(
  WidgetTester tester, {
  Size size = const Size(390, 844),
  double scale = 1,
  double keyboard = 0,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  await tester.pumpWidget(MaterialApp(
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        textScaler: TextScaler.linear(scale),
        padding: EdgeInsets.only(top: 24, bottom: keyboard > 0 ? 0 : 34),
        viewPadding: const EdgeInsets.only(top: 24, bottom: 34),
        viewInsets: EdgeInsets.only(bottom: keyboard),
      ),
      child: child!,
    ),
    home: const RegisterScreen(),
  ));
  await tester.pumpAndSettle();
}

void main() {
  for (final scenario in [
    (size: const Size(390, 844), scale: 1.0, keyboard: 0.0),
    (size: const Size(390, 844), scale: 2.0, keyboard: 0.0),
    (size: const Size(320, 568), scale: 2.0, keyboard: 0.0),
    (size: const Size(390, 844), scale: 1.0, keyboard: 300.0),
    (size: const Size(390, 844), scale: 2.0, keyboard: 300.0),
    (size: const Size(844, 390), scale: 1.0, keyboard: 0.0),
  ]) {
    testWidgets('registration remains scrollable and non-overlapping $scenario',
        (tester) async {
      await pumpRegistration(tester,
          size: scenario.size,
          scale: scenario.scale,
          keyboard: scenario.keyboard);
      final scroll = find.byType(SingleChildScrollView);
      final cta = find.text('Kostenlos registrieren');
      // One scroll flow: no hard-coded footer-height estimate or overlaid text.
      expect(find.descendant(of: scroll, matching: cta), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(cta);
      await tester.pumpAndSettle();
      final ctaRect = tester.getRect(cta);
      final providerRect = tester.getRect(find.byType(SocialAuthButton).last);
      expect(providerRect.bottom, lessThan(ctaRect.top));
      expect(ctaRect.top, greaterThanOrEqualTo(24));
      expect(ctaRect.bottom,
          lessThanOrEqualTo(scenario.size.height - scenario.keyboard));
      expect(cta.hitTestable(), findsOneWidget);
      expect(tester.widget<Text>(cta).overflow, isNot(TextOverflow.ellipsis));

      final login = find.text('Anmelden');
      await tester.ensureVisible(login);
      await tester.pumpAndSettle();
      final safeBottom = scenario.size.height -
          (scenario.keyboard > 0 ? scenario.keyboard : 34);
      expect(tester.getRect(login).bottom, lessThanOrEqualTo(safeBottom));
      expect(login.hitTestable(), findsOneWidget);
      final name = find.bySemanticsLabel('Name');
      await tester.ensureVisible(name);
      await tester.pumpAndSettle();
      expect(tester.getRect(name).top, greaterThanOrEqualTo(24));
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('invalid form stays reachable above the keyboard after submit',
      (tester) async {
    await pumpRegistration(tester, keyboard: 300, scale: 2);
    final cta = find.text('Kostenlos registrieren');
    await tester.ensureVisible(cta);
    await tester.tap(cta);
    await tester.pumpAndSettle();
    final emailError = find.text('Bitte gib eine gültige E-Mail-Adresse ein.');
    expect(emailError, findsOneWidget);
    await tester.ensureVisible(emailError);
    await tester.pumpAndSettle();
    expect(tester.getRect(emailError).bottom, lessThanOrEqualTo(544));
    for (final label in ['SIT-Plattformbedingungen', 'Datenschutzerklärung']) {
      final link = find.text(label).last;
      await tester.ensureVisible(link);
      await tester.pumpAndSettle();
      expect(link.hitTestable(), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('consent appears once per available action; providers stay off',
      (tester) async {
    await pumpRegistration(tester);
    expect(
      find.bySemanticsLabel(
          registrationConsentActionText('Kostenlos registrieren')),
      findsOneWidget,
    );
    var unavailable = 0;
    for (final entry in {
      AuthSocialProvider.google: 'Mit Google registrieren',
      AuthSocialProvider.apple: 'Mit Apple registrieren',
      AuthSocialProvider.facebook: 'Mit Facebook registrieren',
    }.entries) {
      final available = AuthService.socialProviderEnabled(entry.key);
      expect(
        find.bySemanticsLabel(registrationConsentActionText(entry.value)),
        available ? findsOneWidget : findsNothing,
      );
      final button = tester.widget<SocialAuthButton>(find.ancestor(
        of: find.text(entry.value),
        matching: find.byType(SocialAuthButton),
      ));
      expect(button.available, available);
      if (!available) {
        unavailable++;
        expect(button.onTap, isNull);
      }
    }
    expect(find.text('Im Privatpiloten nicht verfügbar'),
        findsNWidgets(unavailable));
    expect(tester.takeException(), isNull);
  });
}
