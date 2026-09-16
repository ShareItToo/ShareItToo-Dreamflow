import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_facebook_auth_platform_interface/flutter_facebook_auth_platform_interface.dart'
    as fb;
import 'package:google_sign_in_platform_interface/google_sign_in_platform_interface.dart'
    as g;
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _profile = bool.fromEnvironment('SIT_TEST_PROVIDER_SDK_OWNERSHIP');
const _nativeProfile =
    bool.fromEnvironment('SIT_TEST_PROVIDER_NATIVE_OWNERSHIP');
const _initializationProfile =
    bool.fromEnvironment('SIT_TEST_PROVIDER_INITIALIZATION_OWNERSHIP');
final _syntheticToken = List.filled(120, 'x').join();

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setupFirebaseCoreMocks();
  final sdk = _Sdk();
  final google = _Google();
  final facebook = _Facebook();
  late _Backend backend;

  setUpAll(() async {
    if (!_profile && !_nativeProfile && !_initializationProfile) return;
    HttpOverrides.global = _NoNetwork();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = sdk;
    g.GoogleSignInPlatform.instance = google;
    fb.FacebookAuthPlatform.instance = facebook;
  });
  setUp(() {
    sdk.reset();
    google.reset();
    facebook.reset();
    backend = _Backend();
    SharedPreferences.setMockInitialValues({});
  });

  group('mock-only provider SDK ownership profile', () {
    test('profile cannot silently exercise disabled local auth', () {
      expect(BackendConfig.enabled, isTrue);
      expect(BackendConfig.apiBaseUrl, 'http://127.0.0.1:1/api/v1');
      expect(
          AuthService.socialProviderEnabled(AuthSocialProvider.apple), isTrue);
      expect(AuthService.socialProviderEnabled(AuthSocialProvider.google),
          isFalse);
      expect(AuthService.socialProviderEnabled(AuthSocialProvider.facebook),
          isFalse);
    });

    test(
        'omitted epoch is captured before queueing and cannot adopt a later principal',
        () => backend.run(() async {
              final owner = await _installOwner();
              final user = _User(sdk, 'a', pending: true);
              sdk.social = () async => user;
              final a = AuthService.signInWithSocialProvider(
                  AuthSocialProvider.apple);
              await user.tokenEntered.future;
              final queued = AuthService.signInWithSocialProvider(
                  AuthSocialProvider.apple);
              final before = AuthService.sessionEpoch;
              expect(
                  await AuthService.clearSessionOwnerIfMatches(owner,
                      runLogoutCleanup: false),
                  isNotNull);
              expect(AuthService.sessionEpoch, greaterThan(before));
              await _installOwner('b');
              user.token.complete(_syntheticToken);
              expect((await a).failure, AuthFailure.principalChanged);
              expect((await queued).failure, AuthFailure.principalChanged);
              expect(sdk.socialCalls, 1);
              expect(sdk.signOutCalls, 1);
              expect((await AuthService.readSession())?.userId, 'b');
              expect(backend.socialCalls, 0);
            }));

    for (final staleEpoch in [false, true]) {
      test(
          'obsolete ${staleEpoch ? 'epoch' : 'action'} acquires and cleans nothing',
          () async {
        sdk.active = _User(sdk, 'unrelated');
        final result = await AuthService.signInWithSocialProvider(
          AuthSocialProvider.apple,
          expectedSessionEpoch: AuthService.sessionEpoch - (staleEpoch ? 1 : 0),
          isActionCurrent: () => staleEpoch,
        );
        expect(result.failure, AuthFailure.principalChanged);
        expect(sdk.socialCalls, 0);
        expect(sdk.signOutCalls, 0);
        expect(sdk.active?.uid, 'unrelated');
      });
    }

    for (final provider in [
      AuthSocialProvider.google,
      AuthSocialProvider.facebook
    ]) {
      test('disabled ${provider.name} acquires and cleans nothing', () async {
        sdk.active = _User(sdk, 'unrelated');
        final result = await AuthService.signInWithSocialProvider(provider);
        expect(result.failure, AuthFailure.providerUnavailable);
        expect(sdk.signOutCalls, 0);
        expect(sdk.socialCalls, 0);
        expect(sdk.active?.uid, 'unrelated');
      });
    }

    test('cancelled acquisition cannot clean an existing foreign SDK identity',
        () async {
      sdk.active = _User(sdk, 'unrelated');
      sdk.social = () async =>
          throw FirebaseAuthException(code: 'web-context-cancelled');
      final result =
          await AuthService.signInWithSocialProvider(AuthSocialProvider.apple);
      expect(result.failure, AuthFailure.socialCancelled);
      expect(sdk.signOutCalls, 0);
      expect(sdk.active?.uid, 'unrelated');
    });

    test(
        'same-UID B waits through A acquisition and awaited cleanup',
        () => backend.run(() async {
              final aUser = _User(sdk, 'same-uid', pending: true);
              final bUser = _User(sdk, 'same-uid', pending: true);
              final cleanup = Completer<void>();
              final cleaning = Completer<void>();
              var aCurrent = true;
              var bCurrent = true;
              sdk.social = () async => sdk.socialCalls == 1 ? aUser : bUser;
              sdk.cleanup = () async {
                if (sdk.signOutCalls == 1) {
                  cleaning.complete();
                  await cleanup.future;
                }
              };
              final a = AuthService.signInWithSocialProvider(
                  AuthSocialProvider.apple,
                  isActionCurrent: () => aCurrent);
              await aUser.tokenEntered.future;
              final b = AuthService.signInWithSocialProvider(
                  AuthSocialProvider.apple,
                  isActionCurrent: () => bCurrent);
              await pumpEventQueue();
              expect(sdk.socialCalls, 1);
              aCurrent = false;
              aUser.token.complete(_syntheticToken);
              await cleaning.future;
              await pumpEventQueue();
              expect(sdk.socialCalls, 1,
                  reason: 'Pending cleanup still owns the SDK');
              cleanup.complete();
              expect((await a).failure, AuthFailure.principalChanged);
              await bUser.tokenEntered.future;
              expect(sdk.active, same(bUser));
              expect(sdk.signOutCalls, 1);
              bCurrent = false;
              bUser.token.complete(_syntheticToken);
              expect((await b).failure, AuthFailure.principalChanged);
              expect(sdk.signOutCalls, 2);
              expect(backend.socialCalls, 0);
            }));

    test(
        'queued stale B is rejected before SDK acquisition',
        () => backend.run(() async {
              final aUser = _User(sdk, 'a', pending: true);
              sdk.social = () async => aUser;
              var aCurrent = true;
              var bCurrent = true;
              final a = AuthService.signInWithSocialProvider(
                  AuthSocialProvider.apple,
                  isActionCurrent: () => aCurrent);
              await aUser.tokenEntered.future;
              final b = AuthService.signInWithSocialProvider(
                  AuthSocialProvider.apple,
                  isActionCurrent: () => bCurrent);
              bCurrent = false;
              aCurrent = false;
              aUser.token.complete(_syntheticToken);
              expect((await a).failure, AuthFailure.principalChanged);
              expect((await b).failure, AuthFailure.principalChanged);
              expect(sdk.socialCalls, 1);
              expect(sdk.signOutCalls, 1);
            }));

    test(
        'provider exception releases the queue without cleaning another identity',
        () => backend.run(() async {
              final entered = Completer<void>();
              final failed = Completer<_User>();
              sdk.social = () {
                if (sdk.socialCalls == 1) {
                  entered.complete();
                  return failed.future;
                }
                return Future.value(_User(sdk, 'b'));
              };
              final a = AuthService.signInWithSocialProvider(
                  AuthSocialProvider.apple);
              await entered.future;
              final b = AuthService.signInWithSocialProvider(
                  AuthSocialProvider.apple);
              failed.completeError(
                  FirebaseAuthException(code: 'web-context-cancelled'));
              expect((await a).failure, AuthFailure.socialCancelled);
              expect((await b).ok, isTrue);
              expect(sdk.signOutCalls, 1);
              expect(backend.socialCalls, 1);
            }));

    test(
        'phone confirmation waits for social identity cleanup',
        () => backend.run(() async {
              final owner = await _installOwner();
              final challenge = await _challenge(owner);
              final aUser = _User(sdk, 'social', pending: true);
              sdk.social = () async => aUser;
              var current = true;
              final social = AuthService.signInWithSocialProvider(
                  AuthSocialProvider.apple,
                  isActionCurrent: () => current);
              await aUser.tokenEntered.future;
              final phone = _confirm(owner, challenge);
              await pumpEventQueue();
              expect(sdk.phoneCalls, 0);
              current = false;
              aUser.token.complete(_syntheticToken);
              expect((await social).failure, AuthFailure.principalChanged);
              await phone;
              expect(sdk.phoneCalls, 1);
              expect(sdk.signOutCalls, 2);
              expect(backend.phoneCalls, 1);
            }));

    test(
        'social waits through confirmed phone backend and delayed cleanup',
        () => backend.run(() async {
              final owner = await _installOwner();
              final challenge = await _challenge(owner);
              final response = Completer<Map<String, dynamic>>();
              final arrived = Completer<void>();
              final cleanup = Completer<void>();
              final cleaning = Completer<void>();
              backend.confirm = () {
                arrived.complete();
                return response.future;
              };
              sdk.cleanup = () async {
                if (sdk.signOutCalls == 1) {
                  cleaning.complete();
                  await cleanup.future;
                }
              };
              final phone = _confirm(owner, challenge);
              await arrived.future;
              final social = AuthService.signInWithSocialProvider(
                  AuthSocialProvider.apple);
              await pumpEventQueue();
              expect(sdk.socialCalls, 0);
              response.complete({'verified': true});
              await cleaning.future;
              await pumpEventQueue();
              expect(sdk.socialCalls, 0);
              cleanup.complete();
              await phone;
              expect((await social).ok, isTrue);
              expect(sdk.signOutCalls, 2);
            }));

    test(
        'new SMS challenge does not abandon acquired old phone SDK cleanup',
        () => backend.run(() async {
              final owner = await _installOwner();
              final old = await _challenge(owner);
              final user = _User(sdk, 'phone-a', pending: true);
              sdk.phone = () async => user;
              final first = _confirm(owner, old);
              await user.tokenEntered.future;
              final fresh = await _challenge(owner);
              expect(fresh.attemptEpoch, isNot(old.attemptEpoch));
              user.token.complete(_syntheticToken);
              await expectLater(
                first,
                throwsA(isA<PhoneVerificationException>().having(
                  (e) => e.failure,
                  'superseded SMS challenge',
                  PhoneVerificationFailure.principalChanged,
                )),
              );
              expect(sdk.signOutCalls, 1,
                  reason: 'The queue still owns the old acquired identity');
              expect(sdk.active, isNull);
              expect(backend.phoneCalls, 0);
            }));

    test(
        'phone confirmed cleanup failure retains known remote success',
        () => backend.run(() async {
              final owner = await _installOwner();
              final challenge = await _challenge(owner);
              sdk.cleanup =
                  () async => throw StateError('synthetic SDK cleanup failure');
              await expectLater(
                  _confirm(owner, challenge),
                  throwsA(
                    isA<PhoneVerificationException>()
                        .having(
                            (e) => e.failure,
                            'typed failure',
                            PhoneVerificationFailure
                                .confirmedLocalIdentityCleanupFailed)
                        .having((e) => e.remoteAcceptedOrConfirmed,
                            'known confirmation', isTrue),
                  ));
              expect(backend.phoneCalls, 1);
              sdk.cleanup = () async {};
              expect(
                  (await AuthService.signInWithSocialProvider(
                          AuthSocialProvider.apple))
                      .ok,
                  isTrue);
            }));

    test(
        'queued phone owner change prevents SDK invocation',
        () => backend.run(() async {
              final owner = await _installOwner();
              final challenge = await _challenge(owner);
              final user = _User(sdk, 'social', pending: true);
              sdk.social = () async => user;
              var current = true;
              final social = AuthService.signInWithSocialProvider(
                  AuthSocialProvider.apple,
                  isActionCurrent: () => current);
              await user.tokenEntered.future;
              final phone = _confirm(owner, challenge);
              final rejected = expectLater(
                  phone,
                  throwsA(isA<PhoneVerificationException>().having(
                      (e) => e.failure,
                      'owner changed',
                      PhoneVerificationFailure.principalChanged)));
              await _installOwner('b');
              current = false;
              user.token.complete(_syntheticToken);
              await social;
              await rejected;
              expect(sdk.phoneCalls, 0);
              expect(backend.phoneCalls, 0);
            }));
    test(
        'late confirmed phone response keeps acceptance after challenge supersession',
        () => backend.run(() async {
              final owner = await _installOwner();
              final old = await _challenge(owner);
              final arrived = Completer<void>();
              final response = Completer<Map<String, dynamic>>();
              backend.confirm = () {
                arrived.complete();
                return response.future;
              };
              final result = _confirm(owner, old);
              final checked = expectLater(
                  result,
                  throwsA(isA<PhoneVerificationException>()
                      .having((e) => e.failure, 'superseded',
                          PhoneVerificationFailure.principalChanged)
                      .having((e) => e.remoteAcceptedOrConfirmed,
                          'confirmed remotely', isTrue)));
              await arrived.future;
              await _challenge(owner);
              response.complete({'verified': true});
              await checked;
              expect(sdk.signOutCalls, 1);
            }));

    test(
        'unconfirmed phone response and cleanup failure never manufacture confirmation',
        () => backend.run(() async {
              final owner = await _installOwner();
              final challenge = await _challenge(owner);
              backend.confirm = () async => {'verified': false};
              sdk.cleanup =
                  () async => throw StateError('synthetic cleanup failure');
              await expectLater(
                  _confirm(owner, challenge),
                  throwsA(isA<PhoneVerificationException>()
                      .having((e) => e.failure, 'local cleanup failed',
                          PhoneVerificationFailure.localIdentityCleanupFailed)
                      .having((e) => e.remoteAcceptedOrConfirmed,
                          'not confirmed', isFalse)));
            }));
  }, skip: !_profile);

  // AuthService intentionally caches Google initialization for the process.
  // Exercise its first initialization in a fresh test process, not by requiring
  // this case to run before all other Google cases or resetting production state.
  group('mock-only cold Google initialization profile', () {
    test('stale Google initialization cannot launch authentication', () async {
      expect(BackendConfig.enabled, isTrue);
      expect(
          AuthService.socialProviderEnabled(AuthSocialProvider.google), isTrue);
      expect(AuthService.socialProviderEnabled(AuthSocialProvider.facebook),
          isTrue);
      final entered = Completer<void>();
      final initialized = Completer<void>();
      google.initialize = () {
        entered.complete();
        return initialized.future;
      };
      var current = true;
      final result = AuthService.signInWithSocialProvider(
          AuthSocialProvider.google,
          isActionCurrent: () => current);
      await entered.future;
      current = false;
      initialized.complete();
      expect((await result).failure, AuthFailure.principalChanged);
      expect(google.loginCalls, 0);
      expect(google.logoutCalls, 0);
      expect(sdk.signOutCalls, 0);
    });
  }, skip: !_initializationProfile);

  group('mock-only native provider cleanup profile', () {
    for (final provider in [
      AuthSocialProvider.google,
      AuthSocialProvider.facebook
    ]) {
      int logoutCalls() => provider == AuthSocialProvider.google
          ? google.logoutCalls
          : facebook.logoutCalls;

      test('${provider.name} cancellation cleans no unacquired state',
          () async {
        sdk.active = _User(sdk, 'unrelated');
        google.authenticateResult = () async =>
            throw const g.GoogleSignInException(
                code: g.GoogleSignInExceptionCode.canceled);
        facebook.loginResult =
            () async => fb.LoginResult(status: fb.LoginStatus.cancelled);
        final result = await AuthService.signInWithSocialProvider(provider);
        expect(result.failure, AuthFailure.socialCancelled);
        expect(logoutCalls(), 0);
        expect(sdk.phoneCalls, 0);
        expect(sdk.signOutCalls, 0);
        expect(sdk.active?.uid, 'unrelated');
      });

      test(
          '${provider.name} late acquisition is cleaned without Firebase invocation',
          () async {
        final entered = Completer<void>();
        final resultReady = Completer<void>();
        google.authenticateResult = () async {
          entered.complete();
          await resultReady.future;
          return _googleResult;
        };
        facebook.loginResult = () async {
          entered.complete();
          await resultReady.future;
          return _facebookResult();
        };
        var current = true;
        final result = AuthService.signInWithSocialProvider(provider,
            isActionCurrent: () => current);
        await entered.future;
        current = false;
        resultReady.complete();
        expect((await result).failure, AuthFailure.principalChanged);
        expect(logoutCalls(), 1);
        expect(sdk.phoneCalls, 0);
        expect(sdk.signOutCalls, 0);
      });

      test(
          '${provider.name} Firebase failure cleans only acquired native provider',
          () async {
        sdk.active = _User(sdk, 'unrelated');
        sdk.phone =
            () async => throw FirebaseAuthException(code: 'invalid-credential');
        final result = await AuthService.signInWithSocialProvider(provider);
        expect(result.failure, AuthFailure.providerUnavailable);
        expect(logoutCalls(), 1);
        expect(sdk.signOutCalls, 0);
        expect(sdk.active?.uid, 'unrelated');
      });

      test(
          '${provider.name} backend failure still completes owned cleanup',
          () => backend.run(() async {
                backend.socialResponse = () async =>
                    throw http.ClientException('synthetic offline backend');
                final result =
                    await AuthService.signInWithSocialProvider(provider);
                expect(result.failure, AuthFailure.network);
                expect(logoutCalls(), 1);
                expect(sdk.signOutCalls, 1);
                expect(sdk.active, isNull);
              }));

      test(
          '${provider.name} native cleanup remains exclusive until completed',
          () => backend.run(() async {
                final entered = Completer<void>();
                final cleanup = Completer<void>();
                Future<void> delayedCleanup() {
                  entered.complete();
                  return cleanup.future;
                }

                google.cleanup = delayedCleanup;
                facebook.cleanup = delayedCleanup;
                final first = AuthService.signInWithSocialProvider(provider);
                await entered.future;
                final second = AuthService.signInWithSocialProvider(
                    AuthSocialProvider.apple);
                await pumpEventQueue();
                expect(sdk.socialCalls, 0,
                    reason: 'Apple waits for native provider logout');
                cleanup.complete();
                expect((await first).ok, isTrue);
                expect((await second).ok, isTrue);
                expect(logoutCalls(), 1);
                expect(sdk.signOutCalls, 2);
              }));
    }
  }, skip: !_nativeProfile);
}

