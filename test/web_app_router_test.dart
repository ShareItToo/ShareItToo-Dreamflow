import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/navigation/web_app_router.dart';
import 'package:lendify/screens/app_link_destination_screen.dart';
import 'package:lendify/services/app_link_service.dart';
import 'package:lendify/services/mission_web_location.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/services/firebase_runtime.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Owner implements AppLinkPrincipalOwner {
  bool current = true;
  @override
  String get principalToken => 'synthetic-owner';
  @override
  int get epoch => 1;
  @override
  bool get authenticated => true;
  @override
  bool get isCurrentEpoch => current;
  @override
  Future<bool> isCurrent() async => current;
}

class _Harness {
  final owner = _Owner();
  final navigator = GlobalKey<NavigatorState>();
  final key = GlobalKey<WebAppRouterHostState>();
  final localization = LocalizationController();
  late final AppLinkController controller;
  _Harness({String? cold, Future<AppLinkPrincipalOwner> Function()? capture}) {
    controller = AppLinkController(
      initialIsWeb: true,
      capturePrincipalOwner: capture ?? (() async => owner),
      initialWebCapture: InitialWebAppLinkCapture.capture(
        readLocation: () =>
            classifyMissionWebLocation(browserSerializedHref: cold),
        readLegacyUri: () => Uri.parse(cold ?? 'https://shareittoo.com/'),
        configurePaths: () {},
      ),
    )..initialize();
  }
  Widget widget({bool dark = false, Widget? root}) => MultiProvider(
          providers: [
            ChangeNotifierProvider.value(value: controller),
            ChangeNotifierProvider.value(value: localization),
          ],
          child: WebAppRouterHost(
            key: key,
            controller: controller,
            navigatorKey: navigator,
            root:
                root ?? const AppLinkHost(child: Scaffold(body: Text('Root'))),
            buildApp: (config) => MaterialApp.router(
                routerConfig: config,
                theme: ThemeData(
                    brightness: dark ? Brightness.dark : Brightness.light)),
          ));
  Map<String, Object> get state => Map<String, Object>.from(
      key.currentState!.informationForTesting.state! as Map);
  Future<void> restore(String href, [Object? state]) =>
      key.currentState!.restoreForTesting(href, state);
  void dispose() {
    controller.dispose();
    localization.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final kind in [
    AppLinkKind.booking,
    AppLinkKind.chat,
    AppLinkKind.emailVerification,
    AppLinkKind.passwordReset,
    AppLinkKind.paymentReturn,
    AppLinkKind.notifications,
    AppLinkKind.crashDiagnostic
  ]) {
    testWidgets(
        'private or effect-bearing $kind is scrubbed and never replayed',
        (tester) async {
      final h = _Harness();
      addTearDown(h.dispose);
      await tester.pumpWidget(h.widget(
          root: Builder(
              builder: (context) => Scaffold(
                  body: TextButton(
                      onPressed: () {
                        // A local inert route exercises the real observer/registry without
                        // invoking an authentication, payment or diagnostic destination.
                        final route = MaterialPageRoute<void>(
                            builder: (_) => const Scaffold(
                                body: Text('Inert owned route')));
                        WebOwnedRouteBridge.register(
                            context,
                            PrincipalBoundAppLinkTarget(
                                owner: h.owner,
                                target: AppLinkTarget(
                                    kind: kind,
                                    id: 'synthetic-private-id',
                                    uri: Uri.parse(
                                        'shareittoo://synthetic-private?token=synthetic-token'))),
                            route);
                        Navigator.of(context).push(route);
                      },
                      child: const Text('Root'))))));
      await tester.tap(find.text('Root'));
      await tester.pumpAndSettle();
      final entry = h.state;
      expect(h.key.currentState!.informationForTesting.uri.toString(), '/');
      expect(entry.keys, unorderedEquals(['version', 'instance', 'entry']));
      expect(entry.toString(), isNot(contains('synthetic-private')));
      expect(entry.toString(), isNot(contains('synthetic-token')));
      await h.restore('https://shareittoo.com/', {...entry, 'entry': 0});
      await tester.pumpAndSettle();
      await h.restore('https://shareittoo.com/', entry);
      await tester.pumpAndSettle();
      expect(find.text('Inert owned route'), findsNothing);
      expect(find.text('Root'), findsOneWidget);
      expect(h.state['entry'], 0);
    });
  }

