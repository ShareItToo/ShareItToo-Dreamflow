import 'dart:typed_data';

import 'package:flutter/foundation.dart' show protected;
import 'package:lendify/models/item.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/session_transition_service.dart';

enum ListingMutationFailureKind {
  rejected,
  localUnavailable,
  outcomeUnknown,
  principalChanged,
}

class ListingMutationFailure implements Exception {
  final ListingMutationFailureKind kind;
  final String? code;
  final bool remoteAccepted;

  const ListingMutationFailure._(
    this.kind, {
    this.code,
    this.remoteAccepted = false,
  });

  const ListingMutationFailure.rejected(String code)
      : this._(ListingMutationFailureKind.rejected, code: code);

  const ListingMutationFailure.localUnavailable(
    String? code, {
    bool remoteAccepted = false,
  }) : this._(
          ListingMutationFailureKind.localUnavailable,
          code: code,
          remoteAccepted: remoteAccepted,
        );

  const ListingMutationFailure.outcomeUnknown([String? code])
      : this._(ListingMutationFailureKind.outcomeUnknown, code: code);

  const ListingMutationFailure.principalChanged({
    bool remoteAccepted = false,
  }) : this._(
          ListingMutationFailureKind.principalChanged,
          remoteAccepted: remoteAccepted,
        );
}

class ListingMutationContext {
  final User user;
  final SessionTransitionOwner owner;

  const ListingMutationContext({
    required this.user,
    required this.owner,
  });
}

class ListingMutationActionOwner {
  final ListingMutationContext context;
  final int actionEpoch;

  const ListingMutationActionOwner({
    required this.context,
    required this.actionEpoch,
  });

  bool isSynchronouslyCurrent({
    required ListingMutationContext? context,
    required int actionEpoch,
  }) =>
      identical(this.context, context) && this.actionEpoch == actionEpoch;
}

enum ListingMutationOperation {
  create,
  update,
  updateStatus,
  delete,
}

class ListingMutationCommand {
  final ListingMutationOperation operation;
  final Item item;
  final String? status;
  final Map<String, dynamic>? supplyEnrichmentLink;
  final String? blueOceanDraftId;
  final Map<String, dynamic>? blueOceanReview;

  const ListingMutationCommand._({
    required this.operation,
    required this.item,
    this.status,
    this.supplyEnrichmentLink,
    this.blueOceanDraftId,
    this.blueOceanReview,
  });

  const ListingMutationCommand.create(
    Item item, {
    Map<String, dynamic>? supplyEnrichmentLink,
    String? blueOceanDraftId,
    Map<String, dynamic>? blueOceanReview,
  }) : this._(
          operation: ListingMutationOperation.create,
          item: item,
          supplyEnrichmentLink: supplyEnrichmentLink,
          blueOceanDraftId: blueOceanDraftId,
          blueOceanReview: blueOceanReview,
        );

  const ListingMutationCommand.update(Item item)
      : this._(operation: ListingMutationOperation.update, item: item);

  const ListingMutationCommand.updateStatus(Item item, String status)
      : this._(
          operation: ListingMutationOperation.updateStatus,
          item: item,
          status: status,
        );

  const ListingMutationCommand.delete(Item item)
      : this._(operation: ListingMutationOperation.delete, item: item);
}

/// Principal-bound coordinator for listing/media/draft actions. It stores no
/// credential and requires the exact captured owner at every remote boundary.
class ListingMutationService {
  final SessionTransitionService _sessionTransitions;

  const ListingMutationService({
    SessionTransitionService sessionTransitions =
        const SessionTransitionService(),
  }) : _sessionTransitions = sessionTransitions;

  Future<ListingMutationContext?> loadCurrentContext() async {
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
    return ListingMutationContext(user: user, owner: owner);
  }

  Future<bool> isContextCurrent(ListingMutationContext context) async {
    if (!await _sessionTransitions.isOwnerCurrent(context.owner)) return false;
    final current =
        await _sessionTransitions.cachedCurrentUserForOwner(context.owner);
    return current != null &&
        current.id.trim() == context.user.id.trim() &&
        current.email.trim().toLowerCase() ==
            context.user.email.trim().toLowerCase() &&
        await _sessionTransitions.isOwnerCurrent(context.owner);
  }

