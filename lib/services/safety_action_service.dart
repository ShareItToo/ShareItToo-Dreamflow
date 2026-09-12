import 'dart:typed_data';

import 'package:flutter/foundation.dart' show protected;
import 'package:lendify/models/user.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/services/local_safety_privacy_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:lendify/services/session_transition_service.dart';

enum SafetyActionFailureKind {
  rejected,
  localUnavailable,
  outcomeUnknown,
  principalChanged,
}

class SafetyActionFailure implements Exception {
  final SafetyActionFailureKind kind;
  final String? code;
  final bool remoteAcceptedOrConfirmed;

  const SafetyActionFailure._(
    this.kind, {
    this.code,
    this.remoteAcceptedOrConfirmed = false,
  });

  const SafetyActionFailure.rejected(String code)
      : this._(SafetyActionFailureKind.rejected, code: code);

  const SafetyActionFailure.localUnavailable(
    String? code, {
    bool remoteAcceptedOrConfirmed = false,
  }) : this._(
          SafetyActionFailureKind.localUnavailable,
          code: code,
          remoteAcceptedOrConfirmed: remoteAcceptedOrConfirmed,
        );

  const SafetyActionFailure.outcomeUnknown([String? code])
      : this._(SafetyActionFailureKind.outcomeUnknown, code: code);

  const SafetyActionFailure.principalChanged({
    bool remoteAcceptedOrConfirmed = false,
  }) : this._(
          SafetyActionFailureKind.principalChanged,
          remoteAcceptedOrConfirmed: remoteAcceptedOrConfirmed,
        );
}

class SafetyActionContext {
  final User user;
  final SessionTransitionOwner owner;
  final LocalPrincipalIdentity localPrincipal;

  const SafetyActionContext({
    required this.user,
    required this.owner,
    required this.localPrincipal,
  });
}

class SafetyActionOwner {
  final SafetyActionContext context;
  final int actionEpoch;

  const SafetyActionOwner({
    required this.context,
    required this.actionEpoch,
  });

  bool isSynchronouslyCurrent({
    required SafetyActionContext? context,
    required int actionEpoch,
  }) =>
      identical(this.context, context) && this.actionEpoch == actionEpoch;
}

class SafetyReportResult {
  final bool directContactBlocked;

  const SafetyReportResult({this.directContactBlocked = false});
}

class SafetyReturnCaseIssueResult {
  final bool reviewOpened;
  final bool reportRecorded;

  const SafetyReturnCaseIssueResult({
    required this.reviewOpened,
    required this.reportRecorded,
  });
}

/// Principal-bound coordinator for user reports and contact blocking.
///
/// Every remote request resolves credentials only for the immutable owner
/// captured while the screen loaded. Any later local cache write is directed
/// to that owner's opaque local principal, never to the globally current
/// account after an await.
class SafetyActionService {
  final SessionTransitionService _sessionTransitions;

  const SafetyActionService({
    SessionTransitionService sessionTransitions =
        const SessionTransitionService(),
  }) : _sessionTransitions = sessionTransitions;

  @protected
  bool get backendEnabled => BackendConfig.enabled;

  @protected
  bool get qaRuntimeEnabled => QaRuntimeService.isEnabled;

  Future<SafetyActionContext?> loadCurrentContext() async {
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
    return SafetyActionContext(
      user: user,
      owner: owner,
      localPrincipal: LocalPrincipalScope.fromSession(session),
    );
  }

  Future<bool> isContextCurrent(SafetyActionContext context) async {
    if (!await _sessionTransitions.isOwnerCurrent(context.owner)) return false;
    final current =
        await _sessionTransitions.cachedCurrentUserForOwner(context.owner);
    return current != null &&
        current.id.trim() == context.user.id.trim() &&
        current.email.trim().toLowerCase() ==
            context.user.email.trim().toLowerCase() &&
        await _sessionTransitions.isOwnerCurrent(context.owner);
  }

  /// Reads the device-local guest block list only after proving that the
  /// stored session is definitely absent. A malformed or unreadable session
  /// never falls through to guest state.
  Future<List<String>?> loadConfirmedGuestBlockedUsers() async {
    try {
      final owner = await LocalPrincipalActionOwner.capture();
      if (owner.principal.authenticated) return null;
      final result =
          await LocalSafetyPrivacyService.getBlockedUserIdsForPrincipal(
        owner.principal,
      );
      await owner.assertCurrent();
      return result;
    } catch (error) {
      if (error is SafetyActionFailure) rethrow;
      throw const SafetyActionFailure.localUnavailable(
        'local_guest_block_list_unavailable',
      );
    }
  }

