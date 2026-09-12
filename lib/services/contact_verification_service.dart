import 'package:flutter/foundation.dart'
    show debugPrint, protected, visibleForTesting;
import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/session_transition_service.dart';

enum ContactActionFailureKind {
  rejected,
  localUnavailable,
  outcomeUnknown,
  principalChanged,
}

class ContactActionFailure implements Exception {
  final ContactActionFailureKind kind;
  final String? code;
  final bool remoteAcceptedOrConfirmed;

  const ContactActionFailure._(
    this.kind, {
    this.code,
    this.remoteAcceptedOrConfirmed = false,
  });

  const ContactActionFailure.rejected(String code)
      : this._(ContactActionFailureKind.rejected, code: code);

  const ContactActionFailure.localUnavailable(
    String? code, {
    bool remoteAcceptedOrConfirmed = false,
  }) : this._(
          ContactActionFailureKind.localUnavailable,
          code: code,
          remoteAcceptedOrConfirmed: remoteAcceptedOrConfirmed,
        );

  const ContactActionFailure.outcomeUnknown([String? code])
      : this._(ContactActionFailureKind.outcomeUnknown, code: code);

  const ContactActionFailure.principalChanged({
    bool remoteAcceptedOrConfirmed = false,
  }) : this._(
          ContactActionFailureKind.principalChanged,
          remoteAcceptedOrConfirmed: remoteAcceptedOrConfirmed,
        );
}

class ContactVerificationContext {
  final User user;
  final SessionTransitionOwner owner;

  const ContactVerificationContext({
    required this.user,
    required this.owner,
  });
}

class EmailChangeRequestReceipt {
  final ContactVerificationContext context;
  final String newEmail;

  const EmailChangeRequestReceipt({
    required this.context,
    required this.newEmail,
  });
}

class EmailVerificationRequestReceipt {
  final String normalizedEmail;

  const EmailVerificationRequestReceipt({required this.normalizedEmail});
}

class PhoneVerificationConfirmationReceipt {
  final ContactVerificationContext context;
  final String phoneNumber;

  const PhoneVerificationConfirmationReceipt({
    required this.context,
    required this.phoneNumber,
  });
}

enum ContactProfileRefreshKind { refreshed, confirmedRefreshDeferred }

class ContactProfileRefreshResult {
  final ContactProfileRefreshKind kind;
  final User? user;

  const ContactProfileRefreshResult.refreshed(User value)
      : kind = ContactProfileRefreshKind.refreshed,
        user = value;

  const ContactProfileRefreshResult.confirmedRefreshDeferred()
      : kind = ContactProfileRefreshKind.confirmedRefreshDeferred,
        user = null;
}

class LoginEmailVerificationOwner {
  final String normalizedEmail;
  final int actionEpoch;

  const LoginEmailVerificationOwner({
    required this.normalizedEmail,
    required this.actionEpoch,
  });

  bool isCurrent({required String email, required int actionEpoch}) =>
      this.actionEpoch == actionEpoch &&
      normalizedEmail == email.trim().toLowerCase();
}

/// Principal-bound coordinator for contact and verification mutations.
///
/// It never retains access or refresh tokens. Every authenticated operation
/// receives the exact token-free session owner captured by the screen and
/// revalidates it immediately before the remote invocation and after the
/// response.
class ContactVerificationService {
  final SessionTransitionService _sessionTransitions;

  const ContactVerificationService({
    SessionTransitionService sessionTransitions =
        const SessionTransitionService(),
  }) : _sessionTransitions = sessionTransitions;

  @protected
  bool get backendEnabled => BackendConfig.enabled;

  bool get isBackendEnabled => backendEnabled;

  Future<ContactVerificationContext?> loadCurrentContext() async {
    final session = await _sessionTransitions.readSession();
    if (session == null) return null;
    final owner = _sessionTransitions.captureOwner(
      session,
      profileUserId: session.userId,
    );
    final user = await _sessionTransitions.currentUserForOwner(owner);
    if (user == null || !await _sessionTransitions.isOwnerCurrent(owner)) {
      return null;
    }
    return ContactVerificationContext(user: user, owner: owner);
  }

  Future<bool> isContextCurrent(ContactVerificationContext context) async {
    if (!await _sessionTransitions.isOwnerCurrent(context.owner)) return false;
    final current =
        await _sessionTransitions.cachedCurrentUserForOwner(context.owner);
    return current != null &&
        current.id.trim() == context.user.id.trim() &&
        current.email.trim().toLowerCase() ==
            context.user.email.trim().toLowerCase() &&
        await _sessionTransitions.isOwnerCurrent(context.owner);
  }

