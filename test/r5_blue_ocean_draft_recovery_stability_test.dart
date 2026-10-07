import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/blue_ocean_draft_recovery_service.dart';

class _R5MemoryStorage implements BlueOceanDraftRecoveryStorage {
  String? value;
  var writes = 0;
  var deletes = 0;

  @override
  Future<void> delete(String key) async {
    deletes += 1;
    value = null;
  }

  @override
  Future<String?> read(String key) async => value;

  @override
  Future<void> write(String key, String value) async {
    writes += 1;
    this.value = value;
  }
}

void main() {
  test('R5 restores and clears 25 owner-bound listing drafts without drift',
      () async {
    final storage = _R5MemoryStorage();
    final now = DateTime.utc(2026, 8, 24, 15);
    final service = BlueOceanDraftRecoveryService(
      storage: storage,
      nowUtc: () => now,
    );

    for (var index = 0; index < 25; index += 1) {
      final suffix = (index + 1).toRadixString(16).padLeft(12, '0');
      final draftId =
          'listing_ai_draft_00000000-0000-4000-8000-$suffix';
      final title = 'Synthetischer R5-Entwurf ${index + 1}';
      await service.save(BlueOceanDraftRecoverySnapshot(
        ownerId: 'owner-r5-recovery',
        draftId: draftId,
        savedAtUtc: now.subtract(Duration(minutes: index)),
        assistant: const <String, dynamic>{
          'status': 'draft_ready',
          'revision': <String, dynamic>{'revision': 1},
        },
        managedPhotoUrls: <String>[
          'http://127.0.0.1:8787/uploads/synthetic-r5-$suffix.webp',
        ],
        editableFields: <String, dynamic>{
          'title': title,
          'description': 'Nur deterministische Testdaten.',
          'ownerConfirmations': const <String, dynamic>{},
          'readyFingerprint': null,
        },
      ));

      final restored = await service.readForOwner('owner-r5-recovery');
      expect(restored?.draftId, draftId);
      expect(restored?.editableFields['title'], title);
      expect(restored?.editableFields['ownerConfirmations'], isEmpty);
      expect(restored?.editableFields['readyFingerprint'], isNull);
      expect(restored?.managedPhotoUrls, hasLength(1));

      await service.clear();
      expect(await service.readForOwner('owner-r5-recovery'), isNull);
    }

    expect(storage.writes, 25);
    expect(storage.deletes, 25);
    expect(storage.value, isNull);
  });
}
