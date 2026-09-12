import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/payment_checkout_screen.dart';
import 'package:lendify/screens/payment_methods_screen.dart';
import 'package:lendify/screens/stripe_payout_account_screen.dart';

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
}
