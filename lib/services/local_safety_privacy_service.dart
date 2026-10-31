import 'dart:async';
import 'dart:collection';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'local_principal_scope.dart';
import 'shared_persistence_sync.dart';

class _QueuedSafetyMutation {
  final Future<Object?> Function() operation;
  final void Function(Object? value) complete;
  final void Function(Object error, StackTrace stackTrace) completeError;

  const _QueuedSafetyMutation({
    required this.operation,
    required this.complete,
    required this.completeError,
  });
}

class _SafetyMutationQueue {
  final Queue<_QueuedSafetyMutation> _pending = Queue<_QueuedSafetyMutation>();
  bool _running = false;

  Future<T> run<T>(Future<T> Function() operation) {
    final result = Completer<T>();
    _pending.add(_QueuedSafetyMutation(
      operation: () async => operation(),
      complete: (value) => result.complete(value as T),
      completeError: result.completeError,
    ));
    _startIfIdle();
    return result.future;
  }

  void _startIfIdle() {
    if (_running) return;
    _running = true;
    unawaited(_drain());
  }

  Future<void> _drain() async {
    while (_pending.isNotEmpty) {
      final queued = _pending.removeFirst();
      Object? value;
      Object? failure;
      StackTrace? failureStack;
      try {
        value = await queued.operation();
      } catch (error, stackTrace) {
        failure = error;
        failureStack = stackTrace;
      }
      final becameIdle = _pending.isEmpty;
      if (becameIdle) _running = false;
      if (failure != null) {
        queued.completeError(failure, failureStack!);
      } else {
        queued.complete(value);
      }
      if (becameIdle) {
        if (_pending.isNotEmpty) _startIfIdle();
        return;
      }
    }
    _running = false;
  }
}

class _SafetyPrivacyState {
  final int revision;
  final List<String> blockedUserIds;
  final List<Map<String, dynamic>> reports;
  final List<String> hiddenItemIds;
  final List<Map<String, dynamic>> feedbackLog;
  final Map<String, dynamic> feedbackProfile;
  final List<String> mutedThreadIds;
  final Map<String, dynamic>? messagesSettings;
  final Map<String, dynamic>? notificationPreferences;

  const _SafetyPrivacyState({
    this.revision = 0,
    this.blockedUserIds = const <String>[],
    this.reports = const <Map<String, dynamic>>[],
    this.hiddenItemIds = const <String>[],
    this.feedbackLog = const <Map<String, dynamic>>[],
    this.feedbackProfile = const <String, dynamic>{},
    this.mutedThreadIds = const <String>[],
    this.messagesSettings,
    this.notificationPreferences,
  });

  _SafetyPrivacyState copyWith({
    int? revision,
    List<String>? blockedUserIds,
    List<Map<String, dynamic>>? reports,
    List<String>? hiddenItemIds,
    List<Map<String, dynamic>>? feedbackLog,
    Map<String, dynamic>? feedbackProfile,
    List<String>? mutedThreadIds,
    Map<String, dynamic>? messagesSettings,
    bool clearMessagesSettings = false,
    Map<String, dynamic>? notificationPreferences,
    bool clearNotificationPreferences = false,
  }) =>
      _SafetyPrivacyState(
        revision: revision ?? this.revision,
        blockedUserIds: blockedUserIds ?? this.blockedUserIds,
        reports: reports ?? this.reports,
        hiddenItemIds: hiddenItemIds ?? this.hiddenItemIds,
        feedbackLog: feedbackLog ?? this.feedbackLog,
        feedbackProfile: feedbackProfile ?? this.feedbackProfile,
        mutedThreadIds: mutedThreadIds ?? this.mutedThreadIds,
        messagesSettings: clearMessagesSettings
            ? null
            : messagesSettings ?? this.messagesSettings,
        notificationPreferences: clearNotificationPreferences
            ? null
            : notificationPreferences ?? this.notificationPreferences,
      );
}

class _SafetyPrivacyRegistry {
  final int revision;
  final Map<String, _SafetyPrivacyState> principals;
  final Map<String, dynamic> quarantinedPrincipals;
  final bool legacyGuestQuarantined;

  _SafetyPrivacyRegistry({
    required this.revision,
    required this.principals,
    Map<String, dynamic> quarantinedPrincipals = const <String, dynamic>{},
    this.legacyGuestQuarantined = false,
  }) : quarantinedPrincipals = Map<String, dynamic>.from(
          quarantinedPrincipals,
        );
}

/// Principal-scoped local fallback for safety and privacy-relevant state.
///
/// This remains a local/QA fallback. A release backend stays authoritative.
class LocalSafetyPrivacyService {
  static const String storageKey = 'local_safety_privacy_state_v1';
  static const String _legacyBlockedKey = 'blocked_user_ids_v1';
  static const String _legacyReportsKey = 'user_reports_v1';
  static const String _legacyHiddenKey = 'hidden_listing_ids_v1';
  static const String _legacyFeedbackLogKey = 'listing_feedback_log_v1';
  static const String _legacyFeedbackProfileKey =
      'listing_feedback_reason_profile_v1';
  static const String _legacyMutedThreadsKey = 'muted_message_threads_v1';
  static const String _legacyMessagesSettingsKey = 'messages_settings_v1';
  static const String _legacyNotificationPreferencesKey =
      'notification_preferences_v2';
  static const int _maxBlockedUsers = 1000;
  static const int _maxReports = 200;
  static const int _maxHiddenItems = 1000;
  static const int _maxFeedbackEntries = 1000;
  static const int _maxMutedThreads = 1000;
  static final _SafetyMutationQueue _queue = _SafetyMutationQueue();

