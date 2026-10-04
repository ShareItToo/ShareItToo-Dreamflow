import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/synthetic_clone_diagnostic_screen.dart';

void main() {
  testWidgets(
    'incomplete presenter slot card exposes all eight actions on a small surface',
    (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: SyntheticClonePhotoSlotActions(
                segment: 'pickup',
                present: const <String>{},
                busy: false,
                onSelect: (_, __) async {},
              ),
            ),
          ),
        ),
      );

      expect(find.byType(TextButton), findsNWidgets(8));
      expect(find.text('Übersicht – Kamera'), findsOneWidget);
      expect(find.text('Kritischer Bereich – Photo Picker'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('verifier entry remains available without a persisted challenge ID',
      (tester) async {
    final challenge = TextEditingController();
    final payload = TextEditingController();
    final fallback = TextEditingController();
    addTearDown(() {
      challenge.dispose();
      payload.dispose();
      fallback.dispose();
    });

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SyntheticCloneVerifierEntry(
            available: true,
            busy: false,
            challengeIdController: challenge,
            qrPayloadController: payload,
            fallbackCodeController: fallback,
            onChanged: () {},
            onScan: () {},
            onPayload: () {},
            onFallback: () {},
          ),
        ),
      ),
    );

    expect(find.byKey(const ValueKey('synthetic-clone-challenge-id')),
        findsOneWidget);
    expect(find.text('QR-v3-Payload verifizieren'), findsOneWidget);
    expect(find.text('Fallback verifizieren'), findsOneWidget);
    expect(find.byType(TextField), findsNWidgets(3));
  });
}
