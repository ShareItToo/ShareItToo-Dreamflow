const String missionNeedDomainVersion = 'P2-A-2026-10-01.1';

enum MissionNeedNecessity { required, optional }

enum MissionNeedStatus { draft, planned }

class MissionNeedItem {
  const MissionNeedItem({
    required this.needKey,
    required this.necessity,
    required this.quantity,
  });

  final String needKey;
  final MissionNeedNecessity necessity;
  final int quantity;

  factory MissionNeedItem.fromJson(Object? raw) {
    final value = _object(raw, 'mission_need_item_invalid');
    _exactKeys(
      value,
      const <String>{'needKey', 'necessity', 'quantity'},
      'mission_need_item_invalid',
    );
    final needKey = _text(value['needKey'], 'mission_need_item_invalid');
    if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$').hasMatch(needKey)) {
      throw const FormatException('mission_need_item_invalid');
    }
    final quantity = value['quantity'];
    if (quantity is! int || quantity < 1 || quantity > 100) {
      throw const FormatException('mission_need_item_invalid');
    }
    return MissionNeedItem(
      needKey: needKey,
      necessity: switch (value['necessity']) {
        'required' => MissionNeedNecessity.required,
        'optional' => MissionNeedNecessity.optional,
        _ => throw const FormatException('mission_need_item_invalid'),
      },
      quantity: quantity,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'needKey': needKey,
        'necessity': necessity.name,
        'quantity': quantity,
      };
}

class MissionNeedPayload {
  const MissionNeedPayload({
    required this.title,
    required this.status,
    required this.needs,
  });

  final String title;
  final MissionNeedStatus status;
  final List<MissionNeedItem> needs;

  factory MissionNeedPayload.fromJson(Object? raw) {
    final value = _object(raw, 'mission_need_payload_invalid');
    _exactKeys(
      value,
      const <String>{'title', 'status', 'needs'},
      'mission_need_payload_invalid',
    );
    final title = _text(value['title'], 'mission_need_payload_invalid');
    if (title.length > 160) {
      throw const FormatException('mission_need_payload_invalid');
    }
    final rawNeeds = value['needs'];
    if (rawNeeds is! List || rawNeeds.isEmpty || rawNeeds.length > 50) {
      throw const FormatException('mission_need_payload_invalid');
    }
    final needs =
        rawNeeds.map(MissionNeedItem.fromJson).toList(growable: false);
    if (needs.map((need) => need.needKey).toSet().length != needs.length) {
      throw const FormatException('mission_need_payload_invalid');
    }
    return MissionNeedPayload(
      title: title,
      status: switch (value['status']) {
        'draft' => MissionNeedStatus.draft,
        'planned' => MissionNeedStatus.planned,
        _ => throw const FormatException('mission_need_payload_invalid'),
      },
      needs: needs,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'title': title,
        'status': status.name,
        'needs': needs.map((need) => need.toJson()).toList(growable: false),
      };
}

class MissionNeedRevision {
  const MissionNeedRevision({
    required this.revision,
    required this.status,
    required this.payload,
    required this.payloadDigest,
    required this.createdAt,
  });

  final int revision;
  final MissionNeedStatus status;
  final MissionNeedPayload payload;
  final String payloadDigest;
  final DateTime createdAt;

  factory MissionNeedRevision.fromJson(Object? raw) {
    final value = _object(raw, 'mission_need_revision_invalid');
    _exactKeys(
      value,
      const <String>{
        'revision',
        'status',
        'payload',
        'payloadDigest',
        'createdAt',
      },
      'mission_need_revision_invalid',
    );
    final revision = _positiveRevision(value['revision']);
    final payload = MissionNeedPayload.fromJson(value['payload']);
    final status = _status(value['status']);
    if (payload.status != status) {
      throw const FormatException('mission_need_revision_invalid');
    }
    return MissionNeedRevision(
      revision: revision,
      status: status,
      payload: payload,
      payloadDigest: _digest(value['payloadDigest']),
      createdAt: _date(value['createdAt']),
    );
  }
}

class MissionNeed {
  const MissionNeed({
    required this.missionNeedId,
    required this.domainVersion,
    required this.revision,
    required this.status,
    required this.payload,
    required this.payloadDigest,
    required this.createdAt,
    required this.updatedAt,
    required this.revisions,
  });