  Future<void> _requireCurrent(
    SafetyActionContext context, {
    bool remoteAcceptedOrConfirmed = false,
  }) async {
    if (!await isContextCurrent(context)) {
      throw SafetyActionFailure.principalChanged(
        remoteAcceptedOrConfirmed: remoteAcceptedOrConfirmed,
      );
    }
  }

  static SafetyActionFailureKind classifyBackendFailure(
    BackendException error,
  ) {
    const rejected = <int, Set<String>>{
      400: <String>{
        'invalid_block_target',
        'invalid_report_target_type',
        'invalid_report_target',
        'invalid_report_reason',
        'invalid_report_priority',
        'invalid_report_evidence',
        'invalid_report_details',
        'invalid_report_reference',
        'cannot_report_self',
        'cannot_report_own_listing',
        'cannot_report_own_message',
        'report_evidence_not_owned',
        'invalid_harassment_block_report',
        'invalid_harassment_block_report_fields',
      },
      401: <String>{
        'authentication_required',
        'invalid_or_expired_session',
        'account_not_active',
      },
      403: <String>{
        'report_target_forbidden',
        'upload_forbidden',
      },
      404: <String>{
        'user_not_found',
        'report_target_not_found',
        'upload_not_found',
      },
      409: <String>{
        'harassment_requires_block_report_path',
        'active_report_already_exists',
        'harassment_block_report_idempotency_conflict',
        'active_harassment_block_report_already_exists',
        'active_harassment_report_requires_review',
      },
      429: <String>{'rate_limit_exceeded'},
    };
    return rejected[error.statusCode]?.contains(error.code) == true
        ? SafetyActionFailureKind.rejected
        : SafetyActionFailureKind.outcomeUnknown;
  }

  static SafetyActionFailureKind classifyReturnCaseBackendFailure(
    BackendException error,
  ) {
    const rejected = <int, Set<String>>{
      400: <String>{
        'invalid_idempotency_key',
        'invalid_report_target_type',
        'invalid_report_target',
        'invalid_report_reason',
        'invalid_report_priority',
        'invalid_report_evidence',
        'invalid_report_details',
        'invalid_report_reference',
        'report_evidence_not_owned',
        'v52_return_case_reason_code_invalid',
        'v52_return_case_details_required',
        'v52_return_case_evidence_required',
        'v52_return_case_evidence_invalid',
        'v52_return_case_contested_amount_invalid',
        'v52_return_case_evidence_not_owned',
      },
      401: <String>{
        'authentication_required',
        'invalid_or_expired_session',
        'account_not_active',
      },
      403: <String>{
        'action_blocked_by_moderation',
        'report_target_forbidden',
        'v52_return_case_forbidden',
      },
      404: <String>{
        'booking_not_found',
        'report_target_not_found',
      },
      409: <String>{
        'idempotency_key_reused',
        'active_report_already_exists',
        'v52_handover_contract_binding_invalid',
        'v52_return_case_contract_required',
        'v52_return_case_wrong_booking_state',
        'v52_return_report_window_not_open',
        'v52_return_report_window_closed',
        'v52_return_case_amount_exceeds_authorization',
        'v52_active_return_case_exists',
        'v52_return_case_already_recorded',
        'v52_active_booking_report_exists',
      },
      429: <String>{'rate_limit_exceeded'},
    };
    return rejected[error.statusCode]?.contains(error.code) == true
        ? SafetyActionFailureKind.rejected
        : SafetyActionFailureKind.outcomeUnknown;
  }

  @protected
  Future<List<String>> fetchBlockedUsersRemote(
    SafetyActionContext context,
  ) =>
      BackendRepository.getBlockedUserIdsForOwner(context.owner.authOwner);

  @protected
  Future<void> blockUserRemote(
    SafetyActionContext context,
    String userId,
  ) =>
      BackendRepository.blockUserForOwner(
        owner: context.owner.authOwner,
        userId: userId,
      );

  @protected
  Future<void> unblockUserRemote(
    SafetyActionContext context,
    String userId,
  ) =>
      BackendRepository.unblockUserForOwner(
        owner: context.owner.authOwner,
        userId: userId,
      );

