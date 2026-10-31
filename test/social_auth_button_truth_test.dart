import 'dart:ui' show SemanticsAction, Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/widgets/social_auth_button.dart';

void main() {
  for (final brand in SocialAuthBrand.values) {
    testWidgets('${brand.name} unavailable is visible and cannot invoke SDK',
        (tester) async {
      final semantics = tester.ensureSemantics();
      var calls = 0;
      await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: Scaffold(
            body: SizedBox(
              width: 280,
              child: SocialAuthButton(
                brand: brand,
                label: 'Mit ${brand.name} anmelden',
                available: false,
                onTap: () => calls++,
              ),
            ),
          ),
        ),
      ));
      expect(find.text('Im Privatpiloten nicht verfügbar'), findsOneWidget);
      expect(find.byIcon(Icons.lock_outline), findsOneWidget);
      expect(find.byIcon(Icons.arrow_forward_ios_rounded), findsNothing);
      final node = tester.getSemantics(find.text('Mit ${brand.name} anmelden'));
      expect(node.flagsCollection.isEnabled, Tristate.isFalse);
      expect(node.getSemanticsData().label, contains('nicht verfügbar'));
      expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isFalse);
      await tester.tap(find.text('Mit ${brand.name} anmelden'));
      expect(calls, 0);
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });
  }

  testWidgets('configured busy provider is not mislabelled unavailable',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: SocialAuthButton(
          brand: SocialAuthBrand.google,
          label: 'Mit Google anmelden',
          available: true,
          onTap: null,
        ),
      ),
    ));
    expect(find.text('Im Privatpiloten nicht verfügbar'), findsNothing);
    expect(find.byIcon(Icons.lock_outline), findsNothing);
  });
}
