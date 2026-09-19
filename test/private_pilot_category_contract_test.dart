import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/models/category.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('private pilot exposes only exact server-aligned category pairs', () {
    expect(PrivatePilotConfig.categoryAllowed('cat3'), isTrue);
    expect(PrivatePilotConfig.subcategoryAllowed('cat3', 'Kameras'), isTrue);
    expect(PrivatePilotConfig.subcategoryAllowed('cat3', 'Sonstiges'), isTrue);
    expect(PrivatePilotConfig.subcategoryAllowed('cat3', 'Drohnen'), isFalse);
    expect(PrivatePilotConfig.subcategoryAllowed('cat10', 'Autos'), isFalse);
    expect(
        PrivatePilotConfig.subcategoryAllowed('cat10', 'Sonstiges'), isFalse);
    expect(
      PrivatePilotConfig.allowedSubcategories.keys.toSet(),
      PrivatePilotConfig.allowedCategoryIds,
    );
  });

  test('every allowed client category exposes one usable Sonstiges fallback',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final categories = await DataService.getCategories();
    final byId = <String, Category>{
      for (final category in categories) category.id: category,
    };
    expect(byId.keys.toSet(), PrivatePilotConfig.allowedCategoryIds);
    for (final categoryId in PrivatePilotConfig.allowedCategoryIds) {
      final category = byId[categoryId];
      expect(category, isNotNull);
      final subcategories = category!.subcategories;
      expect(
        subcategories
            .where((entry) => entry.trim().toLowerCase() == 'sonstiges')
            .length,
        1,
        reason: '$categoryId must expose one Sonstiges fallback',
      );
      expect(
        PrivatePilotConfig.subcategoryAllowed(categoryId, 'Sonstiges'),
        isTrue,
      );
    }
    for (final categoryId in <String>[
      'cat9',
      'cat10',
      'cat11',
      'cat13',
      'cat18',
      'cat19',
      'cat21',
    ]) {
      expect(
        PrivatePilotConfig.subcategoryAllowed(categoryId, 'Sonstiges'),
        isFalse,
        reason: '$categoryId must remain forbidden',
      );
    }
  });

  test(
      'seed and listing editor preserve exact subcategory selection without drones',
      () async {
    final dataService =
        await File('lib/services/data_service.dart').readAsString();
    final editor =
        await File('lib/screens/create_listing_screen.dart').readAsString();

    expect(dataService, contains("'Kameras & Foto',"));
    expect(dataService, isNot(contains('DJI Mini Drohne')));
    expect(dataService, isNot(contains("name: 'Kameras & Drohnen'")));
    expect(dataService, contains("result.add('Sonstiges')"));
    expect(editor, contains('PrivatePilotConfig.subcategoryAllowed'));
    expect(editor, contains('DropdownButtonFormField<String>'));
    expect(editor, contains('subcategory: _subcategory!'));
  });
}