  @protected
  Future<Map<String, dynamic>> createReportRemote({
    required SafetyActionContext context,
    required String reportedUserId,
    required String reasonCode,
    required String idempotencyKey,
    required String details,
    required List<String> evidenceUploadIds,
    String? reference,
  }) =>
      BackendRepository.createReportForOwner(
        owner: context.owner.authOwner,
        targetType: 'user',
        targetId: reportedUserId,
        reasonCode: reasonCode,
        idempotencyKey: idempotencyKey,
        details: details,
        reference: reference,
        evidenceUploadIds: evidenceUploadIds,
      );

  @protected
  Future<Map<String, dynamic>> createListingReportRemote({
    required SafetyActionContext context,
    required String listingId,
    required String reasonCode,
    required String idempotencyKey,
    required String details,
    required List<String> evidenceUploadIds,
    String? reference,
  }) =>
      BackendRepository.createReportForOwner(
        owner: context.owner.authOwner,
        targetType: 'listing',
        targetId: listingId,
        reasonCode: reasonCode,
        idempotencyKey: idempotencyKey,
        details: details,
        reference: reference,
        evidenceUploadIds: evidenceUploadIds,
      );

  @protected
  Future<Map<String, dynamic>> createHarassmentReportRemote({
    required SafetyActionContext context,
    required String reportedUserId,
    required String idempotencyKey,
    required String details,
    required List<String> evidenceUploadIds,
    String? reference,
  }) =>
      BackendRepository.createHarassmentBlockReportForOwner(
        owner: context.owner.authOwner,
        targetUserId: reportedUserId,
        immediateDanger: false,
        idempotencyKey: idempotencyKey,
        details: details,
        reference: reference,
        evidenceUploadIds: evidenceUploadIds,
      );

  @protected
  Future<Map<String, dynamic>> uploadEvidenceRemote({
    required SafetyActionContext context,
    required Uint8List bytes,
    required String filename,
  }) =>
      BackendRepository.uploadReportEvidenceForOwner(
        owner: context.owner.authOwner,
        bytes: bytes,
        filename: filename,
      );

  @protected
  Future<Map<String, dynamic>> openReturnCaseRemote({
    required SafetyActionContext context,
    required String requestId,
    required String reasonCode,
    required String details,
    required List<String> evidenceUploadIds,
    required int contestedAuthorizedMinor,
    required String idempotencyKey,
  }) =>
      BackendRepository.openV52ReturnCaseForOwner(
        owner: context.owner.authOwner,
        bookingId: requestId,
        reasonCode: reasonCode,
        details: details,
        evidenceUploadIds: evidenceUploadIds,
        contestedAuthorizedMinor: contestedAuthorizedMinor,
        idempotencyKey: idempotencyKey,
      );

  @protected
  Future<Map<String, dynamic>> createBookingIssueReportRemote({
    required SafetyActionContext context,
    required String requestId,
    required String reasonCode,
    required String details,
    required String idempotencyKey,
  }) =>
      BackendRepository.createReportForOwner(
        owner: context.owner.authOwner,
        targetType: 'booking',
        targetId: requestId,
        reasonCode: reasonCode,
        idempotencyKey: idempotencyKey,
        details: details,
        reference: 'return_issue',
      );

  @protected
  Future<bool> openReturnCaseLocal({
    required SafetyActionContext context,
    required String requestId,
    required String reason,
    required String reasonCode,
    required List<String> evidenceNames,
    required int contestedAuthorizedMinor,
  }) =>
      DataService.markRentalRequestNeedsReviewForOwner(
        requestId,
        owner: context.owner.authOwner,
        expectedUserId: context.user.id,
        reason: reason,
        source: 'report_issue_screen',
        reasonCode: reasonCode,
        localEvidenceReferences: evidenceNames
            .map((name) => 'local-private-photo:$name')
            .toList(growable: false),
        contestedAuthorizedMinor: contestedAuthorizedMinor,
      );

  @protected
  Future<void> recordBookingIssueLocal({
    required SafetyActionContext context,
    required String requestId,
    required String reasonCode,
    required String details,
  }) async {
    await DataService.addTimelineEventForOwner(
      owner: context.owner.authOwner,
      expectedUserId: context.user.id,
      requestId: requestId,
      type: 'issue:$reasonCode',
      note: details.isEmpty ? 'Keine Details' : details,
    );
    await DataService.addNotificationForOwner(
      owner: context.owner.authOwner,
      expectedUserId: context.user.id,
      title: 'Problem gemeldet',
      body: 'Deine Meldung wurde gespeichert.',
    );
  }