  for (final host in [
    'shareittoo.com',
    'www.shareittoo.com',
    'staging.shareittoo.com'
  ]) {
    testWidgets('cold exact $host is serialized cleanly and stays default-off',
        (tester) async {
      final h = _Harness(cold: 'https://$host/mission');
      addTearDown(h.dispose);
      await tester.pumpWidget(h.widget());
      await tester.pumpAndSettle();
      expect(
          h.key.currentState!.informationForTesting.uri.toString(), '/mission');
      expect(find.text(h.localization.t('missionWeb.unavailable')),
          findsOneWidget);
      expect(find.text(h.localization.t('missionWeb.correct')), findsNothing);
      expect(h.state.keys, unorderedEquals(['version', 'instance', 'entry']));
      expect(h.state.toString(), isNot(contains('owner')));
      expect(h.state.toString(), isNot(contains(host)));
      expect(
          await h.controller.didPushRouteInformation(
              RouteInformation(uri: Uri.parse('/mission'))),
          false);
    });
  }

  for (final kind in ['listing', 'profile']) {
    testWidgets(
        'public $kind preserves clean push back forward and rejects target drift',
        (tester) async {
      final h = _Harness();
      addTearDown(h.dispose);
      await tester.pumpWidget(h.widget());
      await tester.pumpAndSettle();
      final path = '/$kind/synthetic-public-example';
      FirebaseRuntime.openForegroundMessage(ForegroundPushMessage(
          title: 'Synthetic',
          body: 'Synthetic',
          actionUri: Uri.parse('https://shareittoo.com/open$path')));
      await tester.pumpAndSettle();
      expect(h.key.currentState!.informationForTesting.uri.toString(), path);
      final entry = h.state;
      expect(entry.toString(), isNot(contains('synthetic-public-example')));
      await h.restore('https://shareittoo.com/', {...entry, 'entry': 0});
      await tester.pumpAndSettle();
      expect(find.text('Root'), findsOneWidget);
      await h.restore('https://shareittoo.com$path', entry);
      await tester.pumpAndSettle();
      expect(h.key.currentState!.informationForTesting.uri.toString(), path);
      final screen = tester.widget<AppLinkDestinationScreen>(
          find.byType(AppLinkDestinationScreen));
      expect(screen.target.id, 'synthetic-public-example');
      for (final drift in [
        '$path-changed',
        '$path?token=synthetic',
        '/open$path'
      ]) {
        await h.restore('https://shareittoo.com$drift', entry);
        await tester.pumpAndSettle();
        expect(find.text('Root'), findsOneWidget);
      }
      h.owner.current = false;
      await h.restore('https://shareittoo.com$path', entry);
      await tester.pumpAndSettle();
      expect(find.text('Root'), findsOneWidget);
      FirebaseRuntime.takePendingActionLink();
    });
  }

  testWidgets(
      'retained Mission cursor cannot be rebound to another admitted host',
      (tester) async {
    final h = _Harness(cold: 'https://shareittoo.com/mission');
    addTearDown(h.dispose);
    await tester.pumpWidget(h.widget());
    await tester.pumpAndSettle();
    await h.restore('https://www.shareittoo.com/mission', h.state);
    await tester.pumpAndSettle();
    expect(find.text('Root'), findsOneWidget);
  });

  testWidgets(
      'rapid back forward and repeated history bypass notification dedupe',
      (tester) async {
    final h = _Harness(cold: 'https://shareittoo.com/mission');
    addTearDown(h.dispose);
    await tester.pumpWidget(h.widget());
    await tester.pumpAndSettle();
    final mission = h.state;
    final root = {...mission, 'entry': 0};
    for (var n = 0; n < 3; n++) {
      await h.restore('https://shareittoo.com/', root);
      await tester.pumpAndSettle();
      expect(find.text('Root'), findsOneWidget);
      await h.restore('https://shareittoo.com/mission', mission);
      await tester.pumpAndSettle();
      expect(h.key.currentState!.informationForTesting.uri.path, '/mission');
      expect(find.text(h.localization.t('missionWeb.unavailable')),
          findsOneWidget);
    }
  });

