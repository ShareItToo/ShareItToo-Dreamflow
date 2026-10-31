import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:firebase_core/firebase_core.dart';

import 'web_google_auth.dart';

/// Independent Facebook configuration. Only the existing *public option shape*
/// and digest encoding are shared with Google, never its flag or approval.
class WebFacebookPublicConfig {
  final String projectId;
  final String messagingSenderId;
  final String appId;
  final String apiKey;
  final String authDomain;
  final String backendProjectId;
  final String authorizedOrigin;
  final String approvedDigest;

  const WebFacebookPublicConfig({
    required this.projectId,
    required this.messagingSenderId,
    required this.appId,
    required this.apiKey,
    required this.authDomain,
    required this.backendProjectId,
    required this.authorizedOrigin,
    required this.approvedDigest,
  });

  WebGooglePublicConfig get _publicShape => WebGooglePublicConfig(
        projectId: projectId,
        messagingSenderId: messagingSenderId,
        appId: appId,
        apiKey: apiKey,
        authDomain: authDomain,
        backendProjectId: backendProjectId,
        authorizedOrigin: authorizedOrigin,
        approvedDigest: approvedDigest,
      );

  String get publicConfigDigest => _publicShape.publicConfigDigest;

  FirebaseOptions? optionsFor({
    required bool facebookEnabled,
    required bool activationValidated,
    required bool backendEnabled,
    required String apiBaseUrl,
    required String origin,
    required String readinessJson,
    required String approvedReadinessDigest,
    required DateTime now,
  }) {
    if (!facebookEnabled ||
        !activationValidated ||
        !backendEnabled ||
        !_publicShape.isBound ||
        origin != WebGooglePublicConfig.stagingOrigin ||
        apiBaseUrl != '${WebGooglePublicConfig.stagingOrigin}/api/v1' ||
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

  /// This digest is a reviewed external readback binding, not a signature or
  /// live provider verification. No shipped approval/evidence is supplied here.
  /// Validity is explicit in that review; no implicit freshness window/default.
  bool _readinessBound(String raw, String approved, DateTime now) {
    if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(approved) ||
        sha256.convert(utf8.encode(raw)).toString() != approved) {
      return false;
    }
    try {
      final evidence = jsonDecode(raw);
      const keys = {
        'schemaVersion',
        'provider',
        'platform',
        'origin',
        'backendFirebaseProjectId',
        'webAppConfigSha256',
        'callbackUrl',
        'firebaseProviderEnabled',
        'metaAppMode',
        'audience',
        'audienceVerified',
        'providerReadbackSha256',
        'observedAtUtc',
        'validUntilUtc',
      };
      if (evidence is! Map<String, dynamic> ||
          evidence.length != keys.length ||
          !evidence.keys.every(keys.contains)) {
        return false;
      }
      DateTime? utc(Object? value) {
        if (value is! String ||
            !RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')
                .hasMatch(value)) {
          return null;
        }
        final parsed = DateTime.tryParse(value);
        // DateTime.parse normalizes impossible dates; do not accept those.
        if (parsed == null ||
            parsed.toIso8601String().replaceFirst('.000Z', 'Z') != value) {
          return null;
        }
        return parsed;
      }

      final observed = utc(evidence['observedAtUtc']);
      final until = utc(evidence['validUntilUtc']);
      return evidence['schemaVersion'] is int &&
          evidence['schemaVersion'] == 1 &&
          evidence['provider'] == 'facebook' &&
          evidence['platform'] == 'web' &&
          evidence['origin'] == authorizedOrigin &&
          evidence['backendFirebaseProjectId'] == backendProjectId &&
          evidence['webAppConfigSha256'] == publicConfigDigest &&
          evidence['callbackUrl'] == 'https://$authDomain/__/auth/handler' &&
          evidence['firebaseProviderEnabled'] == true &&
          // This dormant private-pilot contract approves no public audience.
          evidence['metaAppMode'] == 'development' &&
          evidence['audience'] == 'app_roles_only' &&
          evidence['audienceVerified'] == true &&
          evidence['providerReadbackSha256'] is String &&
          RegExp(r'^[a-f0-9]{64}$')
              .hasMatch(evidence['providerReadbackSha256'] as String) &&
          observed != null &&
          until != null &&
          until.isAfter(observed) &&
          !now.isBefore(observed) &&
          now.isBefore(until);
    } on FormatException {
      return false;
    }
  }
}
