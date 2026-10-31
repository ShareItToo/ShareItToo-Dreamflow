import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:lendify/services/data_service.dart';

void main() {
  test('the canonical city catalog contains Heilbronn coordinates', () {
    final heilbronn = DataService.getCities()['Heilbronn'];

    expect(heilbronn, isNotNull);
    expect(heilbronn!.$1, closeTo(49.1427, 0.0001));
    expect(heilbronn.$2, closeTo(9.2109, 0.0001));
  });

  test('direct and freeform addresses derive Heilbronn', () {
    expect(DataService.deriveCityFromAddress('Heilbronn'), 'Heilbronn');
    expect(
      DataService.deriveCityFromAddress('Übergabe am Marktplatz, Heilbronn'),
      'Heilbronn',
    );
  });

  test('selected Places text and coordinates yield the same canonical city',
      () {
    expect(
      resolveListingPayloadCity(
        locationText: 'Marktplatz, 74072 Heilbronn, Deutschland',
        latitude: 49.1427,
        longitude: 9.2109,
        availableCities: DataService.getCities(),
      ),
      'Heilbronn',
    );
  });

  test('no unrelated profile, default, or guessed city is used', () {
    expect(
      resolveListingPayloadCity(
        locationText: 'Unbekannter Ort, Deutschland',
        latitude: 50.1,
        longitude: 8.6,
        availableCities: DataService.getCities(),
      ),
      isNull,
    );
    expect(
      resolveListingPayloadCity(
        locationText: 'Heilbronn',
        latitude: null,
        longitude: null,
        availableCities: DataService.getCities(),
      ),
      isNull,
    );
  });
}
