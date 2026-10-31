import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
      'G2A reads legacy wishlist data without changing metadata or assignments',
      () async {
    final metadata = jsonEncode(<Map<String, Object>>[
      <String, Object>{
        'id': DataService.wlSoonId,
        'name': 'Demnächst benötigt',
        'system': true,
      },
      <String, Object>{
        'id': DataService.wlLaterId,
        'name': 'Für später',
        'system': true,
      },
      <String, Object>{
        'id': DataService.wlAgainId,
        'name': 'Wieder mieten',
        'system': true,
      },
      <String, Object>{
        'id': 'wl_existing_custom',
        'name': 'Renovierung',
        'system': false,
      },
    ]);
    final assignments = jsonEncode(<String, String>{
      'item-existing-1': DataService.wlSoonId,
      'item-existing-2': 'wl_existing_custom',
    });
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': metadata,
      'wishlist_assign_v1': assignments,
    });

    final lists = await DataService.getWishlists();
    expect(lists.map((entry) => entry['id']), contains('wl_existing_custom'));
    expect(
      await DataService.getWishlistForItem('item-existing-1'),
      DataService.wlSoonId,
    );
    expect(
      await DataService.getWishlistForItem('item-existing-2'),
      'wl_existing_custom',
    );

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('wishlists_meta_v1'), metadata);
    expect(prefs.getString('wishlist_assign_v1'), assignments);
    expect(prefs.containsKey('rental_cart_v1'), isFalse);
    expect(prefs.containsKey('project_cart_v1'), isFalse);
  });
}
