const String privateShelfDomainVersion = 'P3-A-2026-10-01.1';

enum PrivateShelfCondition {
  newItem('new'),
  likeNew('like-new'),
  good('good'),
  acceptable('acceptable'),
  worn('worn'),
  used('used');

  const PrivateShelfCondition(this.wireValue);

  final String wireValue;

  static PrivateShelfCondition parse(Object? raw) => values.singleWhere(
        (value) => value.wireValue == raw,
        orElse: () => throw const FormatException(
          'private_shelf_condition_invalid',
        ),
      );
}

class PrivateShelfItemPayload {
  const PrivateShelfItemPayload({
    required this.title,
    required this.categoryKey,
    required this.condition,
  });

  final String title;
  final String categoryKey;
  final PrivateShelfCondition condition;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'title': title,
        'categoryKey': categoryKey,
        'condition': condition.wireValue,
      };
}

class PrivateShelfMedia {
  const PrivateShelfMedia({
    required this.mediaId,
    required this.mimeType,
    required this.width,
    required this.height,
    required this.fullPath,
    required this.thumbnailPath,
    required this.createdAt,
  });

  final String mediaId;
  final String mimeType;
  final int width;
  final int height;
  final String fullPath;
  final String thumbnailPath;
  final DateTime createdAt;

  factory PrivateShelfMedia.fromJson(
    Map<String, dynamic> raw, {
    required String shelfItemId,
  }) {
    _expectExactKeys(raw, const <String>{
      'mediaId',
      'mimeType',
      'width',
      'height',
      'fullUrl',
      'thumbnailUrl',
      'createdAt',
    });
    final mediaId = _uuid(raw['mediaId'], 'private_shelf_media_id_invalid');
    final mimeType = raw['mimeType'];
    if (mimeType is! String ||
        !const <String>{'image/jpeg', 'image/png', 'image/webp'}
            .contains(mimeType)) {
      throw const FormatException('private_shelf_media_type_invalid');
    }
    final width =
        _positiveInt(raw['width'], 'private_shelf_media_size_invalid');
    final height =
        _positiveInt(raw['height'], 'private_shelf_media_size_invalid');
    final base = '/v1/private-shelf/$shelfItemId/media/$mediaId';
    final fullPath = raw['fullUrl'];
    final thumbnailPath = raw['thumbnailUrl'];
    if (fullPath != '$base/full' || thumbnailPath != '$base/thumbnail') {
      throw const FormatException('private_shelf_media_path_invalid');
    }
    return PrivateShelfMedia(
      mediaId: mediaId,
      mimeType: mimeType,
      width: width,
      height: height,
      fullPath: fullPath as String,
      thumbnailPath: thumbnailPath as String,
      createdAt: _date(raw['createdAt']),
    );
  }
}

class PrivateShelfItem {
  const PrivateShelfItem({
    required this.shelfItemId,
    required this.domainVersion,
    required this.title,
    required this.categoryKey,
    required this.condition,
    required this.media,
    required this.createdAt,
    required this.updatedAt,
  });

  final String shelfItemId;
  final String domainVersion;
  final String title;
  final String categoryKey;
  final PrivateShelfCondition condition;
  final List<PrivateShelfMedia> media;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory PrivateShelfItem.fromJson(Map<String, dynamic> raw) {
    _expectExactKeys(raw, const <String>{
      'shelfItemId',
      'domainVersion',
      'title',
      'categoryKey',
      'condition',
      'media',
      'visibility',
      'publicListingCreated',
      'reservationCreated',
      'bookingCreated',
      'paymentCreated',
      'externalGenerativeAiUsed',
      'createdAt',
      'updatedAt',
    });
    final shelfItemId = _shelfItemId(raw['shelfItemId']);
    if (raw['domainVersion'] != privateShelfDomainVersion ||
        raw['visibility'] != 'private_owner_only') {
      throw const FormatException('private_shelf_contract_invalid');
    }
    for (final key in const <String>[
      'publicListingCreated',
      'reservationCreated',
      'bookingCreated',
      'paymentCreated',
      'externalGenerativeAiUsed',
    ]) {
      if (raw[key] is! bool || raw[key] != false) {
        throw const FormatException('private_shelf_effect_invalid');
      }
    }
    final title = _text(raw['title'], 160, 'private_shelf_title_invalid');
    final categoryKey =
        _text(raw['categoryKey'], 80, 'private_shelf_category_invalid');
    if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$').hasMatch(categoryKey)) {
      throw const FormatException('private_shelf_category_invalid');
    }
    final mediaRaw = raw['media'];
    if (mediaRaw is! List) {
      throw const FormatException('private_shelf_media_invalid');
    }
    final media = mediaRaw.map((entry) {
      if (entry is! Map) {
        throw const FormatException('private_shelf_media_invalid');
      }
      return PrivateShelfMedia.fromJson(
        Map<String, dynamic>.from(entry),
        shelfItemId: shelfItemId,
      );
    }).toList(growable: false);
    if (media.map((entry) => entry.mediaId).toSet().length != media.length) {
      throw const FormatException('private_shelf_media_invalid');
    }
    return PrivateShelfItem(
      shelfItemId: shelfItemId,
      domainVersion: privateShelfDomainVersion,
      title: title,
      categoryKey: categoryKey,
      condition: PrivateShelfCondition.parse(raw['condition']),
      media: media,
      createdAt: _date(raw['createdAt']),
      updatedAt: _date(raw['updatedAt']),
    );
  }
}

void _expectExactKeys(Map<String, dynamic> raw, Set<String> expected) {
  if (raw.length != expected.length ||
      !raw.keys.toSet().containsAll(expected)) {
    throw const FormatException('private_shelf_shape_invalid');
  }
}

String _text(Object? raw, int maximum, String code) {
  if (raw is! String || raw.trim().isEmpty || raw.trim().length > maximum) {
    throw FormatException(code);
  }
  return raw.trim();
}

String _shelfItemId(Object? raw) {
  if (raw is! String ||
      !RegExp(
        r'^shelf_item_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      ).hasMatch(raw)) {
    throw const FormatException('private_shelf_item_id_invalid');
  }
  return raw;
}

String _uuid(Object? raw, String code) {
  if (raw is! String ||
      !RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      ).hasMatch(raw)) {
    throw FormatException(code);
  }
  return raw;
}

int _positiveInt(Object? raw, String code) {
  if (raw is! int || raw < 1 || raw > 10000) throw FormatException(code);
  return raw;
}

DateTime _date(Object? raw) {
  if (raw is! String) throw const FormatException('private_shelf_date_invalid');
  final parsed = DateTime.tryParse(raw);
  if (parsed == null || !parsed.isUtc) {
    throw const FormatException('private_shelf_date_invalid');
  }
  return parsed;
}