  final String missionNeedId;
  final String domainVersion;
  final int revision;
  final MissionNeedStatus status;
  final MissionNeedPayload payload;
  final String payloadDigest;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<MissionNeedRevision> revisions;

  factory MissionNeed.fromJson(Object? raw) {
    final value = _object(raw, 'mission_need_invalid');
    const baseKeys = <String>{
      'missionNeedId',
      'domainVersion',
      'revision',
      'status',
      'payload',
      'payloadDigest',
      'createdAt',
      'updatedAt',
      'bindingStatus',
      'reservationCreated',
      'bookingCreated',
      'contractCreated',
      'paymentCreated',
      'externalGenerativeAiUsed',
      'automaticPhotoAnalysisUsed',
    };
    final allowed = <String>{...baseKeys, 'revisions'};
    if (!value.keys.toSet().containsAll(baseKeys) ||
        value.keys.any((key) => !allowed.contains(key))) {
      throw const FormatException('mission_need_invalid');
    }
    final id = _text(value['missionNeedId'], 'mission_need_invalid');
    if (!RegExp(
      r'^mission_need_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    ).hasMatch(id)) {
      throw const FormatException('mission_need_invalid');
    }
    if (value['domainVersion'] != missionNeedDomainVersion ||
        value['bindingStatus'] != 'non_binding' ||
        value['reservationCreated'] != false ||
        value['bookingCreated'] != false ||
        value['contractCreated'] != false ||
        value['paymentCreated'] != false ||
        value['externalGenerativeAiUsed'] != false ||
        value['automaticPhotoAnalysisUsed'] != false) {
      throw const FormatException('mission_need_invalid');
    }
    final revision = _positiveRevision(value['revision']);
    final status = _status(value['status']);
    final payload = MissionNeedPayload.fromJson(value['payload']);
    if (payload.status != status) {
      throw const FormatException('mission_need_invalid');
    }
    final rawRevisions = value['revisions'];
    final revisions = rawRevisions == null
        ? const <MissionNeedRevision>[]
        : rawRevisions is List
            ? rawRevisions
                .map(MissionNeedRevision.fromJson)
                .toList(growable: false)
            : throw const FormatException('mission_need_invalid');
    if (revisions.isNotEmpty &&
        (revisions.last.revision != revision ||
            revisions.last.payloadDigest != value['payloadDigest'])) {
      throw const FormatException('mission_need_invalid');
    }
    return MissionNeed(
      missionNeedId: id,
      domainVersion: missionNeedDomainVersion,
      revision: revision,
      status: status,
      payload: payload,
      payloadDigest: _digest(value['payloadDigest']),
      createdAt: _date(value['createdAt']),
      updatedAt: _date(value['updatedAt']),
      revisions: revisions,
    );
  }
}

Map<String, dynamic> _object(Object? raw, String code) {
  if (raw is! Map) throw FormatException(code);
  return Map<String, dynamic>.from(raw);
}

void _exactKeys(Map<String, dynamic> value, Set<String> keys, String code) {
  if (value.length != keys.length || !value.keys.toSet().containsAll(keys)) {
    throw FormatException(code);
  }
}

String _text(Object? value, String code) {
  if (value is! String || value.trim().isEmpty) throw FormatException(code);
  return value.trim();
}

int _positiveRevision(Object? value) {
  if (value is! int || value < 1) {
    throw const FormatException('mission_need_invalid');
  }
  return value;
}

MissionNeedStatus _status(Object? value) => switch (value) {
      'draft' => MissionNeedStatus.draft,
      'planned' => MissionNeedStatus.planned,
      _ => throw const FormatException('mission_need_invalid'),
    };

String _digest(Object? value) {
  if (value is! String || !RegExp(r'^[0-9a-f]{64}$').hasMatch(value)) {
    throw const FormatException('mission_need_invalid');
  }
  return value;
}

DateTime _date(Object? value) {
  final parsed = value is String ? DateTime.tryParse(value) : null;
  if (parsed == null || !parsed.isUtc) {
    throw const FormatException('mission_need_invalid');
  }
  return parsed;
}
