import 'dart:async';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

import 'web_apple_browser_types.dart';

const _scriptId = 'sit-apple-sign-in-sdk';
const _scriptUrl =
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
Future<void>? _loader;
final _popupSingleFlight = WebApplePopupSingleFlight();

@JS('AppleID.auth.init')
external void _initializeApple(JSObject configuration);

@JS('AppleID.auth.signIn')
external JSPromise<JSAny?> _signInWithApple();

Future<void> _loadSdk() {
  final active = _loader;
  if (active != null) return active;
  final completion = Completer<void>();
  final attempt = completion.future;
  _loader = attempt;
  unawaited(() async {
    try {
      await _loadSdkOnce();
      completion.complete();
    } catch (error, stackTrace) {
      if (identical(_loader, attempt)) _loader = null;
      completion.completeError(error, stackTrace);
    }
  }());
  return attempt;
}

Future<void> _loadSdkOnce() async {
  if (web.document.querySelector('script#$_scriptId') != null) return;
  final completion = Completer<void>();
  final script = web.HTMLScriptElement()
    ..id = _scriptId
    ..async = true
    ..defer = true
    ..type = 'application/javascript'
    ..crossOrigin = 'anonymous'
    ..src = _scriptUrl;
  script.onload = (JSAny _) {
    if (!completion.isCompleted) completion.complete();
  }.toJS;
  script.onerror = (JSAny _) {
    script.remove();
    if (!completion.isCompleted) {
      completion.completeError(const WebApplePopupFailure('sdk_load_failed'));
    }
  }.toJS;
  web.document.head?.append(script);
  await completion.future.timeout(const Duration(seconds: 15), onTimeout: () {
    script.remove();
    throw const WebApplePopupFailure('sdk_load_failed');
  });
}

Future<WebApplePopupResponse> openWebApplePopup(WebApplePopupRequest request) =>
    _popupSingleFlight.run(invoke: () => _openWebApplePopupOnce(request));

Future<WebApplePopupResponse> _openWebApplePopupOnce(
    WebApplePopupRequest request) async {
  await _loadSdk();
  try {
    _initializeApple(<String, Object?>{
      'clientId': request.clientId,
      'scope': 'name email',
      'redirectURI': request.redirectUri,
      'state': request.state,
      'nonce': request.nonce,
      'usePopup': true,
    }.jsify()! as JSObject);
    final value = (await _signInWithApple().toDart)?.dartify();
    if (value is! Map) {
      throw const WebApplePopupFailure('invalid_popup_response');
    }
    final authorization = value['authorization'];
    if (authorization is! Map) {
      throw const WebApplePopupFailure('invalid_popup_response');
    }
    return WebApplePopupResponse(
      state: authorization['state']?.toString() ?? '',
      authorizationCode: authorization['code']?.toString() ?? '',
      appleIdToken: authorization['id_token']?.toString() ?? '',
    );
  } on WebApplePopupFailure {
    rethrow;
  } catch (error) {
    Object? safe;
    try {
      safe = (error as JSAny).dartify();
    } catch (_) {
      safe = null;
    }
    final code = safe is Map ? safe['error']?.toString() : null;
    const cancelled = {'popup_closed_by_user', 'user_cancelled_authorize'};
    if (cancelled.contains(code)) {
      throw const WebApplePopupFailure('popup_cancelled', cancelled: true);
    }
    if (code == 'popup_blocked') {
      throw const WebApplePopupFailure('popup_blocked');
    }
    throw const WebApplePopupFailure('popup_unavailable');
  }
}
