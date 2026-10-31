import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/consumer_dispute_config.dart';
import 'package:lendify/openai/openai_config.dart';

void main() {
  test('automatic helpers are local and explicit price action is typed',
      () async {
    expect(OpenAIConfig.aiHelpersEnabled, isTrue);
    expect(OpenAIConfig.externalAiNetworkAllowed, isFalse);
    expect(OpenAIConfig.directAiChatEnabled, isFalse);
    expect(OpenAIConfig.directAiTransparencyReady, isFalse);
    expect(OpenAIConfig.isAvailable, isTrue);
    final parsed = await OpenAIConfig.parseSearchQuery(
      'Bohrmaschine in Leipzig für 2 Tage',
    );
    expect(parsed['what'], 'bohrmaschine');
    expect(parsed['where'], 'Leipzig');
    expect(parsed['priceMin'], isNull);
    expect(parsed['priceMax'], isNull);
    expect(parsed['source'], 'local_rules');
    expect(parsed['providerExecuted'], isFalse);

    OpenAIConfig.setPriceRequesterForTesting((request) async {
      expect(request['title'], 'Bohrmaschine');
      expect(request['strategy'], 'quick');
      return <String, dynamic>{
        'dailyPriceMin': 7,
        'dailyPriceMax': 9,
        'weeklyPriceMin': 40,
        'weeklyPriceMax': 52,
        'reasoning': 'server test',
      };
    });
    expect(
        (await OpenAIConfig.suggestPrice(
          title: 'Bohrmaschine',
          description: 'Test',
          category: 'Werkzeuge',
          condition: 'Gut',
          location: 'Berlin',
        ))['reasoning'],
        'server test');
    OpenAIConfig.setPriceRequesterForTesting(null);
    expect(
        (await OpenAIConfig.suggestDiscountTiers(
          title: 'Bohrmaschine',
          description: 'Test',
          category: 'Werkzeuge',
          condition: 'Gut',
          location: 'Berlin',
          strategy: 'quick',
        ))['tiers'],
        hasLength(3));
    expect(
        await OpenAIConfig.suggestCategories(
          userInput: 'Bohrmaschine',
          availableCategories: const [],
        ),
        isNotEmpty);
  });

  test('consumer-dispute copy is fail-closed without reviewed build values',
      () {
    expect(ConsumerDisputeConfig.isApproved, isFalse);
    expect(ConsumerDisputeConfig.hasCompleteApprovedConfiguration, isFalse);
    expect(
      ConsumerDisputeConfig.generalInformationText,
      contains('vor der Veröffentlichung geprüft'),
    );
  });
}
