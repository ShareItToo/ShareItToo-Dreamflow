import 'dart:typed_data';

import 'package:lendify/models/private_shelf_item.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';

class PrivateShelfWriteResult {
  const PrivateShelfWriteResult({
    required this.shelfItem,
    required this.replayed,
  });

  final PrivateShelfItem shelfItem;
  final bool replayed;
}

class PrivateShelfMediaBytes {
  const PrivateShelfMediaBytes({
    required this.bytes,
    required this.mimeType,
  });

  final Uint8List bytes;
  final String mimeType;
}

abstract class PrivateShelfGateway {
  Future<List<PrivateShelfItem>> list(AuthSessionOwner owner);

  Future<PrivateShelfItem> load({
    required AuthSessionOwner owner,
    required String shelfItemId,
  });

  Future<PrivateShelfWriteResult> create({
    required AuthSessionOwner owner,
    required PrivateShelfItemPayload payload,
    required String idempotencyKey,
  });

  Future<void> delete({
    required AuthSessionOwner owner,
    required String shelfItemId,
  });

  Future<PrivateShelfMedia> uploadMedia({
    required AuthSessionOwner owner,
    required String shelfItemId,
    required Uint8List bytes,
    required String filename,
  });

  Future<PrivateShelfMediaBytes> readMedia({
    required AuthSessionOwner owner,
    required String shelfItemId,
    required PrivateShelfMedia media,
    required bool thumbnail,
  });
}

typedef PrivateShelfOwnerCheck = Future<bool> Function(AuthSessionOwner owner);

class BackendPrivateShelfGateway implements PrivateShelfGateway {
  const BackendPrivateShelfGateway({
    PrivateShelfOwnerCheck ownerCheck =
        AuthService.isSessionOwnerDefinitelyCurrent,
  }) : _ownerCheck = ownerCheck;

  final PrivateShelfOwnerCheck _ownerCheck;

  Future<void> _requireCurrent(AuthSessionOwner owner) async {
    if (!await _ownerCheck(owner)) {
      throw const BackendException(409, 'principal_changed');
    }
  }

  @override
  Future<List<PrivateShelfItem>> list(AuthSessionOwner owner) async {
    await _requireCurrent(owner);
    final rows = await BackendRepository.getPrivateShelfItemsForOwner(owner);
    await _requireCurrent(owner);
    return rows.map(PrivateShelfItem.fromJson).toList(growable: false);
  }

  @override
  Future<PrivateShelfItem> load({
    required AuthSessionOwner owner,
    required String shelfItemId,
  }) async {
    await _requireCurrent(owner);
    final row = await BackendRepository.getPrivateShelfItemForOwner(
      owner: owner,
      shelfItemId: shelfItemId,
    );
    await _requireCurrent(owner);
    return PrivateShelfItem.fromJson(row);
  }

  @override
  Future<PrivateShelfWriteResult> create({
    required AuthSessionOwner owner,
    required PrivateShelfItemPayload payload,
    required String idempotencyKey,
  }) async {
    await _requireCurrent(owner);
    final response = await BackendRepository.createPrivateShelfItemForOwner(
      owner: owner,
      payload: payload.toJson(),
      idempotencyKey: idempotencyKey,
    );
    await _requireCurrent(owner);
    if (response.length != 2 ||
        response['shelfItem'] is! Map ||
        response['replayed'] is! bool) {
      throw const FormatException('private_shelf_write_result_invalid');
    }
    return PrivateShelfWriteResult(
      shelfItem: PrivateShelfItem.fromJson(
        Map<String, dynamic>.from(response['shelfItem'] as Map),
      ),
      replayed: response['replayed'] as bool,
    );
  }

  @override
  Future<void> delete({
    required AuthSessionOwner owner,
    required String shelfItemId,
  }) async {
    await _requireCurrent(owner);
    await BackendRepository.deletePrivateShelfItemForOwner(
      owner: owner,
      shelfItemId: shelfItemId,
    );
    await _requireCurrent(owner);
  }

  @override
  Future<PrivateShelfMedia> uploadMedia({
    required AuthSessionOwner owner,
    required String shelfItemId,
    required Uint8List bytes,
    required String filename,
  }) async {
    await _requireCurrent(owner);
    final row = await BackendRepository.uploadPrivateShelfMediaForOwner(
      owner: owner,
      shelfItemId: shelfItemId,
      bytes: bytes,
      filename: filename,
    );
    await _requireCurrent(owner);
    return PrivateShelfMedia.fromJson(row, shelfItemId: shelfItemId);
  }

  @override
  Future<PrivateShelfMediaBytes> readMedia({
    required AuthSessionOwner owner,
    required String shelfItemId,
    required PrivateShelfMedia media,
    required bool thumbnail,
  }) async {
    await _requireCurrent(owner);
    final response = await BackendRepository.readPrivateShelfMediaForOwner(
      owner: owner,
      shelfItemId: shelfItemId,
      mediaId: media.mediaId,
      variant: thumbnail ? 'thumbnail' : 'full',
    );
    await _requireCurrent(owner);
    final contentType =
        response.headers['content-type']?.split(';').first.trim();
    final cacheControl = response.headers['cache-control']?.toLowerCase() ?? '';
    final contentLength =
        int.tryParse(response.headers['content-length'] ?? '');
    if (contentType != media.mimeType ||
        !cacheControl.contains('private') ||
        !cacheControl.contains('no-store') ||
        response.bytes.isEmpty ||
        response.bytes.length > 8 * 1024 * 1024 ||
        (contentLength != null && contentLength != response.bytes.length)) {
      throw const FormatException('private_shelf_media_response_invalid');
    }
    return PrivateShelfMediaBytes(
      bytes: response.bytes,
      mimeType: contentType!,
    );
  }
}