  static Future<T> _runForCurrent<T>(
    Future<T> Function(LocalPrincipalIdentity principal) operation,
  ) async {
    final principal = await LocalPrincipalScope.current();
    return _runForPrincipal(principal, operation);
  }

  static Future<T> _runForPrincipal<T>(
    LocalPrincipalIdentity principal,
    Future<T> Function(LocalPrincipalIdentity principal) operation,
  ) {
    if (!_validPrincipalToken(principal.token)) {
      throw StateError('Ungültiger lokaler Kontobereich.');
    }
    return _queue.run(() => operation(principal));
  }

  static bool _validPrincipalToken(String token) =>
      token == LocalPrincipalIdentity.guest.token ||
      RegExp(r'^p_[a-f0-9]{64}$').hasMatch(token);

  static List<String> _decodeStringList(
    dynamic raw, {
    required String label,
    required int maximum,
  }) {
    if (raw is! List || raw.length > maximum) {
      throw FormatException('Ungültiger lokaler $label-Speicher.');
    }
    final result = <String>[];
    final seen = <String>{};
    for (final entry in raw) {
      if (entry is! String) {
        throw FormatException('Ungültiger lokaler $label-Eintrag.');
      }
      final value = entry.trim();
      if (value.isEmpty || value.length > 300 || !seen.add(value)) {
        throw FormatException('Ungültiger lokaler $label-Eintrag.');
      }
      result.add(value);
    }
    result.sort();
    return result;
  }

  static bool _jsonSafe(dynamic value, [int depth = 0]) {
    if (depth > 12) return false;
    if (value == null || value is bool || value is num || value is String) {
      return value is! String || value.length <= 8000;
    }
    if (value is List) {
      return value.length <= 1000 &&
          value.every((entry) => _jsonSafe(entry, depth + 1));
    }
    if (value is Map) {
      return value.length <= 200 &&
          value.entries.every((entry) =>
              entry.key is String &&
              (entry.key as String).length <= 200 &&
              _jsonSafe(entry.value, depth + 1));
    }
    return false;
  }

  static List<Map<String, dynamic>> _decodeMapList(
    dynamic raw, {
    required String label,
    required int maximum,
  }) {
    if (raw is! List || raw.length > maximum) {
      throw FormatException('Ungültiger lokaler $label-Speicher.');
    }
    return raw.map((entry) {
      if (entry is! Map) {
        throw FormatException('Ungültiger lokaler $label-Eintrag.');
      }
      final value = Map<String, dynamic>.from(entry);
      if (!_jsonSafe(value)) {
        throw FormatException('Ungültiger lokaler $label-Eintrag.');
      }
      return value;
    }).toList(growable: false);
  }

  static _SafetyPrivacyState _decodeBucket(dynamic raw) {
    if (raw is! Map) {
      throw const FormatException('Ungültiger lokaler Sicherheitsbereich.');
    }
    final map = Map<String, dynamic>.from(raw);
    final revision = map['revision'];
    final profileRaw = map['feedbackProfile'];
    final messagesSettingsRaw = map['messagesSettings'];
    final notificationPreferencesRaw = map['notificationPreferences'];
    if (revision is! int ||
        revision < 0 ||
        profileRaw is! Map ||
        !_jsonSafe(profileRaw) ||
        (messagesSettingsRaw != null &&
            (messagesSettingsRaw is! Map || !_jsonSafe(messagesSettingsRaw))) ||
        (notificationPreferencesRaw != null &&
            (notificationPreferencesRaw is! Map ||
                !_jsonSafe(notificationPreferencesRaw)))) {
      throw const FormatException('Ungültiger lokaler Sicherheitsbereich.');
    }
    return _SafetyPrivacyState(
      revision: revision,
      blockedUserIds: _decodeStringList(
        map['blockedUserIds'],
        label: 'Blocklisten',
        maximum: _maxBlockedUsers,
      ),
      reports: _decodeMapList(
        map['reports'],
        label: 'Meldungs',
        maximum: _maxReports,
      ),
      hiddenItemIds: _decodeStringList(
        map['hiddenItemIds'],
        label: 'Ausblendungs',
        maximum: _maxHiddenItems,
      ),
      feedbackLog: _decodeMapList(
        map['feedbackLog'],
        label: 'Feedback',
        maximum: _maxFeedbackEntries,
      ),
      feedbackProfile: Map<String, dynamic>.from(profileRaw),
      mutedThreadIds: _decodeStringList(
        map['mutedThreadIds'],
        label: 'Stummschaltungs',
        maximum: _maxMutedThreads,
      ),
      messagesSettings: messagesSettingsRaw == null
          ? null
          : Map<String, dynamic>.from(messagesSettingsRaw as Map),
      notificationPreferences: notificationPreferencesRaw == null
          ? null
          : Map<String, dynamic>.from(notificationPreferencesRaw as Map),
    );
  }

