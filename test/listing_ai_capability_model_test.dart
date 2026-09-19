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
