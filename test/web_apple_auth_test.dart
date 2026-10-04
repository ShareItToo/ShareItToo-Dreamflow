import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/remote_auth_attempt_transaction.dart';
import 'package:lendify/services/web_apple_auth.dart';
import 'package:lendify/services/web_apple_browser_bridge.dart';

const firebaseToken =
    'synthetic-firebase-id-token-with-no-live-value-0000000000000000000000000'
    '000000000000000000000000000000000000000000000000000000000000000000';
const appleToken =
    'synthetic-apple-id-token-with-no-live-value-000000000000000000000000000'
    '00000000000000000000000000000000000000000000000000000000000000000';
const config = WebAppleDirectConfig(
  clientId: 'com.shareittoo.synthetic.web',
  redirectUri: 'https://staging.shareittoo.com/auth/apple/callback',
);

class Attempt {
  bool current = true;
  bool ready = true;
  String? currentUid;
  String? ownedUid;
  String driftAt = '';
  String provider = 'apple.com';
  int popupCalls = 0;
  int firebaseCalls = 0;
  int tokenCalls = 0;
  int randomCalls = 0;
  WebApplePopupFailure? popupFailure;
  String responseState = 'match';
  String code = 'synthetic-single-use-code';
  String idToken = appleToken;
  String seenNonce = '';
  String seenRawNonce = '';

  void check() {
    if (!current) throw const RemoteAuthAttemptSuperseded();
  }

  void drift(String phase) {
    if (driftAt == phase) current = false;
  }

  List<int> random(int length) {
    expect(length, 32);
    randomCalls += 1;
    return List<int>.filled(length, randomCalls);
  }

  Future<dynamic> run() => acquireWebAppleMaterial(
        config: config,
        available: () => ready,
        requireCurrent: check,
        randomBytes: random,
        popup: (request) async {
          popupCalls += 1;
          expect(request.clientId, config.clientId);
          expect(request.redirectUri, config.redirectUri);
          expect(request.state,
              base64Url.encode(List<int>.filled(32, 1)).replaceAll('=', ''));
          seenNonce = request.nonce;
          drift('popup');
          if (popupFailure case final failure?) throw failure;
          return WebApplePopupResponse(
            state: responseState == 'match' ? request.state : responseState,
            authorizationCode: code,
            appleIdToken: idToken,
          );
        },
        signInToFirebase: (token, rawNonce) async {
          firebaseCalls += 1;
          expect(token, appleToken);
          seenRawNonce = rawNonce;
          drift('firebase');
          currentUid = 'synthetic-firebase-uid';
          return WebAppleFirebaseIdentity(
            uid: 'synthetic-firebase-uid',
            readFreshToken: () async {
              tokenCalls += 1;
              drift('token');
              return WebAppleFirebaseToken(
                token: firebaseToken,
                signInProvider: provider,
              );
            },
          );
        },
        currentFirebaseUid: () => currentUid,
        acquired: (uid) => ownedUid = uid,
      );
}

Matcher failure(String code) => throwsA(isA<WebAppleAuthFailure>()
    .having((error) => error.code, 'sanitized code', code)
    .having(
        (error) => error.toString(), 'redacted', isNot(contains('synthetic'))));
Matcher popupFailure(String code) => throwsA(isA<WebApplePopupFailure>()
    .having((error) => error.code, 'sanitized code', code));

