import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/blue_ocean_draft_recovery_service.dart';
import 'package:lendify/services/blue_ocean_suggestion_takeover.dart';
import 'package:lendify/widgets/listing_suggestion_preview.dart';

const _fields = <String, dynamic>{
  'title': {'value': 'Bosch Bohrmaschine', 'confidence': 'HIGH'},
  'category': {'value': 'cat8', 'confidence': 'MEDIUM'},
  'subcategory': {'value': 'Sonstiges', 'confidence': 'MEDIUM'},
  'description': {
    'value': 'Möglicherweise eine Bohrmaschine. Zustand selbst prüfen.',
    'confidence': 'MEDIUM',
  },
  'price': {'value': '999 €', 'confidence': 'HIGH'},
};

Widget _app(Map<dynamic, dynamic> fields, {double scale = 1}) => MaterialApp(
      home: Scaffold(
        body: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(scale)),
          child: SingleChildScrollView(
            child: ListingSuggestionPreview(
              fields: fields,
              categoryLabels: const {'cat8': 'Werkzeuge'},
            ),
          ),
        ),
      ),
    );

class _Storage implements BlueOceanDraftRecoveryStorage {
  String? value;
  @override
  Future<void> delete(String key) async => value = null;
  @override
  Future<String?> read(String key) async => value;
  @override
  Future<void> write(String key, String value) async => this.value = value;
}

void main() {
  testWidgets(
      'shows all four actual suggestions, not IDs, price or edit controls',
      (tester) async {
    await tester.pumpWidget(_app(_fields));
    for (final value in [
      'Vorschau – noch nicht übernommen',
      'Bosch Bohrmaschine',
      'Werkzeuge',
      'Sonstiges',
      'Möglicherweise eine Bohrmaschine. Zustand selbst prüfen.',
    ]) {
      expect(find.text(value), findsOneWidget);
    }
    expect(find.text('cat8'), findsNothing);
    expect(find.text('999 €'), findsNothing);
    expect(find.byType(TextField), findsNothing);
    expect(find.byType(Image), findsNothing);
    expect(_fields['title']['value'], 'Bosch Bohrmaschine');
  });

  testWidgets('missing, low-confidence and unknown categories stay honest',
      (tester) async {
    await tester.pumpWidget(_app(const {
      'title': {'value': 'Nicht gesichert', 'confidence': 'LOW'},
      'category': {'value': 'unknown', 'confidence': 'HIGH'},
      'subcategory': {'value': [], 'confidence': 'MEDIUM'},
    }));
    expect(find.text('Kein sicherer Vorschlag – bitte selbst ergänzen.'),
        findsNWidgets(4));
    expect(find.text('Nicht gesichert'), findsNothing);
    expect(find.text('unknown'), findsNothing);
  });

  testWidgets(
      'narrow enlarged preview exposes each full value to accessibility',
      (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(_app(_fields, scale: 2));
      expect(
          find.bySemanticsLabel(
              'Titel: Bosch Bohrmaschine Vorschlag – bitte prüfen.'),
          findsOneWidget);
      await tester.ensureVisible(find.text('Beschreibung'));
      await tester.pumpAndSettle();
      expect(
          find.bySemanticsLabel(
              RegExp(r'Beschreibung: Möglicherweise eine Bohrmaschine')),
          findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets(
      'offline restart keeps pending preview separate from saved manual fields and original photo',
      (tester) async {
    final storage = _Storage();
    final now = DateTime.utc(2026, 9, 29, 12);
    final service =
        BlueOceanDraftRecoveryService(storage: storage, nowUtc: () => now);
    await service.save(BlueOceanDraftRecoverySnapshot(
      ownerId: 'synthetic-preview-owner',
      draftId: 'listing_ai_draft_12345678-1234-4123-8123-123456789abc',
      savedAtUtc: now,
      assistant: const {
        'status': 'draft_ready',
        'revision': {'fields': _fields}
      },
      managedPhotoUrls: const [
        'http://127.0.0.1:18080/uploads/synthetic-original.webp'
      ],
      editableFields: const {
        'title': 'Mein eigener Titel',
        'ownerDailyPrice': '12',
        'suggestionsAccepted': false
      },
    ));
    // Fresh service/widget instances, storage only; no backend or native model.
    final restored = await BlueOceanDraftRecoveryService(
      storage: storage,
      nowUtc: () => now.add(const Duration(minutes: 5)),
    ).readForOwner('synthetic-preview-owner');
    expect(restored, isNotNull);
    final before = storage.value;
    await tester
        .pumpWidget(_app(restored!.assistant['revision']['fields'] as Map));
    expect(find.text('Bosch Bohrmaschine'), findsOneWidget);
    final takeover =
        BlueOceanSuggestionTakeoverState.fromRecovery(restored.editableFields);
    expect(takeover.accepted, isFalse);
    expect(takeover.canPublish, isFalse);
    expect(takeover.editableFields['title'], 'Mein eigener Titel');
    expect(takeover.editableFields['ownerDailyPrice'], '12');
    expect(
        restored.managedPhotoUrls.single, endsWith('/synthetic-original.webp'));
    expect(storage.value, before);
  });
}
