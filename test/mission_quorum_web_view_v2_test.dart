import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';
import 'support/mission_quorum_web_golden_v2.dart';
import 'support/mission_quorum_web_preview_v2.dart';

Map<String, dynamic> golden([String scenario = 'complete']) =>
    (jsonDecode(p7V2DisplayCatalogJson) as Map<String, dynamic>)[scenario]
        as Map<String, dynamic>;
Widget preview({Map<String, dynamic>? raw, double scale = 1}) => MaterialApp(
    theme: ThemeData(fontFamily: 'Roboto'),
    builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: TextScaler.linear(scale)),
        child: child!),
    home: P7V2WebPreviewHarness.open(
        flag: true,
        raw: raw ?? golden(),
        expectedDigest: raw?['digest'] ?? p7V2DisplayGoldenDigest,
        expectedPrincipal: p7V2DisplayGoldenPrincipal));
void resign(Map<String, dynamic> raw) {
  raw['envelope']['projectionDigest'] =
      p7V2DisplayDigest(raw['envelope']['projection']);
  raw['digest'] = p7V2DisplayDigest(raw['envelope']);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  WidgetController.hitTestWarningShouldBeFatal = true;
  test(
      'segment axis and presented confirmation/verification bind bidirectionally',
      () {
    for (final phase in ['pickup', 'return']) {
      for (final variant in [
        'confirmed_unknown',
        'confirmed_clarification',
        'deviation_evidenced',
        'deviation_unknown',
        'missing_verifier_evidenced'
      ]) {
        final raw = golden();
        final p = raw['envelope']['projection'];
        final c = p['components'][0];
        final s = raw['envelope']['details'][0][phase];
        if (phase == 'pickup') {
          // No later Return evidence can be the reason this negative is rejected.
          raw['envelope']['details'][0]['return'] =
              golden('rejected')['envelope']['details'][0]['return'];
          c['axes']['return'] = 'unknown';
        }
        if (variant.startsWith('deviation')) {
          s['confirmation']['decision'] = 'deviation';
        }
        if (variant == 'missing_verifier_evidenced') s['verification'] = null;
        c['axes'][phase] = variant.endsWith('unknown')
            ? 'unknown'
            : variant.endsWith('clarification')
                ? 'needs_clarification'
                : 'evidenced';
        c['status'] = c['axes'].values.contains('needs_clarification')
            ? 'needs_clarification'
            : 'incomplete';
        p['status'] = c['status'];
        resign(raw);
        expect(() => preview(raw: raw), throwsFormatException,
            reason:
                '$phase $variant must fail despite consistent wrapper/status digests');
      }
    }
  });
  test(
      'ReturnCase cause, return axis and dispute are mutually bound with closed enums',
      () {
    for (final change in <void Function(Map<String, dynamic>)>[
      (x) => x['envelope']['details'][0]['returnCaseStatus'] = null,
      (x) => x['envelope']['details'][0]['returnCaseStatus'] = 'closed',
      (x) => x['envelope']['details'][0]['returnState'] = 'private-value',
      (x) => x['envelope']['details'][0]['returnCaseStatus'] = 'private-value',
      (x) => x['envelope']['details'][0]['returnCaseId'] = 'private-id',
      (x) => x['envelope']['projection']['components'][0]['axes']['dispute'] =
          'none',
      (x) => x['envelope']['projection']['components'][0]['axes']['return'] =
          'evidenced',
    ]) {
      final x = golden('optional_conflict');
      change(x);
      resign(x);
      expect(() => preview(raw: x), throwsFormatException);
    }
    final x = golden();
    x['envelope']['projection']['components'][0]['axes']['dispute'] = 'open';
    resign(x);
    expect(() => preview(raw: x), throwsFormatException);
  });
  testWidgets(
      'backend-derived synthetic deviation is clarification without inventing a ReturnCase',
      (tester) async {
    final raw = golden('deviation');
    await tester.pumpWidget(preview(raw: raw));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('p7-axis-0-return')))
            .data,
        'Rückgabe: Klärung erforderlich');
    expect(find.byKey(const ValueKey('p7-return-reason-0')), findsNothing);
    expect(tester.takeException(), isNull);
  });
  setUpAll(() async {
    // These widget checks do not attest browser runtime or deployment.
    if (kIsWeb) return;
    final font = FontLoader('Roboto')
      ..addFont(rootBundle.load('assets/fonts/Roboto-Regular.ttf'));
    await font.load();
  });
  test('dedicated harness rejects unavailable and malformed preview flags', () {
    for (final flag in [null, false, 'true', 1]) {
      expect(
          () => P7V2WebPreviewHarness.open(
              flag: flag,
              raw: golden(),
              expectedDigest: p7V2DisplayGoldenDigest,
              expectedPrincipal: p7V2DisplayGoldenPrincipal),
          throwsFormatException);
    }
  });
  testWidgets('ordinary view is unavailable by default', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: P7V2WebPreview()));
    expect(find.text('Synthetische Testansicht nicht freigegeben'),
        findsOneWidget);
    expect(find.textContaining('Eigentümer 1'), findsNothing);
  });

  test(
      'version, digest, namespace, principal, real IDs and contradictory shapes fail closed',
      () {
    final changes = <void Function(Map<String, dynamic>)>[
      (x) => x['envelope']['version'] = 'other',
      (x) => x['envelope']['authentic'] = true,
      (x) => x['envelope']['namespace'] = 'real',
      (x) => x['envelope']['projection']['missionNeedId'] =
          'mission_need_11111111-1111-4111-8111-111111111111',
      (x) => x['envelope']['projection']['resolutionId'] =
          'mission_inventory_11111111-1111-4111-8111-111111111111',
      (x) => x['envelope']['projection']['missionOwnerId'] = 'real-principal',
      (x) => x['envelope']['projection']['components'][0]['ownerId'] =
          'real-owner',
      (x) => x['envelope']['projection']['components'][0]['itemId'] =
          'real-listing',
      (x) => x['envelope']['details'][0]['pickup']['slots'][0]['evidenceId'] =
          'real-evidence',
      (x) => x['envelope']['details'][0]['pickup']['slots'][1]['slot'] =
          'overview',
      (x) => x['envelope']['details'][0]['pickup']['slots'].removeLast(),
      (x) => x['envelope']['details'][0]['pickup']['verification']
          ['evidenceSetDigest'] = 'f' * 64,
      (x) => x['envelope']['details'][0]['pickup']['verification']
              ['verifierId'] =
          x['envelope']['projection']['components'][0]['ownerId'],
      (x) => x['envelope']['details'][0]['return']['verification']
          ['codeLength'] = 5,
      (x) => x['envelope']['details'][0]['return']['verification']
          ['codeLength'] = 7,
      (x) => x['envelope']['details'][0]['return']['verification']
          ['digitsOnly'] = false,
      (x) => x['envelope']['projection']['components'][0]['axes']
          ['acceptance'] = 'timeout',
      (x) => x['envelope']['extra'] = 'unexpected',
    ];
    for (final change in changes) {
      final raw = golden();
      change(raw);
      resign(raw);
      expect(
          () => P7V2DisplayEnvelope.parse(
              raw: raw,
              expectedDigest: raw['digest'],
              expectedPrincipal: p7V2DisplayGoldenPrincipal),
          throwsFormatException);
    }
    final tampered = golden();
    tampered['envelope']['projection']['status'] = 'readback_required';
    expect(
        () => P7V2DisplayEnvelope.parse(
            raw: tampered,
            expectedDigest: p7V2DisplayGoldenDigest,
            expectedPrincipal: p7V2DisplayGoldenPrincipal),
        throwsFormatException);
    expect(
        () => P7V2DisplayEnvelope.parse(
            raw: golden(),
            expectedDigest: 'e' * 64,
            expectedPrincipal: p7V2DisplayGoldenPrincipal),
        throwsFormatException);
    expect(
        () => P7V2DisplayEnvelope.parse(
            raw: golden(),
            expectedDigest: p7V2DisplayGoldenDigest,
            expectedPrincipal: 'foreign'),
        throwsFormatException);
  });

  for (final size in [
    const Size(390, 844),
    const Size(768, 1024),
    const Size(1920, 1080),
    const Size(3840, 2160)
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets(
          'four plus four and methods are accessible at ${size.width} scale $scale',
          (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final semantics = tester.ensureSemantics();
        try {
          await tester.pumpWidget(preview(scale: scale));
          await tester.pumpAndSettle();
          final disclosure = find.byKey(const ValueKey('p7-disclosure'));
          final initial = tester.getRect(disclosure);
          expect(initial.top, greaterThanOrEqualTo(0));
          expect(initial.bottom, lessThan(size.height));
          expect(
              find.bySemanticsLabel(p7V2SyntheticDisclosure), findsOneWidget);
          final body = tester.getRect(find.byType(ListView));
          expect(body.width, lessThanOrEqualTo(960));
          expect(body.center.dx, closeTo(size.width / 2, 0.1));
          final action = find.byKey(const ValueKey('p7-evidence-0'));
          await tester.scrollUntilVisible(action, 200);
          await tester.pumpAndSettle();
          expect(action.hitTestable(), findsOneWidget);
          await tester.tap(action, warnIfMissed: true);
          await tester.pumpAndSettle();
          for (final segment in ['pickup', 'return']) {
            final count = find.byKey(ValueKey('p7-count-0-$segment'));
            await tester.ensureVisible(count);
            await tester.pumpAndSettle();
            expect(count.hitTestable(), findsOneWidget);
            expect(tester.widget<Text>(count).data, contains('4/4'));
            for (final slot in [
              'overview',
              'detail',
              'accessories',
              'critical'
            ]) {
              expect(find.byKey(ValueKey('p7-slot-0-$segment-$slot')),
                  findsOneWidget);
            }
          }
          expect(find.text('QR-v3: synthetischer Verifizierungsbeleg'),
              findsOneWidget);
          expect(
              find.text(
                  'Fallback: exakt 6 Ziffern, synthetischer Verifizierungsbeleg'),
              findsOneWidget);
          expect(tester.getRect(disclosure), initial,
              reason: 'disclosure never scrolls out of view');
          expect(tester.takeException(), isNull);
        } finally {
          semantics.dispose();
        }
      });
    }
  }

  testWidgets(
      'keyboard toggles evidence; reset and disposal clear ephemeral state',
      (tester) async {
    await tester.pumpWidget(preview());
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<OutlinedButton>(find.byKey(const ValueKey('p7-reset')))
            .focusNode!
            .hasFocus,
        isTrue);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('p7-count-0-pickup')), findsOneWidget);
    final reset = find.byKey(const ValueKey('p7-reset'));
    await tester.ensureVisible(reset);
    await tester.pumpAndSettle();
    await tester.tap(reset);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('p7-count-0-pickup')), findsNothing);
    expect(
        tester.widget<ListView>(find.byType(ListView)).controller!.offset, 0);
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('p7-evidence-0')), 200);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('p7-evidence-0')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('p7-count-0-pickup')), findsOneWidget);
    await tester.pumpWidget(preview());
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('p7-count-0-pickup')), findsNothing);
    expect(
        tester.widget<ListView>(find.byType(ListView)).controller!.offset, 0);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(preview());
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('p7-count-0-pickup')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'injected data is detached and a 3/4 slot set cannot display verified truth',
      (tester) async {
    final raw = golden('partial');
    final view = preview(raw: raw);
    raw['envelope']['projection']['status'] = 'tampered-after-validation';
    await tester.pumpWidget(view);
    await tester.pumpAndSettle();
    final action = find.byKey(const ValueKey('p7-evidence-0'));
    await tester.scrollUntilVisible(action, 200);
    await tester.pumpAndSettle();
    expect(action.hitTestable(), findsOneWidget);
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.text('Übergabe: 3/4 synthetische Foto-Slots'), findsOneWidget);
    expect(
        tester
            .widget<Text>(
                find.byKey(const ValueKey('p7-slot-0-pickup-critical')))
            .data,
        'Kritischer Bereich: fehlt');
    expect(find.text('Verifizierung: unbekannt'), findsNWidgets(2));
    expect(find.textContaining('tampered-after-validation'), findsNothing);
  });

  testWidgets(
      'rejection, timeout and isolated optional dispute are rendered honestly',
      (tester) async {
    for (final scenario in ['rejected', 'timeout', 'optional_conflict']) {
      final raw = golden(scenario);
      await tester.pumpWidget(preview(raw: raw));
      await tester.pumpAndSettle();
      expect(
          tester.widget<Text>(find.byKey(const ValueKey('p7-status'))).data,
          scenario == 'rejected'
              ? 'Mission: unvollständig'
              : scenario == 'timeout'
                  ? 'Mission: Ergebnis muss geprüft werden'
                  : 'Mission: Klärung erforderlich');
      if (scenario == 'optional_conflict') {
        expect(
            tester
                .widget<Text>(find.byKey(const ValueKey('p7-return-reason-0')))
                .data,
            'Rückgabe-Klärungsgrund (synthetisch): widersprüchlicher Rückgabe-/Prüffallstatus.');
        expect(find.text('Optionale Komponente'), findsOneWidget);
        expect(
            tester
                .widget<Text>(find.byKey(const ValueKey('p7-axis-0-dispute')))
                .data,
            'Klärungsfall: offen');
        await tester.scrollUntilVisible(
            find.byKey(const ValueKey('p7-axis-1-dispute')), 250);
        expect(
            tester
                .widget<Text>(find.byKey(const ValueKey('p7-axis-1-dispute')))
                .data,
            'Klärungsfall: kein Ereignis belegt');
      }
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets(
      'released is not accepted and there are no real evidence or replay claims',
      (tester) async {
    await tester.pumpWidget(preview(raw: golden('released')));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('p7-axis-0-supplyRelease')))
            .data,
        'Freigabe: freigegeben');
    expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('p7-axis-0-acceptance')))
            .data,
        'Annahme: nicht gebunden');
    expect(find.textContaining('Kein PG-Readback'), findsOneWidget);
    final action = find.byKey(const ValueKey('p7-evidence-0'));
    await tester.scrollUntilVisible(action, 200);
    await tester.pumpAndSettle();
    expect(action.hitTestable(), findsOneWidget);
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('p7-count-0-pickup')))
            .data,
        contains('0/4'));
    expect(find.text('QR-v3: synthetischer Verifizierungsbeleg'), findsNothing);
    final texts = tester
        .widgetList<Text>(find.byType(Text))
        .map((t) => t.data ?? '')
        .join(' ');
    expect(texts, isNot(contains('p7v2-synthetic-')));
    expect(texts, isNot(contains(p7V2DisplayGoldenDigest)));
    expect(tester.takeException(), isNull);
  });
  test(
      'V2 context, typed IDs, private extras and impossible sequence are rejected even if resigned',
      () {
    for (final change in <void Function(Map<String, dynamic>)>[
      (x) => x['envelope']['projection']['context']['synthetic'] = false,
      (x) => x['envelope']['projection']['context']['namespace'] = 'foreign',
      (x) =>
          x['envelope']['projection']['context']['private'] = 'PRIVATE-MARKER',
      (x) => x['envelope']['projection']['components'][0]['needKey'] =
          'private-name',
      (x) => x['envelope']['details'][0]['pickup']['slots'][0]['private'] =
          'PRIVATE-MARKER',
    ]) {
      final x = golden();
      change(x);
      resign(x);
      expect(() => preview(raw: x), throwsFormatException);
    }
    for (final scenario in ['rejected', 'timeout']) {
      final x = golden(scenario);
      x['envelope']['details'][0]['pickup'] =
          golden()['envelope']['details'][0]['pickup'];
      resign(x);
      expect(() => preview(raw: x), throwsFormatException);
    }
  });
}