  @protected
  Future<void> cacheBlockedUsers(
    SafetyActionContext context,
    List<String> ids,
  ) =>
      LocalSafetyPrivacyService.setBlockedUserIdsForPrincipal(
        context.localPrincipal,
        ids,
      );

  @protected
  Future<void> blockUserLocal(
    SafetyActionContext context,
    String userId,
  ) =>
      LocalSafetyPrivacyService.blockUserForPrincipal(
        context.localPrincipal,
        userId,
      );

  @protected
  Future<void> unblockUserLocal(
    SafetyActionContext context,
    String userId,
  ) =>
      LocalSafetyPrivacyService.unblockUserForPrincipal(
        context.localPrincipal,
        userId,
      );

  @protected
  Future<void> createReportLocal({
    required SafetyActionContext context,
    required String reportedUserId,
    required String reasonCode,
    required String details,
    required List<String> evidenceNames,
    String? reference,
  }) =>
      LocalSafetyPrivacyService.addReportForPrincipal(
        principal: context.localPrincipal,
        reporterUserId: context.user.id,
        reportedUserId: reportedUserId,
        reasonCode: reasonCode,
        details: details,
        evidenceNames: evidenceNames,
        reference: reference,
      );

  @protected
  Future<void> createListingReportLocal({
    required SafetyActionContext context,
    required String listingId,
    required String listingOwnerUserId,
    required String reasonCode,
    required String details,
    required List<String> evidenceNames,
    String? reference,
  }) =>
      LocalSafetyPrivacyService.addReportForPrincipal(
        principal: context.localPrincipal,
        reporterUserId: context.user.id,
        reportedUserId: listingOwnerUserId,
        targetType: 'listing',
        targetId: listingId,
        reasonCode: reasonCode,
        details: details,
        evidenceNames: evidenceNames,
        reference: reference,
      );

  @protected
  Future<void> createHarassmentReportLocal({
    required SafetyActionContext context,
    required String reportedUserId,
    required String details,
    required List<String> evidenceNames,
    String? reference,
  }) =>
      LocalSafetyPrivacyService.addHarassmentReportAndBlockForPrincipal(
        principal: context.localPrincipal,
        reporterUserId: context.user.id,
        reportedUserId: reportedUserId,
        details: details,
        evidenceNames: evidenceNames,
        reference: reference,
      );

  Future<List<String>> loadBlockedUsers(SafetyActionContext context) async {
    await _requireCurrent(context);
    if (!backendEnabled || qaRuntimeEnabled) {
      try {
        final result =
            await LocalSafetyPrivacyService.getBlockedUserIdsForPrincipal(
          context.localPrincipal,
        );
        await _requireCurrent(context);
        return result;
      } catch (error) {
        if (error is SafetyActionFailure) rethrow;
        if (!await isContextCurrent(context)) {
          throw const SafetyActionFailure.principalChanged();
        }
        throw const SafetyActionFailure.localUnavailable(
          'local_block_list_unavailable',
        );
      }
    }

    try {
      final result = await fetchBlockedUsersRemote(context);
      await _requireCurrent(context);
      try {
        await cacheBlockedUsers(context, result);
      } catch (_) {
        await _requireCurrent(context);
        throw const SafetyActionFailure.localUnavailable(
          'local_block_list_cache_failed',
        );
      }
      await _requireCurrent(context);
      return result;
    } on SafetyActionFailure {
      rethrow;
    } on BackendException catch (error) {
      if (!await isContextCurrent(context)) {
        throw const SafetyActionFailure.principalChanged();
      }
      final kind = classifyBackendFailure(error);
      if (kind == SafetyActionFailureKind.rejected) {
        throw SafetyActionFailure.rejected(error.code);
      }
      throw SafetyActionFailure.outcomeUnknown(error.code);
    } catch (_) {
      if (!await isContextCurrent(context)) {
        throw const SafetyActionFailure.principalChanged();
      }
      throw const SafetyActionFailure.outcomeUnknown(
        'block_list_transport_failed',
      );
    }
  }

