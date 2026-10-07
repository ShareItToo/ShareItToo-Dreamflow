import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/supply_enrichment_technical_config.dart';
import 'package:lendify/models/supply_enrichment.dart';
import 'package:lendify/widgets/supply_enrichment_dialog.dart';

Map<String, dynamic> sessionJson({int suggestionCount = 1}) {
  return <String, dynamic>{
    'sourceListingId': 'listing-source-1',
    'heuristicVersion': 'G5A-CATEGORY-TEMPLATES-1',
    'primaryListingCreated': true,
    'primaryListingBlocked': false,
    'externalGenerativeAiUsed': false,
    'suggestions': List<Map<String, dynamic>>.generate(
      suggestionCount,
      (index) => <String, dynamic>{
        'id': 'supply_suggestion_${index}00000000',
        'label': 'Passendes Zubehör $index',
        'prompt': 'Gehört das passende Zubehör $index dazu?',
        'target': <String, dynamic>{
          'categoryId': 'cat8',
          'subcategory': 'Handwerkzeuge',
        },
        'projectTag': 'renovation',
        'outcome': null,
      },
    ),
  };
}

void main() {
  test('G5A UI stays unavailable by default and in release mode', () {
    expect(SupplyEnrichmentTechnicalConfig.enabled, isFalse);
    expect(SupplyEnrichmentTechnicalConfig.publicReleaseAllowed, isFalse);
    expect(
      SupplyEnrichmentTechnicalConfig.externalGenerativeAiAllowed,
      isFalse,
    );
    expect(
      SupplyEnrichmentTechnicalConfig.availableForMode(releaseMode: false),
      isFalse,
    );
    expect(
      SupplyEnrichmentTechnicalConfig.availableForMode(releaseMode: true),
      isFalse,
    );
    expect(
      SupplyEnrichmentTechnicalConfig.availableForConfiguration(
        featureEnabled: true,
        releaseMode: true,
        signedStageAInternalEnvelope: false,
      ),
      isFalse,
    );
    expect(
      SupplyEnrichmentTechnicalConfig.availableForConfiguration(
        featureEnabled: true,
        releaseMode: true,
        signedStageAInternalEnvelope: true,
      ),
      isTrue,
    );
  });

  test('session parser rejects more than three suggestions', () {
    expect(
      () => SupplyEnrichmentSession.fromJson(sessionJson(suggestionCount: 4)),
      throwsFormatException,
    );
    final session =
        SupplyEnrichmentSession.fromJson(sessionJson(suggestionCount: 3));
    expect(session.suggestions, hasLength(3));
    expect(session.primaryListingCreated, isTrue);
    expect(session.primaryListingBlocked, isFalse);
    expect(session.externalGenerativeAiUsed, isFalse);
  });

  test('follow-up prefill rejects copied price, description or photo truth',
      () {
    final safe = <String, dynamic>{
      'title': 'Passende Handwerkzeuge',
      'categoryId': 'cat8',
      'subcategory': 'Handwerkzeuge',
      'locationText': 'Musterstraße 1, Berlin',
      'city': 'Berlin',
      'country': 'Deutschland',
      'latitude': 52.52,
      'longitude': 13.405,
      'pricePrefilled': false,
      'descriptionPrefilled': false,
      'photoPrefilled': false,
      'link': <String, dynamic>{
        'sourceListingId': 'listing-source-1',
        'suggestionId': 'supply_suggestion_00000000',
        'outcome': 'separate_rental',
      },
    };
    final prefill = SupplyEnrichmentPrefill.fromJson(safe);
    expect(prefill.title, 'Passende Handwerkzeuge');
    expect(prefill.link.outcome, 'separate_rental');
    expect(
      () => SupplyEnrichmentPrefill.fromJson(<String, dynamic>{
        ...safe,
        'pricePrefilled': true,
      }),
      throwsFormatException,
    );
  });

  testWidgets('dialog offers exactly the five owner decisions', (tester) async {
    final session = SupplyEnrichmentSession.fromJson(sessionJson());
    SupplyEnrichmentOutcome? recorded;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SupplyEnrichmentDialog(
            session: session,
            onOutcome: (suggestion, outcome) async {
              recorded = outcome;
              return SupplyEnrichmentOutcomeResult(
                suggestionId: suggestion.id,
                outcome: outcome.wireValue,
                nextAction: 'recorded',
              );
            },
          ),
        ),
      ),
    );

    for (final label in <String>[
      'Als Zubehör enthalten',
      'Separat vermieten',
      'Neue eigene Anzeige',
      'Gehört nicht dazu',
      'Vorschlag ist falsch',
    ]) {
      expect(find.text(label), findsOneWidget);
    }

    await tester.tap(find.text('Als Zubehör enthalten'));
    await tester.pumpAndSettle();
    expect(recorded, SupplyEnrichmentOutcome.includedAccessory);
    expect(find.text('Alle Antworten wurden gespeichert.'), findsOneWidget);
  });
}