  Future<void> _requireContextCurrent(
    ContactVerificationContext context, {
    bool remoteAcceptedOrConfirmed = false,
  }) async {
    if (!await isContextCurrent(context)) {
      throw ContactActionFailure.principalChanged(
        remoteAcceptedOrConfirmed: remoteAcceptedOrConfirmed,
      );
    }
  }

  @protected
  Future<String?> accessTokenForOwner(
    ContactVerificationContext context,
  ) =>
      AuthService.accessTokenForOwner(context.owner.authOwner);

  @protected
  Future<Map<String, dynamic>> sendEmailChangeRemote({
    required String accessToken,
    required String newEmail,
    required String currentPassword,
  }) =>
      BackendHttp.requestJson(
        method: 'POST',
        path: '/auth/email-change/request',
        accessToken: accessToken,
        body: <String, Object>{
          'newEmail': newEmail,
          'currentPassword': currentPassword,
        },
      );

  @protected
  Future<Map<String, dynamic>> sendEmailVerificationRemote(String email) =>
      BackendHttp.requestJson(
        method: 'POST',
        path: '/auth/email-verification/request',
        body: <String, Object>{'email': email},
      );

  static ContactActionFailureKind classifyEmailChangeFailure(
    BackendException error,
  ) {
    const allowed = <int, Set<String>>{
      400: <String>{'invalid_email', 'email_unchanged'},
      401: <String>{
        'authentication_required',
        'invalid_or_expired_session',
        'account_not_active',
        'invalid_credentials',
      },
      409: <String>{'email_in_use'},
      429: <String>{'rate_limit_exceeded'},
    };
    return allowed[error.statusCode]?.contains(error.code) == true
        ? ContactActionFailureKind.rejected
        : ContactActionFailureKind.outcomeUnknown;
  }

  static ContactActionFailureKind classifyEmailVerificationFailure(
    BackendException error,
  ) =>
      error.statusCode == 429 && error.code == 'rate_limit_exceeded'
          ? ContactActionFailureKind.rejected
          : ContactActionFailureKind.outcomeUnknown;

  Future<EmailChangeRequestReceipt> requestEmailChange({
    required ContactVerificationContext context,
    required String newEmail,
    required String currentPassword,
  }) async {
    await _requireContextCurrent(context);
    if (!backendEnabled) {
      throw const ContactActionFailure.localUnavailable('backend_disabled');
    }
    final normalized = newEmail.trim().toLowerCase();
    final accessToken = await accessTokenForOwner(context);
    await _requireContextCurrent(context);
    if (accessToken == null || accessToken.isEmpty) {
      throw const ContactActionFailure.localUnavailable(
        'authenticated_token_unavailable',
      );
    }

    late final Map<String, dynamic> response;
    try {
      await _requireContextCurrent(context);
      response = await sendEmailChangeRemote(
        accessToken: accessToken,
        newEmail: normalized,
        currentPassword: currentPassword,
      );
    } on ContactActionFailure {
      rethrow;
    } on BackendException catch (error) {
      final kind = classifyEmailChangeFailure(error);
      if (kind == ContactActionFailureKind.rejected) {
        throw ContactActionFailure.rejected(error.code);
      }
      throw ContactActionFailure.outcomeUnknown(error.code);
    } catch (error) {
      debugPrint(
        '[ContactVerificationService] email change outcome unknown: '
        '${error.runtimeType}',
      );
      throw const ContactActionFailure.outcomeUnknown();
    }

    if (response['accepted'] != true) {
      throw const ContactActionFailure.outcomeUnknown(
        'invalid_server_response',
      );
    }
    await _requireContextCurrent(
      context,
      remoteAcceptedOrConfirmed: true,
    );
    return EmailChangeRequestReceipt(
      context: context,
      newEmail: normalized,
    );
  }

  Future<EmailVerificationRequestReceipt> requestContactEmailVerification(
    ContactVerificationContext context,
  ) async {
    await _requireContextCurrent(context);
    final receipt = await _requestEmailVerification(context.user.email);
    await _requireContextCurrent(
      context,
      remoteAcceptedOrConfirmed: true,
    );
    return receipt;
  }

  Future<EmailVerificationRequestReceipt> requestLoginEmailVerification(
    String email,
  ) =>
      _requestEmailVerification(email);

  @protected
  Future<PhoneVerificationChallenge> startPhoneVerificationProvider({
    required AuthSessionOwner owner,
    required String phoneNumber,
  }) =>
      AuthService.requestPhoneVerification(
        owner: owner,
        phoneNumber: phoneNumber,
      );

