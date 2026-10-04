import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/blue_ocean_draft_recovery_service.dart';

class _MemoryStorage implements BlueOceanDraftRecoveryStorage {
  String? value;

  @override
  Future<void> delete(String key) async => value = null;

  @override
  Future<String?> read(String key) async => value;

  @override
  Future<void> write(String key, String value) async => this.value = value;
}

const _ownerId = 'owner-r4-local-recovery';
const _draftId = 'listing_ai_draft_12345678-1234-4123-8123-123456789abc';

BlueOceanDraftRecoverySnapshot _snapshot(DateTime savedAt) =>
    BlueOceanDraftRecoverySnapshot(
      ownerId: _ownerId,
      draftId: _draftId,
      savedAtUtc: savedAt,
      assistant: const <String, dynamic>{
        'status': 'draft_ready',
        'revision': <String, dynamic>{'revision': 1},
      },
      managedPhotoUrls: const <String>[
        'http://127.0.0.1:8787/uploads/synthetic-r4-full.webp',
      ],
      editableFields: const <String, dynamic>{
        'title': 'Synthetischer R4-Entwurf',
        'description': 'Nur deterministische Testdaten.',
      },
    );

void main() {
  test('restores only the matching owner inside the 24-hour TTL', () async {
    final storage = _MemoryStorage();
    final now = DateTime.utc(2026, 8, 24, 14);
    final service = BlueOceanDraftRecoveryService(
      storage: storage,
      nowUtc: () => now,
    );
    await service.save(_snapshot(now.subtract(const Duration(hours: 23))));

    final restored = await service.readForOwner(_ownerId);

    expect(restored?.draftId, _draftId);
    expect(restored?.editableFields['title'], 'Synthetischer R4-Entwurf');
    expect(storage.value, isNotNull);
  });

  test('fails closed and clears an account-mismatched snapshot', () async {
    final storage = _MemoryStorage();
    final now = DateTime.utc(2026, 8, 24, 14);
    final service = BlueOceanDraftRecoveryService(
      storage: storage,
      nowUtc: () => now,
    );
    await service.save(_snapshot(now));

    expect(await service.readForOwner('different-owner'), isNull);
    expect(storage.value, isNull);
  });

  test('fails closed and clears expired or future-dated state', () async {
    final now = DateTime.utc(2026, 8, 24, 14);
    for (final savedAt in <DateTime>[
      now.subtract(const Duration(hours: 25)),
      now.add(const Duration(minutes: 1)),
    ]) {
      final storage = _MemoryStorage();
      final service = BlueOceanDraftRecoveryService(
        storage: storage,
        nowUtc: () => now,
      );
      await service.save(_snapshot(savedAt));

      expect(await service.readForOwner(_ownerId), isNull);
      expect(storage.value, isNull);
    }
  });

  test('rejects raw data URLs and oversized snapshots before persistence',
      () async {
    final storage = _MemoryStorage();
    final now = DateTime.utc(2026, 8, 24, 14);
    final service = BlueOceanDraftRecoveryService(
      storage: storage,
      nowUtc: () => now,
    );
    final unsafe = BlueOceanDraftRecoverySnapshot(
      ownerId: _ownerId,
      draftId: _draftId,
      savedAtUtc: now,
      assistant: const <String, dynamic>{},
      managedPhotoUrls: const <String>['data:image/png;base64,AAAA'],
      editableFields: const <String, dynamic>{},
    );
    final oversized = BlueOceanDraftRecoverySnapshot(
      ownerId: _ownerId,
      draftId: _draftId,
      savedAtUtc: now,
      assistant: <String, dynamic>{'payload': 'x' * (129 * 1024)},
      managedPhotoUrls: const <String>[
        'https://localhost/uploads/synthetic-r4-full.webp',
      ],
      editableFields: const <String, dynamic>{},
    );

    await expectLater(service.save(unsafe), throwsFormatException);
    await expectLater(service.save(oversized), throwsFormatException);
    expect(storage.value, isNull);
  });
}
