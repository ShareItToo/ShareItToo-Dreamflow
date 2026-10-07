import 'package:firebase_core/firebase_core.dart';

import 'web_apple_auth_config.dart';
import 'web_apple_browser_bridge.dart';
import 'web_facebook_auth_config.dart';
import 'web_google_auth.dart';

/// Startup configuration only: no principal, SDK user, popup or SIT session.
class WebFirebaseAuthSelection {
  final FirebaseOptions? options;
  final bool google;
  final bool facebook;
  final bool apple;
  final WebAppleDirectConfig? appleDirect;
  const WebFirebaseAuthSelection._(
      this.options, this.google, this.facebook, this.apple, this.appleDirect);
  static const unavailable =
      WebFirebaseAuthSelection._(null, false, false, false, null);
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
  String googleReadinessJson = '',
  String googleReadinessDigest = '',
  String googleDecisionJson = '',
  String googleDecisionDigest = '',
  String googleEvidenceDigest = '',
  String googleSourceCommit = '',
  required String facebookReadinessJson,
  required String facebookReadinessDigest,
  required DateTime now,
  WebAppleDirectPublicConfig appleConfig = const WebAppleDirectPublicConfig(),
  bool appleEnabled = false,
  String appleReadinessJson = '',
  String appleReadinessDigest = '',
}) {
  final google = googleConfig.optionsFor(
    googleEnabled: googleEnabled,
    activationValidated: activationValidated,
    backendEnabled: backendEnabled,
    apiBaseUrl: apiBaseUrl,
    origin: origin,
    readinessJson: googleReadinessJson,
    approvedReadinessDigest: googleReadinessDigest,
    decisionJson: googleDecisionJson,
    approvedDecisionDigest: googleDecisionDigest,
    approvedEvidenceDigest: googleEvidenceDigest,
    expectedSourceCommit: googleSourceCommit,
    now: now,
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
  final apple = appleConfig.configurationFor(
    appleEnabled: appleEnabled,
    activationValidated: activationValidated,
    backendEnabled: backendEnabled,
    apiBaseUrl: apiBaseUrl,
    origin: origin,
    readinessJson: appleReadinessJson,
    approvedReadinessDigest: appleReadinessDigest,
    now: now,
  );
  final options = google ?? facebook ?? apple?.firebaseOptions;
  if (options == null) return WebFirebaseAuthSelection.unavailable;
  // Runtime approvals are provider-owned: an expired/missing approval cannot
  // disable another valid provider. Configured identity fields still bind the
  // one shared app even if that provider's approval has expired. Empty fields
  // grant nothing; contradictory nonempty fields fail the entire app closed.
  bool conflicts(String project, String backendProject, String app,
      String sender, String key, String domain) {
    bool differs(String value, String? expected) =>
        value.isNotEmpty && value != expected;
    return differs(project, options.projectId) ||
        differs(backendProject, options.projectId) ||
        differs(app, options.appId) ||
        differs(sender, options.messagingSenderId) ||
        differs(key, options.apiKey) ||
        differs(domain, options.authDomain);
  }

  if ((googleEnabled &&
          conflicts(
              googleConfig.projectId,
              googleConfig.backendProjectId,
              googleConfig.appId,
              googleConfig.messagingSenderId,
              googleConfig.apiKey,
              googleConfig.authDomain)) ||
      (facebookEnabled &&
          conflicts(
              facebookConfig.projectId,
              facebookConfig.backendProjectId,
              facebookConfig.appId,
              facebookConfig.messagingSenderId,
              facebookConfig.apiKey,
              facebookConfig.authDomain)) ||
      (appleEnabled &&
          conflicts(
              appleConfig.projectId,
              appleConfig.backendProjectId,
              appleConfig.appId,
              appleConfig.messagingSenderId,
              appleConfig.apiKey,
              appleConfig.authDomain))) {
    return WebFirebaseAuthSelection.unavailable;
  }
  return WebFirebaseAuthSelection._(
    options,
    google != null,
    facebook != null,
    apple != null,
    apple?.direct,
  );
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
