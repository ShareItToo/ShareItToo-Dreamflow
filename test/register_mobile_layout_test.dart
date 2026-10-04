import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/register_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/utils/registration_consent_bundle.dart';
import 'package:lendify/widgets/social_auth_button.dart';

const _facebookLoginOnlyNotice =
    'Facebook ist nur zur Anmeldung bestehender Konten verfügbar.';

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
  setUpAll(() => WidgetController.hitTestWarningShouldBeFatal = true);
  tearDownAll(() => WidgetController.hitTestWarningShouldBeFatal = false);

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
      final facebookNotice = find.text(_facebookLoginOnlyNotice);
      expect(facebookNotice, findsOneWidget);
      final noticeRect = tester.getRect(facebookNotice);
      expect(providerRect.bottom, lessThan(noticeRect.top));
      expect(noticeRect.bottom, lessThan(ctaRect.top));
      expect(ctaRect.top, greaterThanOrEqualTo(24));
      expect(ctaRect.bottom,
          lessThanOrEqualTo(scenario.size.height - scenario.keyboard));
      expect(cta.hitTestable(), findsOneWidget);
      expect(tester.widget<Text>(cta).overflow, isNot(TextOverflow.ellipsis));

      await tester.ensureVisible(facebookNotice);
      await tester.pumpAndSettle();
      expect(facebookNotice.hitTestable(), findsOneWidget);
      expect(tester.widget<Text>(facebookNotice).maxLines, isNull);

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
    expect(cta.hitTestable(), findsOneWidget);
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

  testWidgets(
      'consent follows registration availability; Facebook is login-only',
      (tester) async {
    await pumpRegistration(tester);
    expect(
      find.bySemanticsLabel(
          registrationConsentActionText('Kostenlos registrieren')),
      findsOneWidget,
    );
    var unavailable = 0;
    expect(find.byType(SocialAuthButton), findsNWidgets(2));
    for (final entry in {
      AuthSocialProvider.google: 'Mit Google registrieren',
      AuthSocialProvider.apple: 'Mit Apple registrieren',
    }.entries) {
      final available =
          AuthService.socialRegistrationProviderEnabled(entry.key);
      expect(
        find.bySemanticsLabel(registrationConsentActionText(entry.value)),
        available ? findsOneWidget : findsNothing,
      );
      final buttonFinder = find.ancestor(
        of: find.text(entry.value),
        matching: find.byType(SocialAuthButton),
      );
      expect(buttonFinder, findsOneWidget);
      final button = tester.widget<SocialAuthButton>(buttonFinder);
      expect(button.available, available);
      expect(button.onTap, available ? isNotNull : isNull);
      if (!available) {
        unavailable++;
      }
    }
    expect(find.text('Mit Facebook registrieren'), findsNothing);
    expect(
      find.bySemanticsLabel(
          registrationConsentActionText('Mit Facebook registrieren')),
      findsNothing,
    );
    expect(find.text(_facebookLoginOnlyNotice), findsOneWidget);
    expect(find.text('Im Privatpiloten nicht verfügbar'),
        findsNWidgets(unavailable));
    expect(tester.takeException(), isNull);
  });
}
