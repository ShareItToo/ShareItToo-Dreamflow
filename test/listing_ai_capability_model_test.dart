import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/services/listing_mutation_service.dart';

Map<String, dynamic> capability({
  String provider = 'mock',
  String mode = 'mock',
  bool available = true,
  Object imageLimit = 4,
  String? supportedClientVersion,
}) {
  const disclosureText = 'Server disclosure';
  return <String, dynamic>{
    'available': available,
    'provider': provider,
    'mode': mode,
    'disclosureVersion': 'test-v1',
    'disclosureText': disclosureText,
    'disclosureHash': sha256.convert(utf8.encode(disclosureText)).toString(),
    'policyRevision': 'policy-v1',
    'configRevision': 'config-v1',
    'budgetScope': 'lifetime',
    'lifetimeBudgetCents': provider == 'openai' ? 10000 : 0,
    'stagingSmokeBudgetCents': provider == 'openai' ? 250 : 0,
    'stagingSmokeActivationId':
        provider == 'openai' ? '11111111-1111-4111-8111-111111111111' : null,
    'supportedClientVersion':
        supportedClientVersion ?? PrivatePilotConfig.v52ClientBuild,
    'imageLimit': imageLimit,
  };
}

void main() {
  test('capability parser is exact, typed and provider-mode consistent', () {
    final parsed = ListingAiCapability.fromJson(capability());
    expect(parsed.provider, 'mock');
    expect(parsed.mode, 'mock');
    expect(parsed.imageLimit, 4);
    expect(parsed.budgetScope, 'lifetime');
    expect(parsed.lifetimeBudgetCents, 0);
    expect(parsed.stagingSmokeBudgetCents, 0);
    expect(parsed.stagingSmokeActivationId, isNull);

    expect(
      parsed.handshake.keys.toSet(),
      <String>{
        'available',
        'provider',
        'mode',
        'disclosureVersion',
        'disclosureHash',
        'policyRevision',
        'configRevision',
        'budgetScope',
        'lifetimeBudgetCents',
        'stagingSmokeBudgetCents',
        'stagingSmokeActivationId',
        'supportedClientVersion',
        'imageLimit',
      },
    );

    expect(
      () => ListingAiCapability.fromJson({...capability(), 'unexpected': true}),
      throwsFormatException,
    );
    expect(
      () => ListingAiCapability.fromJson(
        capability(imageLimit: 1.5),
      ),
      throwsFormatException,
    );
    expect(
      () => ListingAiCapability.fromJson(
        {...capability()}..remove('stagingSmokeBudgetCents'),
      ),
      throwsFormatException,
    );
    for (final invalid in <(String, Object?)>[
      ('budgetScope', 'activation'),
      ('lifetimeBudgetCents', -1),
      ('lifetimeBudgetCents', 1.5),
      ('stagingSmokeBudgetCents', -1),
      ('stagingSmokeBudgetCents', '0'),
      ('stagingSmokeActivationId', 123),
      ('stagingSmokeActivationId', '  '),
    ]) {
      final raw = capability()..[invalid.$1] = invalid.$2;
      expect(
        () => ListingAiCapability.fromJson(raw),
        throwsFormatException,
        reason: '${invalid.$1} rejects ${invalid.$2}',
      );
    }
    expect(
      () => ListingAiCapability.fromJson(
        capability()..['stagingSmokeActivationId'] = 'activation-id',
      ),
      throwsFormatException,
      reason: 'mock capabilities require a null activation id',
    );
    final openAi = ListingAiCapability.fromJson(
      capability(provider: 'openai', mode: 'external'),
    );
    expect(openAi.lifetimeBudgetCents, 10000);
    expect(openAi.stagingSmokeBudgetCents, 250);
    expect(
      openAi.stagingSmokeActivationId,
      '11111111-1111-4111-8111-111111111111',
    );
    for (final invalidOpenAi in <Map<String, dynamic>>[
      capability(
        provider: 'openai',
        mode: 'external',
      )..['lifetimeBudgetCents'] = 0,
      capability(
        provider: 'openai',
        mode: 'external',
      )..['stagingSmokeBudgetCents'] = 3,
      capability(
        provider: 'openai',
        mode: 'external',
      )..['stagingSmokeBudgetCents'] = 501,
      capability(
        provider: 'openai',
        mode: 'external',
      )..['stagingSmokeActivationId'] = 'not-a-uuid',
    ]) {
      expect(
        () => ListingAiCapability.fromJson(invalidOpenAi),
        throwsFormatException,
      );
    }
    for (final provider in <String>['disabled', 'mock', 'on_device']) {
      final mode = provider;
      for (final invalidValue in <(String, Object?)>[
        ('lifetimeBudgetCents', 1),
        ('stagingSmokeBudgetCents', 1),
        ('stagingSmokeActivationId', '11111111-1111-4111-8111-111111111111'),
      ]) {
        final raw = capability(
          provider: provider,
          mode: mode,
          available: provider != 'disabled',
        )..[invalidValue.$1] = invalidValue.$2;
        expect(
          () => ListingAiCapability.fromJson(raw),
          throwsFormatException,
          reason: '$provider rejects ${invalidValue.$1}',
        );
      }
    }
    expect(
      () => ListingAiCapability.fromJson(
        capability(provider: 'openai', mode: 'on_device'),
      ),
      throwsFormatException,
    );
    expect(
      () => ListingAiCapability.fromJson(
        capability(supportedClientVersion: '1.0.0+stale'),
      ),
      throwsFormatException,
    );
  });

  test('capability parser preserves the exact server disclosure text', () {
    const disclosureText = '  Exact server wording\n';
    final raw = capability();
    raw['disclosureText'] = disclosureText;
    raw['disclosureHash'] =
        sha256.convert(utf8.encode(disclosureText)).toString();
    final parsed = ListingAiCapability.fromJson(raw);
    expect(parsed.disclosureText, disclosureText);
  });
}
