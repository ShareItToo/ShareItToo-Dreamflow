import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/remote_auth_attempt_transaction.dart';
import 'package:lendify/services/web_apple_auth.dart';

const syntheticId =
    'synthetic-firebase-id-token-with-no-signature-or-live-value-'
    'synthetic-firebase-id-token-with-no-signature-or-live-value';

class Token extends Fake implements IdTokenResult {
  @override
  final String? token;
  @override
  final String? signInProvider;
  Token({this.token = syntheticId, this.signInProvider = 'apple.com'});
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

// Any credential/profile/providerData/isNewUser access throws through Fake.
class AppleInfo extends Fake implements AdditionalUserInfo {
  final String? Function() code;
  AppleInfo(this.code);
  @override
  String? get authorizationCode => code();
}

class PopupResult extends Fake implements UserCredential {
  @override
  final User? user;
  @override
  final AdditionalUserInfo? additionalUserInfo;
  PopupResult(this.user, this.additionalUserInfo);
}

class Sdk extends Fake implements FirebaseAuth {
  @override
  User? currentUser;
  late Future<UserCredential> Function() popup;
  int calls = 0;
  @override
  Future<UserCredential> signInWithPopup(AuthProvider provider) {
    calls++;
    expect(provider, isA<AppleAuthProvider>());
    expect(provider.providerId, 'apple.com');
    expect((provider as AppleAuthProvider).scopes, ['email', 'name']);
    expect(provider.parameters, isEmpty);
    return popup();
  }
}

class Attempt {
  final sdk = Sdk();
  bool current = true;
  bool ready = true;
  int generation = 1;
  String at = '';
  String? uid;
  String? code = 'synthetic-code';
  Token token = Token();
  int tokens = 0;
  int codes = 0;
  bool remote = false;
  bool persisted = false;
  String? discarded;

  Attempt() {
    sdk.popup = () async {
      if (at == 'missing-user') return PopupResult(null, null);
      final user = Identity('synthetic-a', () async {
        tokens++;
        change('token');
        return token;
      });
      sdk.currentUser = user;
      change('popup');
      return PopupResult(
          user,
          at == 'missing-info'
              ? null
              : AppleInfo(() {
                  codes++;
                  change('code');
                  return code;
                }));
    };
  }
  void change(String phase) {
    if (at == '$phase-principal') current = false;
    if (at == '$phase-generation') generation++;
    if (at == '$phase-ready') ready = false;
    if (at == '$phase-uid') {
      sdk.currentUser = Identity('synthetic-b', () async => Token());
    }
  }

  Future<WebAppleExchangeMaterial> acquire() => acquireWebAppleMaterial(
        auth: sdk,
        available: () => ready,
        requireCurrent: () {
          if (!current || generation != 1) {
            throw const RemoteAuthAttemptSuperseded();
          }
        },
        acquired: (value) => uid = value,
      );

