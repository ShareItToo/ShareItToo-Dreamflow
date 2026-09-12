import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/create_listing_screen.dart';

void main() {
  test('editing preserves the exact listing city over profile and defaults',
      () {
    expect(
      resolveListingEditorCity(
        existingCity: 'Heilbronn',
        supplyPrefillCity: null,
        userCity: 'Berlin',
        availableCities: const <String>['Hamburg'],
      ),
      'Heilbronn',
    );
  });

  test('blank edit data falls back in safe creation precedence', () {
    expect(
      resolveListingEditorCity(
        existingCity: '  ',
        supplyPrefillCity: ' Köln ',
        userCity: 'Berlin',
        availableCities: const <String>['Hamburg'],
      ),
      'Köln',
    );
    expect(
      resolveListingEditorCity(
        existingCity: null,
        supplyPrefillCity: null,
        userCity: ' Berlin ',
        availableCities: const <String>['Hamburg'],
      ),
      'Berlin',
    );
    expect(
      resolveListingEditorCity(
        existingCity: null,
        supplyPrefillCity: null,
        userCity: null,
        availableCities: const <String>[' Hamburg '],
      ),
      'Hamburg',
    );
  });

  test('missing city truth fails instead of inventing a region', () {
    expect(
      () => resolveListingEditorCity(
        existingCity: null,
        supplyPrefillCity: null,
        userCity: null,
        availableCities: const <String>['  '],
      ),
      throwsStateError,
    );
  });
}
