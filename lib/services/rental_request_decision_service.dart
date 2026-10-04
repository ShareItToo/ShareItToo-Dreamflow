import 'package:flutter/foundation.dart' show protected;
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/session_transition_service.dart';

enum RentalRequestDecisionFailureKind {
  rejected,
  localUnavailable,
  outcomeUnknown,
  principalChanged,
}

class RentalRequestDecisionFailure implements Exception {
  final RentalRequestDecisionFailureKind kind;
  final String? code;
  final bool remoteAccepted;

  const RentalRequestDecisionFailure._(
    this.kind, {
    this.code,
    this.remoteAccepted = false,
  });

  const RentalRequestDecisionFailure.rejected(String code)
      : this._(RentalRequestDecisionFailureKind.rejected, code: code);

  const RentalRequestDecisionFailure.localUnavailable(
    String? code, {
    bool remoteAccepted = false,
  }) : this._(
          RentalRequestDecisionFailureKind.localUnavailable,
          code: code,
          remoteAccepted: remoteAccepted,
        );

  const RentalRequestDecisionFailure.outcomeUnknown([String? code])
      : this._(
          RentalRequestDecisionFailureKind.outcomeUnknown,
          code: code,
        );

  const RentalRequestDecisionFailure.principalChanged({
    bool remoteAccepted = false,
  }) : this._(
          RentalRequestDecisionFailureKind.principalChanged,
          remoteAccepted: remoteAccepted,
        );
}

class RentalRequestDecisionContext {
  final User user;
  final SessionTransitionOwner owner;

  const RentalRequestDecisionContext({
    required this.user,
    required this.owner,
  });
}

class RentalRequestDecisionActionOwner {
  final RentalRequestDecisionContext context;
  final int actionEpoch;

  const RentalRequestDecisionActionOwner({
    required this.context,
    required this.actionEpoch,
  });

  bool isSynchronouslyCurrent({
    required RentalRequestDecisionContext? context,
    required int actionEpoch,
  }) =>
      identical(this.context, context) && this.actionEpoch == actionEpoch;
}

class RentalRequestDecisionResult {
  final RentalRequest request;
  final bool remoteAccepted;

  const RentalRequestDecisionResult({
    required this.request,
    required this.remoteAccepted,
  });
}

/// Principal-bound coordinator for an owner's accept/decline decision.
///
/// It deliberately separates definitive structured rejection from an unknown
/// transport outcome. A returned server booking remains accepted truth even
/// when a later local verification fails.
class RentalRequestDecisionService {
  final SessionTransitionService _sessionTransitions;

  const RentalRequestDecisionService({
    SessionTransitionService sessionTransitions =
        const SessionTransitionService(),
  }) : _sessionTransitions = sessionTransitions;

  Future<RentalRequestDecisionContext?> loadCurrentContext() async {
    final epoch = _sessionTransitions.sessionEpoch;
    final session = await _sessionTransitions.readSession();
    if (session == null || epoch != _sessionTransitions.sessionEpoch) {
      return null;
    }
    final owner = _sessionTransitions.captureOwner(
      session,
      profileUserId: session.userId,
    );
    if (owner.authOwner.epoch != epoch) return null;
    final user = await _sessionTransitions.currentUserForOwner(owner);
    if (user == null ||
        epoch != _sessionTransitions.sessionEpoch ||
        !await _sessionTransitions.isOwnerCurrent(owner)) {
      return null;
    }
    return RentalRequestDecisionContext(user: user, owner: owner);
  }

  Future<bool> isContextCurrent(RentalRequestDecisionContext context) async {
    if (!await _sessionTransitions.isOwnerCurrent(context.owner)) return false;
    final current =
        await _sessionTransitions.cachedCurrentUserForOwner(context.owner);
    return current != null &&
        current.id.trim() == context.user.id.trim() &&
        current.email.trim().toLowerCase() ==
            context.user.email.trim().toLowerCase() &&
        await _sessionTransitions.isOwnerCurrent(context.owner);
  }

