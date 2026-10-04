import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:firebase_core/firebase_core.dart';

import 'web_apple_browser_bridge.dart';

class WebApplePreparedConfig {
  final FirebaseOptions firebaseOptions;
  final WebAppleDirectConfig direct;

  const WebApplePreparedConfig(this.firebaseOptions, this.direct);
}

/// Independent direct-flow configuration. It deliberately cannot borrow the
/// historical W1 Firebase-handler callback approval below.
class WebAppleDirectPublicConfig {
  final String projectId;
  final String messagingSenderId;
  final String appId;
  final String apiKey;
  final String authDomain;
  final String backendProjectId;
  final String authorizedOrigin;
  final String clientId;
  final String redirectUri;
  final String approvedDigest;

  const WebAppleDirectPublicConfig({
    this.projectId = '',
    this.messagingSenderId = '',
    this.appId = '',
    this.apiKey = '',
    this.authDomain = '',
    this.backendProjectId = '',
    this.authorizedOrigin = '',
    this.clientId = '',
    this.redirectUri = '',
    this.approvedDigest = '',
  });

  String get publicConfigDigest => WebApplePublicConfig._digest(jsonEncode({
        'projectId': projectId,
        'messagingSenderId': messagingSenderId,
        'appId': appId,
        'apiKey': apiKey,
        'authDomain': authDomain,
        'backendProjectId': backendProjectId,
        'authorizedOrigin': authorizedOrigin,
        'clientId': clientId,
        'redirectUri': redirectUri,
      }));

  WebAppleDirectConfig get direct =>
      WebAppleDirectConfig(clientId: clientId, redirectUri: redirectUri);

  bool get isBound =>
      RegExp(r'^[a-z][a-z0-9-]{4,28}[a-z0-9]$').hasMatch(projectId) &&
      RegExp(r'^[0-9]{6,20}$').hasMatch(messagingSenderId) &&
      RegExp('^1:$messagingSenderId:web:[a-f0-9]{16,64}\$').hasMatch(appId) &&
      RegExp(r'^AIza[A-Za-z0-9_-]{35}$').hasMatch(apiKey) &&
      authDomain == '$projectId.firebaseapp.com' &&
      backendProjectId == projectId &&
      authorizedOrigin == WebApplePublicConfig.stagingOrigin &&
      direct.isValid &&
      WebApplePublicConfig._isDigest(approvedDigest) &&
      approvedDigest == publicConfigDigest;

  WebApplePreparedConfig? configurationFor({
    bool appleEnabled = false,
    bool activationValidated = false,
    bool backendEnabled = false,
    String apiBaseUrl = '',
    String origin = '',
    String readinessJson = '',
    String approvedReadinessDigest = '',
    required DateTime now,
  }) {
    if (!appleEnabled ||
        !activationValidated ||
        !backendEnabled ||
        !isBound ||
        origin != WebApplePublicConfig.stagingOrigin ||
        apiBaseUrl != WebApplePublicConfig.stagingApi ||
        !_readinessBound(readinessJson, approvedReadinessDigest, now)) {
      return null;
    }
    return WebApplePreparedConfig(
      FirebaseOptions(
        apiKey: apiKey,
        appId: appId,
        messagingSenderId: messagingSenderId,
        projectId: projectId,
        authDomain: authDomain,
      ),
      direct,
    );
  }

