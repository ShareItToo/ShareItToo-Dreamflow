@TestOn('browser')
library;

import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
// Flutter exposes no public browser NetworkImage transport override. These
// SDK testing seams intercept image XHR too, not just package:http requests.
// ignore: implementation_imports
import 'package:flutter/src/painting/_network_image_web.dart' as network;
// ignore: implementation_imports
import 'package:flutter/src/web.dart' as web_shim;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/navigation/main_navigation.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/profile_info_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/background_theme_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/services/shared_persistence_keys.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/widgets/user_avatar.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_web/shared_preferences_web.dart';
import 'package:web/web.dart' as web;
import 'support/web_avatar_xhr.dart';

// Flutter's BSD-licensed 50x50 kBlueSquarePng test fixture.
final png = base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAASElEQVR42u3PMQ0AMAgAsGFjL/4tYQU08JLWQSN/9TsgREREREREREREREREREREREREREREREREREREREREREREREREREQ2BgNuaUcSjuqqAAAAAElFTkSuQmCC');
final avatar =
    BackendConfig.uri('/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.png')
        .toString();
User user(String id) => User(
    id: id,
    displayName: 'Synthetic $id',
    email: '$id@example.invalid',
    preferredLanguage: 'de',
    isVerified: false,
    isBanned: false,
    role: 'user',
    avgRating: 0,
    reviewCount: 0,
    createdAt: DateTime(2026),
    emailVerified: true);
String session(User u) => jsonEncode({
      'userId': u.id,
      'email': u.email,
      'sessionId': 'session-${u.id}',
      'createdAt': '2026-01-01T00:00:00Z',
      'accessToken': 'token-${u.id}',
      'refreshToken': 'refresh-${u.id}',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z'
    });

class Picker extends ImagePickerPlatform {
  int calls = 0;
  @override
  Future<XFile?> getImageFromSource(
      {required ImageSource source,
      ImagePickerOptions options = const ImagePickerOptions()}) async {
    calls++;
    return XFile.fromData(png, name: 'synthetic.png', mimeType: 'image/png');
  }
}