  static RentalRequestDecisionFailureKind classifyBackendFailure(
    BackendException error,
  ) {
    const rejected = <int, Set<String>>{
      400: <String>{
        'invalid_booking_transition',
        'invalid_booking_status',
        'invalid_cancellation_type',
        'cancellation_type_without_cancellation',
        'private_pilot_owner_acceptance_required',
      },
      401: <String>{
        'authentication_required',
        'invalid_or_expired_session',
        'account_not_active',
      },
      403: <String>{
        'booking_forbidden',
        'renter_no_show_owner_required',
        'action_blocked_by_moderation',
      },
      404: <String>{'booking_not_found'},
      409: <String>{
        'booking_revision_conflict',
        'booking_request_expired',
        'invalid_status_transition',
        'pilot_simulation_transition_forbidden',
        'pilot_simulation_no_show_not_applicable',
        'fresh_booking_quote_required',
        'booking_quote_not_found',
        'renter_no_show_before_start',
      },
      429: <String>{'rate_limit_exceeded'},
    };
    return rejected[error.statusCode]?.contains(error.code) == true
        ? RentalRequestDecisionFailureKind.rejected
        : RentalRequestDecisionFailureKind.outcomeUnknown;
  }

  @protected
  Future<AccountRentalRequestMutationResult> performDecision({
    required RentalRequestDecisionContext context,
    required RentalRequest request,
    required String status,
    List<Map<String, dynamic>>? legalDeclarations,
  }) =>
      DataService.updateRentalRequestStatusForOwner(
        owner: context.owner.authOwner,
        expectedOwnerId: context.user.id,
        requestId: request.id,
        status: status,
        legalDeclarations: legalDeclarations,
      );

  Future<RentalRequestDecisionResult> execute({
    required RentalRequestDecisionContext context,
    required RentalRequest request,
    required String status,
    List<Map<String, dynamic>>? legalDeclarations,
  }) async {
    if (request.ownerId.trim() != context.user.id.trim() ||
        !await isContextCurrent(context)) {
      throw const RentalRequestDecisionFailure.principalChanged();
    }
    try {
      if (!await isContextCurrent(context)) {
        throw const RentalRequestDecisionFailure.principalChanged();
      }
      final result = await performDecision(
        context: context,
        request: request,
        status: status,
        legalDeclarations: legalDeclarations,
      );
      if (!await isContextCurrent(context)) {
        throw RentalRequestDecisionFailure.principalChanged(
          remoteAccepted: result.remoteAccepted,
        );
      }
      return RentalRequestDecisionResult(
        request: result.request,
        remoteAccepted: result.remoteAccepted,
      );
    } on RentalRequestDecisionFailure {
      rethrow;
    } on AccountRentalRequestMutationFailure catch (failure) {
      throw switch (failure.kind) {
        AccountRentalRequestMutationFailureKind.rejected =>
          RentalRequestDecisionFailure.rejected(
            failure.code ?? 'rejected',
          ),
        AccountRentalRequestMutationFailureKind.localUnavailable =>
          RentalRequestDecisionFailure.localUnavailable(
            failure.code,
            remoteAccepted: failure.remoteAccepted,
          ),
        AccountRentalRequestMutationFailureKind.outcomeUnknown =>
          RentalRequestDecisionFailure.outcomeUnknown(failure.code),
        AccountRentalRequestMutationFailureKind.principalChanged =>
          RentalRequestDecisionFailure.principalChanged(
            remoteAccepted: failure.remoteAccepted,
          ),
      };
    } on BackendException catch (error) {
      if (!await isContextCurrent(context)) {
        throw const RentalRequestDecisionFailure.principalChanged();
      }
      if (classifyBackendFailure(error) ==
          RentalRequestDecisionFailureKind.rejected) {
        throw RentalRequestDecisionFailure.rejected(error.code);
      }
      throw RentalRequestDecisionFailure.outcomeUnknown(error.code);
    } catch (_) {
      if (!await isContextCurrent(context)) {
        throw const RentalRequestDecisionFailure.principalChanged();
      }
      throw const RentalRequestDecisionFailure.localUnavailable(
        'local_request_decision_failed',
      );
    }
  }
}