  Future<void> blockUser(
    SafetyActionContext context,
    String userId,
  ) =>
      _setBlocked(context, userId, blocked: true);

  Future<void> unblockUser(
    SafetyActionContext context,
    String userId,
  ) =>
      _setBlocked(context, userId, blocked: false);

  Future<void> _setBlocked(
    SafetyActionContext context,
    String userId, {
    required bool blocked,
  }) async {
    final normalized = userId.trim();
    if (normalized.isEmpty) {
      throw const SafetyActionFailure.rejected('invalid_block_target');
    }
    await _requireCurrent(context);
    var remoteAccepted = false;
    try {
      if (backendEnabled && !qaRuntimeEnabled) {
        await _requireCurrent(context);
        if (blocked) {
          await blockUserRemote(context, normalized);
        } else {
          await unblockUserRemote(context, normalized);
        }
        remoteAccepted = true;
        await _requireCurrent(
          context,
          remoteAcceptedOrConfirmed: true,
        );
      }
      try {
        if (blocked) {
          await blockUserLocal(context, normalized);
        } else {
          await unblockUserLocal(context, normalized);
        }
      } catch (_) {
        await _requireCurrent(
          context,
          remoteAcceptedOrConfirmed: remoteAccepted,
        );
        throw SafetyActionFailure.localUnavailable(
          'local_block_state_failed',
          remoteAcceptedOrConfirmed: remoteAccepted,
        );
      }
      await _requireCurrent(
        context,
        remoteAcceptedOrConfirmed: remoteAccepted,
      );
    } on SafetyActionFailure {
      rethrow;
    } on BackendException catch (error) {
      if (!await isContextCurrent(context)) {
        throw SafetyActionFailure.principalChanged(
          remoteAcceptedOrConfirmed: remoteAccepted,
        );
      }
      final kind = classifyBackendFailure(error);
      if (kind == SafetyActionFailureKind.rejected) {
        throw SafetyActionFailure.rejected(error.code);
      }
      throw SafetyActionFailure.outcomeUnknown(error.code);
    } catch (_) {
      if (!await isContextCurrent(context)) {
        throw SafetyActionFailure.principalChanged(
          remoteAcceptedOrConfirmed: remoteAccepted,
        );
      }
      if (remoteAccepted) {
        throw const SafetyActionFailure.localUnavailable(
          'local_block_state_failed',
          remoteAcceptedOrConfirmed: true,
        );
      }
      throw const SafetyActionFailure.outcomeUnknown(
        'block_transport_failed',
      );
    }
  }

  Future<SafetyReportResult> submitReport({
    required SafetyActionContext context,
    required String reportedUserId,
    required String reasonCode,
    required String idempotencyKey,
    required String details,
    required List<String> evidenceNames,
    required List<String> evidenceUploadIds,
    String? reference,
    bool harassment = false,
  }) async {
    await _requireCurrent(context);
    try {
      if (backendEnabled && !qaRuntimeEnabled) {
        await _requireCurrent(context);
        if (harassment) {
          final result = await createHarassmentReportRemote(
            context: context,
            reportedUserId: reportedUserId,
            idempotencyKey: idempotencyKey,
            details: details,
            evidenceUploadIds: evidenceUploadIds,
            reference: reference,
          );
          await _requireCurrent(
            context,
            remoteAcceptedOrConfirmed: true,
          );
          final protection = result['protection'];
          return SafetyReportResult(
            directContactBlocked:
                protection is Map && protection['directContactBlocked'] == true,
          );
        }
        await createReportRemote(
          context: context,
          reportedUserId: reportedUserId,
          reasonCode: reasonCode,
          idempotencyKey: idempotencyKey,
          details: details,
          evidenceUploadIds: evidenceUploadIds,
          reference: reference,
        );
        await _requireCurrent(
          context,
          remoteAcceptedOrConfirmed: true,
        );
        return const SafetyReportResult();
      }

      if (harassment) {
        await createHarassmentReportLocal(
          context: context,
          reportedUserId: reportedUserId,
          details: details,
          evidenceNames: evidenceNames,
          reference: reference,
        );
        await _requireCurrent(context);
        return const SafetyReportResult(directContactBlocked: true);
      }
      await createReportLocal(
        context: context,
        reportedUserId: reportedUserId,
        reasonCode: reasonCode,
        details: details,
        evidenceNames: evidenceNames,
        reference: reference,
      );
      await _requireCurrent(context);
      return const SafetyReportResult();
    } on SafetyActionFailure {
      rethrow;
    } on BackendException catch (error) {
      if (!await isContextCurrent(context)) {
        throw const SafetyActionFailure.principalChanged();
      }
      final kind = classifyBackendFailure(error);
      if (kind == SafetyActionFailureKind.rejected) {
        throw SafetyActionFailure.rejected(error.code);
      }
      throw SafetyActionFailure.outcomeUnknown(error.code);
    } catch (_) {
      if (!await isContextCurrent(context)) {
        throw const SafetyActionFailure.principalChanged();
      }
      if (backendEnabled && !qaRuntimeEnabled) {
        throw const SafetyActionFailure.outcomeUnknown(
          'report_transport_failed',
        );
      }
      throw const SafetyActionFailure.localUnavailable(
        'local_report_failed',
      );
    }
  }

