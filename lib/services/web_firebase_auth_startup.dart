import 'package:firebase_core/firebase_core.dart';

import 'web_facebook_auth_config.dart';
import 'web_google_auth.dart';

/// Startup configuration only: no principal, SDK user, popup or SIT session.
class WebFirebaseAuthSelection {
  final FirebaseOptions? options;
  final bool google;
  final bool facebook;
  const WebFirebaseAuthSelection._(this.options, this.google, this.facebook);
  static const unavailable = WebFirebaseAuthSelection._(null, false, false);
}

bool sameWebFirebaseApp(FirebaseOptions a, FirebaseOptions b) =>
    a.projectId == b.projectId &&
    a.appId == b.appId &&
    a.apiKey == b.apiKey &&
    a.authDomain == b.authDomain &&
    a.messagingSenderId == b.messagingSenderId;

WebFirebaseAuthSelection selectWebFirebaseAuth({
  required WebGooglePublicConfig googleConfig,
  required WebFacebookPublicConfig facebookConfig,
  required bool googleEnabled,
  required bool facebookEnabled,
  required bool activationValidated,
  required bool backendEnabled,
  required String apiBaseUrl,
  required String origin,
  required String facebookReadinessJson,
  required String facebookReadinessDigest,
  required DateTime now,
}) {
  final google = googleConfig.optionsFor(
    googleEnabled: googleEnabled,
    backendEnabled: backendEnabled,
    apiBaseUrl: apiBaseUrl,
    origin: origin,
  );
  final facebook = facebookConfig.optionsFor(
    facebookEnabled: facebookEnabled,
    activationValidated: activationValidated,
    backendEnabled: backendEnabled,
    apiBaseUrl: apiBaseUrl,
    origin: origin,
    readinessJson: facebookReadinessJson,
    approvedReadinessDigest: facebookReadinessDigest,
    now: now,
  );
  // A requested but unbound provider must not silently borrow the other's app.
  if ((googleEnabled && google == null) ||
      (facebookEnabled && facebook == null) ||
      (google != null &&
          facebook != null &&
          !sameWebFirebaseApp(google, facebook))) {
    return WebFirebaseAuthSelection.unavailable;
  }
  return WebFirebaseAuthSelection._(
      google ?? facebook, google != null, facebook != null);
}

Future<bool> prepareWebFirebaseAuth({
  required WebFirebaseAuthSelection selection,
  required Future<void> Function(FirebaseOptions options) initializeBoundApp,
  required Future<void> Function() useMemoryPersistence,
}) =>
    prepareWebGoogleAuth(
      options: selection.options,
      initializeBoundApp: () => initializeBoundApp(selection.options!),
      useMemoryPersistence: useMemoryPersistence,
    );
