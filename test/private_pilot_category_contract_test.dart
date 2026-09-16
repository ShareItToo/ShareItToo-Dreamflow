import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/private_pilot_config.dart';

void main() {
  test('private pilot exposes only exact server-aligned category pairs', () {
    expect(PrivatePilotConfig.categoryAllowed('cat3'), isTrue);
    expect(PrivatePilotConfig.subcategoryAllowed('cat3', 'Kameras'), isTrue);
    expect(PrivatePilotConfig.subcategoryAllowed('cat3', 'Drohnen'), isFalse);
    expect(PrivatePilotConfig.subcategoryAllowed('cat10', 'Autos'), isFalse);
    expect(
      PrivatePilotConfig.allowedSubcategories.keys.toSet(),
      PrivatePilotConfig.allowedCategoryIds,
    );
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
    expect(editor, contains('PrivatePilotConfig.subcategoryAllowed'));
    expect(editor, contains('DropdownButtonFormField<String>'));
    expect(editor, contains('subcategory: _subcategory!'));
  });
}
