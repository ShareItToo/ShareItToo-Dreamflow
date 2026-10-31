import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';
import 'support/mission_quorum_web_golden.dart';
import 'support/mission_quorum_web_preview.dart';

Map<String, dynamic> golden() =>
    jsonDecode(p7DisplayGoldenJson) as Map<String, dynamic>;
Widget preview({Map<String, dynamic>? raw, double scale = 1}) => MaterialApp(
    theme: ThemeData(fontFamily: 'Roboto'),
    builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: TextScaler.linear(scale)),
        child: child!),
    home: P7WebPreviewHarness.open(
        flag: true,
        raw: raw ?? golden(),
        expectedDigest: raw?['digest'] ?? p7DisplayGoldenDigest,
        expectedPrincipal: p7DisplayGoldenPrincipal));
void resign(Map<String, dynamic> raw) {
  raw['envelope']['projectionDigest'] =
      p7DisplayDigest(raw['envelope']['projection']);
  raw['digest'] = p7DisplayDigest(raw['envelope']);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    // The browser test host does not serve the bundled font assets. Keep the
    // shipped-glyph geometry proof on VM; Chrome separately proves the web
    // harness, semantics, keyboard and layout using its engine test font.
    if (kIsWeb) return;
    final font = FontLoader('Roboto')
      ..addFont(rootBundle.load('assets/fonts/Roboto-Regular.ttf'));
    await font.load();
  });
  test('dedicated harness rejects unavailable and malformed preview flags', () {
    for (final flag in [null, false, 'true', 1]) {
      expect(
          () => P7WebPreviewHarness.open(
              flag: flag,
              raw: jsonDecode(p7DisplayGoldenJson),
              expectedDigest: p7DisplayGoldenDigest,
              expectedPrincipal: p7DisplayGoldenPrincipal),
          throwsFormatException);
    }
  });
  testWidgets('ordinary view is unavailable by default', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: P7WebPreview()));
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
          () => P7DisplayEnvelope.parse(
              raw: raw,
              expectedDigest: raw['digest'],
              expectedPrincipal: p7DisplayGoldenPrincipal),
          throwsFormatException);
    }
    final tampered = golden();
    tampered['envelope']['projection']['status'] = 'readback_required';
    expect(
        () => P7DisplayEnvelope.parse(
            raw: tampered,
            expectedDigest: p7DisplayGoldenDigest,
            expectedPrincipal: p7DisplayGoldenPrincipal),
        throwsFormatException);
    expect(
        () => P7DisplayEnvelope.parse(
            raw: golden(),
            expectedDigest: 'e' * 64,
            expectedPrincipal: p7DisplayGoldenPrincipal),
        throwsFormatException);
    expect(
        () => P7DisplayEnvelope.parse(
            raw: golden(),
            expectedDigest: p7DisplayGoldenDigest,
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
          expect(find.bySemanticsLabel(p7SyntheticDisclosure), findsOneWidget);
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
    final raw = golden();
    final slot = raw['envelope']['details'][0]['pickup']['slots'][3];
    slot['present'] = false;
    slot['evidenceId'] = null;
    slot['uploadId'] = null;
    slot['uploadSha256'] = null;
    raw['envelope']['details'][0]['pickup']['confirmation'] = null;
    raw['envelope']['details'][0]['pickup']['verification'] = null;
    raw['envelope']['projection']['components'][0]['axes']['pickup'] =
        'unknown';
    resign(raw);
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
    expect(find.text('Kritischer Bereich: fehlt'), findsOneWidget);
    expect(find.text('Verifizierung: unbekannt'), findsOneWidget);
    expect(find.textContaining('tampered-after-validation'), findsNothing);
  });

  testWidgets(
      'rejection, timeout and isolated optional dispute are rendered honestly',
      (tester) async {
    for (final scenario in ['rejected', 'timeout', 'optional_conflict']) {
      final raw = golden();
      final p = raw['envelope']['projection'];
      final c = p['components'][0];
      if (scenario == 'optional_conflict') {
        c['necessity'] = 'optional';
        c['slotKey'] = 'optional:${c['needKey']}:${c['ordinal']}';
        raw['envelope']['details'][0]['slotKey'] = c['slotKey'];
        c['axes']['return'] = 'needs_clarification';
        c['axes']['dispute'] = 'open';
        c['status'] = 'needs_clarification';
        p['status'] = 'needs_clarification';
      } else {
        c['axes']['acceptance'] = scenario;
        c['status'] =
            scenario == 'timeout' ? 'readback_required' : 'incomplete';
        p['status'] = c['status'];
      }
      resign(raw);
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
}
