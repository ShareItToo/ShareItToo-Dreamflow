import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/config/synthetic_payment_config.dart';
import 'package:lendify/screens/synthetic_payment_test_screen.dart';
import 'package:lendify/services/synthetic_payment_service.dart';

const run = 'wp255-20260929120000-aabbccdd';
const booking = '00000000-0000-4000-8000-000000000011';
Map<String, dynamic> snapshot(
        {String? status, String scenario = 'challenge_then_capture'}) =>
    {
      'runId': run,
      'bookingId': booking,
      'marker': {
        'persistentNotice': syntheticPaymentNotice,
        'syntheticTestOnly': true,
        'monetaryEffectMinor': 0,
        'contractEligible': false,
        'payoutEligible': false
      },
      'quote': {
        'amountMinor': 6600,
        'platformFeeMinor': 600,
        'ownerPayoutMinor': 6000,
        'currency': 'EUR'
      },
      'payout': null,
      'audit': <Map<String, dynamic>>[],
      'isRenter': true,
      'scenarios': syntheticPaymentScenarios,
      'payment': status == null
          ? null
          : {
              'status': status,
              'scenario': scenario,
              'method': 'synthetic',
              'livemode': false,
              'capturedMinor':
                  ['captured', 'refunded'].contains(status) ? 6600 : 0,
              'refundedMinor': status == 'refunded' ? 6600 : 0
            },
    };

class FakeServer implements SyntheticPaymentApi {
  Map<String, dynamic> value = snapshot();
  final receipts = <String, Map<String, dynamic>>{};
  final commands = <Map<String, dynamic>>[];
  bool fail = false;
  bool ignoreCommand = false;
  bool cleaned = false;
  @override
  Future<Map<String, dynamic>> load() async {
    if (fail) throw StateError('unauthorized');
    return value;
  }

  @override
  Future<void> command(Map<String, dynamic> body) async {
    commands.add(Map.of(body));
    if (fail) throw StateError('unavailable');
    if (ignoreCommand || receipts.containsKey(body['key'])) return;
    final scenario = body['scenario'] as String? ??
        (value['payment'] as Map?)?['scenario'] as String? ??
        'challenge_then_capture';
    final next = switch (body['action']) {
      'select' => 'ready',
      'submit' => scenario == 'decline' ? 'failed' : 'requires_action',
      'confirm' => 'captured',
      _ => 'refunded'
    };
    value = {
      ...snapshot(status: next, scenario: scenario),
      'audit': [
        ...value['audit'] as List,
        {'status': next}
      ]
    };
    receipts[body['key'] as String] = Map.of(body);
  }

  @override
  Future<void> cleanup() async {
    if (fail) throw StateError('cleanup');
    cleaned = true;
    receipts.clear();
    value = snapshot();
  }
}