Future<AuthSessionOwner> _installOwner([String id = 'a']) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
      'auth_session_v1',
      jsonEncode({
        'email': '$id@example.invalid',
        'userId': id,
        'sessionId': 'session-$id',
        'createdAt': '2026-01-01T00:00:00.000Z',
        'accessToken': 'synthetic-access',
        'refreshToken': 'synthetic-refresh',
        'accessTokenExpiresAt':
            DateTime.now().add(const Duration(days: 1)).toIso8601String(),
      }));
  return AuthService.captureSessionOwner((await AuthService.readSession())!);
}

Future<PhoneVerificationChallenge> _challenge(AuthSessionOwner owner) =>
    AuthService.requestPhoneVerification(
        owner: owner, phoneNumber: '+4915112345678');
Future<void> _confirm(
        AuthSessionOwner owner, PhoneVerificationChallenge challenge) =>
    AuthService.confirmPhoneVerification(
        owner: owner, challenge: challenge, smsCode: '123456');

class _Backend {
  int socialCalls = 0;
  int phoneCalls = 0;
  Future<Map<String, dynamic>> Function() confirm =
      () async => {'verified': true};
  Future<http.Response> Function() socialResponse = () async => http.Response(
      jsonEncode({
        'accepted': true,
        'verificationEmailSent': true,
        'email': 'synthetic@example.invalid'
      }),
      202);
  Future<void> run(Future<void> Function() body) => http.runWithClient(
      body,
      () => MockClient((request) async {
            expect(request.url.host, '127.0.0.1');
            expect(request.url.port, 1);
            final path = request.url.path;
            if (path == '/api/v1/auth/phone-verification/status') {
              return http.Response(
                  jsonEncode({'available': true, 'provider': 'firebase-phone'}),
                  200);
            }
            if (path == '/api/v1/auth/phone-verification/confirm') {
              phoneCalls++;
              return http.Response(jsonEncode(await confirm()), 200);
            }
            if (path == '/api/v1/auth/social') {
              socialCalls++;
              return socialResponse();
            }
            throw StateError('Unexpected mock backend route');
          }));
}

