import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/payment_methods_screen.dart';
import 'package:lendify/screens/technical_sandbox_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
  setUp(() => SharedPreferences.setMockInitialValues({}));
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

  testWidgets(
      'PaymentMethods drops capability returned for a stale session owner',
      (tester) async {
    var ownerChecks = 0;
    await tester.pumpWidget(MaterialApp(
      home: PaymentMethodsScreen(
        sessionReader: () async => const AuthSession(
          userId: 'old-owner',
          sessionId: 'old-session',
          email: 'old-owner@example.invalid',
        ),
        ownerChecker: (_) async {
          ownerChecks++;
          // The capture is current, but the response belongs to the session
          // that was replaced while the capability request was in flight.
          return ownerChecks == 1;
        },
        loadCapabilities: () async => {
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
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(ownerChecks, 2);
    expect(find.text('Stripe Sandbox'), findsNothing);
    expect(find.text('Melde dich erneut an.'), findsOneWidget);
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

  for (final status in ['paid', 'expired', 'pending', 'unknown']) {
    testWidgets('URL-less $status replay is recovered by one status read',
        (tester) async {
      final keys = <String>[];
      final reads = <String>[];
      var opens = 0;
      await tester.pumpWidget(MaterialApp(
        home: TechnicalSandboxScreen(
          loadCapabilities: () async => availableCapabilities(),
          startCheckout: (key) async {
            keys.add(key);
            // The create response was lost. The retry returns the existing
            // run, not a new provider session; terminal sessions have no URL.
            if (keys.length == 1) {
              throw const BackendException(503, 'synthetic_response_lost');
            }
            return TechnicalSandboxCheckout(
              id: runId,
              status: status,
              amountMinor: 100,
              currency: 'EUR',
              checkoutUrl: null,
              checkoutExpiresAt: null,
              replayed: true,
            );
          },
          loadRun: (id) async {
            reads.add(id);
            return TechnicalSandboxRun(
              id: runId,
              status: status,
              amountMinor: 100,
              currency: 'EUR',
              checkoutUrl: null,
              checkoutExpiresAt: null,
              receipt: status == 'paid' ? validReceipt() : null,
            );
          },
          openExternal: (_) async {
            opens++;
            return true;
          },
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Technischen Zahlungstest starten'));
      await tester.pumpAndSettle();
      expect(reads, isEmpty);
      await tester.tap(find.text('Technischen Zahlungstest starten'));
      await tester.pumpAndSettle();
      expect(keys, hasLength(2));
      expect(keys.toSet(), hasLength(1));
      expect(reads, [runId]);
      expect(opens, 0);
      expect(find.textContaining('Serverbestätigter Test'),
          status == 'paid' ? findsOneWidget : findsNothing);
      expect(find.textContaining('ist abgelaufen'),
          status == 'expired' ? findsOneWidget : findsNothing);
      expect(find.textContaining('Der Checkout wurde geöffnet'), findsNothing);
      if (status == 'pending' || status == 'unknown') {
        await tester.tap(find.text('Sandbox-Status prüfen'));
        await tester.pumpAndSettle();
        expect(keys, hasLength(2));
        expect(reads, [runId, runId]);
      }
    });
  }

  for (final outcome in ['foreign-run', 'no-receipt', 'read-failed']) {
    testWidgets('URL-less recovery fails closed for $outcome', (tester) async {
      var creates = 0;
      var reads = 0;
      await tester.pumpWidget(MaterialApp(
        home: TechnicalSandboxScreen(
          loadCapabilities: () async => availableCapabilities(),
          startCheckout: (_) async {
            creates++;
            return const TechnicalSandboxCheckout(
              id: runId,
              status: 'pending',
              amountMinor: 100,
              currency: 'EUR',
              checkoutUrl: null,
              checkoutExpiresAt: null,
              replayed: true,
            );
          },
          loadRun: (id) async {
            expect(id, runId);
            reads++;
            if (outcome == 'read-failed') {
              throw const BackendException(503, 'synthetic_read_failed');
            }
            const foreignId =
                'technical_sandbox_123e4567-e89b-42d3-a456-426614174001';
            return TechnicalSandboxRun(
              id: outcome == 'foreign-run' ? foreignId : runId,
              status: 'paid',
              amountMinor: 100,
              currency: 'EUR',
              checkoutUrl: null,
              checkoutExpiresAt: null,
              receipt: outcome == 'foreign-run'
                  ? {...validReceipt(), 'runId': foreignId}
                  : null,
            );
          },
          openExternal: (_) async => throw StateError('must not open'),
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Technischen Zahlungstest starten'));
      await tester.pumpAndSettle();
      expect(creates, 1);
      expect(reads, 1);
      expect(find.textContaining('Serverbestätigter Test'), findsNothing);
      await tester.tap(find.text('Sandbox-Status prüfen'));
      await tester.pumpAndSettle();
      expect(creates, 1);
      expect(reads, 2);
    });
  }

  for (final invalid in ['refunded', 'amount', 'currency', 'id']) {
    testWidgets('URL-less $invalid envelope is rejected before status read',
        (tester) async {
      var reads = 0;
      await tester.pumpWidget(MaterialApp(
        home: TechnicalSandboxScreen(
          loadCapabilities: () async => availableCapabilities(),
          startCheckout: (_) async => TechnicalSandboxCheckout(
            id: invalid == 'id' ? 'foreign-invalid-id' : runId,
            status: invalid == 'refunded' ? 'refunded' : 'paid',
            amountMinor: invalid == 'amount' ? 99 : 100,
            currency: invalid == 'currency' ? 'USD' : 'EUR',
            checkoutUrl: null,
            checkoutExpiresAt: null,
            replayed: true,
          ),
          loadRun: (_) async {
            reads++;
            throw StateError('must not read invalid envelope');
          },
          openExternal: (_) async => throw StateError('must not open'),
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Technischen Zahlungstest starten'));
      await tester.pumpAndSettle();
      expect(reads, 0);
      expect(find.textContaining('sicher geladen'), findsOneWidget);
      expect(find.textContaining('Serverbestätigter Test'), findsNothing);
    });
  }

  for (final transition in ['foreign-owner', 'same-owner-new-epoch']) {
    for (final boundary in ['create', 'read']) {
      testWidgets('$transition rejects late $boundary recovery response',
          (tester) async {
        final storedSession = jsonEncode({
          'userId': 'synthetic_sandbox_user_owner',
          'sessionId': 'synthetic-session-a',
          'email': 'a@example.invalid',
          'createdAt': '2026-09-19T10:00:00.000Z',
        });
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('auth_session_v1', storedSession);
        final owner =
            AuthService.captureSessionOwner((await AuthService.readSession())!);
        final createResponse = Completer<TechnicalSandboxCheckout>();
        final readResponse = Completer<TechnicalSandboxRun>();
        var creates = 0;
        var reads = 0;
        var opens = 0;
        await tester.pumpWidget(MaterialApp(
          home: Builder(
              builder: (context) => TextButton(
                    onPressed: () =>
                        Navigator.of(context).push(MaterialPageRoute<void>(
                      builder: (_) => TechnicalSandboxScreen(
                        sessionReader: AuthService.readSession,
                        loadCapabilities: () async => availableCapabilities(),
                        startCheckout: (_) {
                          creates++;
                          return createResponse.future;
                        },
                        loadRun: (_) {
                          reads++;
                          return readResponse.future;
                        },
                        openExternal: (_) async {
                          opens++;
                          return true;
                        },
                      ),
                    )),
                    child: const Text('Open synthetic route'),
                  )),
        ));
        await tester.tap(find.text('Open synthetic route'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Technischen Zahlungstest starten'));
        await tester.pump();
        const replay = TechnicalSandboxCheckout(
          id: runId,
          status: 'paid',
          amountMinor: 100,
          currency: 'EUR',
          checkoutUrl: null,
          checkoutExpiresAt: null,
          replayed: true,
        );
        if (boundary == 'read') {
          createResponse.complete(replay);
          await tester.pump();
          expect(reads, 1);
        }
        if (transition == 'same-owner-new-epoch') {
          // Real local epoch transition only; no provider/realtime logout.
          expect(
              await AuthService.clearSessionOwnerIfMatches(owner,
                  runLogoutCleanup: false),
              isNotNull);
          await prefs.setString('auth_session_v1', storedSession);
          expect(AuthService.sessionEpoch, greaterThan(owner.epoch));
        } else {
          await prefs.setString(
              'auth_session_v1',
              jsonEncode({
                'userId': 'synthetic_sandbox_user_other',
                'sessionId': 'synthetic-session-b',
                'email': 'b@example.invalid',
              }));
        }
        if (boundary == 'create') {
          createResponse.complete(replay);
        } else {
          readResponse.complete(TechnicalSandboxRun(
            id: runId,
            status: 'paid',
            amountMinor: 100,
            currency: 'EUR',
            checkoutUrl: null,
            checkoutExpiresAt: null,
            receipt: validReceipt(),
          ));
        }
        await tester.pumpAndSettle();
        expect(creates, 1);
        expect(reads, boundary == 'read' ? 1 : 0);
        expect(opens, 0);
        expect(find.byType(TechnicalSandboxScreen), findsNothing);
        expect(find.textContaining('Serverbestätigter Test'), findsNothing);
      });
    }
  }

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
