import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Item withCatalogState(
    Item source, {
    String? status,
    bool? isActive,
    String? categoryId,
    String? condition,
    double? pricePerDay,
    double? lat,
    double? lng,
  }) {
    final json = source.toJson()
      ..['status'] = status ?? source.status
      ..['isActive'] = isActive ?? source.isActive
      ..['categoryId'] = categoryId ?? source.categoryId
      ..['condition'] = condition ?? source.condition
      ..['pricePerDay'] = pricePerDay ?? source.pricePerDay
      ..['priceRaw'] = pricePerDay ?? source.priceRaw
      ..['lat'] = lat ?? source.lat
      ..['lng'] = lng ?? source.lng;
    return Item.fromJson(json);
  }

  setUp(() {
    QaRuntimeService.reset();
  });

  test('owner listing catalog revision round-trips without client invention',
      () {
    final source = buildTestItem(id: 'revisioned', ownerId: 'owner-a');
    expect(source.catalogRevision, 1);

    final revisioned = Item.fromJson({
      ...source.toJson(),
      'catalogRevision': 7,
    });

    expect(revisioned.catalogRevision, 7);
    expect(revisioned.toJson()['catalogRevision'], 7);
  });

  test('public catalog excludes paused listings and applies combined filters',
      () async {
    final drill = withCatalogState(
      buildTestItem(
        id: 'drill',
        ownerId: 'owner-a',
        title: 'Bosch professional drill',
      ),
      categoryId: 'tools',
      condition: 'good',
      pricePerDay: 18,
      lat: 52.5205,
      lng: 13.4095,
    );
    final camera = withCatalogState(
      buildTestItem(
        id: 'camera',
        ownerId: 'owner-b',
        title: 'Sony camera',
      ),
      categoryId: 'electronics',
      condition: 'like-new',
      pricePerDay: 35,
      lat: 52.54,
      lng: 13.43,
    );
    final paused = withCatalogState(
      buildTestItem(
        id: 'paused-drill',
        ownerId: 'owner-c',
        title: 'Bosch hidden drill',
      ),
      status: 'paused',
      isActive: false,
      categoryId: 'tools',
      condition: 'good',
      pricePerDay: 12,
    );
    SharedPreferences.setMockInitialValues({
      'items': jsonEncode([drill.toJson(), camera.toJson(), paused.toJson()]),
    });

    final results = await DataService.searchPublicItems(
      query: 'bosch',
      categoryIds: const ['tools'],
      conditions: const ['good'],
      minPrice: 15,
      maxPrice: 20,
      latitude: 52.52,
      longitude: 13.41,
      radiusKm: 5,
      sort: 'distance',
    );

    expect(results.map((item) => item.id), ['drill']);
  });

  test('catalog limit is bounded and price sorting is deterministic', () async {
    final expensive = withCatalogState(
      buildTestItem(id: 'expensive', ownerId: 'owner-a'),
      condition: 'good',
      pricePerDay: 40,
    );
    final cheap = withCatalogState(
      buildTestItem(id: 'cheap', ownerId: 'owner-b'),
      condition: 'good',
      pricePerDay: 10,
    );
    SharedPreferences.setMockInitialValues({
      'items': jsonEncode([expensive.toJson(), cheap.toJson()]),
    });

    final results = await DataService.searchPublicItems(
      sort: 'price_asc',
      limit: 1,
    );

    expect(results.map((item) => item.id), ['cheap']);
  });

  test('only canonical full-size backend images survive an edit', () {
    expect(
      BackendConfig.isManagedListingImageUrl(
        'https://shareittoo.com/api/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp',
      ),
      isTrue,
    );
    expect(
      BackendConfig.isManagedListingImageUrl(
        'https://shareittoo.com/api/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-thumb.webp',
      ),
      isFalse,
    );
    expect(
      BackendConfig.isManagedListingImageUrl(
        'https://images.example.com/legacy-listing.jpg',
      ),
      isFalse,
    );
  });

  test('private chat image URLs accept only canonical sanitized image names',
      () {
    expect(
      BackendConfig.managedMessageImageUrl(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-thumb.webp',
      ),
      'https://shareittoo.com/api/v1/uploads/'
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-thumb.webp',
    );
    expect(
      BackendConfig.managedMessageImageUrl('../private-document.pdf'),
      isNull,
    );
    expect(
      BackendConfig.managedMessageImageUrl(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.pdf',
      ),
      isNull,
    );
  });
}