  bool _readinessBound(String raw, String approved, DateTime now) {
    if (raw.length > 8192 ||
        !WebApplePublicConfig._isDigest(approved) ||
        WebApplePublicConfig._digest(raw) != approved) {
      return false;
    }
    try {
      final evidence = jsonDecode(raw);
      const keys = {
        'schemaVersion',
        'provider',
        'platform',
        'origin',
        'apiBaseUrl',
        'backendFirebaseProjectId',
        'webAppConfigSha256',
        'callbackUrl',
        'firebaseProviderEnabled',
        'firebaseAppleOAuthConfigured',
        'appleServicesIdSha256',
        'firebaseAppleServicesIdSha256',
        'backendAppleServicesIdSha256',
        'backendAppleOwnershipConfigured',
        'backendAppleAcquisitionEnabled',
        'appleTeamIdSha256',
        'firebaseAppleTeamIdSha256',
        'appleKeyIdSha256',
        'firebaseAppleKeyIdSha256',
        'applePrimaryAppSignInEnabled',
        'appleServicesIdBoundToPrimaryApp',
        'appleSigningKeyEnabled',
        'appleRedirectDomainSha256',
        'backendAppleRedirectUriSha256',
        'appleRedirectDomainVerified',
        'appleReturnUrlVerified',
        'scope',
        'audience',
        'audienceVerified',
        'providerReadbackSha256',
        'observedAtUtc',
        'validUntilUtc',
      };
      if (evidence is! Map<String, dynamic> ||
          evidence.length != keys.length ||
          !evidence.keys.every(keys.contains) ||
          jsonEncode(evidence) != raw) {
        return false;
      }
      final observed = WebApplePublicConfig._utc(evidence['observedAtUtc']);
      final until = WebApplePublicConfig._utc(evidence['validUntilUtc']);
      final clientDigest = WebApplePublicConfig._digest(clientId);
      final redirectDigest = WebApplePublicConfig._digest(redirectUri);
      final domainDigest =
          WebApplePublicConfig._digest(Uri.parse(redirectUri).host);
      bool digest(Object? value) => WebApplePublicConfig._isDigest(value);
      return evidence['schemaVersion'] == 2 &&
          evidence['provider'] == 'apple' &&
          evidence['platform'] == 'web_direct' &&
          evidence['origin'] == authorizedOrigin &&
          evidence['apiBaseUrl'] == WebApplePublicConfig.stagingApi &&
          evidence['backendFirebaseProjectId'] == backendProjectId &&
          evidence['webAppConfigSha256'] == publicConfigDigest &&
          evidence['callbackUrl'] == redirectUri &&
          evidence['firebaseProviderEnabled'] == true &&
          evidence['firebaseAppleOAuthConfigured'] == true &&
          evidence['appleServicesIdSha256'] == clientDigest &&
          evidence['firebaseAppleServicesIdSha256'] == clientDigest &&
          evidence['backendAppleServicesIdSha256'] == clientDigest &&
          evidence['backendAppleOwnershipConfigured'] == true &&
          evidence['backendAppleAcquisitionEnabled'] == true &&
          digest(evidence['appleTeamIdSha256']) &&
          evidence['appleTeamIdSha256'] ==
              evidence['firebaseAppleTeamIdSha256'] &&
          digest(evidence['appleKeyIdSha256']) &&
          evidence['appleKeyIdSha256'] ==
              evidence['firebaseAppleKeyIdSha256'] &&
          evidence['applePrimaryAppSignInEnabled'] == true &&
          evidence['appleServicesIdBoundToPrimaryApp'] == true &&
          evidence['appleSigningKeyEnabled'] == true &&
          evidence['appleRedirectDomainSha256'] == domainDigest &&
          evidence['backendAppleRedirectUriSha256'] == redirectDigest &&
          evidence['appleRedirectDomainVerified'] == true &&
          evidence['appleReturnUrlVerified'] == true &&
          evidence['scope'] == 'private_pilot' &&
          evidence['audience'] == 'existing_allowlisted_accounts_only' &&
          evidence['audienceVerified'] == true &&
          digest(evidence['providerReadbackSha256']) &&
          observed != null &&
          until != null &&
          until.isAfter(observed) &&
          until.difference(observed) <=
              WebApplePublicConfig.maximumEvidenceValidity &&
          !now.isBefore(observed) &&
          now.isBefore(until);
    } on FormatException {
      return false;
    }
  }
}

/// Dormant Apple Web configuration contract. It has no runtime consumer and
/// does not establish acquisition, revocation, enrollment or live readiness.
class WebApplePublicConfig {
  static const stagingOrigin = 'https://staging.shareittoo.com';
  static const stagingApi = '$stagingOrigin/api/v1';
  // Local evidence policy, not a claimed Apple/Firebase provider requirement.
  static const maximumEvidenceValidity = Duration(hours: 24);

  final String projectId;
  final String messagingSenderId;
  final String appId;
  final String apiKey;
  final String authDomain;
  final String backendProjectId;
  final String authorizedOrigin;
  final String approvedDigest;

  const WebApplePublicConfig({
    this.projectId = '',
    this.messagingSenderId = '',
    this.appId = '',
    this.apiKey = '',
    this.authDomain = '',
    this.backendProjectId = '',
    this.authorizedOrigin = '',
    this.approvedDigest = '',
  });

  /// Independent Apple approval; this encoding shares no provider approval.
  /// Ordered compact JSON UTF-8, with no trailing newline.
  String get publicConfigDigest => _digest(jsonEncode({
        'projectId': projectId,
        'messagingSenderId': messagingSenderId,
        'appId': appId,
        'apiKey': apiKey,
        'authDomain': authDomain,
        'backendProjectId': backendProjectId,
        'authorizedOrigin': authorizedOrigin,
      }));

  bool get isBound =>
      RegExp(r'^[a-z][a-z0-9-]{4,28}[a-z0-9]$').hasMatch(projectId) &&
      RegExp(r'^[0-9]{6,20}$').hasMatch(messagingSenderId) &&
      RegExp('^1:$messagingSenderId:web:[a-f0-9]{16,64}\$').hasMatch(appId) &&
      RegExp(r'^AIza[A-Za-z0-9_-]{35}$').hasMatch(apiKey) &&
      authDomain == '$projectId.firebaseapp.com' &&
      backendProjectId == projectId &&
      authorizedOrigin == stagingOrigin &&
      _isDigest(approvedDigest) &&
      approvedDigest == publicConfigDigest;

