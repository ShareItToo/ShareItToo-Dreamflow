import 'package:flutter/foundation.dart' show protected;
import 'package:lendify/models/security.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';

enum PasswordChangeFailureKind {
  rejected,
  confirmedLocalFinalizationFailed,
  outcomeUnknown,
}

class PasswordChangeFailure implements Exception {
  final PasswordChangeFailureKind kind;
  final bool localSessionDefinitelyCleared;

  const PasswordChangeFailure._(
    this.kind, {
    this.localSessionDefinitelyCleared = false,
  });

  const PasswordChangeFailure.rejected()
      : this._(PasswordChangeFailureKind.rejected);

  const PasswordChangeFailure.confirmedLocalFinalizationFailed()
      : this._(PasswordChangeFailureKind.confirmedLocalFinalizationFailed);

  const PasswordChangeFailure.outcomeUnknown({
    required bool localSessionDefinitelyCleared,
  }) : this._(
          PasswordChangeFailureKind.outcomeUnknown,
          localSessionDefinitelyCleared: localSessionDefinitelyCleared,
        );
}

enum LogoutAllFailureKind {
  rejected,
  confirmedLocalFinalizationFailed,
  outcomeUnknown,
}

class LogoutAllFailure implements Exception {
  final LogoutAllFailureKind kind;
  final bool localSessionDefinitelyCleared;

  const LogoutAllFailure._(
    this.kind, {
    this.localSessionDefinitelyCleared = false,
  });

  const LogoutAllFailure.rejected() : this._(LogoutAllFailureKind.rejected);

  const LogoutAllFailure.confirmedLocalFinalizationFailed()
      : this._(LogoutAllFailureKind.confirmedLocalFinalizationFailed);

  const LogoutAllFailure.outcomeUnknown({
    required bool localSessionDefinitelyCleared,
  }) : this._(
          LogoutAllFailureKind.outcomeUnknown,
          localSessionDefinitelyCleared: localSessionDefinitelyCleared,
        );
}

enum SessionRevocationFailureKind {
  rejected,
  confirmedLocalFinalizationFailed,
  outcomeUnknown,
}

class SessionRevocationFailure implements Exception {
  final SessionRevocationFailureKind kind;
  final String targetSessionId;
  final bool invokingSessionDefinitelyCurrent;

  const SessionRevocationFailure._(
    this.kind, {
    required this.targetSessionId,
    required this.invokingSessionDefinitelyCurrent,
  });

  const SessionRevocationFailure.rejected({
    required String targetSessionId,
    required bool invokingSessionDefinitelyCurrent,
  }) : this._(
          SessionRevocationFailureKind.rejected,
          targetSessionId: targetSessionId,
          invokingSessionDefinitelyCurrent: invokingSessionDefinitelyCurrent,
        );

  const SessionRevocationFailure.confirmedLocalFinalizationFailed({
    required String targetSessionId,
    required bool invokingSessionDefinitelyCurrent,
  }) : this._(
          SessionRevocationFailureKind.confirmedLocalFinalizationFailed,
          targetSessionId: targetSessionId,
          invokingSessionDefinitelyCurrent: invokingSessionDefinitelyCurrent,
        );

  const SessionRevocationFailure.outcomeUnknown({
    required String targetSessionId,
    required bool invokingSessionDefinitelyCurrent,
  }) : this._(
          SessionRevocationFailureKind.outcomeUnknown,
          targetSessionId: targetSessionId,
          invokingSessionDefinitelyCurrent: invokingSessionDefinitelyCurrent,
        );
}

/// Server-authoritative account security controls.
///
/// The device-local fallback deliberately implements none of these controls.
/// A successful return therefore always means that the configured SIT backend
/// confirmed the operation for the exact session that invoked it.
class AccountSecurityService {
  static const int _maxSessions = 100;
  static const int _maxSessionIdLength = 80;
  static const int _maxDeviceNameLength = 160;
  static const int _maxLocationLength = 200;
  static const int _maxPasswordLength = 1024;