  static ListingMutationFailureKind classifyBackendFailure(
    BackendException error,
  ) {
    const rejected = <int, Set<String>>{
      400: <String>{
        'invalid_listing',
        'listing_title_required',
        'listing_description_too_short',
        'listing_category_required',
        'invalid_listing_condition',
        'invalid_listing_price',
        'listing_location_required',
        'invalid_listing_coordinates',
        'invalid_listing_duration',
        'invalid_handover_radius',
        'listing_photo_required',
        'listing_photo_must_be_uploaded',
        'listing_photo_not_found',
        'listing_photo_not_approved',
        'invalid_listing_status',
        'listing_revision_required',
        'private_pilot_listing_declaration_required',
        'private_pilot_category_not_allowed',
        'private_pilot_subcategory_not_allowed',
        'private_pilot_country_not_allowed',
        'private_pilot_region_not_allowed',
      },
      401: <String>{
        'authentication_required',
        'invalid_or_expired_session',
        'account_not_active',
      },
      403: <String>{
        'listing_forbidden',
        'listing_photo_forbidden',
        'action_blocked_by_moderation',
      },
      404: <String>{'listing_not_found', 'user_not_found'},
      409: <String>{
        'listing_revision_conflict',
        'listing_locked_by_moderation',
        'listing_photo_already_used',
        'private_pilot_account_declaration_required',
        'private_pilot_commercial_review_blocked',
        'private_pilot_listing_declaration_required',
        'private_pilot_category_not_allowed',
        'private_pilot_subcategory_not_allowed',
        'private_pilot_country_not_allowed',
        'private_pilot_region_not_allowed',
        'private_pilot_listing_region_unbound',
      },
      429: <String>{'rate_limit_exceeded'},
    };
    return rejected[error.statusCode]?.contains(error.code) == true
        ? ListingMutationFailureKind.rejected
        : ListingMutationFailureKind.outcomeUnknown;
  }

  @protected
  Future<AccountListingMutationResult> performListingMutation({
    required ListingMutationContext context,
    required ListingMutationCommand command,
  }) {
    final owner = context.owner.authOwner;
    return switch (command.operation) {
      ListingMutationOperation.create => DataService.addItemForOwner(
          owner: owner,
          item: command.item,
          supplyEnrichmentLink: command.supplyEnrichmentLink,
          blueOceanDraftId: command.blueOceanDraftId,
          blueOceanReview: command.blueOceanReview,
        ),
      ListingMutationOperation.update => DataService.updateItemForOwner(
          owner: owner,
          updated: command.item,
        ),
      ListingMutationOperation.updateStatus =>
        DataService.updateItemStatusForOwner(
          owner: owner,
          expectedOwnerId: command.item.ownerId,
          itemId: command.item.id,
          status: command.status ?? '',
        ),
      ListingMutationOperation.delete => DataService.deleteItemByIdForOwner(
          owner: owner,
          expectedOwnerId: command.item.ownerId,
          itemId: command.item.id,
        ),
    };
  }

  Future<AccountListingMutationResult> execute({
    required ListingMutationContext context,
    required ListingMutationCommand command,
  }) async {
    if (command.item.ownerId.trim() != context.user.id.trim() ||
        !await isContextCurrent(context)) {
      throw const ListingMutationFailure.principalChanged();
    }
    try {
      if (!await isContextCurrent(context)) {
        throw const ListingMutationFailure.principalChanged();
      }
      final result = await performListingMutation(
        context: context,
        command: command,
      );
      if (!await isContextCurrent(context)) {
        throw ListingMutationFailure.principalChanged(
          remoteAccepted: result.remoteAccepted,
        );
      }
      return result;
    } on ListingMutationFailure {
      rethrow;
    } on AccountListingMutationFailure catch (failure) {
      throw switch (failure.kind) {
        AccountListingMutationFailureKind.rejected =>
          ListingMutationFailure.rejected(failure.code ?? 'rejected'),
        AccountListingMutationFailureKind.localUnavailable =>
          ListingMutationFailure.localUnavailable(
            failure.code,
            remoteAccepted: failure.remoteAccepted,
          ),
        AccountListingMutationFailureKind.outcomeUnknown =>
          ListingMutationFailure.outcomeUnknown(failure.code),
        AccountListingMutationFailureKind.principalChanged =>
          ListingMutationFailure.principalChanged(
            remoteAccepted: failure.remoteAccepted,
          ),
      };
    } on BackendException catch (error) {
      if (!await isContextCurrent(context)) {
        throw const ListingMutationFailure.principalChanged();
      }
      if (classifyBackendFailure(error) ==
          ListingMutationFailureKind.rejected) {
        throw ListingMutationFailure.rejected(error.code);
      }
      throw ListingMutationFailure.outcomeUnknown(error.code);
    } catch (_) {
      if (!await isContextCurrent(context)) {
        throw const ListingMutationFailure.principalChanged();
      }
      throw const ListingMutationFailure.localUnavailable(
        'local_listing_mutation_failed',
      );
    }
  }

