import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:lendify/config/mission_web_entry_config.dart';
import 'package:lendify/screens/mission_web_entry_screen.dart';
import 'package:lendify/screens/app_link_destination_screen.dart';
import 'package:lendify/services/app_link_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/mission_web_entry.dart';

class _Owner implements AppLinkPrincipalOwner {
  @override
  String get principalToken => 'synthetic-route-owner';
  @override
  bool get authenticated => false;
  @override
  int get epoch => 1;
  @override
  bool get isCurrentEpoch => true;
  @override
  Future<bool> isCurrent() async => true;
}

class _Controller extends AppLinkController {
  PrincipalBoundAppLinkTarget? pending;
  @override
  PrincipalBoundAppLinkTarget? takePending() {
    final p = pending;
    pending = null;
    return p;
  }

  void offer() {
    pending = PrincipalBoundAppLinkTarget(
        target: AppLinkParser.parseRaw('https://shareittoo.com/mission',
            isWeb: true)!,
        owner: _Owner());
    notifyListeners();
  }
}

Widget host(LocalizationController l,
        {bool web = true, bool enabled = false, double scale = 1}) =>
    ChangeNotifierProvider.value(
        value: l,
        child: MaterialApp(
          theme: ThemeData(fontFamily: 'Roboto'),
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(scale)),
              child: child!),
          home: MissionWebEntryScreen(testWeb: web, testEnabled: enabled),
        ));

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  setUpAll(() async {
    final font = FontLoader('Roboto')
      ..addFont(rootBundle.load('assets/fonts/Roboto-Regular.ttf'));
    await font.load();
  });
  test('independent flag defaults false and requires Web', () {
    expect(MissionWebEntryConfig.enabled, false);
    for (final web in [true, false]) {
      for (final flag in [true, false]) {
        expect(MissionWebEntryConfig.availableFor(isWeb: web, enabled: flag),
            web && flag);
      }
    }
  });
  test(
      'exact raw HTTPS mission URL only; aliases never enter the legacy permissive parser',
      () {
    for (final domain in [
      'shareittoo.com',
      'www.shareittoo.com',
      'staging.shareittoo.com'
    ]) {
      final raw = 'https://$domain/mission';
      expect(AppLinkParser.parseRaw(raw, isWeb: true)?.kind,
          AppLinkKind.missionWebEntry);
      expect(AppLinkParser.parseRaw(raw, isWeb: false), null);
    }
    for (final raw in [
      'http://shareittoo.com/mission',
      'https://shareittoo.com:443/mission',
      'https://shareittoo.com:8443/mission',
      'https://user@shareittoo.com/mission',
      'https://evil.invalid/mission',
      'https://shareittoo.com.evil.invalid/mission',
      'https://shareittoo.com/mission/',
      'https://shareittoo.com/mission/extra',
      'https://shareittoo.com/mission?',
      'https://shareittoo.com/mission?enabled=true',
      'https://shareittoo.com/mission#',
      'https://shareittoo.com/mission#private',
      'https://shareittoo.com/%6dission',
      'https://shareittoo.com/miss%69on',
      'https://shareittoo.com/mission%2f',
      'https://shareittoo.com/a/../mission',
      'https://shareittoo.com//mission',
      'https://shareittoo.com/Mission',
      'https://shareittoo.com/open/mission',
      'https://shareittoo.com/api/v1/mission',
      'shareittoo://mission',
      '/mission',
      'https://shareittoo.com/unknown'
    ]) {
      expect(AppLinkParser.parseRaw(raw, isWeb: true), null, reason: raw);
    }
    // A normalized Uri cannot prove absence of an encoded alias. Mission ingress requires raw bytes.
    expect(
        AppLinkParser.parse(Uri.parse('https://shareittoo.com/mission')), null);
  });
  test('canonical Uri inputs cannot attest original browser URL spelling', () {
    for (final raw in [
      'https://shareittoo.com/%6dission',
      'https://shareittoo.com:443/mission',
      'https://shareittoo.com/a/../mission',
    ]) {
      expect(AppLinkParser.parseRaw(raw, isWeb: true), null);
      final normalized = Uri.parse(raw).toString();
      expect(normalized, 'https://shareittoo.com/mission');
      // Documents information loss, not end-to-end browser rejection proof.
      expect(AppLinkParser.parseRaw(normalized, isWeb: true)?.kind,
          AppLinkKind.missionWebEntry);
    }
  });
  testWidgets(
      'off/native flags expose localized unavailable without actions or synthetic data',
      (tester) async {
    final l = LocalizationController();
    addTearDown(l.dispose);
    for (final pair in [(true, false), (false, true), (false, false)]) {
      await tester.pumpWidget(host(l, web: pair.$1, enabled: pair.$2));
      expect(find.text(l.t('missionWeb.unavailable')), findsOneWidget);
      expect(find.byType(OutlinedButton), findsNothing);
      expect(tester.widget<MissionWebEntry>(find.byType(MissionWebEntry)).view,
          null);
      expect(
          tester
              .widget<MissionWebEntry>(find.byType(MissionWebEntry))
              .pickupPlan,
          null);
      expect(find.byKey(const ValueKey('mission-pickup-0')), findsNothing);
    }
  });
  testWidgets(
      'local correction/reset are real, DE/EN copy complete, disposal resets the example',
      (tester) async {
    final l = LocalizationController();
    addTearDown(l.dispose);
    for (final language in [AppLanguage.de, AppLanguage.en]) {
      await l.setLanguage(language);
      await tester.pumpWidget(host(l, enabled: true));
      var entry = tester.widget<MissionWebEntry>(find.byType(MissionWebEntry));
      expect(
          entry.pickupPlan!.validFor(entry.view!, entry.pickupBinding!), true);
      expect(entry.pickupPlan!.entries[0].area, MissionPickupArea.exampleA);
      expect(entry.pickupPlan!.entries[1].area, MissionPickupArea.exampleB);
      expect(
          entry.pickupPlan!.entries[0].window!.start ==
              entry.pickupPlan!.entries[1].window!.start,
          false);
      for (final text in [
        entry.pickupCopy!.separate,
        entry.pickupCopy!.syntheticNotAgreed,
        entry.pickupCopy!.noDeliveryOrCombined
      ]) {
        expect(text.startsWith('missionWeb.'), false);
        expect(find.text(text), findsOneWidget);
      }
      for (final value in [
        entry.copy.title,
        entry.copy.unavailable,
        entry.copy.nonBinding,
        entry.copy.noReservation,
        entry.copy.noGroupBooking,
        ...entry.copy.statuses.values
      ]) {
        expect(value.startsWith('missionWeb.'), false);
      }
      final before = entry.view!;
      final correct = find.byKey(const ValueKey('mission-entry-correct-0'));
      await tester.ensureVisible(correct);
      await tester.tap(correct);
      await tester.pump();
      entry = tester.widget<MissionWebEntry>(find.byType(MissionWebEntry));
      expect(entry.view!.units[0].quantity, 3);
      expect(entry.pickupPlan!.entries[0].areaStatus,
          MissionPickupValueStatus.changed);
      expect(entry.pickupPlan!.entries[0].timeStatus,
          MissionPickupValueStatus.changed);
      expect(entry.pickupPlan!.entries[0].area, null);
      expect(entry.pickupPlan!.entries[0].window, null);
      expect(entry.pickupPlan!.entries[0].sourceRevision, 2);
      expect(find.text(l.t('missionWeb.pickup.areaA')), findsNothing);
      expect(find.textContaining('2026-10-04'), findsNothing);
      expect(
          find.text(entry
              .pickupCopy!.windows[MissionPickupWindowLabel.october4Morning]!),
          findsNothing);
      expect(before.units[0].quantity, 2);
      final reset = find.byKey(const ValueKey('mission-entry-reset'));
      await tester.ensureVisible(reset);
      await tester.tap(reset);
      await tester.pump();
      entry = tester.widget<MissionWebEntry>(find.byType(MissionWebEntry));
      expect(entry.pickupPlan!.entries[0].area, MissionPickupArea.exampleA);
      expect(entry.pickupPlan!.entries[0].sourceRevision, 1);
      expect(
          tester
              .widget<MissionWebEntry>(find.byType(MissionWebEntry))
              .view!
              .units[0]
              .quantity,
          2);
      await tester.pumpWidget(const SizedBox.shrink());
    }
    await tester.pumpWidget(host(l, enabled: true));
    expect(
        tester
            .widget<MissionWebEntry>(find.byType(MissionWebEntry))
            .pickupPlan!
            .entries[0]
            .sourceRevision,
        1);
    expect(
        tester
            .widget<MissionWebEntry>(find.byType(MissionWebEntry))
            .view!
            .units[0]
            .quantity,
        2);
  });
  testWidgets(
      'D7 shows localized Berlin windows without UTC or technical revisions in text or semantics',
      (tester) async {
    final l = LocalizationController();
    addTearDown(l.dispose);
    final semantics = tester.ensureSemantics();
    try {
      for (final language in [AppLanguage.de, AppLanguage.en]) {
        await l.setLanguage(language);
        await tester.pumpWidget(host(l, enabled: true));
        expect(
            find.textContaining(
                RegExp(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z')),
            findsNothing);
        expect(
            find.textContaining(
                RegExp(r'Quellrevision|source revision', caseSensitive: false)),
            findsNothing);
        expect(
            find.bySemanticsLabel(RegExp(
                r'Quellrevision|source revision|T08:00:00Z',
                caseSensitive: false)),
            findsNothing);
        expect(
            find.text(language == AppLanguage.de
                ? '4. Oktober 2026, 10–11 Uhr (Berlin)'
                : '4 October 2026, 10–11 am (Berlin)'),
            findsOneWidget);
        expect(
            find.text(language == AppLanguage.de
                ? '5. Oktober 2026, 15–16 Uhr (Berlin)'
                : '5 October 2026, 3–4 pm (Berlin)'),
            findsOneWidget);
      }
    } finally {
      semantics.dispose();
    }
  });
  for (final width in [390.0, 1440.0, 1920.0, 3840.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('localized route layout $width/$scale', (tester) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final l = LocalizationController();
        addTearDown(l.dispose);
        final semantics = tester.ensureSemantics();
        try {
          for (final language in [AppLanguage.de, AppLanguage.en]) {
            await l.setLanguage(language);
            await tester.pumpWidget(host(l, enabled: true, scale: scale));
            await tester.ensureVisible(
                find.byKey(const ValueKey('mission-entry-reset')));
            expect(tester.takeException(), null);
            expect(
                find.bySemanticsLabel(l.t('missionWeb.title')), findsOneWidget);
            expect(
                find.byKey(const ValueKey('mission-pickup-0')), findsOneWidget);
            expect(
                find.byKey(const ValueKey('mission-pickup-1')), findsOneWidget);
            expect(
                find.text(l.t('missionWeb.pickup.separate')), findsOneWidget);
          }
        } finally {
          semantics.dispose();
        }
      });
    }
  }
  testWidgets(
      'D7 adds no focusable controls and keyboard correction/reset remains functional',
      (tester) async {
    final l = LocalizationController();
    addTearDown(l.dispose);
    await tester.pumpWidget(host(l, enabled: true));
    expect(find.byType(OutlinedButton), findsNWidgets(3));
    final first = find.byKey(const ValueKey('mission-entry-correct-0'));
    await tester.ensureVisible(first);
    tester.widget<OutlinedButton>(first).focusNode!.requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(find.text(l.t('missionWeb.pickup.changedArea')), findsOneWidget);
    final reset = find.byKey(const ValueKey('mission-entry-reset'));
    await tester.ensureVisible(reset);
    tester.widget<OutlinedButton>(reset).focusNode!.requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(find.text(l.t('missionWeb.pickup.areaA')), findsOneWidget);
    expect(tester.takeException(), null);
  });
  testWidgets(
      'principal-owned host dispatches isolated mission screen, never general data destination; navigator back preserves base',
      (tester) async {
    final controller = _Controller();
    final l = LocalizationController();
    addTearDown(controller.dispose);
    addTearDown(l.dispose);
    await tester.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider<AppLinkController>.value(value: controller),
          ChangeNotifierProvider<LocalizationController>.value(value: l),
        ],
        child: const MaterialApp(
            home: AppLinkHost(child: Scaffold(body: Text('Base'))))));
    controller.offer();
    await tester.pumpAndSettle();
    expect(find.byType(MissionWebEntryScreen), findsOneWidget);
    expect(find.byType(AppLinkDestinationScreen), findsNothing);
    expect(find.byType(OutlinedButton), findsNothing);
    final context = tester.element(find.byType(MissionWebEntryScreen));
    Navigator.of(context).pop();
    await tester.pumpAndSettle();
    expect(find.text('Base'), findsOneWidget);
    controller.offer();
    await tester.pumpAndSettle();
    expect(find.byType(MissionWebEntryScreen), findsOneWidget);
    expect(tester.takeException(), null);
  });
}