  static _SafetyPrivacyRegistry _readRegistry(SharedPreferences prefs) {
    final raw = prefs.getString(storageKey);
    if (raw == null || raw.isEmpty) {
      return _SafetyPrivacyRegistry(revision: 0, principals: {});
    }
    final dynamic decoded;
    try {
      decoded = jsonDecode(raw);
    } catch (_) {
      throw const FormatException(
        'Der lokale Sicherheits- und Datenschutzspeicher ist beschädigt.',
      );
    }
    if (decoded is! Map) {
      throw const FormatException(
        'Der lokale Sicherheits- und Datenschutzspeicher ist beschädigt.',
      );
    }
    final map = Map<String, dynamic>.from(decoded);
    final revision = map['revision'];
    final rawPrincipals = map['principals'];
    if (map['schemaVersion'] != 1 ||
        revision is! int ||
        revision < 0 ||
        rawPrincipals is! Map ||
        map['legacyGuestQuarantined'] is! bool) {
      throw const FormatException(
        'Der lokale Sicherheits- und Datenschutzspeicher ist beschädigt.',
      );
    }
    final principals = <String, _SafetyPrivacyState>{};
    final quarantined = <String, dynamic>{};
    for (final entry in rawPrincipals.entries) {
      final token = entry.key.toString();
      if (!_validPrincipalToken(token)) {
        throw const FormatException(
          'Der lokale Sicherheits- und Datenschutzspeicher ist beschädigt.',
        );
      }
      try {
        principals[token] = _decodeBucket(entry.value);
      } on FormatException {
        quarantined[token] = entry.value;
      }
    }
    if (principals.length + quarantined.length >
        LocalPrincipalScope.maxRetainedPrincipals) {
      throw const FormatException(
        'Der lokale Sicherheits- und Datenschutzspeicher ist zu groß.',
      );
    }
    return _SafetyPrivacyRegistry(
      revision: revision,
      principals: principals,
      quarantinedPrincipals: quarantined,
      legacyGuestQuarantined: map['legacyGuestQuarantined'] as bool,
    );
  }

  static Map<String, dynamic> _bucketJson(_SafetyPrivacyState state) =>
      <String, dynamic>{
        'revision': state.revision,
        'blockedUserIds': state.blockedUserIds,
        'reports': state.reports,
        'hiddenItemIds': state.hiddenItemIds,
        'feedbackLog': state.feedbackLog,
        'feedbackProfile': state.feedbackProfile,
        'mutedThreadIds': state.mutedThreadIds,
        'messagesSettings': state.messagesSettings,
        'notificationPreferences': state.notificationPreferences,
      };

  static Future<void> _writeRegistry(
    SharedPreferences prefs,
    _SafetyPrivacyRegistry registry,
  ) async {
    final encoded = jsonEncode(<String, dynamic>{
      'schemaVersion': 1,
      'revision': registry.revision,
      'legacyGuestQuarantined': registry.legacyGuestQuarantined,
      'principals': <String, dynamic>{
        for (final entry in registry.principals.entries)
          entry.key: _bucketJson(entry.value),
        for (final entry in registry.quarantinedPrincipals.entries)
          entry.key: entry.value,
      },
    });
    final accepted = await prefs.setString(storageKey, encoded);
    if (!accepted || prefs.getString(storageKey) != encoded) {
      throw StateError(
        'Der lokale Sicherheits- und Datenschutzspeicher konnte nicht bestätigt werden.',
      );
    }
  }

  static bool _hasLegacyGuestState(SharedPreferences prefs) =>
      prefs.containsKey(_legacyBlockedKey) ||
      prefs.containsKey(_legacyReportsKey) ||
      prefs.containsKey(_legacyHiddenKey) ||
      prefs.containsKey(_legacyFeedbackLogKey) ||
      prefs.containsKey(_legacyFeedbackProfileKey) ||
      prefs.containsKey(_legacyMessagesSettingsKey) ||
      prefs.containsKey(_legacyNotificationPreferencesKey);

