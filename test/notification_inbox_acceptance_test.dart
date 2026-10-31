// Synthetic provider-off acceptance of the production notification widgets.
import 'dart:convert';
import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/message.dart';
import 'package:lendify/screens/message_thread_screen.dart';
import 'package:lendify/screens/booking_detail_screen.dart';
import 'package:lendify/screens/ongoing_owner_detail_screen.dart';
import 'package:lendify/screens/notification_detail_screen.dart';
import 'package:lendify/screens/notifications_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
// Inspect/use the already registered real browser store; no provider adapter.
// ignore: depend_on_referenced_packages
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

import 'support/test_builders.dart';
import 'support/notification_browser_store_stub.dart'
    if (dart.library.js_interop) 'support/notification_browser_store.dart';

late SharedPreferencesStorePlatform browserStore;

Map<String, Object?> row(String id, String user, String type) => {
      'id': id,
      'userId': user,
      'category': type == 'thread' ? 'messages' : 'bookings',
      'title': '$user $type update',
      'body': 'Synthetic private notice for $user.',
      'ts': '2026-10-03T10:00:00Z',
      'read': false,
      'entityType': type,
      'entityId': type == 'thread' ? 'synthetic-thread' : 'synthetic-booking',
      'ctaLabel': type == 'thread'
          ? 'Zum Chat'
          : user == 'renter'
              ? 'Zur Buchung'
              : 'Anfrage prüfen',
      'actionUrl': 'https://outside.invalid/never-open',
    };

Future<void> principal(String id, {String session = 'first'}) async {
  final prefs = await SharedPreferences.getInstance();
  final user = buildTestUser(id, name: id, email: '$id@example.invalid');
  await prefs.setString('currentUser', jsonEncode(user.toJson()));
  await prefs.setString(
      'auth_session_v1',
      jsonEncode({
        'userId': id,
        'email': user.email,
        'sessionId': '$id-$session',
        'createdAt': '2026-10-03T09:00:00Z',
      }));
}

Future<void> seed() async {
  expect(BackendConfig.enabled, isFalse);
  final values = <String, Object>{
    'notifications': jsonEncode([
      row('owner-booking', 'owner', 'booking'),
      row('owner-message', 'owner', 'thread'),
      row('renter-booking', 'renter', 'booking'),
      row('foreign-message', 'foreign', 'thread'),
    ]),
    'rental_requests': jsonEncode([
      buildTestRequest(
        id: 'synthetic-booking',
        itemId: 'synthetic-item',
        ownerId: 'owner',
        renterId: 'renter',
        status: 'pending',
      ).toJson()
    ]),
    'items': jsonEncode([
      {
        ...buildTestItem(id: 'synthetic-item', ownerId: 'owner').toJson(),
        'photos': <String>[],
      }
    ]),
    'users': jsonEncode([
      for (final id in ['owner', 'renter', 'foreign'])
        buildTestUser(id, name: id, email: '$id@example.invalid').toJson(),
    ]),
    'message_threads_v1': jsonEncode([
      MessageThread(
        id: 'synthetic-thread',
        requestId: 'synthetic-booking',
        itemId: 'synthetic-item',
        itemTitle: 'Synthetic item',
        user1Id: 'renter',
        user2Id: 'owner',
        messages: [],
        createdAt: DateTime.utc(2026, 10, 3),
      ).toJson()
    ]),
  };
  if (kIsWeb) {
    expect(browserStore.runtimeType.toString(),
        contains('SharedPreferencesPlugin'));
    SharedPreferencesStorePlatform.instance = browserStore;
    SharedPreferences.resetStatic();
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear(); // Flutter's owned temporary browser profile only.
    for (final entry in values.entries) {
      await prefs.setString(entry.key, entry.value as String);
    }
  } else {
    SharedPreferences.setMockInitialValues(values);
  }
  await principal('owner');
}