class _NoNetwork extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      throw StateError('Real network forbidden in provider ownership tests');
}

const _googleResult = g.AuthenticationResults(
  user: g.GoogleSignInUserData(
      email: 'synthetic@example.invalid', id: 'synthetic'),
  authenticationTokens:
      g.AuthenticationTokenData(idToken: 'synthetic-not-a-credential'),
);
fb.LoginResult _facebookResult() => fb.LoginResult(
      status: fb.LoginStatus.success,
      accessToken: fb.ClassicToken(
          declinedPermissions: [],
          grantedPermissions: [],
          userId: 'synthetic',
          expires: DateTime(2100),
          tokenString: 'synthetic-not-a-credential',
          applicationId: 'synthetic'),
    );

class _Google extends g.GoogleSignInPlatform {
  int loginCalls = 0;
  int logoutCalls = 0;
  late Future<void> Function() initialize;
  late Future<g.AuthenticationResults> Function() authenticateResult;
  late Future<void> Function() cleanup;
  void reset() {
    loginCalls = 0;
    logoutCalls = 0;
    initialize = () async {};
    authenticateResult = () async => _googleResult;
    cleanup = () async {};
  }

  @override
  Future<void> init(g.InitParameters params) => initialize();
  @override
  Future<g.AuthenticationResults> authenticate(
      g.AuthenticateParameters params) {
    loginCalls++;
    return authenticateResult();
  }