  static _SafetyPrivacyState _readLegacyGuestState(
    SharedPreferences prefs,
  ) {
    List<String> stringListPreference(String key, String label, int maximum) {
      if (!prefs.containsKey(key)) return <String>[];
      final value = prefs.getStringList(key);
      return _decodeStringList(value, label: label, maximum: maximum);
    }

    List<Map<String, dynamic>> mapListPreference(
      String key,
      String label,
      int maximum,
    ) {
      if (!prefs.containsKey(key)) return <Map<String, dynamic>>[];
      final entries = prefs.getStringList(key);
      if (entries == null || entries.length > maximum) {
        throw FormatException('Ungültiger lokaler $label-Speicher.');
      }
      final decoded = entries.map((entry) {
        final value = jsonDecode(entry);
        if (value is! Map) {
          throw FormatException('Ungültiger lokaler $label-Eintrag.');
        }
        return Map<String, dynamic>.from(value);
      }).toList(growable: false);
      return _decodeMapList(decoded, label: label, maximum: maximum);
    }

    final blockedRaw = prefs.getString(_legacyBlockedKey);
    final blocked = blockedRaw == null
        ? <String>[]
        : _decodeStringList(
            jsonDecode(blockedRaw),
            label: 'Blocklisten',
            maximum: _maxBlockedUsers,
          );
    final reportsRaw = prefs.getString(_legacyReportsKey);
    final reports = reportsRaw == null
        ? <Map<String, dynamic>>[]
        : _decodeMapList(
            jsonDecode(reportsRaw),
            label: 'Meldungs',
            maximum: _maxReports,
          );
    final profileRaw = prefs.getString(_legacyFeedbackProfileKey);
    final dynamic profileDecoded =
        profileRaw == null ? <String, dynamic>{} : jsonDecode(profileRaw);
    if (profileDecoded is! Map || !_jsonSafe(profileDecoded)) {
      throw const FormatException('Ungültiges lokales Feedbackprofil.');
    }
    Map<String, dynamic>? optionalMapPreference(String key, String label) {
      final raw = prefs.getString(key);
      if (raw == null) return null;
      final decoded = jsonDecode(raw);
      if (decoded is! Map || !_jsonSafe(decoded)) {
        throw FormatException('Ungültige lokale $label-Einstellung.');
      }
      return Map<String, dynamic>.from(decoded);
    }

    return _SafetyPrivacyState(
      revision: 0,
      blockedUserIds: blocked,
      reports: reports,
      hiddenItemIds: stringListPreference(
        _legacyHiddenKey,
        'Ausblendungs',
        _maxHiddenItems,
      ),
      feedbackLog: mapListPreference(
        _legacyFeedbackLogKey,
        'Feedback',
        _maxFeedbackEntries,
      ),
      feedbackProfile: Map<String, dynamic>.from(profileDecoded),
      messagesSettings: optionalMapPreference(
        _legacyMessagesSettingsKey,
        'Nachrichten',
      ),
      notificationPreferences: optionalMapPreference(
        _legacyNotificationPreferencesKey,
        'Benachrichtigungs',
      ),
    );
  }

  static Future<_SafetyPrivacyState> _readState(
    SharedPreferences prefs,
    LocalPrincipalIdentity principal,
  ) async {
    final registry = _readRegistry(prefs);
    if (registry.quarantinedPrincipals.containsKey(principal.token)) {
      throw const FormatException(
        'Der lokale Sicherheitsbereich dieses Kontos ist beschädigt.',
      );
    }
    final current = registry.principals[principal.token];
    if (current != null) return current;
    if (principal.authenticated || !_hasLegacyGuestState(prefs)) {
      return const _SafetyPrivacyState();
    }
    if (registry.legacyGuestQuarantined) {
      throw const FormatException(
        'Nicht zugeordnete lokale Sicherheitsdaten sind beschädigt.',
      );
    }
    try {
      final migrated = _readLegacyGuestState(prefs);
      await _writeState(prefs, principal, migrated);
      return migrated;
    } on FormatException {
      await _writeRegistry(
        prefs,
        _SafetyPrivacyRegistry(
          revision: registry.revision + 1,
          principals: registry.principals,
          quarantinedPrincipals: registry.quarantinedPrincipals,
          legacyGuestQuarantined: true,
        ),
      );
      rethrow;
    }
  }

  static Future<void> _writeLegacyGuestMirrors(
    SharedPreferences prefs,
    _SafetyPrivacyState state,
  ) async {
    await prefs.setString(
      _legacyBlockedKey,
      jsonEncode(state.blockedUserIds),
    );
    await prefs.setString(
      _legacyReportsKey,
      jsonEncode(state.reports),
    );
    await prefs.setStringList(_legacyHiddenKey, state.hiddenItemIds);
    await prefs.setStringList(
      _legacyFeedbackLogKey,
      state.feedbackLog.map(jsonEncode).toList(growable: false),
    );
    await prefs.setString(
      _legacyFeedbackProfileKey,
      jsonEncode(state.feedbackProfile),
    );
    if (state.messagesSettings == null) {
      await prefs.remove(_legacyMessagesSettingsKey);
    } else {
      await prefs.setString(
        _legacyMessagesSettingsKey,
        jsonEncode(state.messagesSettings),
      );
    }
    if (state.notificationPreferences == null) {
      await prefs.remove(_legacyNotificationPreferencesKey);
    } else {
      await prefs.setString(
        _legacyNotificationPreferencesKey,
        jsonEncode(state.notificationPreferences),
      );
    }
  }

  static Future<void> _writeState(
    SharedPreferences prefs,
    LocalPrincipalIdentity principal,
    _SafetyPrivacyState state,
  ) async {
    final registry = _readRegistry(prefs);
    final exists = registry.principals.containsKey(principal.token) ||
        registry.quarantinedPrincipals.containsKey(principal.token);
    if (!exists &&
        registry.principals.length + registry.quarantinedPrincipals.length >=
            LocalPrincipalScope.maxRetainedPrincipals) {
      throw StateError(
        'Auf diesem Gerät können keine weiteren lokalen Kontobereiche angelegt werden.',
      );
    }
    registry.quarantinedPrincipals.remove(principal.token);
    registry.principals[principal.token] = state;
    await _writeRegistry(
      prefs,
      _SafetyPrivacyRegistry(
        revision: registry.revision + 1,
        principals: registry.principals,
        quarantinedPrincipals: registry.quarantinedPrincipals,
        legacyGuestQuarantined: registry.legacyGuestQuarantined,
      ),
    );
    try {
      if (!principal.authenticated) {
        await _writeLegacyGuestMirrors(prefs, state);
      }
    } finally {
      // The canonical write above is already verified. Open surfaces must
      // refresh even when a non-canonical guest compatibility mirror fails.
      SharedPersistenceSync.notify(
        SharedPersistenceSync.localSafetyPrivacyStateKey,
      );
    }
  }