  Future<String> run() => const RemoteAuthAttemptTransaction<
              WebAppleExchangeMaterial, String, String>()
          .run(
        preflightCurrent: () => current && generation == 1,
        actionCurrent: () => current && generation == 1,
        acquire: acquire,
        invokeRemote: (material) async {
          expect(material.toBackendPayload(), {
            'idToken': syntheticId,
            'appleAuthorizationCode': 'synthetic-code',
          });
          remote = true;
          if (at == 'remote-principal') current = false;
          return 'synthetic-issued';
        },
        persist: (_) async {
          persisted = true;
          if (at == 'persist-principal') current = false;
          return 'synthetic-session';
        },
        discardRemote: (value) async => discarded = value,
        persistedCurrent: (_) async => current && generation == 1,
        discardPersisted: (value) async => discarded = value,
      );
}

Matcher failure(String code) => throwsA(isA<WebAppleAuthFailure>()
    .having((error) => error.code, 'sanitized code', code));

void main() {
  test('synthetic SDK seam and exact backend payload on kIsWeb=$kIsWeb',
      () async {
    final a = Attempt();
    final material = await a.acquire();
    expect(material.toBackendPayload(), {
      'idToken': syntheticId,
      'appleAuthorizationCode': 'synthetic-code',
    });
    expect(material.toString(), 'WebAppleExchangeMaterial(redacted)');
    expect(a.uid, 'synthetic-a');
    expect(a.sdk.calls, 1);
    expect(a.tokens, 1);
    expect(a.codes, 1);
  });
  test('owned synthetic transaction can exchange and persist', () async {
    final a = Attempt();
    expect(await a.run(), 'synthetic-session');
    expect(a.remote && a.persisted, isTrue);
  });
  test('disabled and superseded actions never open popup', () async {
    final a = Attempt()..ready = false;
    await expectLater(a.acquire(), failure('web_config_unavailable'));
    expect(a.sdk.calls, 0);
    a.ready = true;
    a.generation++;
    await expectLater(a.acquire(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
    expect(a.sdk.calls, 0);
  });
  for (final phase in ['popup', 'token', 'code']) {
    for (final drift in ['principal', 'generation', 'uid', 'ready']) {
      test('$phase-$drift rejects before remote exchange', () async {
        final a = Attempt()..at = '$phase-$drift';
        await expectLater(
            a.run(),
            drift == 'ready'
                ? failure('web_config_unavailable')
                : throwsA(isA<RemoteAuthAttemptSuperseded>()));
        expect(a.uid, 'synthetic-a');
        expect(a.remote || a.persisted, isFalse);
        if (phase == 'popup') expect(a.tokens, 0);
        if (phase != 'code') expect(a.codes, 0);
      });
    }
  }
  for (final code in <String?>[null, '', '  ', 'x' * 12001]) {
    test(
        'missing/invalid authorization code is a hard failure length=${code?.length}',
        () async {
      final a = Attempt()..code = code;
      await expectLater(a.run(), failure('missing_authorization_code'));
      expect(a.uid, 'synthetic-a');
      expect(a.remote || a.persisted, isFalse);
    });
  }
  test('missing additional info models installed Web SDK missing code',
      () async {
    final a = Attempt()..at = 'missing-info';
    await expectLater(a.run(), failure('missing_authorization_code'));
    expect(a.remote, isFalse);
  });
  test('missing popup user never captures a successor UID', () async {
    final a = Attempt()..at = 'missing-user';
    a.sdk.currentUser = Identity('synthetic-b', () async => Token());
    await expectLater(a.run(), failure('missing_firebase_user'));
    expect(a.uid, isNull);
    expect(a.tokens, 0);
  });
  test('empty acquired UID cannot read token or exchange', () async {
    final a = Attempt();
    a.sdk.popup = () async {
      final user = Identity('', () async => throw StateError('must not read'));
      a.sdk.currentUser = user;
      return PopupResult(user, null);
    };
    await expectLater(a.run(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
    expect(a.remote, isFalse);
  });
  for (final provider in [null, '', 'google.com', 'facebook.com', 'apple']) {
    test('fresh sign-in-provider $provider cannot borrow Apple code', () async {
      final a = Attempt()..token = Token(signInProvider: provider);
      await expectLater(a.run(), failure('provider_mismatch'));
      expect(a.codes, 0);
      expect(a.remote, isFalse);
    });
  }
  for (final token in <String?>[null, '', '  ', 'short', 'x' * 12001]) {
    test('empty/oversized token rejected length=${token?.length}', () async {
      final a = Attempt()..token = Token(token: token);
      await expectLater(a.run(), failure('missing_firebase_id_token'));
      expect(a.codes, 0);
      expect(a.remote, isFalse);
    });
  }
  for (final code in [
    'popup-closed-by-user',
    'cancelled-popup-request',
    'web-context-cancelled',
    'canceled',
    'popup-blocked',
    'unauthorized-domain',
    'operation-not-allowed',
    'network-request-failed'
  ]) {
    test('SDK $code becomes a bounded failure with no private payload',
        () async {
      final a = Attempt();
      a.sdk.popup = () async => throw FirebaseAuthException(
          code: code, message: 'private-synthetic-detail');
      final cancelled = [
        'popup-closed-by-user',
        'cancelled-popup-request',
        'web-context-cancelled',
        'canceled'
      ].contains(code);
      await expectLater(
          a.acquire(),
          throwsA(isA<WebAppleAuthFailure>()
              .having((e) => e.code, 'code',
                  cancelled ? 'popup_cancelled' : 'popup_unavailable')
              .having((e) => e.cancelled, 'cancelled', cancelled)
              .having((e) => e.toString(), 'redacted',
                  isNot(contains('private-synthetic')))));
      expect(a.uid, isNull);
    });
  }
  test('untyped error cannot forge cancellation', () async {
    final a = Attempt();
    a.sdk.popup = () async => throw StateError('popup-closed-by-user');
    await expectLater(a.acquire(), failure('popup_unavailable'));
  });
  test('superseded popup failure belongs to obsolete action', () async {
    final a = Attempt();
    a.sdk.popup = () async {
      a.generation++;
      throw FirebaseAuthException(code: 'popup-closed-by-user');
    };
    await expectLater(a.acquire(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
  });
  for (final phase in ['token', 'code']) {
    for (final drift in ['', 'uid', 'generation', 'ready']) {
      test('$phase exception preserves ownership/readiness and sanitizes',
          () async {
        final a = Attempt();
        Never fail() {
          if (drift.isNotEmpty) {
            a.at = '$phase-$drift';
            a.change(phase);
          }
          throw StateError('private-synthetic-material');
        }

        a.sdk.popup = () async {
          final user = Identity(
              'synthetic-a', () async => phase == 'token' ? fail() : Token());
          a.sdk.currentUser = user;
          return PopupResult(user, AppleInfo(fail));
        };
        await expectLater(
            a.run(),
            drift == 'uid' || drift == 'generation'
                ? throwsA(isA<RemoteAuthAttemptSuperseded>())
                : failure(drift == 'ready'
                    ? 'web_config_unavailable'
                    : 'popup_unavailable'));
        expect(a.uid, 'synthetic-a');
        expect(a.remote || a.persisted, isFalse);
      });
    }
  }
  for (final phase in ['remote', 'persist']) {
    test('$phase drift discards exact stale transaction result', () async {
      final a = Attempt()..at = '$phase-principal';
      await expectLater(a.run(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
      expect(a.discarded,
          phase == 'remote' ? 'synthetic-issued' : 'synthetic-session');
    });
  }
}