  @override
  Future<void> signOut(g.SignOutParams params) {
    logoutCalls++;
    return cleanup();
  }

  @override
  bool supportsAuthenticate() => true;
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Unexpected mock Google operation');
}

class _Facebook extends fb.FacebookAuthPlatform {
  int loginCalls = 0;
  int logoutCalls = 0;
  late Future<fb.LoginResult> Function() loginResult;
  late Future<void> Function() cleanup;
  void reset() {
    loginCalls = 0;
    logoutCalls = 0;
    loginResult = () async => _facebookResult();
    cleanup = () async {};
  }

  @override
  Future<fb.LoginResult> login(
      {List<String> permissions = const ['email', 'public_profile'],
      fb.LoginBehavior loginBehavior = fb.LoginBehavior.dialogOnly,
      fb.LoginTracking loginTracking = fb.LoginTracking.enabled,
      String? nonce}) {
    loginCalls++;
    return loginResult();
  }

  @override
  Future<void> logOut() {
    logoutCalls++;
    return cleanup();
  }

  @override
  bool get isWebSdkInitialized => true;
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Unexpected mock Facebook operation');
}

class _MultiFactor extends MultiFactorPlatform {
  _MultiFactor(super.auth);
}

class _User extends UserPlatform {
  final tokenEntered = Completer<void>();
  final token = Completer<String?>();
  _User(FirebaseAuthPlatform auth, String uid, {bool pending = false})
      : super(
            auth,
            _MultiFactor(auth),
            InternalUserDetails(
                userInfo: InternalUserInfo(
                    uid: uid, isAnonymous: false, isEmailVerified: false),
                providerData: [])) {
    if (!pending) token.complete(_syntheticToken);
  }
  @override
  Future<String?> getIdToken(bool forceRefresh) {
    if (!tokenEntered.isCompleted) tokenEntered.complete();
    return token.future;
  }
}

