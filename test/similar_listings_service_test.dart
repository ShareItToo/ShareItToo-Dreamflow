import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/services/similar_listings_service.dart';

import 'support/test_builders.dart';

void main() {
  final current = buildTestItem(id: 'current', ownerId: 'owner');
  Item variant(
    String id, {
    String? categoryId,
    String? subcategory,
    bool? isActive,
  }) =>
      Item.fromJson({
        ...buildTestItem(id: id, ownerId: 'other').toJson(),
        if (categoryId != null) 'categoryId': categoryId,
        if (subcategory != null) 'subcategory': subcategory,
        if (isActive != null) 'isActive': isActive,
        if (isActive != null) 'status': isActive ? 'active' : 'paused',
      });
  final exact = variant('exact', subcategory: current.subcategory);
  final sameCategory = variant('same-category', subcategory: 'saws');
  final otherCategory = variant('other-category', categoryId: 'electronics');
  final hidden = variant('hidden', subcategory: current.subcategory);
  final inactive = variant(
    'inactive',
    subcategory: current.subcategory,
    isActive: false,
  );

  test('prefers same subcategory, excludes current/hidden/ineligible', () {
    final selected = SimilarListingsService.select(
      current: current,
      candidates: [
        sameCategory,
        otherCategory,
        inactive,
        hidden,
        exact,
        current,
      ],
      hiddenItemIds: {'hidden'},
    );
    expect(selected.map((item) => item.id), ['exact', 'same-category']);
  });

  test('returns a truthful empty result when no eligible match exists', () {
    expect(
      SimilarListingsService.select(
        current: current,
        candidates: [current, otherCategory],
      ),
      isEmpty,
    );
  });

  test('propagates authoritative catalog failures instead of returning empty',
      () async {
    final failure = Completer<List<Item>>()
      ..completeError(StateError('catalog unavailable'));
    await expectLater(
      SimilarListingsService.load(
        current: current,
        catalogLoader: () => failure.future,
        hiddenLoader: () async => <String>{},
      ),
      throwsA(isA<StateError>()),
    );
  });
}
