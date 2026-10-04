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

  test('listing payload city uses the derived city over the Berlin fallback',
      () {
    expect(
      resolveListingPayloadCity(
        locationText: 'Übergabeort Heilbronn',
        registeredCity: null,
        availableCities: DataService.getCities(),
      ),
      'Heilbronn',
    );
    expect(
      resolveListingPayloadCity(
        locationText: 'Heilbronn, Innenstadt',
        registeredCity: 'Berlin',
        availableCities: DataService.getCities(),
      ),
      'Heilbronn',
    );
  });
}
