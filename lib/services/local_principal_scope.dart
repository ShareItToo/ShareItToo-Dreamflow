import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart' show immutable;

import 'auth_service.dart';

@immutable
class LocalPrincipalIdentity {
  final String token;
  final bool authenticated;

  const LocalPrincipalIdentity({
    required this.token,
    required this.authenticated,
  });

  static const guest = LocalPrincipalIdentity(
    token: 'guest',
    authenticated: false,
  );
}

/// One repository-owned identity boundary for device-local account data.
///
/// The persisted token is deterministic only on this device/storage contract;
/// it never contains an email, user id, session token or credential value.
class LocalPrincipalScope {
  static const int maxRetainedPrincipals = 12;
  static const String _derivationDomain = 'sit-local-stage-a-v1';

  static String _opaqueToken(String kind, String identity) {
    final digest = sha256
        .convert(utf8.encode('$_derivationDomain|$kind|$identity'))
        .toString();
    return 'p_$digest';
  }

  static LocalPrincipalIdentity fromSession(AuthSession? session) {
    if (session == null) return LocalPrincipalIdentity.guest;
    final userId = (session.userId ?? '').trim();
    final email = session.email.trim().toLowerCase();
    final kind = userId.isNotEmpty ? 'user-id' : 'email';
    final identity = userId.isNotEmpty ? userId : email;
    if (identity.isEmpty) return LocalPrincipalIdentity.guest;
    return LocalPrincipalIdentity(
      token: _opaqueToken(kind, identity),
      authenticated: true,
    );
  }

  static Future<LocalPrincipalIdentity> current() async =>
      fromSession(await AuthService.readSession());

  static Future<void> assertCurrent(LocalPrincipalIdentity expected) async {
    final currentPrincipal = await current();
    if (currentPrincipal.token != expected.token ||
        currentPrincipal.authenticated != expected.authenticated) {
      throw StateError('Die lokale Kontositzung hat sich geändert.');
    }
  }

  static String tokenForSession(AuthSession? session) =>
      fromSession(session).token;

  /// Opaque, device-local identity for one exact authenticated session.
  ///
  /// This is safe to persist as cleanup ownership metadata: it contains no
  /// email, user id, session id, token or credential value, and a later login
  /// of the same account derives a different value when the backend session
  /// changes.
  static String tokenForSessionOwner(AuthSessionOwner owner) {
    final userId = (owner.userId ?? '').trim();
    final email = owner.email.trim().toLowerCase();
    final sessionId = (owner.sessionId ?? '').trim();
    final createdAt = owner.createdAt?.toUtc().toIso8601String() ?? '';
    return _opaqueToken(
      'session-owner',
      '$userId|$email|$sessionId|$createdAt',
    );
  }

  static String tokenForUserId(String userId) {
    final normalized = userId.trim();
    if (normalized.isEmpty) return LocalPrincipalIdentity.guest.token;
    return _opaqueToken('user-id', normalized);
  }
}

/// Immutable, credential-free owner of one local or authenticated action.
/// A confirmed guest is distinct from an unreadable or malformed session.
@immutable
class LocalPrincipalActionOwner {
  final LocalPrincipalIdentity principal;
  final AuthSessionOwner? sessionOwner;
  final int epoch;

  const LocalPrincipalActionOwner._({
    required this.principal,
    required this.sessionOwner,
    required this.epoch,
  });

  static Future<LocalPrincipalActionOwner> capture() async {
    final epoch = AuthService.sessionEpoch;
    final session = await AuthService.readSession();
    if (epoch != AuthService.sessionEpoch) {
      throw StateError('Die Kontositzung hat sich geändert.');
    }
    final owner = LocalPrincipalActionOwner._(
      principal: LocalPrincipalScope.fromSession(session),
      sessionOwner:
          session == null ? null : AuthService.captureSessionOwner(session),
      epoch: epoch,
    );
    await owner.assertCurrent();
    return owner;
  }

  bool get isCurrentEpoch => epoch == AuthService.sessionEpoch;

  Future<bool> isCurrent() async {
    if (!isCurrentEpoch) return false;
    final session = sessionOwner;
    final current = session == null
        ? await AuthService.isStoredSessionDefinitelyAbsent()
        : await AuthService.isSessionOwnerDefinitelyCurrent(session);
    return current && isCurrentEpoch;
  }

  Future<void> assertCurrent() async {
    if (!await isCurrent()) {
      throw StateError('Die Kontositzung hat sich geändert.');
    }
  }
}