  static Future<List<String>> getBlockedUserIds() =>
      _runForCurrent((principal) async {
        final prefs = await SharedPreferences.getInstance();
        return List<String>.from(
          (await _readState(prefs, principal)).blockedUserIds,
        );
      });

  static Future<List<String>> getBlockedUserIdsForPrincipal(
    LocalPrincipalIdentity principal,
  ) =>
      _runForPrincipal(principal, (principal) async {
        final prefs = await SharedPreferences.getInstance();
        return List<String>.from(
          (await _readState(prefs, principal)).blockedUserIds,
        );
      });

  static Future<void> setBlockedUserIds(List<String> ids) =>
      _runForCurrent((principal) async {
        final cleaned = _decodeStringList(
          ids,
          label: 'Blocklisten',
          maximum: _maxBlockedUsers,
        );
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        // Remote block-list reads are part of catalog loading. Persisting and
        // notifying an identical snapshot would schedule the catalog again,
        // causing a self-sustaining refresh loop on authenticated Explore.
        // Keep a real change observable, but make a read-through sync
        // idempotent.
        if (_sameStrings(state.blockedUserIds, cleaned)) return;
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            blockedUserIds: cleaned,
          ),
        );
      });

  static Future<void> setBlockedUserIdsForPrincipal(
    LocalPrincipalIdentity principal,
    List<String> ids,
  ) =>
      _runForPrincipal(principal, (principal) async {
        final cleaned = _decodeStringList(
          ids,
          label: 'Blocklisten',
          maximum: _maxBlockedUsers,
        );
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        if (_sameStrings(state.blockedUserIds, cleaned)) return;
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            blockedUserIds: cleaned,
          ),
        );
      });

  static bool _sameStrings(List<String> left, List<String> right) {
    if (left.length != right.length) return false;
    for (var index = 0; index < left.length; index += 1) {
      if (left[index] != right[index]) return false;
    }
    return true;
  }

  static Future<void> blockUser(String userId) =>
      _runForCurrent((principal) async {
        final normalized = userId.trim();
        if (normalized.isEmpty || normalized.length > 300) {
          throw ArgumentError.value(userId, 'userId', 'Ungültiger Nutzer');
        }
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        final next = <String>{...state.blockedUserIds, normalized}.toList()
          ..sort();
        if (next.length > _maxBlockedUsers) {
          throw StateError('Zu viele lokal blockierte Nutzer.');
        }
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            blockedUserIds: next,
          ),
        );
      });

  static Future<void> blockUserForPrincipal(
    LocalPrincipalIdentity principal,
    String userId,
  ) =>
      _runForPrincipal(principal, (principal) async {
        final normalized = userId.trim();
        if (normalized.isEmpty || normalized.length > 300) {
          throw ArgumentError.value(userId, 'userId', 'Ungültiger Nutzer');
        }
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        final next = <String>{...state.blockedUserIds, normalized}.toList()
          ..sort();
        if (next.length > _maxBlockedUsers) {
          throw StateError('Zu viele lokal blockierte Nutzer.');
        }
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            blockedUserIds: next,
          ),
        );
      });

  static Future<void> unblockUser(String userId) =>
      _runForCurrent((principal) async {
        final normalized = userId.trim();
        if (normalized.isEmpty) return;
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        if (!state.blockedUserIds.contains(normalized)) return;
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            blockedUserIds: state.blockedUserIds
                .where((entry) => entry != normalized)
                .toList(growable: false),
          ),
        );
      });

  static Future<void> unblockUserForPrincipal(
    LocalPrincipalIdentity principal,
    String userId,
  ) =>
      _runForPrincipal(principal, (principal) async {
        final normalized = userId.trim();
        if (normalized.isEmpty) return;
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        if (!state.blockedUserIds.contains(normalized)) return;
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            blockedUserIds: state.blockedUserIds
                .where((entry) => entry != normalized)
                .toList(growable: false),
          ),
        );
      });

  static Future<Set<String>> getHiddenItemIds() =>
      _runForCurrent((principal) async {
        final prefs = await SharedPreferences.getInstance();
        return (await _readState(prefs, principal)).hiddenItemIds.toSet();
      });

  static Future<void> hideItem(String itemId) =>
      _runForCurrent((principal) async {
        final normalized = itemId.trim();
        if (normalized.isEmpty || normalized.length > 300) {
          throw ArgumentError.value(itemId, 'itemId', 'Ungültige Anzeige');
        }
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        final next = <String>{...state.hiddenItemIds, normalized}.toList()
          ..sort();
        if (next.length > _maxHiddenItems) {
          throw StateError('Zu viele lokal ausgeblendete Anzeigen.');
        }
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            hiddenItemIds: next,
          ),
        );
      });

  static Future<void> recordFeedback({
    required String itemId,
    required String reason,
    String? categoryId,
    double? pricePerDay,
    String? city,
    bool hideOnlyThisItem = false,
  }) =>
      _runForCurrent((principal) async {
        final normalizedItem = itemId.trim();
        final normalizedReason = reason.trim();
        if (normalizedItem.isEmpty ||
            normalizedItem.length > 300 ||
            normalizedReason.isEmpty ||
            normalizedReason.length > 100 ||
            (pricePerDay != null &&
                (!pricePerDay.isFinite || pricePerDay < 0))) {
          throw ArgumentError('Ungültiges lokales Anzeigenfeedback.');
        }
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        if (state.feedbackLog.length >= _maxFeedbackEntries) {
          throw StateError('Zu viele lokale Feedbackeinträge.');
        }
        final entry = <String, dynamic>{
          'itemId': normalizedItem,
          'reason': normalizedReason,
          'categoryId': categoryId?.trim(),
          'pricePerDay': pricePerDay,
          'city': city?.trim(),
          'hideOnlyThisItem': hideOnlyThisItem,
          'recordedAt': DateTime.now().toUtc().toIso8601String(),
        };
        final profile = Map<String, dynamic>.from(state.feedbackProfile);
        final reasonCounts = Map<String, dynamic>.from(
          profile['reasonCounts'] as Map? ?? const <String, dynamic>{},
        );
        reasonCounts[normalizedReason] =
            (reasonCounts[normalizedReason] as int? ?? 0) + 1;
        profile['reasonCounts'] = reasonCounts;
        final normalizedCategory = categoryId?.trim() ?? '';
        if (normalizedCategory.isNotEmpty) {
          final signals = Map<String, dynamic>.from(
            profile['categorySignals'] as Map? ?? const <String, dynamic>{},
          );
          signals[normalizedCategory] =
              (signals[normalizedCategory] as int? ?? 0) +
                  (normalizedReason == 'not_interesting' ? 2 : 1);
          profile['categorySignals'] = signals;
        }
        if (normalizedReason == 'too_far') {
          profile['distanceSensitivityDownvotes'] =
              (profile['distanceSensitivityDownvotes'] as int? ?? 0) + 1;
        }
        if (normalizedReason == 'too_expensive') {
          profile['priceSensitivityDownvotes'] =
              (profile['priceSensitivityDownvotes'] as int? ?? 0) + 1;
          if (pricePerDay != null) {
            final samples = List<num>.from(
              profile['expensivePriceSamples'] as List? ?? const <num>[],
            )..add(pricePerDay);
            profile['expensivePriceSamples'] = samples;
          }
        }
        if (normalizedReason == 'already_have') {
          profile['similarityDownvotes'] =
              (profile['similarityDownvotes'] as int? ?? 0) + 1;
        }
        if (normalizedReason == 'seen_too_often') {
          profile['frequencyDownvotes'] =
              (profile['frequencyDownvotes'] as int? ?? 0) + 1;
        }
        final hidden = <String>{...state.hiddenItemIds};
        if (hideOnlyThisItem) hidden.add(normalizedItem);
        if (hidden.length > _maxHiddenItems || !_jsonSafe(profile)) {
          throw StateError('Das lokale Feedbackprofil ist zu groß.');
        }
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            feedbackLog: <Map<String, dynamic>>[
              ...state.feedbackLog,
              entry,
            ],
            feedbackProfile: profile,
            hiddenItemIds: hidden.toList()..sort(),
          ),
        );
      });

  static Map<String, dynamic> _newReport({
    required String reporterUserId,
    required String reportedUserId,
    required String reasonCode,
    String targetType = 'user',
    String? targetId,
    String details = '',
    List<String> evidenceNames = const <String>[],
    String? reference,
  }) {
    final reporter = reporterUserId.trim();
    final reported = reportedUserId.trim();
    final reason = reasonCode.trim();
    final normalizedTargetType = targetType.trim();
    final normalizedTargetId = (targetId ?? reportedUserId).trim();
    final normalizedDetails = details.trim();
    if (reporter.isEmpty ||
        reporter.length > 300 ||
        reported.isEmpty ||
        reported.length > 300 ||
        reason.isEmpty ||
        reason.length > 100 ||
        !const <String>{'user', 'listing'}.contains(normalizedTargetType) ||
        normalizedTargetId.isEmpty ||
        normalizedTargetId.length > 300 ||
        normalizedDetails.length > 4000 ||
        evidenceNames.length > 10 ||
        evidenceNames.any(
          (entry) => entry.trim().isEmpty || entry.trim().length > 300,
        ) ||
        (reference?.length ?? 0) > 500) {
      throw ArgumentError('Ungültige lokale Meldung.');
    }
    final now = DateTime.now().toUtc();
    return <String, dynamic>{
      'id': 'rep_${now.microsecondsSinceEpoch}',
      'reporterUserId': reporter,
      'reportedUserId': reported,
      'targetType': normalizedTargetType,
      'targetId': normalizedTargetId,
      'reasonCode': reason,
      'details': normalizedDetails,
      'evidenceNames': evidenceNames.map((entry) => entry.trim()).toList(),
      'reference': reference?.trim(),
      'createdAt': now.toIso8601String(),
    };
  }

  static Future<void> addReport({
    required String reporterUserId,
    required String reportedUserId,
    required String reasonCode,
    String details = '',
    List<String> evidenceNames = const <String>[],
    String? reference,
  }) =>
      _runForCurrent((principal) async {
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        if (state.reports.length >= _maxReports) {
          throw StateError('Zu viele lokale Meldungen.');
        }
        final report = _newReport(
          reporterUserId: reporterUserId,
          reportedUserId: reportedUserId,
          reasonCode: reasonCode,
          details: details,
          evidenceNames: evidenceNames,
          reference: reference,
        );
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            reports: <Map<String, dynamic>>[...state.reports, report],
          ),
        );
      });

  static Future<void> addReportForPrincipal({
    required LocalPrincipalIdentity principal,
    required String reporterUserId,
    required String reportedUserId,
    required String reasonCode,
    String targetType = 'user',
    String? targetId,
    String details = '',
    List<String> evidenceNames = const <String>[],
    String? reference,
  }) =>
      _runForPrincipal(principal, (principal) async {
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        if (state.reports.length >= _maxReports) {
          throw StateError('Zu viele lokale Meldungen.');
        }
        final report = _newReport(
          reporterUserId: reporterUserId,
          reportedUserId: reportedUserId,
          reasonCode: reasonCode,
          targetType: targetType,
          targetId: targetId,
          details: details,
          evidenceNames: evidenceNames,
          reference: reference,
        );
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            reports: <Map<String, dynamic>>[...state.reports, report],
          ),
        );
      });

  static Future<void> addHarassmentReportAndBlock({
    required String reporterUserId,
    required String reportedUserId,
    String details = '',
    List<String> evidenceNames = const <String>[],
    String? reference,
  }) =>
      _runForCurrent((principal) async {
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        if (state.reports.length >= _maxReports) {
          throw StateError('Zu viele lokale Meldungen.');
        }
        final report = _newReport(
          reporterUserId: reporterUserId,
          reportedUserId: reportedUserId,
          reasonCode: 'harassment',
          details: details,
          evidenceNames: evidenceNames,
          reference: reference,
        );
        final normalizedTarget = reportedUserId.trim();
        final blocked = <String>{
          ...state.blockedUserIds,
          normalizedTarget,
        }.toList()
          ..sort();
        if (blocked.length > _maxBlockedUsers) {
          throw StateError('Zu viele lokal blockierte Nutzer.');
        }
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            reports: <Map<String, dynamic>>[...state.reports, report],
            blockedUserIds: blocked,
          ),
        );
      });

  static Future<void> addHarassmentReportAndBlockForPrincipal({
    required LocalPrincipalIdentity principal,
    required String reporterUserId,
    required String reportedUserId,
    String details = '',
    List<String> evidenceNames = const <String>[],
    String? reference,
  }) =>
      _runForPrincipal(principal, (principal) async {
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        if (state.reports.length >= _maxReports) {
          throw StateError('Zu viele lokale Meldungen.');
        }
        final report = _newReport(
          reporterUserId: reporterUserId,
          reportedUserId: reportedUserId,
          reasonCode: 'harassment',
          details: details,
          evidenceNames: evidenceNames,
          reference: reference,
        );
        final normalizedTarget = reportedUserId.trim();
        final blocked = <String>{
          ...state.blockedUserIds,
          normalizedTarget,
        }.toList()
          ..sort();
        if (blocked.length > _maxBlockedUsers) {
          throw StateError('Zu viele lokal blockierte Nutzer.');
        }
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            reports: <Map<String, dynamic>>[...state.reports, report],
            blockedUserIds: blocked,
          ),
        );
      });

  static Future<List<Map<String, dynamic>>> getReports() =>
      _runForCurrent((principal) async {
        final prefs = await SharedPreferences.getInstance();
        return (await _readState(prefs, principal))
            .reports
            .map((entry) => Map<String, dynamic>.from(entry))
            .toList(growable: false);
      });

  static Future<_SafetyPrivacyState> _migrateAttributedMutedThreads(
    SharedPreferences prefs,
    LocalPrincipalIdentity principal,
    _SafetyPrivacyState state,
    String? legacyUserId,
  ) async {
    final owner = legacyUserId?.trim() ?? '';
    final raw = prefs.getString(_legacyMutedThreadsKey);
    if (!principal.authenticated ||
        owner.isEmpty ||
        raw == null ||
        LocalPrincipalScope.tokenForUserId(owner) != principal.token) {
      return state;
    }
    final entries = _decodeStringList(
      jsonDecode(raw),
      label: 'Stummschaltungs',
      maximum: _maxMutedThreads,
    );
    final prefix = '$owner::';
    final attributed = entries
        .where((entry) => entry.startsWith(prefix))
        .map((entry) => entry.substring(prefix.length).trim())
        .where((entry) => entry.isNotEmpty)
        .toSet();
    if (attributed.isEmpty) return state;
    final nextMuted = <String>{...state.mutedThreadIds, ...attributed}.toList()
      ..sort();
    if (nextMuted.length > _maxMutedThreads) {
      throw const FormatException('Zu viele lokal stummgeschaltete Chats.');
    }
    final migrated = state.copyWith(
      revision: state.revision + 1,
      mutedThreadIds: nextMuted,
    );
    await _writeState(prefs, principal, migrated);
    final remaining =
        entries.where((entry) => !entry.startsWith(prefix)).toList();
    if (remaining.isEmpty) {
      await prefs.remove(_legacyMutedThreadsKey);
    } else {
      await prefs.setString(_legacyMutedThreadsKey, jsonEncode(remaining));
    }
    return migrated;
  }

  static Future<Set<String>> getMutedThreadIds({String? legacyUserId}) =>
      _runForCurrent((principal) async {
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        final migrated = await _migrateAttributedMutedThreads(
          prefs,
          principal,
          state,
          legacyUserId,
        );
        return migrated.mutedThreadIds.toSet();
      });

  static Future<void> setThreadMuted({
    required String threadId,
    required bool muted,
    String? legacyUserId,
  }) =>
      _runForCurrent((principal) async {
        final normalized = threadId.trim();
        if (normalized.isEmpty || normalized.length > 300) {
          throw ArgumentError.value(threadId, 'threadId', 'Ungültiger Chat');
        }
        final prefs = await SharedPreferences.getInstance();
        final state = await _migrateAttributedMutedThreads(
          prefs,
          principal,
          await _readState(prefs, principal),
          legacyUserId,
        );
        final next = <String>{...state.mutedThreadIds};
        if (muted) {
          next.add(normalized);
        } else {
          next.remove(normalized);
        }
        if (next.length > _maxMutedThreads) {
          throw StateError('Zu viele lokal stummgeschaltete Chats.');
        }
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            mutedThreadIds: next.toList()..sort(),
          ),
        );
      });

  static Future<Map<String, dynamic>?> getMessagesSettings() =>
      _runForCurrent((principal) async {
        final prefs = await SharedPreferences.getInstance();
        final value = (await _readState(prefs, principal)).messagesSettings;
        return value == null ? null : Map<String, dynamic>.from(value);
      });

  static Future<void> setMessagesSettings(Map<String, dynamic> value) =>
      _runForCurrent((principal) async {
        if (!_jsonSafe(value)) {
          throw ArgumentError('Ungültige lokale Nachrichteneinstellungen.');
        }
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            messagesSettings: Map<String, dynamic>.from(value),
          ),
        );
      });

  static Future<Map<String, dynamic>?> getNotificationPreferences() =>
      _runForCurrent((principal) async {
        final prefs = await SharedPreferences.getInstance();
        final value =
            (await _readState(prefs, principal)).notificationPreferences;
        return value == null ? null : Map<String, dynamic>.from(value);
      });

  static Future<void> setNotificationPreferences(
    Map<String, dynamic> value,
  ) =>
      _runForCurrent((principal) async {
        if (!_jsonSafe(value)) {
          throw ArgumentError(
              'Ungültige lokale Benachrichtigungseinstellungen.');
        }
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        await _writeState(
          prefs,
          principal,
          state.copyWith(
            revision: state.revision + 1,
            notificationPreferences: Map<String, dynamic>.from(value),
          ),
        );
      });

  static Future<Map<String, dynamic>> exportCurrentPrincipal() =>
      _runForCurrent((principal) async {
        final prefs = await SharedPreferences.getInstance();
        final state = await _readState(prefs, principal);
        return <String, dynamic>{
          'schemaVersion': 1,
          'scope': 'local-principal',
          'principalScope': principal.authenticated
              ? 'authenticated-account'
              : 'guest-device',
          'blockedUserIds': state.blockedUserIds,
          'reports': state.reports,
          'hiddenItemIds': state.hiddenItemIds,
          'feedbackLog': state.feedbackLog,
          'feedbackProfile': state.feedbackProfile,
          'mutedThreadIds': state.mutedThreadIds,
          'messagesSettings': state.messagesSettings,
          'notificationPreferences': state.notificationPreferences,
        };
      });

  static Future<void> clearCurrentPrincipal() =>
      _runForCurrent(_clearPrincipal);

  /// Clears one explicit opaque principal after the server confirmed account
  /// deletion. It never resolves the target through the device's current
  /// session, so a successor Account B remains untouched.
  static Future<void> clearPrincipalForConfirmedAccountDeletion(
    String userId,
  ) {
    final normalized = userId.trim();
    if (normalized.isEmpty) {
      throw ArgumentError.value(userId, 'userId');
    }
    return _queue.run(
      () => _clearPrincipal(
        LocalPrincipalIdentity(
          token: LocalPrincipalScope.tokenForUserId(normalized),
          authenticated: true,
        ),
      ),
    );
  }

  static Future<void> _clearPrincipal(
    LocalPrincipalIdentity principal,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final registry = _readRegistry(prefs);
    registry.principals.remove(principal.token);
    registry.quarantinedPrincipals.remove(principal.token);
    await _writeRegistry(
      prefs,
      _SafetyPrivacyRegistry(
        revision: registry.revision + 1,
        principals: registry.principals,
        quarantinedPrincipals: registry.quarantinedPrincipals,
        legacyGuestQuarantined:
            principal.authenticated ? registry.legacyGuestQuarantined : false,
      ),
    );
    if (!principal.authenticated) {
      for (final key in <String>[
        _legacyBlockedKey,
        _legacyReportsKey,
        _legacyHiddenKey,
        _legacyFeedbackLogKey,
        _legacyFeedbackProfileKey,
        _legacyMutedThreadsKey,
        _legacyMessagesSettingsKey,
        _legacyNotificationPreferencesKey,
      ]) {
        await prefs.remove(key);
      }
    }
    SharedPersistenceSync.notify(
      SharedPersistenceSync.localSafetyPrivacyStateKey,
    );
  }
}
