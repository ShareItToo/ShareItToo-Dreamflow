const String missionSupplyParticipationDomainVersion = 'P6-C1-2026-10-02.1';
const String missionSupplyParticipationNeedKey = 'plant_container_equipment';

enum MissionSupplyParticipationStatus { active, withdrawn }

enum MissionSupplyParticipationAvailability {
  confirmedAvailable,
  withdrawn,
}

class MissionSupplyParticipationItem {
  const MissionSupplyParticipationItem({
    required this.shelfItemId,
    required this.needKey,
    required this.revision,
    required this.availabilityStatus,
    required this.createdAt,
  });

  final String shelfItemId;
  final String needKey;
  final int revision;
  final MissionSupplyParticipationAvailability availabilityStatus;
  final DateTime createdAt;

  factory MissionSupplyParticipationItem.fromJson(Object? raw) {
    final value = _object(raw, 'mission_supply_participation_item_invalid');
    _exactKeys(
        value,
        const <String>{
          'shelfItemId',
          'needKey',
          'revision',
          'availabilityStatus',
          'createdAt',
        },
        'mission_supply_participation_item_invalid');
    final shelfItemId = value['shelfItemId'];
    if (shelfItemId is! String ||
        !RegExp(r'^shelf_item_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
            .hasMatch(shelfItemId)) {
      throw const FormatException('mission_supply_participation_item_invalid');
    }
    if (value['needKey'] != missionSupplyParticipationNeedKey) {
      throw const FormatException('mission_supply_participation_item_invalid');
    }
    final revision = value['revision'];
    if (revision is! int || revision < 1 || revision >= 2147483647) {
      throw const FormatException('mission_supply_participation_item_invalid');
    }
    final availability = switch (value['availabilityStatus']) {
      'confirmed_available' =>
        MissionSupplyParticipationAvailability.confirmedAvailable,
      'withdrawn' => MissionSupplyParticipationAvailability.withdrawn,
      _ => throw const FormatException(
          'mission_supply_participation_item_invalid'),
    };
    return MissionSupplyParticipationItem(
      shelfItemId: shelfItemId,
      needKey: missionSupplyParticipationNeedKey,
      revision: revision,
      availabilityStatus: availability,
      createdAt: _timestamp(value['createdAt']),
    );
  }
}

class MissionSupplyParticipation {
  const MissionSupplyParticipation({
    required this.participationId,
    required this.domainVersion,
    required this.currentRevision,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.items,
  });

  final String participationId;
  final String domainVersion;
  final int currentRevision;
  final MissionSupplyParticipationStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<MissionSupplyParticipationItem> items;

  factory MissionSupplyParticipation.fromJson(Object? raw) {
    final value = _object(raw, 'mission_supply_participation_invalid');
    _exactKeys(
        value,
        const <String>{
          'participationId',
          'domainVersion',
          'currentRevision',
          'status',
          'createdAt',
          'updatedAt',
          'items',
        },
        'mission_supply_participation_invalid');
    final id = value['participationId'];
    if (id is! String ||
        !RegExp(r'^mission_supply_participation_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
            .hasMatch(id) ||
        value['domainVersion'] != missionSupplyParticipationDomainVersion) {
      throw const FormatException('mission_supply_participation_invalid');
    }
    final revision = value['currentRevision'];
    if (revision is! int || revision < 1 || revision >= 2147483647) {
      throw const FormatException('mission_supply_participation_invalid');
    }
    final status = switch (value['status']) {
      'active' => MissionSupplyParticipationStatus.active,
      'withdrawn' => MissionSupplyParticipationStatus.withdrawn,
      _ => throw const FormatException('mission_supply_participation_invalid'),
    };
    final rawItems = value['items'];
    if (rawItems is! List) {
      throw const FormatException('mission_supply_participation_invalid');
    }
    final items = rawItems
        .map(MissionSupplyParticipationItem.fromJson)
        .toList(growable: false);
    if (items.map((item) => item.shelfItemId).toSet().length != items.length) {
      throw const FormatException('mission_supply_participation_invalid');
    }
    return MissionSupplyParticipation(
      participationId: id,
      domainVersion: missionSupplyParticipationDomainVersion,
      currentRevision: revision,
      status: status,
      createdAt: _timestamp(value['createdAt']),
      updatedAt: _timestamp(value['updatedAt']),
      items: items,
    );
  }
}

class MissionSupplyParticipationSnapshot {
  const MissionSupplyParticipationSnapshot({
    required this.participation,
    required this.visibility,
    required this.matchingActivated,
  });

  final MissionSupplyParticipation? participation;
  final String visibility;
  final bool matchingActivated;

  factory MissionSupplyParticipationSnapshot.fromJson(Object? raw) {
    final value = _object(raw, 'mission_supply_participation_snapshot_invalid');
    _exactKeys(
        value,
        const <String>{
          'participation',
          'visibility',
          'matchingActivated',
        },
        'mission_supply_participation_snapshot_invalid');
    final participation = value['participation'] == null
        ? null
        : MissionSupplyParticipation.fromJson(value['participation']);
    if (value['visibility'] != 'private_owner_only' ||
        value['matchingActivated'] != false) {
      throw const FormatException(
          'mission_supply_participation_snapshot_invalid');
    }
    return MissionSupplyParticipationSnapshot(
      participation: participation,
      visibility: 'private_owner_only',
      matchingActivated: false,
    );
  }
}

class MissionSupplyParticipationCommandResult {
  const MissionSupplyParticipationCommandResult({
    required this.participationId,
    required this.revision,
    required this.status,
    this.shelfItemId,
    this.needKey,
  });

