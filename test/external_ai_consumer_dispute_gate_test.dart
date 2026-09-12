import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/consumer_dispute_config.dart';
import 'package:lendify/openai/openai_config.dart';

void main() {
  test('all former external-AI helpers use deterministic local fallbacks',
      () async {
    expect(OpenAIConfig.aiHelpersEnabled, isFalse);
    expect(OpenAIConfig.externalAiNetworkAllowed, isFalse);
    expect(OpenAIConfig.directAiChatEnabled, isFalse);
    expect(OpenAIConfig.directAiTransparencyReady, isFalse);
    expect(OpenAIConfig.isAvailable, isFalse);
    expect(await OpenAIConfig.parseSearchQuery('Bohrmaschine in Berlin'), {
      'what': null,
      'where': null,
      'whenStart': null,
      'whenEnd': null,
      'priceMin': null,
      'priceMax': null,
      'category': null,
    });
    expect(
        (await OpenAIConfig.suggestPrice(
          title: 'Bohrmaschine',
          description: 'Test',
          category: 'Werkzeuge',
          condition: 'Gut',
          location: 'Berlin',
        ))['reasoning'],
        'KI nicht konfiguriert');
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
          availableCategories: const ['Werkzeuge'],
        ),
        isEmpty);
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
