import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/remote_auth_attempt_transaction.dart';
import 'package:lendify/services/web_google_auth.dart';

class SyntheticProviderError implements Exception {
  final String code;
  const SyntheticProviderError(this.code);
}

WebGooglePublicConfig config(
    {Map<String, String> changes = const {}, bool approve = true}) {
  final values = <String, String>{
    'project': 'synthetic-project',
    'sender': '123456789012',
    'app': '1:123456789012:web:0123456789abcdef',
    'key': ['AIza', List.filled(35, 'x').join()].join(),
    'domain': 'synthetic-project.firebaseapp.com',
    'backend': 'synthetic-project',
    'origin': WebGooglePublicConfig.stagingOrigin,
    ...changes,
  };
  WebGooglePublicConfig make(String digest) => WebGooglePublicConfig(
        projectId: values['project']!,
        messagingSenderId: values['sender']!,
        appId: values['app']!,
        apiKey: values['key']!,
        authDomain: values['domain']!,
        backendProjectId: values['backend']!,
        authorizedOrigin: values['origin']!,
        approvedDigest: digest,
      );
  return make(approve ? make('').publicConfigDigest : '');
}

void main() {
  test('verified public options bind Web app, sender, project and staging only',
      () {
    final candidate = config();
    expect(candidate.isBound, isTrue);
    final options = candidate.optionsFor(
        googleEnabled: true,
        backendEnabled: true,
        apiBaseUrl: '${WebGooglePublicConfig.stagingOrigin}/api/v1',
        origin: WebGooglePublicConfig.stagingOrigin);
    expect(options?.appId, candidate.appId);
    expect(options?.authDomain, candidate.authDomain);
    expect(options?.projectId, candidate.backendProjectId);
  });
  for (final mutation in <Map<String, String>>[
    {'project': ''},
    {'sender': ''},
    {'app': ''},
    {'key': ''},
    {'domain': ''},
    {'backend': ''},
    {'origin': ''},
    {'app': '1:123456789012:android:0123456789abcdef'},
    {'app': '1:987654321012:web:0123456789abcdef'},
    {'backend': 'other-project'},
    {'domain': 'other-project.firebaseapp.com'},
    {'domain': 'evil.invalid'},
    {'key': 'not-an-api-key'},
    {'sender': '.*'},
    {'origin': 'https://shareittoo.com'},
  ]) {
    test('even rehashed invalid public options are rejected: ${mutation.keys}',
        () {
      expect(config(changes: mutation).isBound, isFalse);
    });
  }
  test('missing or stale approval digest cannot enable Web auth', () {
    expect(config(approve: false).isBound, isFalse);
    final old = config();
    final drift = WebGooglePublicConfig(
        projectId: old.projectId,
        messagingSenderId: old.messagingSenderId,
        appId: '${old.appId}a',
        apiKey: old.apiKey,
        authDomain: old.authDomain,
        backendProjectId: old.backendProjectId,
        authorizedOrigin: old.authorizedOrigin,
        approvedDigest: old.publicConfigDigest);
    expect(drift.isBound, isFalse);
  });
  test(
      'flags, backend binding, exact origin and initialization all fail closed',
      () {
    final candidate = config();
    for (final origin in [
      'https://shareittoo.com',
      'http://staging.shareittoo.com',
      'https://staging.shareittoo.com.evil.invalid',
      'http://localhost:1234'
    ]) {
      expect(
          candidate.optionsFor(
              googleEnabled: true,
              backendEnabled: true,
              apiBaseUrl: '${WebGooglePublicConfig.stagingOrigin}/api/v1',
              origin: origin),
          isNull);
    }
    for (final flags in [(false, true), (true, false)]) {
      expect(
          candidate.optionsFor(
              googleEnabled: flags.$1,
              backendEnabled: flags.$2,
              apiBaseUrl: '${WebGooglePublicConfig.stagingOrigin}/api/v1',
              origin: WebGooglePublicConfig.stagingOrigin),
          isNull);
    }
    expect(
        candidate.optionsFor(
            googleEnabled: true,
            backendEnabled: true,
            apiBaseUrl: 'https://shareittoo.com/api/v1',
            origin: WebGooglePublicConfig.stagingOrigin),
        isNull);
    for (final enabled in [false, true]) {
      for (final bound in [false, true]) {
        for (final ready in [false, true]) {
          expect(
              webGoogleControlAvailable(
                  googleEnabled: enabled,
                  optionsBound: bound,
                  initialized: ready),
              enabled && bound && ready);
        }
      }
    }
  });
  for (final failure in [
    'none',
    'missing-options',
    'initialize',
    'persistence'
  ]) {
    test('auth-only preparation $failure never reports premature readiness',
        () async {
      final calls = <String>[];
      final options = config().optionsFor(
          googleEnabled: true,
          backendEnabled: true,
          apiBaseUrl: '${WebGooglePublicConfig.stagingOrigin}/api/v1',
          origin: WebGooglePublicConfig.stagingOrigin);
      final ready = await prepareWebGoogleAuth(
        options: failure == 'missing-options' ? null : options,
        initializeBoundApp: () async {
          calls.add('app');
          if (failure == 'initialize') throw StateError('fixture');
        },
        useMemoryPersistence: () async {
          calls.add('memory');
          if (failure == 'persistence') throw StateError('fixture');
        },
      );
      expect(ready, failure == 'none');
      expect(
          calls,
          failure == 'missing-options'
              ? []
              : failure == 'initialize'
                  ? ['app']
                  : ['app', 'memory']);
    });
  }

  Future<String> token(
          {bool available = true,
          void Function()? current,
          Future<WebGoogleIdentity> Function()? popup,
          String? Function()? currentUid,
          void Function(String)? acquired}) =>
      acquireWebGoogleToken(
        available: available,
        requireCurrent: current ?? () {},
        popup: popup ??
            () async => WebGoogleIdentity(
                uid: 'synthetic-a',
                readFreshIdToken: () async => 'synthetic-firebase-token'),
        currentFirebaseUid: currentUid ?? () => 'synthetic-a',
        acquired: acquired ?? (_) {},
        providerErrorCode: (error) =>
            error is SyntheticProviderError ? error.code : null,
      );

  test('disabled Google never invokes popup', () async {
    var called = false;
    await expectLater(
        token(
            available: false,
            popup: () async {
              called = true;
              throw StateError('unexpected');
            }),
        throwsA(isA<WebGoogleAuthFailure>()));
    expect(called, isFalse);
  });
  test('untyped provider-looking error cannot forge popup cancellation',
      () async {
    await expectLater(
      token(popup: () async => throw StateError('popup-closed-by-user')),
      throwsA(isA<WebGoogleAuthFailure>()
          .having((error) => error.cancelled, 'cancelled', isFalse)
          .having((error) => error.code, 'code', 'popup_unavailable')),
    );
  });
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
    test(
        'popup $code has a sanitized cancellation/error outcome and no backend call',
        () async {
      var remoteCalled = false;
      await expectLater(
          const RemoteAuthAttemptTransaction<String, String, String>().run(
            preflightCurrent: () => true,
            actionCurrent: () => true,
            acquire: () =>
                token(popup: () async => throw SyntheticProviderError(code)),
            invokeRemote: (_) async {
              remoteCalled = true;
              return 'unexpected';
            },
            persist: (value) async => value,
            discardRemote: (_) async {},
            persistedCurrent: (_) async => true,
            discardPersisted: (_) async {},
          ),
          throwsA(isA<WebGoogleAuthFailure>()
              .having(
                  (error) => error.cancelled,
                  'cancelled',
                  const {
                    'popup-closed-by-user',
                    'cancelled-popup-request',
                    'web-context-cancelled',
                    'canceled'
                  }.contains(code))
              .having((error) => error.code, 'sanitized code',
                  isNot(contains('private')))));
      expect(remoteCalled, isFalse);
    });
  }
  test(
      'only the backend response becomes a session, never the Firebase credential',
      () async {
    final events = <String>[];
    final result =
        await const RemoteAuthAttemptTransaction<String, String, String>().run(
      preflightCurrent: () => true,
      actionCurrent: () => true,
      acquire: () => token(acquired: (_) => events.add('owned')),
      invokeRemote: (idToken) async {
        expect(idToken, 'synthetic-firebase-token');
        events.add('exchange');
        return 'backend-owned-session';
      },
      persist: (value) async {
        events.add('persist');
        return value;
      },
      discardRemote: (_) async {},
      persistedCurrent: (_) async => true,
      discardPersisted: (_) async {},
    );
    expect(result, 'backend-owned-session');
    expect(events, ['owned', 'exchange', 'persist']);
  });
  test(
      'UI loss after popup still records cleanup ownership but never exchanges',
      () async {
    var current = true;
    String? cleanupUid;
    var remoteCalled = false;
    await expectLater(
        const RemoteAuthAttemptTransaction<String, String, String>().run(
          preflightCurrent: () => current,
          actionCurrent: () => current,
          acquire: () => token(
              current: () {
                if (!current) throw const RemoteAuthAttemptSuperseded();
              },
              popup: () async {
                current = false;
                return WebGoogleIdentity(
                    uid: 'synthetic-a', readFreshIdToken: () async => 'unused');
              },
              acquired: (uid) => cleanupUid = uid),
          invokeRemote: (_) async {
            remoteCalled = true;
            return 'unused';
          },
          persist: (value) async => value,
          discardRemote: (_) async {},
          persistedCurrent: (_) async => true,
          discardPersisted: (_) async {},
        ),
        throwsA(isA<RemoteAuthAttemptSuperseded>()));
    expect(cleanupUid, 'synthetic-a');
    expect(remoteCalled, isFalse);
  });
  test(
      'principal change during token acquisition and empty token both fail closed',
      () async {
    var uid = 'synthetic-a';
    await expectLater(
        token(
            currentUid: () => uid,
            popup: () async => WebGoogleIdentity(
                uid: uid,
                readFreshIdToken: () async {
                  uid = 'synthetic-b';
                  return 'stale';
                })),
        throwsA(isA<RemoteAuthAttemptSuperseded>()));
    await expectLater(
        token(
            popup: () async => WebGoogleIdentity(
                uid: 'synthetic-a', readFreshIdToken: () async => null)),
        throwsA(isA<WebGoogleAuthFailure>()));
  });
}