void main() {
  test(
      'every central shared key is accepted and legacy keys canonicalized on Web',
      () async {
    final events = <String>[];
    final subscription = SharedPersistenceSync.changes.listen(events.add);
    for (final key in SharedPersistenceKeys.sharedKeys) {
      SharedPersistenceSync.notify(key);
    }
    SharedPersistenceSync.notify('unknown-no-notification');
    expect(
        events,
        SharedPersistenceKeys.sharedKeys
            .map(SharedPersistenceKeys.canonicalKey)
            .toList());
    expect(
        SharedPersistenceKeys.canonicalKey(
            SharedPersistenceKeys.legacyWishlistStateKey),
        SharedPersistenceKeys.wishlistStateKey);
    expect(
        SharedPersistenceKeys.canonicalKey(
            SharedPersistenceKeys.legacyRentalCartKey),
        SharedPersistenceKeys.rentalCartKey);
    await subscription.cancel();
  });
  testWidgets(
      'web avatar upload, localStorage rehydrate, exact local logout and account isolation',
      (tester) async {
    expect(BackendConfig.enabled, true);
    final a = user('a');
    final b = user('b');
    SharedPreferencesPlugin.registerWith(null);
    SharedPreferences.resetStatic();
    final initialPrefs = await SharedPreferences.getInstance();
    final initialValues = <String, Object>{
      'users': jsonEncode([a.toJson(), b.toJson()]),
      'currentUser': jsonEncode(a.toJson()),
      'auth_session_v1': session(a),
      'qa_messages_notifs_seeded_v3_for_a': true,
      'qa_messages_notifs_seeded_v3_for_b': true
    };
    for (final entry in initialValues.entries) {
      if (entry.value is String) {
        await initialPrefs.setString(entry.key, entry.value as String);
      } else {
        await initialPrefs.setBool(entry.key, entry.value as bool);
      }
    }
    final picker = Picker();
    final oldPicker = ImagePickerPlatform.instance;
    ImagePickerPlatform.instance = picker;
    addTearDown(() {
      ImagePickerPlatform.instance = oldPicker;
      network.debugRestoreHttpRequestFactory();
    });
    final imageReads = <String>[];
    network.httpRequestFactory = () => avatarXhr(png, (url, headers) {
          expect(url, avatar);
          expect(headers, {'Authorization': 'Bearer token-a'});
          imageReads.add(url);
        }) as web_shim.XMLHttpRequest;
    var remoteA = a.toJson();
    var active = a;
    var uploads = 0;
    var patches = 0;
    final navigation = GlobalKey<NavigatorState>();
    Widget root() => MultiProvider(
            providers: [
              ChangeNotifierProvider(create: (_) => LocalizationController()),
              ChangeNotifierProvider(
                  create: (_) => MainNavController()..setIndex(4)),
              ChangeNotifierProvider(
                  create: (_) => DeveloperPreviewController()),
              ChangeNotifierProvider(
                  create: (_) => BackgroundThemeController()),
            ],
            child: MaterialApp(
                navigatorKey: navigation,
                home: const MainNavigation(initialIndex: 4)));
    Future<void> settle() async {
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
    }

    Future<void> mount() async {
      await tester.pumpWidget(root());
      await tester.pumpAndSettle();
    }

    List<SitUserAvatar> avatars() =>
        tester.widgetList<SitUserAvatar>(find.byType(SitUserAvatar)).toList();
    await http.runWithClient(() async {
      await mount();
      navigation.currentState!.push(
          MaterialPageRoute<void>(builder: (_) => const ProfileInfoScreen()));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Foto ändern'));
      await tester.tap(find.text('Foto ändern'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Foto aus Galerie wählen'));
      await tester.pumpAndSettle();
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)));
      await settle();
      expect(picker.calls, 1);
      expect(avatars().any((w) => (w.url ?? '').startsWith('data:image/png')),
          true,
          reason: 'selected image preview');
      // Chrome image codecs must start outside WidgetTester's fake clock.
      // Predecode only the locally intercepted synthetic owner-bound image;
      // URL propagation, rendered pixels and account isolation remain asserted.
      await tester.runAsync(() async {
        final done = Completer<void>();
        final provider = NetworkImage(avatar,
            headers: const {'Authorization': 'Bearer token-a'});
        final stream = provider.resolve(ImageConfiguration.empty);
        final listener = ImageStreamListener((image, _) {
          image.dispose();
          if (!done.isCompleted) done.complete();
        }, onError: (Object e, StackTrace? s) {
          if (!done.isCompleted) done.completeError(e, s);
        });
        stream.addListener(listener);
        try {
          await done.future.timeout(const Duration(seconds: 5));
        } finally {
          stream.removeListener(listener);
        }
      });
      await tester.ensureVisible(find.text('Speichern'));
      await tester.tap(find.text('Speichern'));
      await settle();
      expect(find.text('Gespeichert'), findsOneWidget);
      expect(uploads, 1);
      expect(patches, 1);
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)));
      await tester.pumpAndSettle();
      expect(avatars().where((w) => w.url == avatar).length,
          greaterThanOrEqualTo(2),
          reason: 'main/profile after save');
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)));
      await settle();
      expect(
          tester
              .widgetList<RawImage>(find.byType(RawImage))
              .where((w) => w.image != null)
              .length,
          greaterThanOrEqualTo(2),
          reason: 'decoded visible pixels');
      expect(imageReads, isNotEmpty);
      var prefs = await SharedPreferences.getInstance();
      expect((jsonDecode(prefs.getString('currentUser')!) as Map)['photoURL'],
          avatar);
      await tester.pumpWidget(const SizedBox.shrink());
      SharedPreferences.resetStatic();
      prefs = await SharedPreferences.getInstance();
      await prefs.reload();
      expect(web.window.localStorage.getItem('flutter.currentUser'),
          contains(avatar));
      await mount();
      expect(avatars().where((w) => w.url == avatar).length,
          greaterThanOrEqualTo(2),
          reason: 'storage rehydrate');
      // Exercise exact local logout, not provider/realtime/secure-storage cleanup.
      final owner =
          AuthService.captureSessionOwner((await AuthService.readSession())!);
      expect(
          await AuthService.clearSessionOwnerIfMatches(owner,
              runLogoutCleanup: false),
          isNotNull);
      expect(
          await DataService.clearCurrentUserIfMatches(
              userId: a.id, email: a.email),
          true);
      await tester.pumpAndSettle();
      expect(prefs.getString('auth_session_v1'), isNull);
      expect(prefs.getString('currentUser'), isNull);
      expect(avatars().any((w) => w.url == avatar), false);
      // Synthetic authenticated successor sessions, no identity provider involved.
      active = b;
      await prefs.setString('auth_session_v1', session(b));
      await prefs.setString('currentUser', jsonEncode(b.toJson()));
      SharedPersistenceSync.notify(
          SharedPersistenceSync.accountSecurityStateKey);
      await tester.pumpAndSettle();
      expect(avatars().any((w) => w.url == avatar), false);
      active = a;
      await prefs.setString('auth_session_v1', session(a));
      await prefs.setString('currentUser', jsonEncode(remoteA));
      SharedPersistenceSync.notify(
          SharedPersistenceSync.accountSecurityStateKey);
      await tester.pumpAndSettle();
      expect(avatars().where((w) => w.url == avatar).length,
          greaterThanOrEqualTo(2),
          reason: 'same-account re-login');
      expect(
          (jsonDecode(prefs.getString('users')!) as List)
              .cast<Map>()
              .firstWhere((u) => u['id'] == 'b')['photoURL'],
          isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
        () => MockClient((request) async {
              final path = request.url.path;
              if (request.method == 'POST' && path.endsWith('/uploads')) {
                expect(request.headers['Authorization'], 'Bearer token-a');
                expect(latin1.decode(request.bodyBytes),
                    contains('profile_image'));
                uploads++;
                return http.Response(jsonEncode({'url': avatar}), 200);
              }
              if (request.method == 'PATCH' && path.endsWith('/profile')) {
                remoteA = Map<String, dynamic>.from(
                    (jsonDecode(request.body) as Map)['profile'] as Map);
                expect(remoteA['photoURL'], avatar);
                patches++;
                return http.Response(jsonEncode({'user': remoteA}), 200);
              }
              if (request.method == 'GET' && path.endsWith('/auth/me')) {
                return http.Response(
                    jsonEncode(
                        {'user': active.id == 'a' ? remoteA : b.toJson()}),
                    200);
              }
              if (request.method == 'GET' &&
                  path.endsWith('/rental-requests')) {
                return http.Response('{"requests":[]}', 200);
              }
              if (request.method == 'GET' && path.endsWith('/listings')) {
                return http.Response('{"items":[]}', 200);
              }
              if (request.method == 'GET' && path.endsWith('/listings/mine')) {
                return http.Response('{"items":[]}', 200);
              }
              if (request.method == 'GET' && path.endsWith('/user-blocks')) {
                return http.Response('{"blocks":[]}', 200);
              }
              if (request.method == 'GET' &&
                  path.endsWith('/message-threads')) {
                return http.Response('{"threads":[]}', 200);
              }
              throw StateError(
                  'Unexpected mock route: ${request.method} $path');
            }));
  });
}