Future<void> showInbox(WidgetTester tester,
    {double width = 390, double scale = 1}) async {
  tester.view.reset();
  tester.view.physicalSize = Size(width, 900);
  tester.view.devicePixelRatio = 1;
  await tester.pumpWidget(ChangeNotifierProvider(
    create: (_) => LocalizationController(),
    child: MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: TextScaler.linear(scale)),
        child: child!,
      ),
      home: const NotificationsScreen(),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  registerBrowserStore();
  browserStore = SharedPreferencesStorePlatform.instance;
  setUp(seed);

  testWidgets('recipient-only rows, read persistence and replay after remount',
      (tester) async {
    addTearDown(tester.view.reset);
    await showInbox(tester);
    expect(find.text('owner booking update'), findsOneWidget);
    expect(find.text('owner thread update'), findsOneWidget);
    expect(find.text('renter booking update'), findsNothing);
    expect(find.text('foreign thread update'), findsNothing);
    await tester.tap(find.text('owner thread update'));
    await tester.pumpAndSettle();
    expect(find.byType(NotificationDetailScreen), findsOneWidget);
    expect(
        (await DataService.getNotificationFeedForUser('owner'))
            .singleWhere((e) => e['id'] == 'owner-message')['read'],
        isTrue);
    await tester.pumpWidget(const SizedBox());
    // Drop all widget and SharedPreferences cache state. In Chrome the next
    // read is from the actual registered browser localStorage adapter.
    SharedPreferences.resetStatic();
    await showInbox(tester);
    expect(find.text('owner thread update'), findsOneWidget);
    expect((await DataService.getNotificationFeedForUser('owner')).length, 2);
    expect(
        (await DataService.getNotificationFeedForUser('owner'))
            .singleWhere((e) => e['id'] == 'owner-message')['read'],
        isTrue);
    await expectLater(
        DataService.getNotificationFeedForUser('foreign'), throwsStateError);
    await tester.pumpWidget(const SizedBox());
  });

  for (final successor in ['renter', 'owner']) {
    testWidgets(
        'open private detail is dismissed for $successor successor session',
        (tester) async {
      addTearDown(tester.view.reset);
      await showInbox(tester);
      await tester.tap(find.text('owner thread update'));
      await tester.pumpAndSettle();
      expect(find.byType(NotificationDetailScreen), findsOneWidget);
      await principal(successor, session: 'successor');
      SharedPersistenceSync.notify(
          SharedPersistenceSync.accountSecurityStateKey);
      await tester.pumpAndSettle();
      expect(find.byType(NotificationDetailScreen), findsNothing);
      if (successor == 'renter') {
        expect(find.text('owner thread update'), findsNothing);
        expect(find.text('renter booking update'), findsOneWidget);
      } else {
        expect(find.text('owner thread update'), findsOneWidget);
        expect(find.text('owner booking update'), findsOneWidget);
        expect(find.text('renter booking update'), findsNothing);
      }
      await tester.pumpWidget(const SizedBox());
    });
  }

  for (final successor in ['renter', 'owner']) {
    testWidgets('captured old row callback cannot adopt $successor successor',
        (tester) async {
      addTearDown(tester.view.reset);
      await showInbox(tester);
      final card = find
          .ancestor(
              of: find.text('owner thread update'),
              matching: find.byType(InkWell))
          .first;
      final oldTap = tester.widget<InkWell>(card).onTap!;
      await principal(successor, session: 'successor');
      SharedPersistenceSync.notify(
          SharedPersistenceSync.accountSecurityStateKey);
      await tester.pumpAndSettle();
      oldTap();
      await tester.pumpAndSettle();
      expect(find.byType(NotificationDetailScreen), findsNothing);
      final prefs = await SharedPreferences.getInstance();
      expect(
          (jsonDecode(prefs.getString('notifications')!) as List)
              .singleWhere((e) => e['id'] == 'owner-message')['read'],
          isFalse);
      await tester.pumpWidget(const SizedBox());
    });
  }

  testWidgets('exact logout clears visible private detail and inbox',
      (tester) async {
    addTearDown(tester.view.reset);
    await showInbox(tester);
    await tester.tap(find.text('owner thread update'));
    await tester.pumpAndSettle();
    final owner =
        AuthService.captureSessionOwner((await AuthService.readSession())!);
    await AuthService.clearSessionOwnerIfMatches(owner,
        runLogoutCleanup: false);
    await tester.pumpAndSettle();
    expect(find.byType(NotificationDetailScreen), findsNothing);
    expect(find.text('owner thread update'), findsNothing);
    expect(await AuthService.isSessionOwnerDefinitelyCurrent(owner), isFalse);
    await tester.pumpWidget(const SizedBox());
  });

  for (final width in [390.0, 1024.0]) {
    testWidgets('keyboard and read semantics at width $width and text scale 2',
        (tester) async {
      addTearDown(tester.view.reset);
      final semantics = tester.ensureSemantics();
      await showInbox(tester, width: width, scale: 2);
      final card = find
          .ancestor(
              of: find.text('owner booking update'),
              matching: find.byType(InkWell))
          .first;
      final node = tester.getSemantics(card);
      expect(node.flagsCollection.isButton, isTrue);
      expect(node.getSemanticsData().value, 'Ungelesen');
      expect(node.getSemanticsData().label, contains('owner booking update'));
      for (var step = 0;
          step < 24 &&
              tester.getSemantics(card).flagsCollection.isFocused !=
                  Tristate.isTrue;
          step++) {
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pump();
      }
      expect(
          tester.getSemantics(card).flagsCollection.isFocused, Tristate.isTrue);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(find.byType(NotificationDetailScreen), findsOneWidget);
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(tester.getSemantics(card).getSemanticsData().value, 'Gelesen');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      semantics.dispose();
    });
  }

  for (final type in ['booking', 'thread']) {
    testWidgets('$type CTA opens only the internal role-owned destination',
        (tester) async {
      addTearDown(tester.view.reset);
      await showInbox(tester, width: 1024);
      await tester.tap(find.text('owner $type update'));
      await tester.pumpAndSettle();
      final staleCta = tester
          .widget<NotificationDetailScreen>(
              find.byType(NotificationDetailScreen))
          .onCta;
      final cta = find.text(type == 'booking' ? 'Anfrage prüfen' : 'Zum Chat');
      await tester.ensureVisible(cta);
      await tester.tap(cta);
      await tester.pumpAndSettle();
      expect(
          find.byType(type == 'booking'
              ? OngoingOwnerDetailScreen
              : MessageThreadScreen),
          findsOneWidget);
      await principal('renter', session: 'successor');
      SharedPersistenceSync.notify(
          SharedPersistenceSync.accountSecurityStateKey);
      await tester.pumpAndSettle();
      expect(find.byType(NotificationDetailScreen), findsNothing);
      expect(find.byType(OngoingOwnerDetailScreen), findsNothing);
      expect(find.byType(MessageThreadScreen), findsNothing);
      staleCta();
      await tester.pumpAndSettle();
      expect(find.byType(OngoingOwnerDetailScreen), findsNothing);
      expect(find.byType(MessageThreadScreen), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }

  testWidgets('renter accepted-booking CTA uses its own internal booking',
      (tester) async {
    addTearDown(tester.view.reset);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        'rental_requests',
        jsonEncode([
          buildTestRequest(
            id: 'synthetic-booking',
            itemId: 'synthetic-item',
            ownerId: 'owner',
            renterId: 'renter',
            status: 'accepted',
          ).toJson()
        ]));
    await principal('renter');
    await showInbox(tester, width: 1024);
    expect(find.text('owner booking update'), findsNothing);
    await tester.tap(find.text('renter booking update'));
    await tester.pumpAndSettle();
    final cta = find.text('Zur Buchung');
    await tester.ensureVisible(cta);
    await tester.tap(cta);
    await tester.pumpAndSettle();
    expect(find.byType(BookingDetailScreen), findsOneWidget);
    expect(find.byType(OngoingOwnerDetailScreen), findsNothing);
    final screen =
        tester.widget<BookingDetailScreen>(find.byType(BookingDetailScreen));
    expect(screen.viewerIsOwner, isFalse);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
