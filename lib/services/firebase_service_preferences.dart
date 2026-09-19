import 'package:shared_preferences/shared_preferences.dart';

class FirebaseServicePreferences {
  final bool pushEnabled;
  final bool crashDiagnosticsEnabled;
  final bool pushBackendCleanupPending;
  final List<String> pushBackendCleanupOwnerTokens;
  final bool pushLocalCleanupPending;
  final bool installationCleanupPending;
  final bool crashDiagnosticsCleanupPending;

  const FirebaseServicePreferences({
    required this.pushEnabled,
    required this.crashDiagnosticsEnabled,
    required this.pushBackendCleanupPending,
    required this.pushBackendCleanupOwnerTokens,
    required this.pushLocalCleanupPending,
    required this.installationCleanupPending,
    required this.crashDiagnosticsCleanupPending,
  });

  String? get pushBackendCleanupOwnerToken =>
      pushBackendCleanupOwnerTokens.isEmpty
          ? null
          : pushBackendCleanupOwnerTokens.first;

  static const defaults = FirebaseServicePreferences(
    pushEnabled: false,
    crashDiagnosticsEnabled: false,
    pushBackendCleanupPending: false,
    pushBackendCleanupOwnerTokens: [],
    pushLocalCleanupPending: false,
    installationCleanupPending: false,
    crashDiagnosticsCleanupPending: false,
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
  static const _pushCleanupOwnerTokensKey =
      'firebase_push_backend_cleanup_owner_tokens_v2';
  static const _pushLocalCleanupPendingKey =
      'firebase_push_local_cleanup_pending_v1';
  static const _installationCleanupPendingKey =
      'firebase_installation_cleanup_pending_v1';
  static const _crashCleanupPendingKey =
      'firebase_crash_diagnostics_cleanup_pending_v1';

  static Future<FirebaseServicePreferences> read() async {
    final prefs = await SharedPreferences.getInstance();
    final legacyOwner = prefs.getString(_pushCleanupOwnerTokenKey);
    final owners = prefs.getStringList(_pushCleanupOwnerTokensKey) ??
        (legacyOwner == null ? const <String>[] : <String>[legacyOwner]);
    return FirebaseServicePreferences(
      pushEnabled: prefs.getBool(_pushEnabledKey) ?? false,
      crashDiagnosticsEnabled: prefs.getBool(_crashEnabledKey) ?? false,
      pushBackendCleanupPending:
          (prefs.getBool(_pushCleanupPendingKey) ?? false) || owners.isNotEmpty,
      pushBackendCleanupOwnerTokens: List.unmodifiable(owners),
      pushLocalCleanupPending:
          prefs.getBool(_pushLocalCleanupPendingKey) ?? false,
      installationCleanupPending:
          prefs.getBool(_installationCleanupPendingKey) ?? false,
      crashDiagnosticsCleanupPending:
          prefs.getBool(_crashCleanupPendingKey) ?? false,
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

  static Future<void> setCrashDiagnosticsCleanupPending(bool pending) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_crashCleanupPendingKey, pending);
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
    final legacyOwner = prefs.getString(_pushCleanupOwnerTokenKey);
    final owners = prefs.getStringList(_pushCleanupOwnerTokensKey) ??
        (legacyOwner == null ? <String>[] : <String>[legacyOwner]);
    if (pending) {
      if (!owners.contains(normalizedOwnerToken)) {
        owners.add(normalizedOwnerToken!);
      }
      await prefs.setStringList(_pushCleanupOwnerTokensKey, owners);
      await prefs.setBool(_pushCleanupPendingKey, owners.isNotEmpty);
    } else if (normalizedOwnerToken != null &&
        normalizedOwnerToken.isNotEmpty) {
      owners.remove(normalizedOwnerToken);
      await prefs.setStringList(_pushCleanupOwnerTokensKey, owners);
      await prefs.setBool(_pushCleanupPendingKey, owners.isNotEmpty);
    } else {
      await prefs.remove(_pushCleanupOwnerTokensKey);
      await prefs.remove(_pushCleanupOwnerTokenKey);
      await prefs.setBool(_pushCleanupPendingKey, false);
    }
    // Keep the legacy key absent after the first write; read() still migrates
    // installations that have not written the v2 owner set yet.
    await prefs.remove(_pushCleanupOwnerTokenKey);
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
