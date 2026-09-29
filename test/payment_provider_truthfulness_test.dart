import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/payment_checkout_screen.dart';
import 'package:lendify/screens/payment_methods_screen.dart';
import 'package:lendify/screens/stripe_payout_account_screen.dart';
import 'package:lendify/services/backend_http.dart';

void main() {
  testWidgets('unavailable provider never presents Stripe or a payment action',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: PaymentMethodsScreen(
        loadCapabilities: () async => const {
          'provider': null,
          'providerBacked': false,
          'checkoutAvailable': false,
          'mode': 'unavailable',
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Noch nicht freigeschaltet'), findsOneWidget);
    expect(
      find.textContaining('kein echter Marketplace-Zahlungsdienstleister'),
      findsOneWidget,
    );
    expect(find.textContaining('Stripe'), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('provider test mode is explicit and promises no real money',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: PaymentMethodsScreen(
        loadCapabilities: () async => const {
          'provider': 'stripe',
          'providerBacked': true,
          'checkoutAvailable': true,
          'mode': 'test',
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Zahlungstest verfügbar'), findsOneWidget);
    expect(find.textContaining('kein echtes Geld'), findsOneWidget);
    expect(find.text('Sicher über Stripe'), findsNothing);
  });

  testWidgets('live provider may be named only after server capability',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: PaymentMethodsScreen(
        loadCapabilities: () async => const {
          'provider': 'stripe',
          'providerBacked': true,
          'checkoutAvailable': true,
          'mode': 'live',
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Sicher über Stripe'), findsOneWidget);
  });

  testWidgets('unavailable payout provider shows no onboarding action',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: StripePayoutAccountScreen(
        loadCapabilities: () async => const {
          'provider': null,
          'providerBacked': false,
          'payoutOnboardingAvailable': false,
          'mode': 'unavailable',
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(
      find.text('Auszahlungen noch nicht freigeschaltet'),
      findsOneWidget,
    );
    expect(find.textContaining('Stripe'), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('payout test mode is explicit and does not claim real money',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: StripePayoutAccountScreen(
        loadCapabilities: () async => const {
          'provider': 'stripe',
          'providerBacked': true,
          'payoutOnboardingAvailable': true,
          'mode': 'test',
        },
        loadConnectStatus: () async => const {
          'exists': false,
          'ready': false,
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Auszahlungstest verfügbar'), findsOneWidget);
    expect(find.textContaining('Es fließt kein echtes Geld'), findsOneWidget);
    expect(find.text('Test-Onboarding öffnen'), findsOneWidget);
    expect(find.text('Sicher bei Stripe fortfahren'), findsNothing);
  });

  testWidgets('direct payment screen does not load or offer an unbacked flow',
      (tester) async {
    var paymentLoaded = false;
    await tester.pumpWidget(MaterialApp(
      home: PaymentCheckoutScreen(
        bookingId: 'booking-1',
        loadCapabilities: () async => const {
          'provider': null,
          'providerBacked': false,
          'checkoutAvailable': false,
          'mode': 'unavailable',
        },
        loadPayment: (_) async {
          paymentLoaded = true;
          return const {};
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(paymentLoaded, isFalse);
    expect(find.text('Zahlung noch nicht freigeschaltet'), findsOneWidget);
    expect(find.textContaining('Stripe'), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('direct payment test mode is explicit and uses no real money',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: PaymentCheckoutScreen(
        bookingId: 'booking-2',
        loadCapabilities: () async => const {
          'provider': 'stripe',
          'providerBacked': true,
          'checkoutAvailable': true,
          'mode': 'test',
        },
        loadPayment: (_) async => const {
          'quote': {
            'amountMinor': 6600,
            'platformFeeMinor': 600,
            'ownerPayoutMinor': 6000,
            'currency': 'EUR',
          },
          'payment': null,
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Zahlungstest'), findsOneWidget);
    expect(find.textContaining('kein echtes Geld'), findsOneWidget);
    expect(find.text('Test-Checkout öffnen'), findsOneWidget);
    expect(find.text('Sicher mit Stripe bezahlen'), findsNothing);
  });

  testWidgets('direct payment screen rejects an inconsistent capability',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: PaymentCheckoutScreen(
        bookingId: 'booking-3',
        loadCapabilities: () async => const {
          'provider': null,
          'checkoutAvailable': true,
          'mode': 'live',
        },
        loadPayment: (_) async => throw StateError('must stay closed'),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Zahlung noch nicht freigeschaltet'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
  });

  for (final truthStatus in ['pending', 'needsReview']) {
    testWidgets(
        'refund truth $truthStatus is neutral and never offers checkout',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: PaymentCheckoutScreen(
          bookingId: 'booking-refund-$truthStatus',
          loadCapabilities: () async => const {
            'provider': 'stripe',
            'providerBacked': true,
            'checkoutAvailable': true,
            'mode': 'test',
          },
          loadPayment: (_) async => {
            'quote': const {
              'amountMinor': 6600,
              'platformFeeMinor': 600,
              'ownerPayoutMinor': 6000,
              'currency': 'EUR',
            },
            'payment': {
              'status': 'refund_verification_pending',
              'refundTruthStatus': truthStatus,
              'refundedMinor': null,
              'amountMinor': 6600,
              'platformFeeMinor': 600,
              'ownerPayoutMinor': 6000,
              'currency': 'EUR',
            },
          },
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Erstattungsstatus wird geprüft'), findsOneWidget);
      expect(find.textContaining('sicher abgeglichen'), findsOneWidget);
      expect(find.text('Zahlung bestätigt'), findsNothing);
      expect(find.text('Test-Checkout öffnen'), findsNothing);
      expect(find.byType(FilledButton), findsNothing);
    });
  }

  testWidgets('refresh failure clears previously confirmed payment truth',
      (tester) async {
    var failRefresh = false;
    await tester.pumpWidget(MaterialApp(
      home: PaymentCheckoutScreen(
        bookingId: 'booking-stale-truth',
        loadCapabilities: () async => const {
          'provider': 'stripe',
          'providerBacked': true,
          'checkoutAvailable': true,
          'mode': 'test',
        },
        loadPayment: (_) async {
          if (failRefresh) {
            throw const BackendException(503, 'payment_provider_unavailable');
          }
          return const {
            'quote': {
              'amountMinor': 6600,
              'platformFeeMinor': 600,
              'ownerPayoutMinor': 6000,
              'currency': 'EUR',
            },
            'payment': {
              'status': 'captured',
              'refundTruthStatus': 'none',
              'amountMinor': 6600,
              'platformFeeMinor': 600,
              'ownerPayoutMinor': 6000,
              'currency': 'EUR',
            },
          };
        },
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Testzahlung bestätigt'), findsOneWidget);

    failRefresh = true;
    await tester.tap(find.byIcon(Icons.refresh));
    await tester.pumpAndSettle();

    expect(find.text('Testzahlung bestätigt'), findsNothing);
    expect(find.text('Zahlung noch nicht freigeschaltet'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
  });

  for (final mode in ['test', 'live']) {
    for (final status in [
      'requires_action',
      'captured',
      'partially_refunded',
      'refunded'
    ]) {
      testWidgets(
          '$mode $status keeps payment, refund and payout truth separate',
          (tester) async {
        await tester.pumpWidget(MaterialApp(
          home: PaymentCheckoutScreen(
            bookingId: 'synthetic-status',
            loadCapabilities: () async => {
              'provider': 'stripe',
              'providerBacked': true,
              'checkoutAvailable': true,
              'mode': mode,
            },
            loadPayment: (_) async => {
              'payment': {
                'status': status,
                'livemode': mode == 'live',
                'refundTruthStatus':
                    status.contains('refunded') ? 'providerBound' : 'none',
                'amountMinor': 6600,
                'platformFeeMinor': 600,
                'ownerPayoutMinor': 6000,
                'refundedMinor': 3300,
                'currency': 'EUR',
              },
              'payout': null,
            },
          ),
        ));
        await tester.pumpAndSettle();
        final title = switch (status) {
          'requires_action' => 'Bestätigung im Checkout erforderlich',
          'captured' =>
            mode == 'test' ? 'Testzahlung bestätigt' : 'Zahlung bestätigt',
          'partially_refunded' => mode == 'test'
              ? 'Testzahlung teilweise erstattet'
              : 'Teilweise erstattet',
          _ => mode == 'test' ? 'Testzahlung erstattet' : 'Zahlung erstattet',
        };
        expect(find.text(title), findsOneWidget);
        expect(find.textContaining('Es fließt kein echtes Geld'),
            mode == 'test' ? findsOneWidget : findsNothing);
        if (status != 'requires_action') {
          expect(find.byType(FilledButton), findsNothing);
          expect(find.textContaining('Keine Auszahlung bestätigt.'),
              findsOneWidget);
        }
        if (status.contains('refunded')) {
          expect(find.text('33,00 EUR'), findsOneWidget);
          expect(find.text('Zahlung bestätigt'), findsNothing);
        }
      });
    }
  }

  for (final paidAt in [null, '2026-09-29T12:00:00Z']) {
    testWidgets('test payout requires durable paid timestamp: $paidAt',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: PaymentCheckoutScreen(
          bookingId: 'synthetic-payout',
          loadCapabilities: () async => const {
            'provider': 'stripe',
            'checkoutAvailable': true,
            'mode': 'test',
          },
          loadPayment: (_) async => {
            'payment': {'status': 'captured', 'currency': 'EUR'},
            'payout': {'status': 'paid', 'paidAt': paidAt},
          },
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('Testauszahlung bestätigt.'),
          paidAt == null ? findsNothing : findsOneWidget);
      expect(find.textContaining('Es fließt kein echtes Geld'), findsOneWidget);
      expect(find.byType(FilledButton), findsNothing);
    });
  }
}