void main() {
  test('popup bridge is single-flight and rejects a duplicate invocation',
      () async {
    final flight = WebApplePopupSingleFlight();
    final first = Completer<WebApplePopupResponse>();
    var invocations = 0;
    final active = flight.run(invoke: () {
      invocations += 1;
      return first.future;
    });
    await expectLater(
      flight.run(invoke: () async {
        invocations += 1;
        throw StateError('duplicate must not invoke Apple');
      }),
      popupFailure('popup_in_progress'),
    );
    expect(invocations, 1);
    first.complete(const WebApplePopupResponse(
      state: 'state',
      authorizationCode: 'code',
      appleIdToken: 'token',
    ));
    expect((await active).authorizationCode, 'code');
    expect(
      (await flight.run(
        invoke: () async => const WebApplePopupResponse(
          state: 'next',
          authorizationCode: 'next-code',
          appleIdToken: 'next-token',
        ),
      ))
          .state,
      'next',
    );
  });

  test('late timed-out popup cannot clear or satisfy its successor', () async {
    final flight = WebApplePopupSingleFlight();
    final late = Completer<WebApplePopupResponse>();
    await expectLater(
      flight.run(
        invoke: () => late.future,
        timeout: const Duration(milliseconds: 1),
      ),
      popupFailure('popup_unavailable'),
    );
    final successor = Completer<WebApplePopupResponse>();
    final active = flight.run(invoke: () => successor.future);
    late.complete(const WebApplePopupResponse(
      state: 'late',
      authorizationCode: 'late-code',
      appleIdToken: 'late-token',
    ));
    await Future<void>.delayed(Duration.zero);
    await expectLater(
      flight.run(
        invoke: () async => throw StateError('successor still owns flight'),
      ),
      popupFailure('popup_in_progress'),
    );
    successor.complete(const WebApplePopupResponse(
      state: 'successor',
      authorizationCode: 'successor-code',
      appleIdToken: 'successor-token',
    ));
    expect((await active).state, 'successor');
  });

  test('independent state/raw nonce and token-only Firebase credential seam',
      () async {
    final attempt = Attempt();
    final material = await attempt.run();
    expect(attempt.popupCalls, 1);
    expect(attempt.firebaseCalls, 1);
    expect(attempt.randomCalls, 2);
    expect(attempt.seenRawNonce,
        base64Url.encode(List<int>.filled(32, 2)).replaceAll('=', ''));
    expect(attempt.seenNonce,
        sha256.convert(utf8.encode(attempt.seenRawNonce)).toString());
    expect(attempt.seenNonce, isNot(attempt.seenRawNonce));
    expect(attempt.ownedUid, 'synthetic-firebase-uid');
    expect(attempt.tokenCalls, 0);
    expect(await material.readFreshFirebaseIdToken(), firebaseToken);
    expect(material.toString(), 'AppleWebV2Material(redacted)');
    expect(
      material.acquireBody(idToken: firebaseToken, requestId: 'A' * 43),
      {
        'idToken': firebaseToken,
        'appleAuth': {
          'version': 2,
          'operation': 'acquire',
          'requestId': 'A' * 43,
          'authorizationCode': 'synthetic-single-use-code',
        },
      },
    );
  });

  test('disabled or stale attempt never opens Apple popup', () async {
    final disabled = Attempt()..ready = false;
    await expectLater(disabled.run(), failure('web_config_unavailable'));
    expect(disabled.popupCalls, 0);
    final stale = Attempt()..current = false;
    await expectLater(stale.run(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
    expect(stale.popupCalls, 0);
  });

  test('wrong state fails before Firebase and never substitutes a token',
      () async {
    final attempt = Attempt()..responseState = 'B' * 43;
    await expectLater(attempt.run(), failure('state_mismatch'));
    expect(attempt.firebaseCalls, 0);
  });

  for (final value in ['', ' ']) {
    test('missing authorization code fails before Firebase', () async {
      final attempt = Attempt()..code = value;
      await expectLater(attempt.run(), failure('missing_authorization_code'));
      expect(attempt.firebaseCalls, 0);
    });
  }

  for (final value in ['', 'short']) {
    test('missing Apple ID token fails before Firebase', () async {
      final attempt = Attempt()..idToken = value;
      await expectLater(attempt.run(), failure('missing_apple_id_token'));
      expect(attempt.firebaseCalls, 0);
    });
  }

  for (final entry in const [
    WebApplePopupFailure('popup_cancelled', cancelled: true),
    WebApplePopupFailure('popup_blocked'),
  ]) {
    test('${entry.code} remains bounded and does not acquire Firebase',
        () async {
      final attempt = Attempt()..popupFailure = entry;
      await expectLater(
          attempt.run(),
          throwsA(isA<WebAppleAuthFailure>()
              .having((error) => error.code, 'code', entry.code)
              .having(
                  (error) => error.cancelled, 'cancelled', entry.cancelled)));
      expect(attempt.firebaseCalls, 0);
    });
  }

  for (final phase in ['popup', 'firebase']) {
    test('stale owner/generation after $phase cannot continue', () async {
      final attempt = Attempt()..driftAt = phase;
      await expectLater(
          attempt.run(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
      expect(attempt.tokenCalls, 0);
    });
  }

  test('fresh-token callback rechecks provider and current owner', () async {
    final mismatch = Attempt()..provider = 'google.com';
    final material = await mismatch.run();
    await expectLater(
        material.readFreshFirebaseIdToken(), failure('provider_mismatch'));
    final stale = Attempt();
    final staleMaterial = await stale.run();
    stale.current = false;
    await expectLater(staleMaterial.readFreshFirebaseIdToken(),
        throwsA(isA<RemoteAuthAttemptSuperseded>()));
  });

  test('same random output is rejected before popup', () async {
    await expectLater(
      acquireWebAppleMaterial(
        config: config,
        available: () => true,
        requireCurrent: () {},
        popup: (_) => throw StateError('must not open'),
        signInToFirebase: (_, __) => throw StateError('must not sign in'),
        currentFirebaseUid: () => null,
        acquired: (_) {},
        randomBytes: (_) => List<int>.filled(32, 7),
      ),
      failure('secure_random_unavailable'),
    );
  });
}
