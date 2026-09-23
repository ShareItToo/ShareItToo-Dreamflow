import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/create_listing_screen.dart';

import 'support/test_builders.dart';

void main() {
  test('profile-place fallback uses city and country without street data', () {
    final user = buildTestUser(
      'listing-place-city-only',
      name: 'City Only',
      city: 'Ulm',
    ).copyWith(country: 'Deutschland');

    expect(resolveListingEditorProfilePlace(user), 'Ulm, Deutschland');
  });

  test('profile-place fallback ignores blank address fields', () {
    final user = buildTestUser(
      'listing-place-blank-address',
      name: 'Blank Address',
      city: 'Ulm',
    ).copyWith(
      country: 'Deutschland',
      addressCity: '   ',
      addressCountry: '',
    );

    expect(resolveListingEditorProfilePlace(user), 'Ulm, Deutschland');
  });

  test('profile home location remains the preferred coarse place', () {
    final user = buildTestUser(
      'listing-place-home',
      name: 'Home Location',
      city: 'Ulm',
    ).copyWith(
      country: 'Deutschland',
      homeLocation: 'Heilbronn',
      addressCity: 'Musterstadt',
      addressCountry: 'Deutschland',
      addressStreet: 'Nicht übernehmen',
    );

    expect(resolveListingEditorProfilePlace(user), 'Heilbronn');
  });
}