  Future<EmailVerificationRequestReceipt> _requestEmailVerification(
    String email,
  ) async {
    if (!backendEnabled) {
      throw const ContactActionFailure.localUnavailable('backend_disabled');
    }
    final normalized = email.trim().toLowerCase();
    late final Map<String, dynamic> response;
    try {
      response = await sendEmailVerificationRemote(normalized);
    } on BackendException catch (error) {
      final kind = classifyEmailVerificationFailure(error);
      if (kind == ContactActionFailureKind.rejected) {
        throw ContactActionFailure.rejected(error.code);
      }
      throw ContactActionFailure.outcomeUnknown(error.code);
    } catch (error) {
      debugPrint(
        '[ContactVerificationService] email verification outcome unknown: '
        '${error.runtimeType}',
      );
      throw const ContactActionFailure.outcomeUnknown();
    }
    if (response['accepted'] != true) {
      throw const ContactActionFailure.outcomeUnknown(
        'invalid_server_response',
      );
    }
    return EmailVerificationRequestReceipt(normalizedEmail: normalized);
  }

  Future<PhoneVerificationChallenge> requestPhoneVerification({
    required ContactVerificationContext context,
    required String phoneNumber,
  }) async {
    await _requireContextCurrent(context);
    try {
      await _requireContextCurrent(context);
      final challenge = await startPhoneVerificationProvider(
        owner: context.owner.authOwner,
        phoneNumber: phoneNumber,
      );
      await _requireContextCurrent(
        context,
        remoteAcceptedOrConfirmed: challenge.automaticallyVerified,
      );
      return challenge;
    } on ContactActionFailure {
      rethrow;
    } on PhoneVerificationException catch (error) {
      throw mapPhoneFailure(error);
    }
  }

  Future<PhoneVerificationConfirmationReceipt> confirmPhoneVerification({
    required ContactVerificationContext context,
    required PhoneVerificationChallenge challenge,
    required String smsCode,
  }) async {
    if (!identical(challenge.owner, context.owner.authOwner)) {
      throw const ContactActionFailure.principalChanged();
    }
    await _requireContextCurrent(context);
    try {
      await _requireContextCurrent(context);
      await AuthService.confirmPhoneVerification(
        owner: context.owner.authOwner,
        challenge: challenge,
        smsCode: smsCode,
      );
    } on ContactActionFailure {
      rethrow;
    } on PhoneVerificationException catch (error) {
      throw mapPhoneFailure(error);
    }
    await _requireContextCurrent(
      context,
      remoteAcceptedOrConfirmed: true,
    );
    return PhoneVerificationConfirmationReceipt(
      context: context,
      phoneNumber: challenge.phoneNumber,
    );
  }

  @visibleForTesting
  static ContactActionFailure mapPhoneFailure(
    PhoneVerificationException error,
  ) {
    return switch (error.failure) {
      PhoneVerificationFailure.principalChanged =>
        ContactActionFailure.principalChanged(
          remoteAcceptedOrConfirmed: error.remoteAcceptedOrConfirmed,
        ),
      PhoneVerificationFailure.outcomeUnknown ||
      PhoneVerificationFailure.network ||
      PhoneVerificationFailure.timeout =>
        ContactActionFailure.outcomeUnknown(error.failure.name),
      PhoneVerificationFailure.unavailable =>
        ContactActionFailure.localUnavailable(error.failure.name),
      PhoneVerificationFailure.localIdentityCleanupFailed ||
      PhoneVerificationFailure.confirmedLocalIdentityCleanupFailed =>
        ContactActionFailure.localUnavailable(
          error.failure.name,
          remoteAcceptedOrConfirmed: error.remoteAcceptedOrConfirmed,
        ),
      _ => ContactActionFailure.rejected(error.failure.name),
    };
  }

  Future<ContactProfileRefreshResult> refreshVerifiedProfile(
    ContactVerificationContext context,
  ) async {
    await _requireContextCurrent(context);
    try {
      final updated = await DataService.syncCurrentUserForSessionOwner(
        context.owner.authOwner,
      );
      await _requireContextCurrent(context);
      if (updated == null) {
        return const ContactProfileRefreshResult.confirmedRefreshDeferred();
      }
      return ContactProfileRefreshResult.refreshed(updated);
    } on ContactActionFailure {
      rethrow;
    } catch (error) {
      debugPrint(
        '[ContactVerificationService] confirmed profile refresh deferred: '
        '${error.runtimeType}',
      );
      await _requireContextCurrent(
        context,
        remoteAcceptedOrConfirmed: true,
      );
      return const ContactProfileRefreshResult.confirmedRefreshDeferred();
    }
  }
}
