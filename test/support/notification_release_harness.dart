// Isolated release-test entrypoint, never AppRoot or a shipped application.
// Fixture commands mutate only this harness's synthetic local storage.
// ignore_for_file: deprecated_member_use, avoid_web_libraries_in_flutter
import 'dart:convert';
import 'dart:html' as html;
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lendify/models/message.dart';
import 'package:lendify/screens/notification_detail_screen.dart';
import 'package:lendify/screens/notifications_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'test_builders.dart';

final _tree = GlobalKey();
VoidCallback? _oldRow;
VoidCallback? _oldCta;
var _ack = 0;
final _instance =
    '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 30)}';

Map<String, Object?> _row(String user, String type) => {
      'id': '$user-$type',
      'userId': user,
      'category': type == 'thread' ? 'messages' : 'bookings',
      'title': '$user $type update',
      'body': 'Synthetic private notice for $user.',
      'ts': '2026-10-03T10:00:00Z',
      'read': false,
      'entityType': type,
      'entityId': 'synthetic-$type',
      'ctaLabel': type == 'thread' ? 'Zum Chat' : 'Anfrage prüfen',
      'actionUrl': 'https://outside.invalid/never-open',
    };

Future<void> _principal(String id) async {
  final prefs = await SharedPreferences.getInstance();
  final user = buildTestUser(id, name: id, email: '$id@example.invalid');
  await prefs.setString('currentUser', jsonEncode(user.toJson()));
  await prefs.setString(
      'auth_session_v1',
      jsonEncode({
        'userId': id,
        'email': user.email,
        'sessionId': '$id-$_instance-${++_ack}',
        'createdAt': DateTime.now().toUtc().toIso8601String(),
      }));
}

Iterable<Element> _elements(Element root) sync* {
  yield root;
  final children = <Element>[];
  root.visitChildren(children.add);
  for (final child in children) {
    yield* _elements(child);
  }
}

Future<void> _command(String command) async {
  try {
    switch (command) {
      case 'capture-row':
        final root = _tree.currentContext! as Element;
        _oldRow = _elements(root)
            .where((e) => e.widget is InkWell)
            .singleWhere(
              (e) => _elements(e).any((c) =>
                  c.widget is Text &&
                  (c.widget as Text).data == 'owner thread update'),
            )
            .widget
            .castInkWell
            .onTap;
        if (_oldRow == null) throw StateError('missing row');
      case 'capture-cta':
        _oldCta = (_elements(_tree.currentContext! as Element)
                .singleWhere(
                  (e) => e.widget is NotificationDetailScreen,
                )
                .widget as NotificationDetailScreen)
            .onCta;
      case 'replay-row':
        if (_oldRow == null) throw StateError('missing captured row');
        _oldRow!();
      case 'replay-cta':
        if (_oldCta == null) throw StateError('missing captured CTA');
        _oldCta!();
      case 'renter':
      case 'owner':
        await _principal(command);
        SharedPersistenceSync.notify(
            SharedPersistenceSync.accountSecurityStateKey);
      case 'logout':
        final session = await AuthService.readSession();
        if (session == null) throw StateError('missing session');
        await AuthService.clearSessionOwnerIfMatches(
            AuthService.captureSessionOwner(session),
            runLogoutCleanup: false);
      default:
        throw StateError('unsupported command');
    }
    html.document.documentElement!.dataset['sitAck'] = '${++_ack}:$command';
  } catch (_) {
    html.document.documentElement!.dataset['sitFailure'] = 'fixture-command';
  }
}

extension on Widget {
  InkWell get castInkWell => this as InkWell;
}

Future<void> main() async {
  if (!kReleaseMode ||
      !kIsWeb ||
      BackendConfig.enabled ||
      html.window.location.hostname != '127.0.0.1') {
    throw StateError('isolated release harness only');
  }
  WidgetsFlutterBinding.ensureInitialized();
  WidgetsBinding.instance.ensureSemantics();
  final font = FontLoader('Roboto')
    ..addFont(rootBundle.load('assets/fonts/Roboto-Regular.ttf'));
  await font.load();
  final prefs = await SharedPreferences.getInstance();
  if (prefs.getBool('sit_notification_harness_v1') != true) {
    if (prefs.getKeys().isNotEmpty) throw StateError('fresh profile required');
    await prefs.setString(
        'notifications',
        jsonEncode([
          _row('owner', 'booking'),
          _row('owner', 'thread'),
          _row('renter', 'booking'),
          _row('foreign', 'thread'),
        ]));
    await prefs.setString(
        'rental_requests',
        jsonEncode([
          buildTestRequest(
            id: 'synthetic-booking',
            itemId: 'synthetic-item',
            ownerId: 'owner',
            renterId: 'renter',
            status: 'pending',
          ).toJson()
        ]));
    await prefs.setString(
        'users',
        jsonEncode([
          for (final id in ['owner', 'renter'])
            buildTestUser(id, name: id, email: '$id@example.invalid').toJson(),
        ]));
    await prefs.setString('items', '[]');
    await prefs.setString(
        'message_threads_v1',
        jsonEncode([
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
        ]));
    await _principal('owner');
    await prefs.setBool('sit_notification_harness_v1', true);
  }
  html.document.addEventListener('sit-notification-command', (event) {
    if (event is html.CustomEvent && event.detail is String) {
      _command(event.detail as String);
    }
  });
  runApp(ChangeNotifierProvider(
    create: (_) => LocalizationController(),
    child: MaterialApp(
        key: _tree,
        theme: ThemeData(fontFamily: 'Roboto'),
        debugShowCheckedModeBanner: false,
        home: const NotificationsScreen()),
  ));
  html.document.documentElement!.dataset['sitInstance'] = _instance;
  html.document.documentElement!.dataset['sitMode'] = 'release-provider-off';
}