class _Credential extends UserCredentialPlatform {
  _Credential({required super.auth, required super.user});
}

class _Sdk extends FirebaseAuthPlatform {
  _User? active;
  int socialCalls = 0;
  int phoneCalls = 0;
  int signOutCalls = 0;
  late Future<_User> Function() social;
  late Future<_User> Function() phone;
  late Future<void> Function() cleanup;
  void reset() {
    active = null;
    socialCalls = 0;
    phoneCalls = 0;
    signOutCalls = 0;
    social = () async => _User(this, 'social');
    phone = () async => _User(this, 'phone');
    cleanup = () async {};
  }

  @override
  FirebaseAuthPlatform delegateFor({required FirebaseApp app}) => this;
  @override
  FirebaseAuthPlatform setInitialValues(
          {Object? currentUser, String? languageCode}) =>
      this;
  @override
  UserPlatform? get currentUser => active;
  @override
  Future<UserCredentialPlatform> signInWithProvider(
      AuthProvider provider) async {
    socialCalls++;
    final user = await social();
    active = user;
    return _Credential(auth: this, user: user);
  }

  @override
  Future<UserCredentialPlatform> signInWithCredential(
      AuthCredential credential) async {
    phoneCalls++;
    final user = await phone();
    active = user;
    return _Credential(auth: this, user: user);
  }

  @override
  Future<void> signOut() async {
    signOutCalls++;
    await cleanup();
    active = null;
  }

  @override
  Future<void> verifyPhoneNumber({
    String? phoneNumber,
    PhoneMultiFactorInfo? multiFactorInfo,
    required PhoneVerificationCompleted verificationCompleted,
    required PhoneVerificationFailed verificationFailed,
    required PhoneCodeSent codeSent,
    required PhoneCodeAutoRetrievalTimeout codeAutoRetrievalTimeout,
    Duration timeout = const Duration(seconds: 30),
    int? forceResendingToken,
    MultiFactorSession? multiFactorSession,
    String? autoRetrievedSmsCodeForTesting,
  }) async {
    codeSent('synthetic-verification', null);
  }
}
