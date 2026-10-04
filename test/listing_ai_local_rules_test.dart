import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/listing_ai_local_rules.dart';
import 'package:lendify/services/ai_price_calculator_service.dart';

void main() {
  test('parses item and place without treating rental duration as euros', () {
    final result = ListingAiLocalRules.parseSearchQuery(
      'Bohrmaschine in Leipzig für 2 Tage',
    );
    expect(result['what'], 'bohrmaschine');
    expect(result['where'], 'Leipzig');
    expect(result['priceMin'], isNull);
    expect(result['priceMax'], isNull);
    expect(result['source'], 'local_rules');
    expect(result['providerExecuted'], isFalse);
  });

  test('parses explicit euro bounds and valid dates only', () {
    final result = ListingAiLocalRules.parseSearchQuery(
      'Bohrmaschine in Berlin 01.10.2026 bis 03.10.2026 ab 12€',
    );
    expect(result['whenStart'], '2026-10-01');
    expect(result['whenEnd'], '2026-10-03');
    expect(result['priceMin'], 12.0);
    expect(result['priceMax'], isNull);
    expect(
      ListingAiLocalRules.parseSearchQuery(
          'Bohrmaschine am 31.02.2026')['whenStart'],
      isNull,
    );
  });

  test('category and discount helpers stay deterministic and local', () {
    expect(
      ListingAiLocalRules.suggestCategories(
        userInput: 'Bohrmaschine',
        availableCategories: const [],
      ),
      contains('Werkzeuge & Kleingeräte'),
    );
    final tiers = ListingAiLocalRules.discountTiers(strategy: 'quick');
    expect(tiers['source'], 'local_rules');
    expect(tiers['providerExecuted'], isFalse);
  });

  test('strategy changes the selected point, not the orientation range', () {
    final quick = AIPriceCalculatorService.calculate(
      title: 'Bohrmaschine',
      categoryId: 'Werkzeuge & Kleingeräte',
      condition: 'good',
      address: 'Leipzig',
      strategy: 'quick',
    );
    final premium = AIPriceCalculatorService.calculate(
      title: 'Bohrmaschine',
      categoryId: 'Werkzeuge & Kleingeräte',
      condition: 'good',
      address: 'Leipzig',
      strategy: 'premium',
    );
    expect(premium.dailyPriceMin, quick.dailyPriceMin);
    expect(premium.dailyPriceMax, quick.dailyPriceMax);
  });
}
