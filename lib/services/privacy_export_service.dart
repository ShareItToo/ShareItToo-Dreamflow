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

enum PrivacyExportPurpose {
  accessCopy('access_copy'),
  dataPortability('data_portability');

  final String wireValue;
  const PrivacyExportPurpose(this.wireValue);

  String get filename => switch (this) {
        PrivacyExportPurpose.accessCopy => 'shareittoo-access-copy.json',
        PrivacyExportPurpose.dataPortability =>
          'shareittoo-data-portability.json',
      };
}

const _portabilityLocalSections = <PrivacyExportSection>[
  PrivacyExportSection.accountProfile,
  PrivacyExportSection.savedItems,
  PrivacyExportSection.ownedListings,
];

final _privacyCredentialKeyPattern = RegExp(
  r'(password|passcode|credential|access.?token|refresh.?token|authorization|cookie|private.?key|api.?key)',
  caseSensitive: false,
);
final _privacyIdentifierKeyPattern = RegExp(r'(^id$|_id$|_ids$|Id$|Ids$)');
const _withheldLocalPrivacyKeys = <String>{
  'storageKey',
  'storageKeys',
  'payoutAccountId',
  'sessionId',
  'deviceLabel',
  'userAgent',
  'ipAddress',
  'providerSubject',
  'firebaseUserId',
};
const _withheldPortabilityInferenceKeys = <String>{
  'avgRating',
  'reviewCount',
  'isVerified',
  'isBanned',
  'verificationStatus',
  'timesLent',
  'otherUserOnline',
  'otherUserLastActive',
  'moderationStatus',
  'moderationReasonCode',
};

class _LocalExportReferenceMapper {
  final Map<String, String> _references = <String, String>{};

  void collect(Object? value) {
    if (value is List) {
      for (final entry in value) {
        collect(entry);
      }
      return;
    }
    if (value is! Map) return;
    for (final entry in value.entries) {
      final key = entry.key.toString();
      if (_privacyIdentifierKeyPattern.hasMatch(key)) {
        final identifiers =
            entry.value is List ? entry.value as List : <Object?>[entry.value];
        for (final identifier in identifiers) {
          if (identifier is String && identifier.trim().isNotEmpty) {
            _references.putIfAbsent(
              identifier,
              () =>
                  'local_ref_${(_references.length + 1).toString().padLeft(6, '0')}',
            );
          }
        }
      }
      collect(entry.value);
    }
  }

  Object? sanitize(Object? value, PrivacyExportPurpose purpose) {
    if (value is List) {
      return value.map((entry) => sanitize(entry, purpose)).toList();
    }
    if (value is! Map) {
      return value is String ? _references[value] ?? value : value;
    }
    final result = <String, dynamic>{};
    for (final entry in value.entries) {
      final rawKey = entry.key.toString();
      if (_privacyCredentialKeyPattern.hasMatch(rawKey) ||
          _withheldLocalPrivacyKeys.contains(rawKey) ||
          (purpose == PrivacyExportPurpose.dataPortability &&
              _withheldPortabilityInferenceKeys.contains(rawKey))) {
        continue;
      }
      final key = _references[rawKey] ?? rawKey;
      result[key] = sanitize(entry.value, purpose);
    }
    return result;
  }
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
    PrivacyExportPurpose purpose,
  ) =>
      BackendRepository.exportAccountData(
        owner: owner,
        currentPassword: currentPassword,
        exportPurpose: purpose.wireValue,
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
    PrivacyExportPurpose purpose = PrivacyExportPurpose.accessCopy,
  }) async {
    await requireOwner(owner);
    final remote = await readRemote(owner, currentPassword, purpose);
    await requireOwner(owner);
    if (remote['schemaVersion'] != '2.0' ||
        remote['exportPurpose'] != purpose.wireValue ||
        remote['accountId'] != owner.userId ||
        remote['policy'] is! Map ||
        remote['data'] is! Map ||
        remote['generatedAt'] is! String ||
        DateTime.tryParse(remote['generatedAt'] as String) == null) {
      throw const FormatException('Invalid account export response.');
    }
    final local = <String, dynamic>{};
    final sections = purpose == PrivacyExportPurpose.dataPortability
        ? _portabilityLocalSections
        : PrivacyExportSection.values;
    for (final section in sections) {
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
    final mapper = _LocalExportReferenceMapper()..collect(local);
    final minimized = mapper.sanitize(local, purpose);
    if (minimized is! Map<String, dynamic>) {
      throw const FormatException('Invalid local account export payload.');
    }
    return <String, dynamic>{
      ...remote,
      'localDevice': minimized,
      'localDevicePolicy': <String, dynamic>{
        'version': 'sit-local-account-export-policy-v2',
        'purpose': purpose.wireValue,
        'referenceScope': 'local_device_document',
        'rawInternalIdentifiersIncluded': false,
        'authenticationMaterialIncluded': false,
        'includedSections': sections.map((section) => section.name).toList(),
      },
    };
  }
}
