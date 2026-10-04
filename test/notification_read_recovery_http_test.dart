// Synthetic loopback HTTP only. Run with --dart-define=SIT_BACKEND_ENABLED=true.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:lendify/screens/notification_detail_screen.dart';
import 'package:lendify/screens/notifications_screen.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

Map<String, dynamic> notice(String user) => {
      'id': 'synthetic-notice',
      'userId': user,
      'category': 'system',
      'title': '$user private notice',
      'body': 'Synthetic HTTP notification.',
      'ts': '2026-10-04T09:00:00Z',
      'read': false,
    };

Future<void> session(String user, {String generation = 'first'}) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool('qa_messages_notifs_seeded_v3_for_$user', true);
  await prefs.setString(
      'currentUser',
      jsonEncode(buildTestUser(user, name: user, email: '$user@example.invalid')
          .toJson()));
  await prefs.setString(
      'auth_session_v1',
      jsonEncode({
        'userId': user,
        'email': '$user@example.invalid',
        'sessionId': '$user-$generation',
        'createdAt': '2026-10-04T08:00:00Z',
        'accessToken': 'synthetic-access-$user-$generation',
        'refreshToken': 'synthetic-refresh-$user-$generation',
        'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
      }));
}

/// Only redirects transport to a fresh loopback socket; production HTTP JSON,
/// timeout, authentication, repository and cache behavior remain in use.
class SocketOverrides extends HttpOverrides {}

class LoopbackClient extends http.BaseClient {
  LoopbackClient(this.port)
      : inner = HttpOverrides.runWithHttpOverrides(
            () => IOClient(), SocketOverrides());
  final int port;
  final http.Client inner;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    expect(request.url.origin, Uri.parse(BackendConfig.apiBaseUrl).origin);
    final local = http.Request(request.method,
        request.url.replace(scheme: 'http', host: '127.0.0.1', port: port));
    local.headers.addAll(request.headers);
    local.bodyBytes = await request.finalize().toBytes();
    return inner.send(local);
  }

  @override
  void close() => inner.close();
}

class Fixture {
  late HttpServer server;
  int writes = 0;
  int replies = 0;
  bool read = false;
  String user = 'owner';
  final writeArrived = Completer<void>();
  Future<int> Function(int)? reply;
  final List<String?> writeCredentials = [];

  Future<void> start() async {
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      final path = request.uri.path;
      Object body = {};
      if (path == '/api/v1/auth/me') {
        body = {
          'user':
              buildTestUser(user, name: user, email: '$user@example.invalid')
                  .toJson()
        };
      } else if (path == '/api/v1/listings' ||
          path == '/api/v1/listings/mine') {
        body = {'listings': []};
      } else if (path == '/api/v1/notifications' && request.method == 'GET') {
        body = {
          'notifications': [
            {...notice(user), 'read': read}
          ]
        };
      } else if ((path == '/api/v1/notifications/synthetic-notice' &&
              request.method == 'PATCH') ||
          (path == '/api/v1/notifications/read-all' &&
              request.method == 'POST')) {
        final payload = await utf8.decoder.bind(request).join();
        if (request.method == 'PATCH') {
          expect(jsonDecode(payload), {'read': true});
        }
        writeCredentials.add(request.headers.value('authorization'));
        writes++;
        if (!writeArrived.isCompleted) writeArrived.complete();
        final status = await (reply?.call(writes) ?? Future.value(200));
        request.response.statusCode = status;
        if (status == 200) read = true;
        body =
            status == 200 ? {'ok': true} : {'error': 'synthetic_unavailable'};
      } else {
        fail('Unexpected HTTP request: ${request.method} $path');
      }
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode(body));
      await request.response.close();
      if (request.method != 'GET') replies++;
    });
  }

  Future<void> close() async {
    await server.close(force: true);
  }
}

Future<void> settleUntil(WidgetTester tester, bool Function() done) async {
  for (var i = 0; i < 200; i++) {
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
    await tester.pump(const Duration(milliseconds: 30));
    if (done()) {
      await tester.pumpAndSettle();
      return;
    }
  }
  fail('Expected HTTP/UI condition did not settle');
}

class DetailObserver extends NavigatorObserver {
  int detailPushes = 0;
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route.settings.name == 'notification-detail') detailPushes++;
  }
}

Future<void> inbox(WidgetTester tester, {NavigatorObserver? observer}) async {
  await tester.pumpWidget(ChangeNotifierProvider(
    create: (_) => LocalizationController(),
    child: MaterialApp(
        home: const NotificationsScreen(),
        navigatorObservers: [if (observer != null) observer]),
  ));
  await settleUntil(
      tester, () => find.text('owner private notice').evaluate().isNotEmpty);
}

Future<void> open(WidgetTester tester, bool all) async {
  if (all) {
    await tester.tap(find.byTooltip('Mehr Optionen').hitTestable());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alle als gelesen markieren').hitTestable());
  } else {
    await tester.tap(find.text('owner private notice').hitTestable());
  }
  await tester.pump();
}

Future<bool> cachedRead() async {
  final prefs = await SharedPreferences.getInstance();
  return (jsonDecode(prefs.getString('notifications')!) as List)
          .single['read'] ==
      true;
}