  final String participationId;
  final int revision;
  final String status;
  final String? shelfItemId;
  final String? needKey;
}

class MissionSupplyParticipationWriteResult {
  const MissionSupplyParticipationWriteResult({
    required this.snapshot,
    required this.command,
    required this.replayed,
  });

  final MissionSupplyParticipationSnapshot snapshot;
  final MissionSupplyParticipationCommandResult command;
  final bool replayed;

  factory MissionSupplyParticipationWriteResult.fromJson(Object? raw) {
    final value = _object(raw, 'mission_supply_participation_write_invalid');
    _exactKeys(
        value,
        const <String>{
          'participation',
          'visibility',
          'matchingActivated',
          'commandResult',
          'replayed',
        },
        'mission_supply_participation_write_invalid');
    final command = _object(
      value['commandResult'],
      'mission_supply_participation_command_invalid',
    );
    final hasItem = command.containsKey('shelfItemId');
    final expected = <String>{
      'participationId',
      'revision',
      'status',
      if (hasItem) 'shelfItemId',
      if (hasItem) 'needKey',
    };
    _exactKeys(
        command, expected, 'mission_supply_participation_command_invalid');
    final participationId = command['participationId'];
    final revision = command['revision'];
    final status = command['status'];
    if (participationId is! String ||
        !RegExp(r'^mission_supply_participation_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
            .hasMatch(participationId) ||
        revision is! int ||
        revision < 1 ||
        status is! String ||
        !<String>{'active', 'withdrawn', 'confirmed_available'}
            .contains(status)) {
      throw const FormatException(
          'mission_supply_participation_command_invalid');
    }
    final shelfItemId = command['shelfItemId'];
    final needKey = command['needKey'];
    if (hasItem &&
        (shelfItemId is! String ||
            !RegExp(r'^shelf_item_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
                .hasMatch(shelfItemId) ||
            needKey != missionSupplyParticipationNeedKey)) {
      throw const FormatException(
          'mission_supply_participation_command_invalid');
    }
    if (value['replayed'] is! bool) {
      throw const FormatException('mission_supply_participation_write_invalid');
    }
    final snapshot = MissionSupplyParticipationSnapshot.fromJson(
      <String, dynamic>{
        'participation': value['participation'],
        'visibility': value['visibility'],
        'matchingActivated': value['matchingActivated'],
      },
    );
    final root = snapshot.participation;
    if (root == null || root.participationId != participationId) {
      throw const FormatException(
          'mission_supply_participation_command_invalid');
    }
    if (hasItem) {
      MissionSupplyParticipationItem? item;
      for (final entry in root.items) {
        if (entry.shelfItemId == shelfItemId && entry.needKey == needKey) {
          item = entry;
          break;
        }
      }
      final itemStatus = item?.availabilityStatus ==
              MissionSupplyParticipationAvailability.confirmedAvailable
          ? 'confirmed_available'
          : item?.availabilityStatus ==
                  MissionSupplyParticipationAvailability.withdrawn
              ? 'withdrawn'
              : null;
      if (item == null || item.revision != revision || itemStatus != status) {
        throw const FormatException(
            'mission_supply_participation_command_invalid');
      }
    } else {
      final rootStatus = root.status == MissionSupplyParticipationStatus.active
          ? 'active'
          : 'withdrawn';
      if (root.currentRevision != revision || rootStatus != status) {
        throw const FormatException(
            'mission_supply_participation_command_invalid');
      }
    }
    return MissionSupplyParticipationWriteResult(
      snapshot: snapshot,
      command: MissionSupplyParticipationCommandResult(
        participationId: participationId,
        revision: revision,
        status: status,
        shelfItemId: shelfItemId as String?,
        needKey: needKey as String?,
      ),
      replayed: value['replayed'] as bool,
    );
  }
}

Map<String, dynamic> _object(Object? raw, String code) {
  if (raw is! Map) throw FormatException(code);
  final value = <String, dynamic>{};
  for (final entry in raw.entries) {
    if (entry.key is! String) throw FormatException(code);
    value[entry.key as String] = entry.value;
  }
  return value;
}

void _exactKeys(Map<String, dynamic> value, Set<String> expected, String code) {
  if (value.length != expected.length ||
      !value.keys.toSet().containsAll(expected)) {
    throw FormatException(code);
  }
}

DateTime _timestamp(Object? raw) {
  if (raw is! String) {
    throw const FormatException(
        'mission_supply_participation_timestamp_invalid');
  }
  final value = DateTime.tryParse(raw);
  if (value == null || !value.isUtc || value.toIso8601String() != raw) {
    throw const FormatException(
        'mission_supply_participation_timestamp_invalid');
  }
  return value;
}
