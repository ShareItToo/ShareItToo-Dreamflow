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

const runId = 'technical_sandbox_123e4567-e89b-42d3-a456-426614174000';

TechnicalSandboxCheckout checkout() => const TechnicalSandboxCheckout(
      id: runId,
      status: 'pending',
      amountMinor: 100,
      currency: 'EUR',
      checkoutUrl: 'https://checkout.stripe.com/c/test',
      checkoutExpiresAt: null,
      replayed: false,
    );

Map<String, dynamic> validReceipt() => {
      'valid': true,
      'runId': runId,
      'amountMinor': 100,
      'currency': 'EUR',
      'providerSessionId': 'cs_test_technical_sandbox_123',
      'providerPaymentIntentId': 'pi_technical_sandbox_123',
    };

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

  test('run receipt bindings are exact and fail closed', () {
    TechnicalSandboxRun runWith(Map<String, dynamic>? receipt) =>
        TechnicalSandboxRun(
          id: runId,
          status: 'paid',
          amountMinor: 100,
          currency: 'EUR',
          checkoutUrl: null,
          checkoutExpiresAt: null,
          receipt: receipt,
        );

    expect(runWith({}).serverConfirmed, isFalse);
    expect(runWith({'valid': true}).serverConfirmed, isFalse);
    expect(runWith({...validReceipt(), 'runId': 'other'}).serverConfirmed,
        isFalse);
    expect(runWith({...validReceipt(), 'amountMinor': 99}).serverConfirmed,
        isFalse);
    expect(runWith({...validReceipt(), 'currency': 'USD'}).serverConfirmed,
        isFalse);
    expect(
        runWith({...validReceipt(), 'providerSessionId': 'cs_live_bad'})
            .serverConfirmed,
        isFalse);
    expect(
        runWith({...validReceipt(), 'providerPaymentIntentId': ''})
            .serverConfirmed,
        isFalse);
    expect(runWith(validReceipt()).serverConfirmed, isTrue);
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
          id: runId,
          status: 'paid',
          amountMinor: 100,
          currency: 'EUR',
          checkoutUrl: null,
          checkoutExpiresAt: null,
          receipt: {
            'valid': true,
            'runId': runId,
            'amountMinor': 100,
            'currency': 'EUR',
            'providerSessionId': 'cs_test_technical_sandbox_123',
            'providerPaymentIntentId': 'pi_technical_sandbox_123',
          },
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Technischen Zahlungstest starten'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Serverbestätigter Test'), findsOneWidget);
  });

  testWidgets('tampered checkout host is rejected before external open',
      (tester) async {
    var opened = false;
    await tester.pumpWidget(MaterialApp(
      home: TechnicalSandboxScreen(
        loadCapabilities: () async => availableCapabilities(),
        startCheckout: (_) async => const TechnicalSandboxCheckout(
          id: runId,
          status: 'pending',
          amountMinor: 100,
          currency: 'EUR',
          checkoutUrl: 'https://checkout.stripe.com.evil.example/c/test',
          checkoutExpiresAt: null,
          replayed: false,
        ),
        openExternal: (_) async {
          opened = true;
          return true;
        },
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Technischen Zahlungstest starten'));
    await tester.pumpAndSettle();
    expect(opened, isFalse);
    expect(find.textContaining('sicher geladen'), findsOneWidget);
    expect(find.textContaining('Serverbestätigter Test'), findsNothing);
  });
}