void main() {
  test(
      'compile envelope is false by default and rejects release, wrong package and nonclone',
      () {
    expect(SyntheticPaymentConfig.validFlag('invalid'), false);
    expect(SyntheticPaymentConfig.validFlag('1'), false);
    expect(
        SyntheticPaymentConfig.allowed(
            requested: false, release: true, clone: false, bundle: ''),
        true);
    for (final args in [
      (true, true, 'com.shareittoo.app.qa'),
      (false, false, 'com.shareittoo.app.qa'),
      (false, true, 'com.shareittoo.app')
    ]) {
      expect(
          SyntheticPaymentConfig.allowed(
              requested: true,
              release: args.$1,
              clone: args.$2,
              bundle: args.$3),
          false);
    }
  });
  test(
      'snapshot rejects financial, unknown-state and cross-run or booking drift',
      () {
    for (final patch in [
      {'runId': 'other'},
      {'bookingId': 'other'},
      {'payout': {}},
      {'marker': {}},
      {'quote': {}},
      {
        'payment': {'status': 'paid', 'livemode': true}
      }
    ]) {
      expect(
          () => validateSyntheticPaymentSnapshot(
              {...snapshot(), ...patch}, run, booking),
          throwsFormatException);
    }
    expect(
        validateSyntheticPaymentSnapshot(
            snapshot(status: 'refunded'), run, booking)['payment']['status'],
        'refunded');
  });
  if (!SyntheticPaymentConfig.enabled) {
    testWidgets('default build never loads or presents a payment action',
        (tester) async {
      final api = FakeServer()..fail = true;
      await tester.pumpWidget(MaterialApp(
          home: SyntheticPaymentTestScreen(
              runId: run, bookingId: booking, api: api)));
      await tester.pumpAndSettle();
      expect(find.text('Synthetischer Zahlungstest nicht aktiviert.'),
          findsOneWidget);
      expect(find.byType(FilledButton), findsNothing);
      expect(api.commands, isEmpty);
    });
    return;
  }
  test('loopback transport refuses redirects and never sends to another route',
      () async {
    var count = 0;
    final client = MockClient((request) async {
      count++;
      expect(request.url.host, '127.0.0.1');
      expect(request.url.port, 18080);
      expect(request.followRedirects, false);
      return http.Response('', 302,
          headers: {'location': 'https://example.invalid'});
    });
    await expectLater(
        requestSyntheticPaymentJson(
            method: 'GET',
            path: '/synthetic-clone/status',
            token: 'synthetic-test-only',
            client: client),
        throwsException);
    expect(count, 1);
    await expectLater(
        requestSyntheticPaymentJson(
            method: 'POST',
            path: '/bookings',
            token: 'synthetic-test-only',
            client: client),
        throwsStateError);
    expect(count, 1);
    client.close();
  });
  Future<void> open(WidgetTester tester, FakeServer api) async {
    await tester.pumpWidget(MaterialApp(
        home: SyntheticPaymentTestScreen(
            runId: run, bookingId: booking, api: api)));
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, String label) async {
    await tester.ensureVisible(find.text(label));
    await tester.tap(find.text(label));
    await tester.pumpAndSettle();
    expect(find.text(syntheticPaymentNotice), findsOneWidget);
    expect(tester.takeException(), isNull);
  }

  testWidgets(
      'server-driven decline, challenge, capture, refund and exact replay',
      (tester) async {
    final api = FakeServer();
    await open(tester, api);
    expect(find.byType(TextField), findsNothing);
    for (final step in [
      ('Sichere Testablehnung wählen', null),
      ('Testauswahl speichern', 'ready'),
      ('Testzahlung absenden', 'failed'),
      ('Bestätigung mit Testerfolg wählen', null),
      ('Testauswahl speichern', 'ready'),
      ('Testzahlung absenden', 'requires_action'),
      ('Zusätzliche Testbestätigung', 'captured'),
      ('Testerstattung auslösen', 'refunded')
    ]) {
      await tap(tester, step.$1);
      if (step.$2 != null) {
        expect(find.text('Server-Teststatus: ${step.$2}'), findsOneWidget);
      }
    }
    final receipt = api.commands.last;
    await tap(tester, 'Letzten Testbefehl wiederholen');
    expect(api.commands.last, receipt);
    expect((api.value['audit'] as List).length, 6);
    await tester.pumpWidget(const SizedBox());
    await open(tester, api);
    expect(find.text('Server-Teststatus: refunded'), findsOneWidget);
    await tap(tester, 'Klon und Zahlungstest bereinigen');
    expect(api.cleaned, true);
    expect(find.textContaining('Testbereinigung bestätigt: 0'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
  });
  testWidgets(
      'command response alone never produces success and stale state clears on failure',
      (tester) async {
    final api = FakeServer()
      ..value = snapshot(status: 'requires_action')
      ..ignoreCommand = true;
    await open(tester, api);
    await tap(tester, 'Zusätzliche Testbestätigung');
    expect(find.text('Server-Teststatus: requires_action'), findsOneWidget);
    expect(find.text('Server-Teststatus: captured'), findsNothing);
    api.fail = true;
    await tester.tap(find.byIcon(Icons.refresh));
    await tester.pumpAndSettle();
    expect(find.textContaining('Teststatus nicht verfügbar.'), findsOneWidget);
    expect(find.textContaining('Server-Teststatus:'), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
  });
  testWidgets('owner has read-only status and mismatched run fails visibly',
      (tester) async {
    final api = FakeServer()
      ..value = {...snapshot(status: 'refunded'), 'isRenter': false};
    await open(tester, api);
    expect(find.textContaining('Vermieteransicht:'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
    api.value = {...api.value, 'runId': 'wrong'};
    await tester.tap(find.byIcon(Icons.refresh));
    await tester.pumpAndSettle();
    expect(find.textContaining('Teststatus nicht verfügbar.'), findsOneWidget);
  });
  testWidgets('notice stays visible on narrow screen with enlarged text',
      (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(MaterialApp(
        builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: const TextScaler.linear(1.5)),
            child: child!),
        home: SyntheticPaymentTestScreen(
            runId: run, bookingId: booking, api: FakeServer())));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView), const Offset(0, -500));
    await tester.pump();
    expect(find.text(syntheticPaymentNotice).hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