void expectUnreadCard(WidgetTester tester) {
  final values = tester
      .widgetList<Semantics>(find.byType(Semantics, skipOffstage: false))
      .map((widget) => widget.properties.value);
  expect(values, contains('Ungelesen'));
  expect(values, isNot(contains('Gelesen')));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  WidgetController.hitTestWarningShouldBeFatal = true;

  for (final all in [false, true]) {
    testWidgets('HTTP success stays single-flight, all=$all', (tester) async {
      final delayed = Completer<int>();
      final fixture = Fixture()..reply = ((_) => delayed.future);
      await tester.runAsync(fixture.start);
      addTearDown(fixture.close);
      SharedPreferences.setMockInitialValues({});
      await session('owner');
      final observer = DetailObserver();
      await http.runWithClient(() async {
        await inbox(tester, observer: observer);
        await open(tester, all);
        await open(tester, all);
        await settleUntil(tester, () => fixture.writes == 1);
        delayed.complete(200);
        await settleUntil(tester, () => fixture.replies == 1);
        await settleUntil(
            tester,
            () => all
                ? tester
                    .widgetList<Semantics>(find.byType(Semantics))
                    .any((widget) => widget.properties.value == 'Gelesen')
                : find.byType(NotificationDetailScreen).evaluate().isNotEmpty);
        expect(await cachedRead(), isTrue);
        expect(fixture.writes, 1);
        expect(observer.detailPushes, all ? 0 : 1);
        expect(find.byType(AlertDialog), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      }, () => LoopbackClient(fixture.server.port));
    }, skip: !BackendConfig.enabled);

    testWidgets(
        'old retry callback cannot adopt a replacement session, all=$all',
        (tester) async {
      final fixture = Fixture()..reply = ((_) async => 503);
      await tester.runAsync(fixture.start);
      addTearDown(fixture.close);
      SharedPreferences.setMockInitialValues({});
      await session('owner');
      await http.runWithClient(() async {
        await inbox(tester);
        await open(tester, all);
        await settleUntil(
            tester, () => find.text('Erneut versuchen').evaluate().isNotEmpty);
        final retry = tester
            .widget<TextButton>(find.ancestor(
                of: find.text('Erneut versuchen'),
                matching: find.byType(TextButton)))
            .onPressed!;
        await session('owner', generation: 'successor');
        // No event: the async check must still read the exact stored owner.
        retry();
        await tester.pumpAndSettle();
        expect(fixture.writes, 1);
        expect(await cachedRead(), isFalse);
        expect(find.byType(NotificationDetailScreen), findsNothing);
        expect(find.byType(AlertDialog), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      }, () => LoopbackClient(fixture.server.port));
    }, skip: !BackendConfig.enabled);

    testWidgets('HTTP failure has explicit retry, all=$all', (tester) async {
      final fixture = Fixture()
        ..reply = ((attempt) async => attempt == 1 ? 503 : 200);
      await tester.runAsync(fixture.start);
      addTearDown(fixture.close);
      SharedPreferences.setMockInitialValues({});
      await session('owner');
      await http.runWithClient(() async {
        await inbox(tester);
        await open(tester, all);
        await settleUntil(
            tester, () => find.text('Erneut versuchen').evaluate().isNotEmpty);
        expect(tester.takeException(), isNull);
        expect(await cachedRead(), isFalse);
        expectUnreadCard(tester);
        expect(find.byType(NotificationDetailScreen), findsNothing);
        await tester.tap(find.text('Erneut versuchen').hitTestable());
        await settleUntil(
            tester,
            () => all
                ? fixture.writes == 2 &&
                    find.byType(AlertDialog).evaluate().isEmpty
                : find.byType(NotificationDetailScreen).evaluate().isNotEmpty);
        expect(await cachedRead(), isTrue);
        expect(fixture.writes, 2);
        expect(find.byType(NotificationDetailScreen),
            all ? findsNothing : findsOneWidget);
        await tester.pumpWidget(const SizedBox());
      }, () => LoopbackClient(fixture.server.port));
    }, skip: !BackendConfig.enabled);

    testWidgets('HTTP timeout retries without claiming read, all=$all',
        (tester) async {
      final delayed = Completer<int>();
      final fixture = Fixture()
        ..reply =
            ((attempt) => attempt == 1 ? delayed.future : Future.value(200));
      await tester.runAsync(fixture.start);
      addTearDown(fixture.close);
      SharedPreferences.setMockInitialValues({});
      await session('owner');
      await http.runWithClient(() async {
        await inbox(tester);
        await open(tester, all);
        await settleUntil(tester, () => fixture.writes == 1);
        await tester.pump(const Duration(seconds: 21));
        await tester.pumpAndSettle();
        expect(find.text('Lesestatus nicht bestätigt'), findsOneWidget);
        expect(await cachedRead(), isFalse);
        expectUnreadCard(tester);
        expect(tester.takeException(), isNull);
        await tester.tap(find.text('Erneut versuchen').hitTestable());
        await settleUntil(tester, () => fixture.replies == 1);
        await settleUntil(
            tester,
            () => all
                ? find.byType(AlertDialog).evaluate().isEmpty
                : find.byType(NotificationDetailScreen).evaluate().isNotEmpty);
        expect(await cachedRead(), isTrue);
        delayed.complete(200);
        await settleUntil(tester, () => fixture.replies == 2);
        expect(fixture.writes, 2);
        expect(find.byType(NotificationDetailScreen, skipOffstage: false),
            all ? findsNothing : findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      }, () => LoopbackClient(fixture.server.port));
    }, skip: !BackendConfig.enabled);

    for (final successor in ['logout', 'foreign', 'replacement']) {
      for (final status in [200, 401, 503]) {
        testWidgets('late HTTP $status cannot adopt $successor, all=$all',
            (tester) async {
          final delayed = Completer<int>();
          final fixture = Fixture()..reply = ((_) => delayed.future);
          await tester.runAsync(fixture.start);
          addTearDown(fixture.close);
          SharedPreferences.setMockInitialValues({});
          await session('owner');
          await http.runWithClient(() async {
            await inbox(tester);
            await open(tester, all);
            await settleUntil(tester, () => fixture.writes == 1);
            final prefs = await SharedPreferences.getInstance();
            if (successor == 'logout') {
              final owner = AuthService.captureSessionOwner(
                  (await AuthService.readSession())!);
              await AuthService.clearSessionOwnerIfMatches(owner,
                  runLogoutCleanup: false);
            } else {
              fixture.user = successor == 'foreign' ? 'other' : 'owner';
              await session(fixture.user, generation: 'successor');
              SharedPersistenceSync.notify(
                  SharedPersistenceSync.accountSecurityStateKey);
            }
            // Same notification ID deliberately stresses successor cache ownership.
            final retained = jsonEncode([notice(fixture.user)]);
            await prefs.setString('notifications', retained);
            await tester.pump();
            // Finish successor refresh before releasing the stale write.
            if (successor != 'logout') {
              await settleUntil(
                  tester,
                  () => find
                      .text('${fixture.user} private notice')
                      .evaluate()
                      .isNotEmpty);
            }
            final before = prefs.getString('notifications');
            delayed.complete(status);
            await settleUntil(tester, () => fixture.replies == 1);
            expect(prefs.getString('notifications'), before);
            expect(find.byType(NotificationDetailScreen, skipOffstage: false),
                findsNothing);
            expect(find.byType(AlertDialog), findsNothing);
            expect(fixture.writeCredentials,
                ['Bearer synthetic-access-owner-first']);
            expect(tester.takeException(), isNull);
            await tester.pumpWidget(const SizedBox());
          }, () => LoopbackClient(fixture.server.port));
        }, skip: !BackendConfig.enabled);
      }
    }
  }

  testWidgets('rapid repeated item taps and retries open exactly one detail',
      (tester) async {
    final first = Completer<int>();
    final second = Completer<int>();
    final fixture = Fixture()
      ..reply = ((attempt) => attempt == 1 ? first.future : second.future);
    await tester.runAsync(fixture.start);
    addTearDown(fixture.close);
    SharedPreferences.setMockInitialValues({});
    await session('owner');
    final observer = DetailObserver();
    await http.runWithClient(() async {
      await inbox(tester, observer: observer);
      await open(tester, false);
      await open(tester, false);
      await settleUntil(tester, () => fixture.writes == 1);
      first.complete(503);
      await settleUntil(
          tester, () => find.text('Erneut versuchen').evaluate().isNotEmpty);
      final retry = tester
          .widget<TextButton>(find.ancestor(
              of: find.text('Erneut versuchen'),
              matching: find.byType(TextButton)))
          .onPressed!;
      retry();
      retry();
      await settleUntil(tester, () => fixture.writes == 2);
      second.complete(200);
      await settleUntil(tester,
          () => find.byType(NotificationDetailScreen).evaluate().isNotEmpty);
      expect(observer.detailPushes, 1);
      expect(fixture.writes, 2);
      await tester.pumpWidget(const SizedBox());
    }, () => LoopbackClient(fixture.server.port));
  }, skip: !BackendConfig.enabled);

  for (final proceed in [false, true]) {
    testWidgets('failed receipt can ${proceed ? 'open unread' : 'cancel'}',
        (tester) async {
      final fixture = Fixture()..reply = ((_) async => 503);
      await tester.runAsync(fixture.start);
      addTearDown(fixture.close);
      SharedPreferences.setMockInitialValues({});
      await session('owner');
      await http.runWithClient(() async {
        await inbox(tester);
        await open(tester, false);
        await settleUntil(
            tester, () => find.text('Erneut versuchen').evaluate().isNotEmpty);
        await tester.tap(
            find.text(proceed ? 'Trotzdem öffnen' : 'Abbrechen').hitTestable());
        await tester.pumpAndSettle();
        expect(await cachedRead(), isFalse);
        expect(find.byType(NotificationDetailScreen),
            proceed ? findsOneWidget : findsNothing);
        expect(fixture.writes, 1);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      }, () => LoopbackClient(fixture.server.port));
    }, skip: !BackendConfig.enabled);
  }
}
