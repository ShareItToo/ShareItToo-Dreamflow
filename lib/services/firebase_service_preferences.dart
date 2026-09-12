import 'package:shared_preferences/shared_preferences.dart';

class FirebaseServicePreferences {
  final bool pushEnabled;
  final bool crashDiagnosticsEnabled;
  final bool pushBackendCleanupPending;
  final String? pushBackendCleanupOwnerToken;
  final bool pushLocalCleanupPending;
  final bool installationCleanupPending;

  const FirebaseServicePreferences({
    required this.pushEnabled,
    required this.crashDiagnosticsEnabled,
    required this.pushBackendCleanupPending,
    required this.pushBackendCleanupOwnerToken,
    required this.pushLocalCleanupPending,
    required this.installationCleanupPending,
  });

  static const defaults = FirebaseServicePreferences(
    pushEnabled: false,
    crashDiagnosticsEnabled: false,
    pushBackendCleanupPending: false,
    pushBackendCleanupOwnerToken: null,
    pushLocalCleanupPending: false,
    installationCleanupPending: false,
  );
}

abstract final class FirebaseServicePreferencesStore {
  static const String decisionVersion = 'firebase-services-v1-2026-08-16';
  static const _pushEnabledKey = 'firebase_push_enabled_v1';
  static const _pushDecidedAtKey = 'firebase_push_decided_at_v1';
  static const _crashEnabledKey = 'firebase_crash_diagnostics_enabled_v1';
  static const _crashDecidedAtKey = 'firebase_crash_diagnostics_decided_at_v1';
  static const _decisionVersionKey = 'firebase_services_decision_version_v1';
  static const _pushCleanupPendingKey =
      'firebase_push_backend_cleanup_pending_v1';
  static const _pushCleanupOwnerTokenKey =
      'firebase_push_backend_cleanup_owner_token_v1';
  static const _pushLocalCleanupPendingKey =
      'firebase_push_local_cleanup_pending_v1';
  static const _installationCleanupPendingKey =
      'firebase_installation_cleanup_pending_v1';

  static Future<FirebaseServicePreferences> read() async {
    final prefs = await SharedPreferences.getInstance();
    return FirebaseServicePreferences(
      pushEnabled: prefs.getBool(_pushEnabledKey) ?? false,
      crashDiagnosticsEnabled: prefs.getBool(_crashEnabledKey) ?? false,
      pushBackendCleanupPending: prefs.getBool(_pushCleanupPendingKey) ?? false,
      pushBackendCleanupOwnerToken: prefs.getString(_pushCleanupOwnerTokenKey),
      pushLocalCleanupPending:
          prefs.getBool(_pushLocalCleanupPendingKey) ?? false,
      installationCleanupPending:
          prefs.getBool(_installationCleanupPendingKey) ?? false,
    );
  }

  static Future<void> setPushEnabled(bool enabled,
      {DateTime? decidedAt}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_pushEnabledKey, enabled);
    await prefs.setString(
      _pushDecidedAtKey,
      (decidedAt ?? DateTime.now()).toUtc().toIso8601String(),
    );
    await prefs.setString(_decisionVersionKey, decisionVersion);
  }

  static Future<void> setCrashDiagnosticsEnabled(
    bool enabled, {
    DateTime? decidedAt,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_crashEnabledKey, enabled);
    await prefs.setString(
      _crashDecidedAtKey,
      (decidedAt ?? DateTime.now()).toUtc().toIso8601String(),
    );
    await prefs.setString(_decisionVersionKey, decisionVersion);
  }

  static Future<void> setPushBackendCleanupPending(
    bool pending, {
    String? ownerToken,
  }) async {
    final normalizedOwnerToken = ownerToken?.trim();
    if (pending &&
        (normalizedOwnerToken == null || normalizedOwnerToken.isEmpty)) {
      throw ArgumentError.value(
        ownerToken,
        'ownerToken',
        'A pending backend cleanup must belong to one exact session.',
      );
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_pushCleanupPendingKey, pending);
    if (pending) {
      await prefs.setString(_pushCleanupOwnerTokenKey, normalizedOwnerToken!);
    } else {
      await prefs.remove(_pushCleanupOwnerTokenKey);
    }
  }

  static Future<void> setPushLocalCleanupPending(bool pending) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_pushLocalCleanupPendingKey, pending);
  }

  static Future<void> setInstallationCleanupPending(bool pending) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_installationCleanupPendingKey, pending);
  }
}
