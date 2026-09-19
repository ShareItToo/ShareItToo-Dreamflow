import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/payment_methods_screen.dart';
import 'package:lendify/screens/technical_sandbox_screen.dart';
import 'package:lendify/services/backend_repository.dart';

Map<String, dynamic> availableCapabilities() => {
      'technicalSandbox': {
        'technicalSandboxAvailable': true,
        'provider': 'stripe',
        'mode': 'test',
        'amountMinor': 100,
        'currency': 'EUR',
        'maxRunsPerUser24h': 3,
        'professionalReview': false,
        'syntheticOnly': true,
        'liveMoney': false,
        'bookingEffect': false,
        'ledgerEffect': false,
        'connectEffect': false,
      },
    };

TechnicalSandboxCheckout checkout() => const TechnicalSandboxCheckout(
      id: 'technical_sandbox_run_12345678901234567890',
      status: 'pending',
      checkoutUrl: 'https://checkout.stripe.com/c/test',
      checkoutExpiresAt: null,
      replayed: false,
    );

void main() {
  test('capability parsing fails closed for foreign/tampered values', () {
    final foreign = TechnicalSandboxCapabilities.fromJson({
      ...availableCapabilities()['technicalSandbox'] as Map<String, dynamic>,
      'provider': 'openai',
    });
    final fractionalAmount = TechnicalSandboxCapabilities.fromJson({
      ...availableCapabilities()['technicalSandbox'] as Map<String, dynamic>,
      'amountMinor': 1.5,
    });
    expect(foreign.available, isFalse);
    expect(fractionalAmount.available, isFalse);
  });

  test('idempotency key has cryptographic-length opaque material', () {
    final first = BackendRepository.newTechnicalSandboxIdempotencyKey();
    final second = BackendRepository.newTechnicalSandboxIdempotencyKey();
    expect(first, startsWith('technical-sandbox:'));
    expect(first.length, greaterThan(40));
    expect(second, isNot(first));
  });

  testWidgets(
      'PaymentMethods exposes Sandbox only from fresh available capability',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: PaymentMethodsScreen(
        loadCapabilities: () async => {
          'provider': null,
          'checkoutAvailable': false,
          ...availableCapabilities(),
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Stripe Sandbox'), findsOneWidget);
    expect(find.text('1,00 € Test'), findsOneWidget);
    expect(find.textContaining('Keine Buchung'), findsOneWidget);
    final entry = find.text('Technischen Zahlungstest öffnen');
    await tester.drag(find.byType(ListView), const Offset(0, -420));
    await tester.pumpAndSettle();
    await tester.tap(entry);
    await tester.pumpAndSettle();
    expect(find.byType(TechnicalSandboxScreen), findsOneWidget);
  });

  testWidgets('unavailable capability disables the technical flow truthfully',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: TechnicalSandboxScreen(
        loadCapabilities: () async => {
          'technicalSandbox': {
            'technicalSandboxAvailable': false,
            'provider': 'stripe',
            'mode': 'disabled',
          },
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(
      find.textContaining(
          'Der technische Sandbox-Test ist derzeit nicht verfügbar.'),
      findsOneWidget,
    );
    expect(find.text('Technischen Zahlungstest starten'), findsNothing);
  });

  testWidgets(
      'redirect alone never reports success and retries preserve the key',
      (tester) async {
    final keys = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: TechnicalSandboxScreen(
        loadCapabilities: () async => availableCapabilities(),
        startCheckout: (key) async {
          keys.add(key);
          return checkout();
        },
        openExternal: (_) async => false,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Technischen Zahlungstest starten'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Serverbestätigter Test'), findsNothing);
    expect(find.text('Checkout erneut öffnen'), findsOneWidget);
    await tester.tap(find.text('Checkout erneut öffnen'));
    await tester.pumpAndSettle();
    expect(keys, hasLength(2));
    expect(keys[0], keys[1]);
    expect(find.textContaining('Serverbestätigter Test'), findsNothing);
  });

  testWidgets('success is shown only after a server receipt/readback',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: TechnicalSandboxScreen(
        loadCapabilities: () async => availableCapabilities(),
        startCheckout: (_) async => checkout(),
        openExternal: (_) async => true,
        loadRun: (_) async => const TechnicalSandboxRun(
          id: 'technical_sandbox_run_12345678901234567890',
          status: 'paid',
          amountMinor: 100,
          currency: 'EUR',
          checkoutUrl: null,
          checkoutExpiresAt: null,
          receipt: {'valid': true},
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Technischen Zahlungstest starten'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Serverbestätigter Test'), findsOneWidget);
  });
}