  Future<SafetyReportResult> submitListingReport({
    required SafetyActionContext context,
    required String listingId,
    required String listingOwnerUserId,
    required String reasonCode,
    required String idempotencyKey,
    required String details,
    required List<String> evidenceNames,
    required List<String> evidenceUploadIds,
    String? reference,
  }) async {
    final normalizedListingId = listingId.trim();
    final normalizedOwnerId = listingOwnerUserId.trim();
    if (normalizedListingId.isEmpty || normalizedOwnerId.isEmpty) {
      throw const SafetyActionFailure.rejected('invalid_report_target');
    }
    await _requireCurrent(context);
    var remoteAccepted = false;
    try {
      if (backendEnabled && !qaRuntimeEnabled) {
        await _requireCurrent(context);
        await createListingReportRemote(
          context: context,
          listingId: normalizedListingId,
          reasonCode: reasonCode,
          idempotencyKey: idempotencyKey,
          details: details,
          evidenceUploadIds: evidenceUploadIds,
          reference: reference,
        );
        remoteAccepted = true;
        await _requireCurrent(
          context,
          remoteAcceptedOrConfirmed: true,
        );
        return const SafetyReportResult();
      }

      await createListingReportLocal(
        context: context,
        listingId: normalizedListingId,
        listingOwnerUserId: normalizedOwnerId,
        reasonCode: reasonCode,
        details: details,
        evidenceNames: evidenceNames,
        reference: reference,
      );
      await _requireCurrent(context);
      return const SafetyReportResult();
    } on SafetyActionFailure {
      rethrow;
    } on BackendException catch (error) {
      if (!await isContextCurrent(context)) {
        throw SafetyActionFailure.principalChanged(
          remoteAcceptedOrConfirmed: remoteAccepted,
        );
      }
      final kind = classifyBackendFailure(error);
      if (kind == SafetyActionFailureKind.rejected) {
        throw SafetyActionFailure.rejected(error.code);
      }
      throw SafetyActionFailure.outcomeUnknown(error.code);
    } catch (_) {
      if (!await isContextCurrent(context)) {
        throw SafetyActionFailure.principalChanged(
          remoteAcceptedOrConfirmed: remoteAccepted,
        );
      }
      if (remoteAccepted) {
        throw const SafetyActionFailure.localUnavailable(
          'local_listing_report_state_failed',
          remoteAcceptedOrConfirmed: true,
        );
      }
      if (backendEnabled && !qaRuntimeEnabled) {
        throw const SafetyActionFailure.outcomeUnknown(
          'listing_report_transport_failed',
        );
      }
      throw const SafetyActionFailure.localUnavailable(
        'local_listing_report_failed',
      );
    }
  }

