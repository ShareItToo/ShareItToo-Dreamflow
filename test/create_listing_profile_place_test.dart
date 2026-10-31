import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/create_listing_screen.dart';

void main() {
  test('search location requires explicitly selected valid coordinates', () {
    expect(
      isExplicitListingSearchLocation(latitude: null, longitude: null),
      isFalse,
    );
    expect(
      isExplicitListingSearchLocation(latitude: 48.4, longitude: null),
      isFalse,
    );
    expect(
      isExplicitListingSearchLocation(latitude: 48.4, longitude: 9.9),
      isTrue,
    );
  });

  test('search location rejects non-finite and out-of-range coordinates', () {
    expect(
      isExplicitListingSearchLocation(latitude: double.nan, longitude: 9.9),
      isFalse,
    );
    expect(
      isExplicitListingSearchLocation(latitude: 91, longitude: 9.9),
      isFalse,
    );
    expect(
      isExplicitListingSearchLocation(latitude: 48.4, longitude: 181),
      isFalse,
    );
  });
}