  const AccountSecurityService();

  bool get isAvailable => BackendConfig.enabled;

  @protected
  Future<AuthSession?> readSession() => AuthService.readSession();

  @protected
  Future<List<Map<String, dynamic>>> fetchSessions() =>
      BackendRepository.getAuthSessions();

  @protected
  Future<void> revokeRemoteSession(String sessionId) =>
      BackendRepository.revokeAuthSession(sessionId);

  @protected
  Future<void> logoutAllRemoteSessions() =>
      BackendRepository.logoutAllSessions();

  @protected
  Future<void> changeRemotePassword({
    required String currentPassword,
    required String newPassword,
  }) =>
      BackendRepository.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );

  /// UI success may be emitted only while the local auth-session key is still
  /// definitely absent after the server-confirmed action. An active,
  /// malformed, successor or unreadable session all fail closed as false.
  Future<bool> isLocalSessionDefinitelyAbsent() =>
      AuthService.isStoredSessionDefinitelyAbsent();

  @protected
  Future<bool> clearCurrentSessionIfMatches({
    required String userId,
    required String sessionId,
    required String email,
  }) =>
      AuthService.clearSessionIfMatches(
        userId: userId,
        sessionId: sessionId,
        email: email,
      );

  Future<List<SecurityDevice>> getSessions() async {
    final marker = await _requireCurrentSession();
    final raw = await fetchSessions();
    await _assertSameCurrentSession(marker);
    return _decodeSessions(raw, expectedCurrentSessionId: marker.sessionId);
  }

  Future<void> revokeSession(String sessionId) async {
    final target = sessionId.trim();
    if (target.isEmpty || target.length > _maxSessionIdLength) {
      throw ArgumentError.value(sessionId, 'sessionId');
    }
    final marker = await _requireCurrentSession();
    if (target == marker.sessionId) {
      throw StateError(
        'Die aktuelle Sitzung darf nicht als fremdes Gerät widerrufen werden.',
      );
    }
    try {
      await revokeRemoteSession(target);
    } on BackendException catch (error) {
      final principalCurrent =
          await _isInvokingSessionDefinitelyCurrent(marker);
      if (_isDefiniteSessionRevocationRejection(error)) {
        throw SessionRevocationFailure.rejected(
          targetSessionId: target,
          invokingSessionDefinitelyCurrent: principalCurrent,
        );
      }
      throw SessionRevocationFailure.outcomeUnknown(
        targetSessionId: target,
        invokingSessionDefinitelyCurrent: principalCurrent,
      );
    } catch (_) {
      throw SessionRevocationFailure.outcomeUnknown(
        targetSessionId: target,
        invokingSessionDefinitelyCurrent:
            await _isInvokingSessionDefinitelyCurrent(marker),
      );
    }
    try {
      await _assertSameCurrentSession(marker);
    } catch (_) {
      throw SessionRevocationFailure.confirmedLocalFinalizationFailed(
        targetSessionId: target,
        invokingSessionDefinitelyCurrent: false,
      );
    }
  }

  static bool _isDefiniteSessionRevocationRejection(
    BackendException error,
  ) =>
      _isExactStructuredRejection(
        error,
        operationCodes: const <int, Set<String>>{
          404: <String>{'session_not_found'},
        },
      );

  Future<bool> _isInvokingSessionDefinitelyCurrent(
    _AccountSecuritySessionMarker marker,
  ) async {
    try {
      await _assertSameCurrentSession(marker);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    if (currentPassword.isEmpty ||
        currentPassword.length > _maxPasswordLength ||
        newPassword.length < 10 ||
        newPassword.length > _maxPasswordLength) {
      throw ArgumentError('Ungültige Passwortlänge.');
    }
    final marker = await _requireCurrentSession();
    try {
      await changeRemotePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );
    } on BackendException catch (error) {
      if (_isDefinitePasswordRejection(error)) {
        throw const PasswordChangeFailure.rejected();
      }
      throw await _unknownPasswordChangeOutcome(marker);
    } catch (_) {
      throw await _unknownPasswordChangeOutcome(marker);
    }
    try {
      await _assertSameCurrentSession(marker);
      final cleared = await clearCurrentSessionIfMatches(
        userId: marker.userId,
        sessionId: marker.sessionId,
        email: marker.email,
      );
      if (!cleared || !await isLocalSessionDefinitelyAbsent()) {
        throw const PasswordChangeFailure.confirmedLocalFinalizationFailed();
      }
    } on PasswordChangeFailure {
      rethrow;
    } catch (_) {
      throw const PasswordChangeFailure.confirmedLocalFinalizationFailed();
    }
  }

  static bool _isDefinitePasswordRejection(BackendException error) =>
      _isExactStructuredRejection(
        error,
        operationCodes: const <int, Set<String>>{
          400: <String>{
            'password_too_short',
            'password_too_long',
            'password_too_weak',
          },
          401: <String>{'invalid_credentials'},
        },
      );

  Future<PasswordChangeFailure> _unknownPasswordChangeOutcome(
    _AccountSecuritySessionMarker marker,
  ) async {
    var definitelyCleared = false;
    try {
      final cleared = await clearCurrentSessionIfMatches(
        userId: marker.userId,
        sessionId: marker.sessionId,
        email: marker.email,
      );
      definitelyCleared = cleared && await isLocalSessionDefinitelyAbsent();
    } catch (_) {
      definitelyCleared = false;
    }
    return PasswordChangeFailure.outcomeUnknown(
      localSessionDefinitelyCleared: definitelyCleared,
    );
  }

  Future<void> logoutAllSessions() async {
    final marker = await _requireCurrentSession();
    try {
      await logoutAllRemoteSessions();
    } on BackendException catch (error) {
      if (_isDefiniteLogoutAllRejection(error)) {
        throw const LogoutAllFailure.rejected();
      }
      throw await _unknownLogoutAllOutcome(marker);
    } catch (_) {
      throw await _unknownLogoutAllOutcome(marker);
    }
    try {
      await _assertSameCurrentSession(marker);
      final cleared = await clearCurrentSessionIfMatches(
        userId: marker.userId,
        sessionId: marker.sessionId,
        email: marker.email,
      );
      if (!cleared || !await isLocalSessionDefinitelyAbsent()) {
        throw const LogoutAllFailure.confirmedLocalFinalizationFailed();
      }
    } on LogoutAllFailure {
      rethrow;
    } catch (_) {
      throw const LogoutAllFailure.confirmedLocalFinalizationFailed();
    }
  }

  static bool _isDefiniteLogoutAllRejection(BackendException error) =>
      _isExactStructuredRejection(error);

  static bool _isExactStructuredRejection(
    BackendException error, {
    Map<int, Set<String>> operationCodes = const <int, Set<String>>{},
  }) {
    const commonCodes = <int, Set<String>>{
      401: <String>{
        'authentication_required',
        'invalid_or_expired_session',
        'account_not_active',
      },
      429: <String>{'rate_limit_exceeded'},
    };
    return commonCodes[error.statusCode]?.contains(error.code) == true ||
        operationCodes[error.statusCode]?.contains(error.code) == true;
  }

  Future<LogoutAllFailure> _unknownLogoutAllOutcome(
    _AccountSecuritySessionMarker marker,
  ) async {
    var definitelyCleared = false;
    try {
      final cleared = await clearCurrentSessionIfMatches(
        userId: marker.userId,
        sessionId: marker.sessionId,
        email: marker.email,
      );
      definitelyCleared = cleared && await isLocalSessionDefinitelyAbsent();
    } catch (_) {
      definitelyCleared = false;
    }
    return LogoutAllFailure.outcomeUnknown(
      localSessionDefinitelyCleared: definitelyCleared,
    );
  }

  Future<_AccountSecuritySessionMarker> _requireCurrentSession() async {
    if (!isAvailable) {
      throw StateError(
        'Kontosicherheit ist ohne die serverseitige Anmeldung nicht verfügbar.',
      );
    }
    final session = await readSession();
    if (session == null) {
      throw StateError('Für Kontosicherheit ist eine Anmeldung erforderlich.');
    }
    final userId = (session.userId ?? '').trim();
    final sessionId = (session.sessionId ?? '').trim();
    final email = session.email.trim().toLowerCase();
    if (userId.isEmpty ||
        userId.length > 256 ||
        sessionId.isEmpty ||
        sessionId.length > _maxSessionIdLength ||
        email.isEmpty ||
        email.length > 320) {
      throw StateError('Die aktuelle Kontositzung ist unvollständig.');
    }
    return _AccountSecuritySessionMarker(
      userId: userId,
      sessionId: sessionId,
      email: email,
    );
  }

  Future<void> _assertSameCurrentSession(
    _AccountSecuritySessionMarker expected,
  ) async {
    final current = await _requireCurrentSession();
    if (current != expected) {
      throw StateError(
          'Die Kontositzung hat sich während der Aktion geändert.');
    }
  }

  static List<SecurityDevice> _decodeSessions(
    List<Map<String, dynamic>> raw, {
    required String expectedCurrentSessionId,
  }) {
    if (raw.isEmpty || raw.length > _maxSessions) {
      throw const FormatException('Ungültige serverseitige Sitzungsliste.');
    }
    final ids = <String>{};
    final devices = <SecurityDevice>[];
    var currentCount = 0;
    for (final entry in raw) {
      final idValue = entry['id'];
      final nameValue = entry['name'];
      final locationValue = entry['location'];
      final lastActiveValue = entry['lastActive'];
      final isThisDeviceValue = entry['isThisDevice'];
      if (idValue is! String ||
          nameValue is! String ||
          locationValue is! String ||
          lastActiveValue is! String ||
          isThisDeviceValue is! bool) {
        throw const FormatException('Ungültige serverseitige Sitzung.');
      }
      final id = idValue.trim();
      final name = nameValue.trim();
      final location = locationValue.trim();
      final lastActive = DateTime.tryParse(lastActiveValue);
      if (id.isEmpty ||
          id.length > _maxSessionIdLength ||
          !ids.add(id) ||
          name.isEmpty ||
          name.length > _maxDeviceNameLength ||
          location.isEmpty ||
          location.length > _maxLocationLength ||
          lastActive == null) {
        throw const FormatException('Ungültige serverseitige Sitzung.');
      }
      if (isThisDeviceValue) {
        currentCount += 1;
        if (id != expectedCurrentSessionId) {
          throw const FormatException(
            'Die aktuelle serverseitige Sitzung ist widersprüchlich.',
          );
        }
      }
      devices.add(SecurityDevice(
        id: id,
        name: name,
        location: location,
        lastActive: lastActive,
        isThisDevice: isThisDeviceValue,
      ));
    }
    if (currentCount != 1) {
      throw const FormatException(
        'Die aktuelle serverseitige Sitzung fehlt oder ist mehrdeutig.',
      );
    }
    return List<SecurityDevice>.unmodifiable(devices);
  }
}

class _AccountSecuritySessionMarker {
  final String userId;
  final String sessionId;
  final String email;

  const _AccountSecuritySessionMarker({
    required this.userId,
    required this.sessionId,
    required this.email,
  });

  @override
  bool operator ==(Object other) =>
      other is _AccountSecuritySessionMarker &&
      other.userId == userId &&
      other.sessionId == sessionId &&
      other.email == email;

  @override
  int get hashCode => Object.hash(userId, sessionId, email);
}