  FirebaseOptions? optionsFor({
    bool appleEnabled = false,
    bool activationValidated = false,
    bool backendEnabled = false,
    String apiBaseUrl = '',
    String origin = '',
    String readinessJson = '',
    String approvedReadinessDigest = '',
    required DateTime now,
  }) {
    if (!appleEnabled ||
        !activationValidated ||
        !backendEnabled ||
        !isBound ||
        origin != stagingOrigin ||
        apiBaseUrl != stagingApi ||
        !_readinessBound(readinessJson, approvedReadinessDigest, now)) {
      return null;
    }
    return FirebaseOptions(
      apiKey: apiKey,
      appId: appId,
      messagingSenderId: messagingSenderId,
      projectId: projectId,
      authDomain: authDomain,
    );
  }

  /// A byte binding to an independently reviewed sanitized readback, not a
  /// signature or verification of the provider. No approved evidence ships.
  bool _readinessBound(String raw, String approved, DateTime now) {
    if (raw.length > 8192 || !_isDigest(approved) || _digest(raw) != approved) {
      return false;
    }
    try {
      final evidence = jsonDecode(raw);
      const keys = {
        'schemaVersion',
        'provider',
        'platform',
        'origin',
        'apiBaseUrl',
        'backendFirebaseProjectId',
        'webAppConfigSha256',
        'callbackUrl',
        'firebaseProviderEnabled',
        'firebaseAppleOAuthConfigured',
        'appleServicesIdSha256',
        'firebaseAppleServicesIdSha256',
        'appleTeamIdSha256',
        'firebaseAppleTeamIdSha256',
        'appleKeyIdSha256',
        'firebaseAppleKeyIdSha256',
        'applePrimaryAppSignInEnabled',
        'appleServicesIdBoundToPrimaryApp',
        'appleSigningKeyEnabled',
        'appleRedirectDomainSha256',
        'appleRedirectDomainVerified',
        'appleReturnUrlVerified',
        'scope',
        'audience',
        'audienceVerified',
        'providerReadbackSha256',
        'observedAtUtc',
        'validUntilUtc',
      };
      if (evidence is! Map<String, dynamic> ||
          evidence.length != keys.length ||
          !evidence.keys.every(keys.contains) ||
          // Reject duplicate keys and noncanonical/ambiguous JSON encodings.
          jsonEncode(evidence) != raw) {
        return false;
      }
      final observed = _utc(evidence['observedAtUtc']);
      final until = _utc(evidence['validUntilUtc']);
      bool sameId(String apple, String firebase) =>
          _isDigest(evidence[apple]) && evidence[apple] == evidence[firebase];

      return evidence['schemaVersion'] is int &&
          evidence['schemaVersion'] == 1 &&
          evidence['provider'] == 'apple' &&
          evidence['platform'] == 'web' &&
          evidence['origin'] == authorizedOrigin &&
          evidence['apiBaseUrl'] == stagingApi &&
          evidence['backendFirebaseProjectId'] == backendProjectId &&
          evidence['webAppConfigSha256'] == publicConfigDigest &&
          evidence['callbackUrl'] == 'https://$authDomain/__/auth/handler' &&
          evidence['firebaseProviderEnabled'] == true &&
          evidence['firebaseAppleOAuthConfigured'] == true &&
          sameId('appleServicesIdSha256', 'firebaseAppleServicesIdSha256') &&
          sameId('appleTeamIdSha256', 'firebaseAppleTeamIdSha256') &&
          sameId('appleKeyIdSha256', 'firebaseAppleKeyIdSha256') &&
          evidence['applePrimaryAppSignInEnabled'] == true &&
          evidence['appleServicesIdBoundToPrimaryApp'] == true &&
          evidence['appleSigningKeyEnabled'] == true &&
          evidence['appleRedirectDomainSha256'] == _digest(authDomain) &&
          evidence['appleRedirectDomainVerified'] == true &&
          evidence['appleReturnUrlVerified'] == true &&
          evidence['scope'] == 'private_pilot' &&
          evidence['audience'] == 'existing_allowlisted_accounts_only' &&
          evidence['audienceVerified'] == true &&
          _isDigest(evidence['providerReadbackSha256']) &&
          observed != null &&
          until != null &&
          until.isAfter(observed) &&
          until.difference(observed) <= maximumEvidenceValidity &&
          !now.isBefore(observed) &&
          now.isBefore(until);
    } on FormatException {
      return false;
    }
  }

  static String _digest(String value) =>
      sha256.convert(utf8.encode(value)).toString();

  static bool _isDigest(Object? value) =>
      value is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(value);

  static DateTime? _utc(Object? value) {
    if (value is! String ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$').hasMatch(value)) {
      return null;
    }
    final parsed = DateTime.tryParse(value);
    return parsed != null &&
            parsed.toIso8601String().replaceFirst('.000Z', 'Z') == value
        ? parsed
        : null;
  }
}