  testWidgets(
      'invalid serialized forms and unknown or previous-document state fail closed',
      (tester) async {
    final h = _Harness();
    addTearDown(h.dispose);
    await tester.pumpWidget(h.widget());
    await tester.pumpAndSettle();
    for (final href in [
      'https://shareittoo.com/mission?',
      'https://shareittoo.com/mission#',
      'https://shareittoo.com/%6dission',
      'https://shareittoo.com/Mission',
      'https://shareittoo.com:443/mission',
      'https://user@shareittoo.com/mission',
      'https://foreign.invalid/mission',
      'https://shareittoo.com/a/../mission',
      'https://shareittoo.com//mission'
    ]) {
      await h.restore(href);
      await tester.pumpAndSettle();
      expect(h.key.currentState!.informationForTesting.uri.path, '/');
      expect(find.text('Root'), findsOneWidget);
    }
    for (final state in [
      {...h.state, 'entry': 42},
      {...h.state, 'instance': '0' * 32},
      {...h.state, 'private': 'forbidden'},
      {'version': 1}
    ]) {
      await h.restore('https://shareittoo.com/mission', state);
      await tester.pumpAndSettle();
      expect(find.text('Root'), findsOneWidget);
    }
  });

  testWidgets(
      'restoration never rebinds A to a successor and preserves B overlay',
      (tester) async {
    final h = _Harness(cold: 'https://shareittoo.com/mission');
    addTearDown(h.dispose);
    await tester.pumpWidget(h.widget());
    await tester.pumpAndSettle();
    final entry = h.state;
    h.navigator.currentState!.push(MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('B'))));
    await tester.pumpAndSettle();
    h.owner.current = false;
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pumpAndSettle();
    expect(find.text('B'), findsOneWidget);
    await h.restore('https://shareittoo.com/mission', entry);
    await tester.pumpAndSettle();
    expect(find.text('B'), findsOneWidget);
    h.navigator.currentState!.pop();
    await tester.pumpAndSettle();
    expect(find.text('Root'), findsOneWidget);
  });

  testWidgets('a newer root and disposal invalidate delayed owner completion',
      (tester) async {
    final captured = Completer<AppLinkPrincipalOwner>();
    final h = _Harness(capture: () => captured.future);
    addTearDown(h.dispose);
    await tester.pumpWidget(h.widget());
    await tester.pumpAndSettle();
    final pending = h.restore('https://shareittoo.com/mission');
    await h.restore('https://shareittoo.com/', {...h.state, 'entry': 0});
    captured.complete(h.owner);
    await pending;
    await tester.pumpAndSettle();
    expect(find.text('Root'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    expect(tester.takeException(), null);
  });

  testWidgets(
      'reverse owner completions cannot resurrect the older history ingress',
      (tester) async {
    final first = Completer<AppLinkPrincipalOwner>();
    final second = Completer<AppLinkPrincipalOwner>();
    var captures = 0;
    final h =
        _Harness(capture: () => captures++ == 0 ? first.future : second.future);
    addTearDown(h.dispose);
    await tester.pumpWidget(h.widget());
    await tester.pumpAndSettle();
    final a = h.restore('https://shareittoo.com/mission');
    final b = h.restore('https://www.shareittoo.com/mission');
    expect(captures, 2);
    second.complete(h.owner);
    await tester.pump();
    expect(find.text('Root'), findsOneWidget);
    first.complete(_Owner()..current = false);
    await Future.wait([a, b]);
    await tester.pumpAndSettle();
    expect(h.key.currentState!.informationForTesting.uri.path, '/mission');
    expect(h.state['entry'], 1);
  });

  testWidgets(
      'dispose while readback is outstanding never publishes or navigates',
      (tester) async {
    final owner = Completer<AppLinkPrincipalOwner>();
    final h = _Harness(capture: () => owner.future);
    addTearDown(h.dispose);
    await tester.pumpWidget(h.widget());
    await tester.pumpAndSettle();
    final pending = h.restore('https://shareittoo.com/mission');
    await tester.pumpWidget(const SizedBox());
    owner.complete(h.owner);
    await pending;
    await tester.pumpAndSettle();
    expect(h.controller.takePending(), null);
    expect(tester.takeException(), null);
  });

  testWidgets(
      'reload uses fresh cold capture and cannot reuse a prior document cursor',
      (tester) async {
    final first = _Harness(cold: 'https://shareittoo.com/mission');
    final next = _Harness(cold: 'https://shareittoo.com/mission');
    addTearDown(first.dispose);
    addTearDown(next.dispose);
    await tester.pumpWidget(first.widget());
    await tester.pumpAndSettle();
    final stale = first.state;
    await tester.pumpWidget(next.widget());
    await tester.pumpAndSettle();
    expect(next.key.currentState!.informationForTesting.uri.path, '/mission');
    expect(next.state['instance'], isNot(stale['instance']));
    await next.restore('https://shareittoo.com/mission', stale);
    await tester.pumpAndSettle();
    expect(find.text('Root'), findsOneWidget);
  });

  testWidgets('theme rebuild preserves router navigator and pageless dialog',
      (tester) async {
    final h = _Harness(cold: 'https://shareittoo.com/mission');
    addTearDown(h.dispose);
    await tester.pumpWidget(h.widget());
    await tester.pumpAndSettle();
    final navigator = h.navigator.currentState;
    final cursor = h.state;
    unawaited(showDialog<void>(
        context: navigator!.overlay!.context,
        builder: (_) =>
            const AlertDialog(content: Text('Foreground overlay'))));
    await tester.pumpAndSettle();
    await tester.pumpWidget(h.widget(dark: true));
    await h.localization.setLanguage(AppLanguage.en);
    await tester.pumpAndSettle();
    expect(h.navigator.currentState, same(navigator));
    expect(h.state, cursor);
    expect(find.text('Foreground overlay'), findsOneWidget);
    h.navigator.currentState!.pop();
    await tester.pumpAndSettle();
    expect(
        find.text(h.localization.t('missionWeb.unavailable')), findsOneWidget);
  });

  testWidgets(
      'SDK reports navigate push and history neglect replacement with clean URI',
      (tester) async {
    final reports = <Map<dynamic, dynamic>>[];
    tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.navigation, (call) async {
      if (call.method == 'routeInformationUpdated') {
        reports.add(call.arguments as Map);
      }
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.navigation, null));
    final h = _Harness();
    addTearDown(h.dispose);
    await tester.pumpWidget(h.widget());
    await tester.pumpAndSettle();
    FirebaseRuntime.openForegroundMessage(ForegroundPushMessage(
        title: 'Synthetic',
        body: 'Synthetic',
        actionUri: Uri.parse('shareittoo://notifications')));
    await tester.pumpAndSettle();
    expect(reports.last['replace'], false);
    expect(find.text('Bitte zuerst anmelden'), findsOneWidget);
    expect(h.state.toString(), isNot(contains('notifications')));
    final privateEntry = h.state;
    await h.restore('https://shareittoo.com/mission');
    await tester.pumpAndSettle();
    expect(reports.where((r) => r['uri'] == '/mission').last['replace'], true);
    expect(reports.every((r) => !(r['uri'] as String).contains('#')), true);
    await h.restore('https://shareittoo.com/', privateEntry);
    await tester.pumpAndSettle();
    expect(find.text('Root'), findsOneWidget);
    expect(find.text('Bitte zuerst anmelden'), findsNothing);
    FirebaseRuntime.takePendingActionLink();
  });

  testWidgets(
      'root anchor preserves an unrelated overlay during history removal',
      (tester) async {
    final owner = _Owner();
    final controller =
        AppLinkController(capturePrincipalOwner: () async => owner);
    final navigator = GlobalKey<NavigatorState>();
    final routerKey = GlobalKey<WebAppRouterHostState>();
    addTearDown(controller.dispose);
    await controller.didPushRouteInformation(
        RouteInformation(uri: Uri.parse('shareittoo://notifications')));
    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: controller,
      child: WebAppRouterHost(
        key: routerKey,
        controller: controller,
        navigatorKey: navigator,
        root: const AppLinkHost(child: Scaffold(body: Text('Root'))),
        buildApp: (config) => MaterialApp.router(routerConfig: config),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Bitte zuerst anmelden'), findsOneWidget);
    navigator.currentState!.push(MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('Overlay B'))));
    await tester.pumpAndSettle();
    final state = Map<String, Object>.from(
        routerKey.currentState!.informationForTesting.state! as Map);
    state['entry'] = 0;
    await routerKey.currentState!
        .restoreForTesting('https://shareittoo.com/', state);
    await tester.pumpAndSettle();
    expect(find.text('Overlay B'), findsOneWidget);
    navigator.currentState!.pop();
    await tester.pumpAndSettle();
    expect(find.text('Root'), findsOneWidget);
  });
}