  Future<SafetyReturnCaseIssueResult> submitReturnCaseIssue({
    required SafetyActionContext context,
    required String requestId,
    required String reasonCode,
    required String idempotencyKey,
    required String details,
    required List<String> evidenceNames,
    required List<String> evidenceUploadIds,
    required bool opensReview,
    int? contestedAuthorizedMinor,
  }) async {
    await _requireCurrent(context);
    var remoteAccepted = false;
    try {
      if (backendEnabled && !qaRuntimeEnabled) {
        await _requireCurrent(context);
        if (opensReview) {
          final contested = contestedAuthorizedMinor;
          if (contested == null || contested <= 0) {
            throw const SafetyActionFailure.rejected(
              'v52_return_case_contested_amount_invalid',
            );
          }
          await openReturnCaseRemote(
            context: context,
            requestId: requestId,
            reasonCode: reasonCode,
            details: details,
            evidenceUploadIds: evidenceUploadIds,
            contestedAuthorizedMinor: contested,
            idempotencyKey: idempotencyKey,
          );
        } else {
          await createBookingIssueReportRemote(
            context: context,
            requestId: requestId,
            reasonCode: reasonCode,
            details: details,
            idempotencyKey: idempotencyKey,
          );
        }
        remoteAccepted = true;
        await _requireCurrent(
          context,
          remoteAcceptedOrConfirmed: true,
        );
        return SafetyReturnCaseIssueResult(
          reviewOpened: opensReview,
          reportRecorded: true,
        );
      }

      if (opensReview) {
        final contested = contestedAuthorizedMinor;
        if (contested == null || contested <= 0) {
          throw const SafetyActionFailure.rejected(
            'v52_return_case_contested_amount_invalid',
          );
        }
        final opened = await openReturnCaseLocal(
          context: context,
          requestId: requestId,
          reason: details,
          reasonCode: reasonCode,
          evidenceNames: evidenceNames,
          contestedAuthorizedMinor: contested,
        );
        await _requireCurrent(context);
        if (!opened) {
          await recordBookingIssueLocal(
            context: context,
            requestId: requestId,
            reasonCode: reasonCode,
            details: details,
          );
          await _requireCurrent(context);
        }
        return SafetyReturnCaseIssueResult(
          reviewOpened: opened,
          reportRecorded: true,
        );
      }

      await recordBookingIssueLocal(
        context: context,
        requestId: requestId,
        reasonCode: reasonCode,
        details: details,
      );
      await _requireCurrent(context);
      return const SafetyReturnCaseIssueResult(
        reviewOpened: false,
        reportRecorded: true,
      );
    } on SafetyActionFailure {
      rethrow;
    } on BackendException catch (error) {
      if (!await isContextCurrent(context)) {
        throw SafetyActionFailure.principalChanged(
          remoteAcceptedOrConfirmed: remoteAccepted,
        );
      }
      final kind = classifyReturnCaseBackendFailure(error);
      if (kind == SafetyActionFailureKind.rejected) {
        throw SafetyActionFailure.rejected(error.code);
      }
      throw SafetyActionFailure.outcomeUnknown(error.code);
    } catch (_) {
      if (!await isContextCurrent(context)) {
        throw SafetyActionFailure.principalChanged(
          remoteAcceptedOrConfirmed: remoteAccepted,
        );
      }
      if (remoteAccepted) {
        throw const SafetyActionFailure.localUnavailable(
          'return_case_local_confirmation_failed',
          remoteAcceptedOrConfirmed: true,
        );
      }
      if (backendEnabled && !qaRuntimeEnabled) {
        throw const SafetyActionFailure.outcomeUnknown(
          'return_case_transport_failed',
        );
      }
      throw const SafetyActionFailure.localUnavailable(
        'local_return_case_failed',
      );
    }
  }

  Future<String?> uploadEvidence({
    required SafetyActionContext context,
    required Uint8List bytes,
    required String filename,
  }) async {
    await _requireCurrent(context);
    if (!backendEnabled || qaRuntimeEnabled) return null;
    try {
      await _requireCurrent(context);
      final result = await uploadEvidenceRemote(
        context: context,
        bytes: bytes,
        filename: filename,
      );
      await _requireCurrent(
        context,
        remoteAcceptedOrConfirmed: true,
      );
      final id = result['id']?.toString() ?? '';
      if (id.isEmpty) {
        throw const SafetyActionFailure.outcomeUnknown(
          'invalid_upload_response',
        );
      }
      return id;
    } on SafetyActionFailure {
      rethrow;
    } on BackendException catch (error) {
      if (!await isContextCurrent(context)) {
        throw const SafetyActionFailure.principalChanged();
      }
      final kind = classifyBackendFailure(error);
      if (kind == SafetyActionFailureKind.rejected) {
        throw SafetyActionFailure.rejected(error.code);
      }
      throw SafetyActionFailure.outcomeUnknown(error.code);
    } catch (_) {
      if (!await isContextCurrent(context)) {
        throw const SafetyActionFailure.principalChanged();
      }
      throw const SafetyActionFailure.outcomeUnknown(
        'evidence_upload_transport_failed',
      );
    }
  }
}
