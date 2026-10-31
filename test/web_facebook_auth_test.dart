import 'dart:ui' show SemanticsAction, Tristate;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/remote_auth_attempt_transaction.dart';
import 'package:lendify/services/web_facebook_auth.dart';
import 'package:lendify/widgets/social_auth_button.dart';

// Deliberately expose only the three SDK members read by the real adapter.
// Any accidental credential/profile/providerData access throws via Fake.
class Token extends Fake implements IdTokenResult {
  @override
  final String? token;
  @override
  final String? signInProvider;
  Token(
      {this.token = 'synthetic-firebase-id',
      this.signInProvider = 'facebook.com'});
}

class Identity extends Fake implements User {
  @override
  final String uid;
  final Future<IdTokenResult> Function() read;
  Identity(this.uid, this.read);
  @override
  Future<IdTokenResult> getIdTokenResult([bool forceRefresh = false]) {
    expect(forceRefresh, isTrue);
    return read();
  }
}

class PopupResult extends Fake implements UserCredential {
  @override
  final User? user;
  PopupResult(this.user);
}

class Sdk extends Fake implements FirebaseAuth {
  @override
  User? currentUser;
  late Future<UserCredential> Function() popup;
  int popups = 0;
  int signOuts = 0;
  @override
  Future<UserCredential> signInWithPopup(AuthProvider provider) {
    popups++;
    expect(provider, isA<FacebookAuthProvider>());
    expect((provider as FacebookAuthProvider).scopes, ['email']);
    expect(provider.parameters, isEmpty);
    return popup();
  }

  @override
  Future<void> signOut() async {
    signOuts++;
    currentUser = null;
  }
}

class Attempt {
  final sdk = Sdk();
  bool current = true;
  bool configurationReady = true;
  int generation = 7;
  String? acquiredUid;
  bool remote = false;
  bool persisted = false;
  String? remoteDiscard;
  String? localDiscard;
  String at = '';
  Token token = Token();

  Attempt() {
    sdk.popup = () async {
      if (at == 'missing-user') return PopupResult(null);
      final user = Identity('synthetic-a', () async {
        if (at == 'token-config') configurationReady = false;
        if (at == 'token-principal') current = false;
        if (at == 'token-uid') {
          sdk.currentUser = Identity('synthetic-b', () async => Token());
        }
        return token;
      });
      sdk.currentUser = user;
      if (at == 'popup-config') configurationReady = false;
      if (at == 'popup-principal') current = false;
      if (at == 'popup-uid') {
        sdk.currentUser = Identity('synthetic-b', () async => Token());
      }
      return PopupResult(user);
    };
  }
  void requireCurrent() {
    if (!current) throw const RemoteAuthAttemptSuperseded();
  }

  Future<String> acquire({bool available = true}) => acquireWebFacebookToken(
      auth: sdk,
      available: () => available && configurationReady,
      requireCurrent: requireCurrent,
      acquired: (uid) => acquiredUid = uid);

  Future<String> run() async {
    final ownedGeneration = generation;
    try {
      return await const RemoteAuthAttemptTransaction<String, String, String>()
          .run(
        preflightCurrent: () => current,
        actionCurrent: () => current,
        acquire: acquire,
        invokeRemote: (value) async {
          expect(value, 'synthetic-firebase-id');
          remote = true;
          if (at == 'backend') current = false;
          if (at == 'backend-denied') throw const BackendDenied();
          return 'backend-issued-a';
        },
        persist: (value) async {
          expect(value, 'backend-issued-a');
          persisted = true;
          if (at == 'persist') current = false;
          return 'sit-session-a';
        },
        discardRemote: (value) async {
          remoteDiscard = value;
        },
        persistedCurrent: (_) async => current,
        discardPersisted: (value) async {
          localDiscard = value;
        },
      );
    } finally {
      // Same production-owned predicate used in AuthService's serial SDK queue.
      if (at == 'cleanup-uid') {
        sdk.currentUser = Identity('synthetic-b', () async => Token());
      }
      if (at == 'cleanup-generation') generation++;
      if (AuthService.shouldCleanUpPhoneIdentity(
          attemptEpoch: ownedGeneration,
          currentAttemptEpoch: generation,
          signedInUid: acquiredUid,
          currentUid: sdk.currentUser?.uid)) {
        await sdk.signOut();
      }
    }
  }
}

