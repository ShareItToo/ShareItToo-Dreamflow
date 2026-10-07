import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class BlueOceanDraftRecoveryStorage {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class FlutterSecureBlueOceanDraftRecoveryStorage
    implements BlueOceanDraftRecoveryStorage {
  const FlutterSecureBlueOceanDraftRecoveryStorage();

  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

class BlueOceanDraftRecoverySnapshot {
  const BlueOceanDraftRecoverySnapshot({
    required this.ownerId,
    required this.draftId,
    required this.savedAtUtc,
    required this.assistant,
    required this.managedPhotoUrls,
    required this.editableFields,
  });

  final String ownerId;
  final String draftId;
  final DateTime savedAtUtc;
  final Map<String, dynamic> assistant;
  final List<String> managedPhotoUrls;
  final Map<String, dynamic> editableFields;
}

class BlueOceanDraftRecoveryService {
  BlueOceanDraftRecoveryService({
    BlueOceanDraftRecoveryStorage? storage,
    DateTime Function()? nowUtc,
  })  : _storage =
            storage ?? const FlutterSecureBlueOceanDraftRecoveryStorage(),
        _nowUtc = nowUtc ?? (() => DateTime.now().toUtc());

  static const String _storageKey = 'blue_ocean_draft_recovery_v1';
  static const String _schemaVersion = 'blue-ocean-draft-recovery-v1';
  static const Duration retention = Duration(hours: 24);
  static const int _maximumEncodedBytes = 128 * 1024;
  static final RegExp _ownerIdPattern = RegExp(r'^[A-Za-z0-9_.:-]{1,160}$');
  static final RegExp _draftIdPattern = RegExp(
    r'^listing_ai_draft_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  );

  final BlueOceanDraftRecoveryStorage _storage;
  final DateTime Function() _nowUtc;

  Future<void> save(BlueOceanDraftRecoverySnapshot snapshot) async {
    final ownerId = snapshot.ownerId.trim();
    final draftId = snapshot.draftId.trim();
    if (!_ownerIdPattern.hasMatch(ownerId) ||
        !_draftIdPattern.hasMatch(draftId) ||
        snapshot.managedPhotoUrls.isEmpty ||
        snapshot.managedPhotoUrls.length > 4 ||
        snapshot.managedPhotoUrls.any(_unsafePhotoReference)) {
      throw const FormatException('invalid_blue_ocean_recovery_snapshot');
    }
    final payload = <String, dynamic>{
      'schemaVersion': _schemaVersion,
      'ownerId': ownerId,
      'draftId': draftId,
      'savedAtUtc': snapshot.savedAtUtc.toUtc().toIso8601String(),
      'assistant': snapshot.assistant,
      'managedPhotoUrls': snapshot.managedPhotoUrls,
      'editableFields': snapshot.editableFields,
    };
    final encoded = jsonEncode(payload);
    if (utf8.encode(encoded).length > _maximumEncodedBytes) {
      throw const FormatException('blue_ocean_recovery_snapshot_too_large');
    }
    await _storage.write(_storageKey, encoded);
  }

  Future<BlueOceanDraftRecoverySnapshot?> readForOwner(String ownerId) async {
    final normalizedOwnerId = ownerId.trim();
    final encoded = await _storage.read(_storageKey);
    if (encoded == null || encoded.isEmpty) return null;
    try {
      if (utf8.encode(encoded).length > _maximumEncodedBytes) {
        throw const FormatException('blue_ocean_recovery_snapshot_too_large');
      }
      final decoded = jsonDecode(encoded);
      if (decoded is! Map) {
        throw const FormatException('invalid_blue_ocean_recovery_snapshot');
      }
      final payload = Map<String, dynamic>.from(decoded);
      if (payload['schemaVersion'] != _schemaVersion ||
          payload['ownerId'] != normalizedOwnerId ||
          !_ownerIdPattern.hasMatch(normalizedOwnerId)) {
        await clear();
        return null;
      }
      final draftId = payload['draftId'];
      final savedAt =
          DateTime.tryParse(payload['savedAtUtc']?.toString() ?? '');
      final assistant = payload['assistant'];
      final photoUrls = payload['managedPhotoUrls'];
      final editableFields = payload['editableFields'];
      if (draftId is! String ||
          !_draftIdPattern.hasMatch(draftId) ||
          savedAt == null ||
          assistant is! Map ||
          photoUrls is! List ||
          photoUrls.isEmpty ||
          photoUrls.length > 4 ||
          photoUrls.any(
              (entry) => entry is! String || _unsafePhotoReference(entry)) ||
          editableFields is! Map) {
        throw const FormatException('invalid_blue_ocean_recovery_snapshot');
      }
      final age = _nowUtc().difference(savedAt.toUtc());
      if (age.isNegative || age > retention) {
        await clear();
        return null;
      }
      return BlueOceanDraftRecoverySnapshot(
        ownerId: normalizedOwnerId,
        draftId: draftId,
        savedAtUtc: savedAt.toUtc(),
        assistant: Map<String, dynamic>.from(assistant),
        managedPhotoUrls: List<String>.unmodifiable(photoUrls.cast<String>()),
        editableFields: Map<String, dynamic>.from(editableFields),
      );
    } on FormatException {
      await clear();
      return null;
    } on TypeError {
      await clear();
      return null;
    }
  }

  Future<void> clear() => _storage.delete(_storageKey);

  static bool _unsafePhotoReference(Object? value) {
    if (value is! String) return true;
    final candidate = value.trim();
    final uri = Uri.tryParse(candidate);
    return candidate.length > 2048 ||
        uri == null ||
        !uri.hasScheme ||
        !const <String>{'http', 'https'}.contains(uri.scheme) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.fragment.isNotEmpty ||
        candidate.startsWith('data:');
  }
}