  Future<String> uploadImage({
    required ListingMutationContext context,
    required Uint8List bytes,
    required String filename,
  }) async {
    if (!await isContextCurrent(context)) {
      throw const ListingMutationFailure.principalChanged();
    }
    try {
      final url = await BackendRepository.uploadImageForOwner(
        owner: context.owner.authOwner,
        bytes: bytes,
        filename: filename,
      );
      if (!await isContextCurrent(context)) {
        throw const ListingMutationFailure.principalChanged(
          remoteAccepted: true,
        );
      }
      return url;
    } on ListingMutationFailure {
      rethrow;
    } on BackendException catch (error) {
      if (!await isContextCurrent(context)) {
        throw const ListingMutationFailure.principalChanged();
      }
      throw ListingMutationFailure.outcomeUnknown(error.code);
    } catch (_) {
      if (!await isContextCurrent(context)) {
        throw const ListingMutationFailure.principalChanged();
      }
      throw const ListingMutationFailure.localUnavailable(
        'local_listing_media_failed',
      );
    }
  }

  Future<Map<String, dynamic>> analyzeBlueOceanDraft({
    required ListingMutationContext context,
    required String draftId,
    required String generationKey,
    required List<String> photoUrls,
    required Map<String, dynamic> consent,
    List<Map<String, dynamic>>? onDeviceAnalysis,
  }) =>
      _runOwnedDraftAction(
        context: context,
        action: () => BackendRepository.analyzeBlueOceanListingDraftForOwner(
          owner: context.owner.authOwner,
          draftId: draftId,
          generationKey: generationKey,
          photoUrls: photoUrls,
          consent: consent,
          onDeviceAnalysis: onDeviceAnalysis,
        ),
      );

  Future<Map<String, dynamic>> reviewBlueOceanDraft({
    required ListingMutationContext context,
    required String draftId,
    required Map<String, dynamic> review,
  }) =>
      _runOwnedDraftAction(
        context: context,
        action: () => BackendRepository.reviewBlueOceanListingDraftForOwner(
          owner: context.owner.authOwner,
          draftId: draftId,
          review: review,
        ),
      );

  Future<Map<String, dynamic>> generateSupplyEnrichment({
    required ListingMutationContext context,
    required String listingId,
  }) =>
      _runOwnedDraftAction(
        context: context,
        action: () => BackendRepository.generateListingSupplyEnrichmentForOwner(
          owner: context.owner.authOwner,
          listingId: listingId,
        ),
      );

  Future<Map<String, dynamic>> recordSupplyEnrichmentOutcome({
    required ListingMutationContext context,
    required String listingId,
    required String suggestionId,
    required String outcome,
  }) =>
      _runOwnedDraftAction(
        context: context,
        action: () =>
            BackendRepository.recordListingSupplyEnrichmentOutcomeForOwner(
          owner: context.owner.authOwner,
          listingId: listingId,
          suggestionId: suggestionId,
          outcome: outcome,
        ),
      );

  Future<Map<String, dynamic>> _runOwnedDraftAction({
    required ListingMutationContext context,
    required Future<Map<String, dynamic>> Function() action,
  }) async {
    if (!await isContextCurrent(context)) {
      throw const ListingMutationFailure.principalChanged();
    }
    try {
      final result = await action();
      if (!await isContextCurrent(context)) {
        throw const ListingMutationFailure.principalChanged(
          remoteAccepted: true,
        );
      }
      return result;
    } on ListingMutationFailure {
      rethrow;
    } on BackendException catch (error) {
      if (!await isContextCurrent(context)) {
        throw const ListingMutationFailure.principalChanged();
      }
      if (classifyBackendFailure(error) ==
          ListingMutationFailureKind.rejected) {
        throw ListingMutationFailure.rejected(error.code);
      }
      throw ListingMutationFailure.outcomeUnknown(error.code);
    } catch (_) {
      if (!await isContextCurrent(context)) {
        throw const ListingMutationFailure.principalChanged();
      }
      throw const ListingMutationFailure.localUnavailable(
        'local_listing_draft_failed',
      );
    }
  }
}