class BackendDenied implements Exception {
  const BackendDenied();
}

void main() {
  test('adapter is runnable with controlled SDK on platform kIsWeb=$kIsWeb',
      () async {
    final a = Attempt();
    expect(await a.run(), 'sit-session-a');
    expect(a.sdk.popups, 1);
    expect(a.sdk.signOuts, 1);
    expect(a.remote && a.persisted, isTrue);
  });
  test('actual platform/UI gate and W1 readiness stay conjunctive', () {
    for (final web in [false, true]) {
      for (final enabled in [false, true]) {
        for (final ready in [false, true]) {
          expect(
              webFacebookControlAvailable(
                  isWeb: web,
                  facebookEnabled: enabled,
                  configurationReady: ready),
              web && enabled && ready);
        }
      }
    }
    expect(
        webFacebookControlAvailable(
            isWeb: kIsWeb, facebookEnabled: true, configurationReady: true),
        kIsWeb);
    expect(AuthService.socialProviderEnabled(AuthSocialProvider.facebook),
        isFalse);
  });
  test('unavailable or superseded before popup never reaches SDK/backend',
      () async {
    final unavailable = Attempt();
    await expectLater(unavailable.acquire(available: false),
        throwsA(isA<WebFacebookAuthFailure>()));
    expect(unavailable.sdk.popups, 0);
    final obsolete = Attempt()..current = false;
    await expectLater(
        obsolete.run(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
    expect(obsolete.sdk.popups, 0);
    expect(obsolete.remote, isFalse);
  });
  for (final at in ['popup-config', 'token-config']) {
    test('$at expires W1 evidence before exchange and still owns cleanup',
        () async {
      final a = Attempt()..at = at;
      await expectLater(
          a.run(),
          throwsA(isA<WebFacebookAuthFailure>()
              .having((e) => e.code, 'code', 'web_config_unavailable')));
      expect(a.remote, isFalse);
      expect(a.sdk.signOuts, 1);
    });
  }
  for (final code in [
    'popup-closed-by-user',
    'cancelled-popup-request',
    'web-context-cancelled',
    'canceled',
    'popup-blocked',
    'unauthorized-domain',
    'network-request-failed',
    'operation-not-allowed'
  ]) {
    test('SDK $code is sanitized with no session or cleanup of unowned user',
        () async {
      final a = Attempt();
      a.sdk.currentUser = Identity('synthetic-successor', () async => Token());
      a.sdk.popup = () async => throw FirebaseAuthException(
          code: code, message: 'private synthetic data never returned');
      final cancelled = [
        'popup-closed-by-user',
        'cancelled-popup-request',
        'web-context-cancelled',
        'canceled'
      ].contains(code);
      await expectLater(
          a.run(),
          throwsA(isA<WebFacebookAuthFailure>()
              .having((e) => e.cancelled, 'cancelled', cancelled)
              .having((e) => e.code, 'sanitized',
                  cancelled ? 'popup_cancelled' : 'popup_unavailable')));
      expect(a.remote || a.persisted, isFalse);
      expect(a.sdk.signOuts, 0);
    });
  }
  test('untyped errors cannot forge cancellation or expose SDK messages',
      () async {
    final a = Attempt();
    a.sdk.popup = () async => throw StateError('popup-closed-by-user private');
    await expectLater(
        a.run(),
        throwsA(isA<WebFacebookAuthFailure>()
            .having((e) => e.code, 'code', 'popup_unavailable')
            .having((e) => e.cancelled, 'cancelled', isFalse)));
  });
  test(
      'superseded failed popup reports ownership loss, not successor cancellation',
      () async {
    final a = Attempt();
    a.sdk.popup = () async {
      a.current = false;
      throw FirebaseAuthException(code: 'popup-closed-by-user');
    };
    await expectLater(a.run(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
    expect(a.sdk.signOuts, 0);
  });
  for (final at in [
    'popup-principal',
    'popup-uid',
    'token-principal',
    'token-uid'
  ]) {
    test(
        '$at records acquired UID but never exchanges; successor not signed out',
        () async {
      final a = Attempt()..at = at;
      await expectLater(a.run(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
      expect(a.acquiredUid, 'synthetic-a');
      expect(a.remote || a.persisted, isFalse);
      expect(a.sdk.signOuts, at.endsWith('uid') ? 0 : 1);
    });
  }
  test('missing popup user never claims current SDK user for cleanup',
      () async {
    final a = Attempt()..at = 'missing-user';
    a.sdk.currentUser = Identity('synthetic-successor', () async => Token());
    await expectLater(
        a.run(),
        throwsA(isA<WebFacebookAuthFailure>()
            .having((e) => e.code, 'code', 'missing_firebase_user')));
    expect(a.acquiredUid, isNull);
    expect(a.sdk.signOuts, 0);
  });
  test('empty acquired UID is never exchanged or signed out', () async {
    final a = Attempt();
    final empty = Identity('', () async => Token());
    a.sdk.popup = () async {
      a.sdk.currentUser = empty;
      return PopupResult(empty);
    };
    await expectLater(a.run(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
    expect(a.remote, isFalse);
    expect(a.sdk.signOuts, 0);
  });
  test(
      'fresh-token SDK failure stays sanitized and cleans only acquired identity',
      () async {
    final a = Attempt();
    final user = Identity(
        'synthetic-a',
        () async => throw FirebaseAuthException(
            code: 'network-request-failed',
            message: 'private synthetic token details'));
    a.sdk.popup = () async {
      a.sdk.currentUser = user;
      return PopupResult(user);
    };
    await expectLater(
        a.run(),
        throwsA(isA<WebFacebookAuthFailure>()
            .having((e) => e.code, 'code', 'popup_unavailable')));
    expect(a.remote, isFalse);
    expect(a.sdk.signOuts, 1);
  });
  for (final token in [
    Token(token: null),
    Token(token: ''),
    Token(token: '   '),
    Token(signInProvider: null),
    Token(signInProvider: 'google.com'),
    Token(signInProvider: 'apple.com')
  ]) {
    test(
        'missing token or mismatched fresh provider is rejected (${token.signInProvider}/${token.token?.length})',
        () async {
      final a = Attempt()..token = token;
      await expectLater(a.run(), throwsA(isA<WebFacebookAuthFailure>()));
      expect(a.remote || a.persisted, isFalse);
      expect(a.sdk.signOuts, 1);
    });
  }
  test(
      'backend ownership loss discards only issued response before persistence',
      () async {
    final a = Attempt()..at = 'backend';
    await expectLater(a.run(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
    expect(a.remoteDiscard, 'backend-issued-a');
    expect(a.persisted, isFalse);
    expect(a.sdk.signOuts, 1);
  });
  test('late UI loss discards only just-persisted SIT session', () async {
    final a = Attempt()..at = 'persist';
    await expectLater(a.run(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
    expect(a.localDiscard, 'sit-session-a');
    expect(a.sdk.signOuts, 1);
  });
  test(
      'successful popup plus denied backend is not enrollment or a SIT session',
      () async {
    final a = Attempt()..at = 'backend-denied';
    await expectLater(a.run(), throwsA(isA<BackendDenied>()));
    expect(a.persisted, isFalse);
    expect(a.sdk.signOuts, 1);
  });
  for (final at in ['cleanup-uid', 'cleanup-generation']) {
    test('$at never signs out successor identity/generation', () async {
      final a = Attempt()..at = at;
      expect(await a.run(), 'sit-session-a');
      expect(a.sdk.signOuts, 0);
    });
  }
  for (final ready in [false, true]) {
    testWidgets('Facebook control truth with W1 configurationReady=$ready',
        (tester) async {
      final semantics = tester.ensureSemantics();
      var calls = 0;
      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: SocialAuthButton(
        brand: SocialAuthBrand.facebook,
        label: 'Mit Facebook anmelden',
        available: webFacebookControlAvailable(
            isWeb: true, facebookEnabled: true, configurationReady: ready),
        onTap: () => calls++,
      ))));
      final label = find.text('Mit Facebook anmelden');
      expect(label.hitTestable(), findsOneWidget);
      final node = tester.getSemantics(label);
      expect(node.flagsCollection.isEnabled,
          ready ? Tristate.isTrue : Tristate.isFalse);
      expect(node.getSemanticsData().hasAction(SemanticsAction.tap), ready);
      await tester.tap(label, warnIfMissed: true);
      expect(calls, ready ? 1 : 0);
      expect(find.text('Im Privatpiloten nicht verfügbar'),
          ready ? findsNothing : findsOneWidget);
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });
  }
}
