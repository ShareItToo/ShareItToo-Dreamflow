import 'package:flutter/foundation.dart' show protected;
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_safety_privacy_service.dart';

class PrivacyExportPrincipalChanged implements Exception {
  const PrivacyExportPrincipalChanged();
}

enum PrivacyExportSection {
  accountProfile,
  savedItems,
  ownedListings,
  reviews,
  operationalRecords,
  safetyPrivacy,
}

/// Builds one export for one immutable, token-free session owner. A successor
/// session never supplies credentials or local sections to this operation.
class PrivacyExportService {
  const PrivacyExportService();

  int get sessionEpoch => AuthService.sessionEpoch;

  @protected
  Future<AuthSession?> readSession() => AuthService.readSession();

  Future<AuthSessionOwner?> loadOwner() async {
    final epoch = sessionEpoch;
    final session = await readSession();
    if (session == null || epoch != sessionEpoch) return null;
    final owner = AuthService.captureSessionOwner(session);
    if ((owner.userId ?? '').trim().isEmpty ||
        !await isOwnerCurrent(owner) ||
        epoch != sessionEpoch) {
      return null;
    }
    return owner;
  }

  Future<bool> isOwnerCurrent(AuthSessionOwner owner) =>
      AuthService.isSessionOwnerDefinitelyCurrent(owner);

  Future<void> requireOwner(AuthSessionOwner owner) async {
    if (owner.epoch != sessionEpoch ||
        !await isOwnerCurrent(owner) ||
        owner.epoch != sessionEpoch) {
      throw const PrivacyExportPrincipalChanged();
    }
  }

  @protected
  Future<Map<String, dynamic>> readRemote(
    AuthSessionOwner owner,
    String currentPassword,
  ) =>
      BackendRepository.exportAccountData(
        owner: owner,
        currentPassword: currentPassword,
      );

  @protected
  Future<Map<String, dynamic>> readLocal(PrivacyExportSection section) async =>
      switch (section) {
        PrivacyExportSection.accountProfile =>
          await DataService.exportCurrentAccountProfileForPrivacy(),
        PrivacyExportSection.savedItems =>
          await DataService.exportSavedItemsForPrivacy(),
        PrivacyExportSection.ownedListings =>
          await DataService.exportOwnedListingsForPrivacy(),
        PrivacyExportSection.reviews =>
          await DataService.exportReviewRecordsForPrivacy(),
        PrivacyExportSection.operationalRecords =>
          await DataService.exportOperationalRecordsForPrivacy(),
        PrivacyExportSection.safetyPrivacy =>
          await LocalSafetyPrivacyService.exportCurrentPrincipal(),
      };

  Future<Map<String, dynamic>> prepare({
    required AuthSessionOwner owner,
    required String currentPassword,
  }) async {
    await requireOwner(owner);
    final remote = await readRemote(owner, currentPassword);
    await requireOwner(owner);
    if (remote['schemaVersion'] != '1.0' ||
        remote['accountId'] != owner.userId ||
        remote['data'] is! Map ||
        remote['generatedAt'] is! String ||
        DateTime.tryParse(remote['generatedAt'] as String) == null) {
      throw const FormatException('Invalid account export response.');
    }
    final local = <String, dynamic>{};
    for (final section in PrivacyExportSection.values) {
      await requireOwner(owner);
      final value = await readLocal(section);
      await requireOwner(owner);
      if (value.containsKey('accountId') &&
          value['accountId'] != owner.userId) {
        throw const FormatException('Invalid local account export owner.');
      }
      local[section.name] = value;
    }
    await requireOwner(owner);
    return <String, dynamic>{...remote, 'localDevice': local};
  }
}
