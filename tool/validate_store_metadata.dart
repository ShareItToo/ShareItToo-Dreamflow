import 'dart:convert';
import 'dart:io';

Never _fail(String message) {
  stderr.writeln('ERROR: $message');
  exit(1);
}

String _readText(Directory root, String relativePath) {
  final file = File('${root.path}/$relativePath');
  if (!file.existsSync()) {
    _fail('Missing store metadata file: $relativePath');
  }
  final value = file.readAsStringSync().trim();
  if (value.isEmpty) {
    _fail('Store metadata file is empty: $relativePath');
  }
  return value;
}

List<dynamic> _readJsonList(Directory root, String relativePath) {
  final file = File('${root.path}/$relativePath');
  if (!file.existsSync()) {
    _fail('Missing store metadata file: $relativePath');
  }
  Object? decoded;
  try {
    decoded = jsonDecode(file.readAsStringSync());
  } on FormatException {
    _fail('Store metadata file is not valid JSON: $relativePath');
  }
  if (decoded is! List) {
    _fail('Store metadata file must contain a JSON list: $relativePath');
  }
  return decoded;
}

Map<String, dynamic> _readJsonMapFile(File file, String label) {
  if (!file.existsSync()) _fail('$label is missing.');
  Object? decoded;
  try {
    decoded = jsonDecode(file.readAsStringSync());
  } on FormatException {
    _fail('$label is not valid JSON.');
  }
  if (decoded is! Map) _fail('$label must contain a JSON object.');
  return decoded.cast<String, dynamic>();
}

void _expectExactKeys(
  Map<String, dynamic> value,
  Set<String> expected,
  String label,
) {
  if (value.length != expected.length || !expected.every(value.containsKey)) {
    _fail('$label must contain exactly the required fields.');
  }
}

void _validateGooglePlayIcon(Directory root, String relativePath) {
  final file = File('${root.path}/$relativePath');
  if (!file.existsSync()) {
    _fail('Missing Google Play store icon: $relativePath');
  }
  final bytes = file.readAsBytesSync();
  if (bytes.length > 1024 * 1024) {
    _fail('Google Play store icon exceeds 1,024 KB.');
  }
  const signature = <int>[137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 ||
      !List<int>.generate(8, (index) => bytes[index])
          .asMap()
          .entries
          .every((entry) => entry.value == signature[entry.key])) {
    _fail('Google Play store icon must be a valid PNG.');
  }
  final chunkType = ascii.decode(bytes.sublist(12, 16));
  if (chunkType != 'IHDR') {
    _fail('Google Play store icon has no PNG IHDR.');
  }
  int uint32(int offset) =>
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
  final width = uint32(16);
  final height = uint32(20);
  final colorType = bytes[25];
  if (width != 512 || height != 512) {
    _fail('Google Play store icon must be exactly 512 x 512 pixels.');
  }
  if (colorType == 4 || colorType == 6) {
    _fail('Google Play store icon must not contain an alpha channel.');
  }
}

void _validateGooglePlayFeatureGraphic(Directory root, String relativePath) {
  final file = File('${root.path}/$relativePath');
  if (!file.existsSync()) {
    _fail('Missing Google Play feature graphic: $relativePath');
  }
  final bytes = file.readAsBytesSync();
  const signature = <int>[137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 ||
      !List<int>.generate(8, (index) => bytes[index])
          .asMap()
          .entries
          .every((entry) => entry.value == signature[entry.key])) {
    _fail('Google Play feature graphic must be a valid PNG.');
  }
  if (ascii.decode(bytes.sublist(12, 16)) != 'IHDR') {
    _fail('Google Play feature graphic has no PNG IHDR.');
  }
  int uint32(int offset) =>
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
  final width = uint32(16);
  final height = uint32(20);
  final bitDepth = bytes[24];
  final colorType = bytes[25];
  if (width != 1024 || height != 500) {
    _fail('Google Play feature graphic must be exactly 1024 x 500 pixels.');
  }
  if (bitDepth != 8 || colorType != 2) {
    _fail(
        'Google Play feature graphic must be a 24-bit RGB PNG without alpha.');
  }
}

void _validateGooglePlayPhoneScreenshot(Directory root, String relativePath) {
  final file = File('${root.path}/$relativePath');
  if (!file.existsSync()) {
    _fail('Missing Google Play phone screenshot: $relativePath');
  }
  final bytes = file.readAsBytesSync();
  const signature = <int>[137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 ||
      bytes.length > 8 * 1024 * 1024 ||
      !List<int>.generate(8, (index) => bytes[index])
          .asMap()
          .entries
          .every((entry) => entry.value == signature[entry.key]) ||
      ascii.decode(bytes.sublist(12, 16)) != 'IHDR') {
    _fail('Google Play phone screenshot must be a PNG no larger than 8 MB.');
  }
  int uint32(int offset) =>
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
  final width = uint32(16);
  final height = uint32(20);
  final bitDepth = bytes[24];
  final colorType = bytes[25];
  final longer = width > height ? width : height;
  final shorter = width < height ? width : height;
  if (shorter < 320 || longer > 3840 || longer > shorter * 2) {
    _fail('Google Play phone screenshot dimensions violate Play requirements.');
  }
  if (bitDepth != 8 || colorType != 2) {
    _fail(
        'Google Play phone screenshots must be 24-bit RGB PNGs without alpha.');
  }
}

Map<String, dynamic> _map(Object? value, String field) {
  if (value is! Map) _fail('$field must be an object.');
  return value.cast<String, dynamic>();
}

String _string(Map<String, dynamic> map, String field) {
  final value = map[field];
  if (value is! String || value.trim().isEmpty) {
    _fail('$field must be a non-empty string.');
  }
  return value.trim();
}

int _runes(String value) => value.runes.length;

void _maxRunes(String label, String value, int maximum) {
  final length = _runes(value);
  if (length > maximum) {
    _fail('$label has $length characters; maximum is $maximum.');
  }
}

void _maxUtf8Bytes(String label, String value, int maximum) {
  final length = utf8.encode(value).length;
  if (length > maximum) {
    _fail('$label has $length UTF-8 bytes; maximum is $maximum.');
  }
}

void _requireHttps(String label, Object? raw) {
  if (raw is! String) _fail('$label must be a URL string.');
  final uri = Uri.tryParse(raw);
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
    _fail('$label must be an absolute HTTPS URL.');
  }
}

void _rejectPublicCopy(String label, String value) {
  final lower = value.toLowerCase();
  const forbidden = <String>[
    '100 % sicher',
    '100% sicher',
    'garantiert sicher',
    'vollständig versichert',
    'kaution',
    'standardschutz',
    'schutzpaket',
    'versicherung',
    'marktführer',
    'zertifiziert sicher',
    'airbnb',
    'staging',
    'testzahlung',
    'debug',
  ];
  for (final phrase in forbidden) {
    if (lower.contains(phrase)) {
      _fail('$label contains forbidden or non-public claim: "$phrase".');
    }
  }
}

String _pubspecVersion(Directory root, {String? pubspecPath}) {
  final pubspec =
      File(pubspecPath ?? '${root.path}/pubspec.yaml').readAsLinesSync();
  final line = pubspec.firstWhere(
    (value) => value.startsWith('version:'),
    orElse: () => _fail('pubspec.yaml has no version field.'),
  );
  return line.substring('version:'.length).trim();
}

void main(List<String> arguments) {
  var requireSubmittable = false;
  var allowCandidateRollover = false;
  String? manifestPath;
  String? accountReadinessPath;
  String? closedTestingReadinessPath;
  String? pubspecPath;
  for (var index = 0; index < arguments.length; index += 1) {
    final value = arguments[index];
    if (value == '--require-submittable') {
      requireSubmittable = true;
    } else if (value == '--allow-candidate-rollover') {
      allowCandidateRollover = true;
    } else if (value == '--manifest') {
      if (index + 1 >= arguments.length) {
        _fail('--manifest requires a path.');
      }
      manifestPath = arguments[index + 1];
      index += 1;
    } else if (value == '--account-readiness') {
      if (index + 1 >= arguments.length) {
        _fail('--account-readiness requires a path.');
      }
      accountReadinessPath = arguments[index + 1];
      index += 1;
    } else if (value == '--closed-testing-readiness') {
      if (index + 1 >= arguments.length) {
        _fail('--closed-testing-readiness requires a path.');
      }
      closedTestingReadinessPath = arguments[index + 1];
      index += 1;
    } else if (value == '--pubspec') {
      if (index + 1 >= arguments.length) {
        _fail('--pubspec requires a path.');
      }
      pubspecPath = arguments[index + 1];
      index += 1;
    } else {
      _fail('Unknown argument: $value');
    }
  }

  final scriptFile = File.fromUri(Platform.script).absolute;
  final root = scriptFile.parent.parent;
  final manifestFile = manifestPath == null
      ? File('${root.path}/store/submission.json')
      : File(manifestPath).absolute;
  final manifest = _readJsonMapFile(manifestFile, 'Store submission manifest');
  if (manifest['schemaVersion'] != 1) _fail('Unsupported schemaVersion.');

  final accountReadinessFile = accountReadinessPath == null
      ? File('${root.path}/store/platform-account-readiness.json')
      : File(accountReadinessPath).absolute;
  final accountReadiness = _readJsonMapFile(
    accountReadinessFile,
    'Store platform account readiness manifest',
  );
  if (accountReadiness['schemaVersion'] != 1) {
    _fail('Unsupported Store platform account readiness schemaVersion.');
  }

  final identity = _map(manifest['identity'], 'identity');
  final product = _map(manifest['product'], 'product');
  final urls = _map(manifest['publicUrls'], 'publicUrls');
  final gates = _map(manifest['blockingGates'], 'blockingGates');
  final metadataFiles = _map(manifest['metadataFiles'], 'metadataFiles');
  final googleFiles =
      _map(metadataFiles['googlePlay'], 'metadataFiles.googlePlay');
  final appleFiles = _map(metadataFiles['apple'], 'metadataFiles.apple');
  final assets = _map(manifest['assets'], 'assets');
  final googleAssets = _map(assets['googlePlay'], 'assets.googlePlay');

  const requiredBlockingGates = <String>{
    'legalProviderIdentity',
    'copyrightOwner',
    'termsAndUserContentRules',
    'firebaseTermsAcceptedByOwner',
    'firebaseFcmAndApns',
    'googlePlayAccountAndFee',
    'googlePlayClosedTestingRequirement',
    'appleAccountXcodeAndSigning',
    'reviewAccounts',
    'realAndroidAndIosDevices',
    'finalBinaryPrivacyScan',
    'closedStoreAndAccessibilityMatrix',
  };
  if (gates.length != requiredBlockingGates.length ||
      !requiredBlockingGates.every(gates.containsKey)) {
    _fail(
        'blockingGates must contain exactly the required Store release gates.');
  }

  final closedTestingReadinessBinding =
      _string(googleFiles, 'closedTestingReadiness');
  final productionAccessApplicationBinding =
      _string(googleFiles, 'productionAccessApplication');
  final closedTestingFeedbackPlanBinding =
      _string(googleFiles, 'closedTestingFeedbackPlan');
  final appContentHandoffBinding = _string(googleFiles, 'appContentHandoff');
  if (appContentHandoffBinding !=
      'store/google-play/app-content-handoff.json') {
    _fail('Google Play appContentHandoff must bind the canonical handoff.');
  }
  if (closedTestingFeedbackPlanBinding !=
      'store/google-play/closed-testing-feedback-plan.json') {
    _fail(
        'Google Play closedTestingFeedbackPlan must bind the canonical plan.');
  }
  if (productionAccessApplicationBinding !=
      'store/google-play/production-access-application.json') {
    _fail(
        'Google Play productionAccessApplication must bind the canonical draft.');
  }
  final closedTestingReadinessFile = closedTestingReadinessPath == null
      ? File('${root.path}/$closedTestingReadinessBinding')
      : File(closedTestingReadinessPath).absolute;
  final closedTestingReadiness = _readJsonMapFile(
    closedTestingReadinessFile,
    'Google Play closed-test readiness',
  );
  _expectExactKeys(
    closedTestingReadiness,
    const {
      'schemaVersion',
      'status',
      'productionAccessAllowed',
      'applicationId',
      'accountType',
      'track',
      'requirements',
      'window',
      'testing',
      'productionAccess',
      'evidenceRef',
      'boundaries',
    },
    'Google Play closed-test readiness',
  );
  if (closedTestingReadiness['schemaVersion'] != 1 ||
      !const {
        'not-started',
        'running',
        'eligible',
        'production-access-approved',
      }.contains(closedTestingReadiness['status']) ||
      closedTestingReadiness['applicationId'] != 'com.shareittoo.app' ||
      closedTestingReadiness['accountType'] != 'personal' ||
      closedTestingReadiness['track'] != 'closed') {
    _fail(
        'Google Play closed-test readiness has an invalid identity or state.');
  }
  if (jsonEncode(closedTestingReadiness).contains('@')) {
    _fail(
        'Google Play closed-test readiness must not contain account addresses.');
  }
  final closedTestRequirements = _map(
    closedTestingReadiness['requirements'],
    'closedTestingReadiness.requirements',
  );
  if (closedTestRequirements['minimumContinuousTesterCount'] != 12 ||
      closedTestRequirements['minimumConsecutiveDays'] != 14) {
    _fail(
        'Google Play closed-test requirements must remain 12 testers for 14 days.');
  }
  final closedTestWindow = _map(
    closedTestingReadiness['window'],
    'closedTestingReadiness.window',
  );
  final closedTestTesting = _map(
    closedTestingReadiness['testing'],
    'closedTestingReadiness.testing',
  );
  final productionAccess = _map(
    closedTestingReadiness['productionAccess'],
    'closedTestingReadiness.productionAccess',
  );
  final closedTestBoundaries = _map(
    closedTestingReadiness['boundaries'],
    'closedTestingReadiness.boundaries',
  );
  for (final key in const {
    'containsTesterPersonalData',
    'containsAccountIdentifiers',
    'containsSecrets',
    'storeSubmissionChanged',
  }) {
    if (closedTestBoundaries[key] != false) {
      _fail('Google Play closed-test readiness must remain sanitized.');
    }
  }
  final closedTestProductionReady =
      closedTestingReadiness['status'] == 'production-access-approved' &&
          closedTestingReadiness['productionAccessAllowed'] == true &&
          closedTestTesting['continuousQualifiedTesterCount'] is int &&
          (closedTestTesting['continuousQualifiedTesterCount'] as int) >= 12 &&
          closedTestTesting['minimumRosterContinuouslyOptedIn'] == true &&
          closedTestTesting['engagementEvidenceCollected'] == true &&
          closedTestWindow['startedAt'] is String &&
          closedTestWindow['eligibleAt'] is String &&
          closedTestWindow['observedAt'] is String &&
          productionAccess['applicationSubmitted'] == true &&
          productionAccess['applicationApproved'] == true &&
          productionAccess['decisionObservedAt'] is String &&
          closedTestingReadiness['evidenceRef'] is String;

  _expectExactKeys(
    accountReadiness,
    const {
      'schemaVersion',
      'state',
      'googlePlay',
      'apple',
      'firebase',
      'boundaries',
    },
    'Store platform account readiness manifest',
  );
  final googlePlayAccount = _map(
    accountReadiness['googlePlay'],
    'platformAccountReadiness.googlePlay',
  );
  final appleAccount = _map(
    accountReadiness['apple'],
    'platformAccountReadiness.apple',
  );
  final firebaseAccount = _map(
    accountReadiness['firebase'],
    'platformAccountReadiness.firebase',
  );
  final accountBoundaries = _map(
    accountReadiness['boundaries'],
    'platformAccountReadiness.boundaries',
  );
  _expectExactKeys(
    googlePlayAccount,
    const {
      'status',
      'accountType',
      'developerAccountCreated',
      'registrationFeePaid',
      'identityVerification',
      'deviceVerification',
      'phoneVerification',
      'appRecordCreated',
      'evidenceRef',
    },
    'platformAccountReadiness.googlePlay',
  );
  _expectExactKeys(
    appleAccount,
    const {
      'status',
      'developerAccountCreated',
      'membershipActive',
      'identityVerification',
      'agreementsAccepted',
      'signingTeamAvailable',
      'appRecordCreated',
      'evidenceRef',
    },
    'platformAccountReadiness.apple',
  );
  _expectExactKeys(
    firebaseAccount,
    const {'status', 'ownerTermsAccepted', 'evidenceRef'},
    'platformAccountReadiness.firebase',
  );
  _expectExactKeys(
    accountBoundaries,
    const {
      'containsEmailAddresses',
      'containsAccountIdentifiers',
      'containsSecrets',
      'purchaseMade',
      'agreementAccepted',
      'storeSubmissionChanged',
    },
    'platformAccountReadiness.boundaries',
  );
  for (final key in const [
    'containsEmailAddresses',
    'containsAccountIdentifiers',
    'containsSecrets',
    'storeSubmissionChanged',
  ]) {
    if (accountBoundaries[key] != false) {
      _fail(
          'Store platform account readiness must remain sanitized and must not change a Store submission.');
    }
  }
  for (final key in const ['purchaseMade', 'agreementAccepted']) {
    if (accountBoundaries[key] is! bool) {
      _fail(
          'Store platform account readiness side-effect flags must be booleans.');
    }
  }
  if (jsonEncode(accountReadiness).contains('@')) {
    _fail(
        'Store platform account readiness must remain sanitized and contain no account address.');
  }
  final playFeePaid = googlePlayAccount['registrationFeePaid'] == true;
  final anyPaidMembership =
      playFeePaid || appleAccount['membershipActive'] == true;
  if ((accountBoundaries['purchaseMade'] == true) != anyPaidMembership) {
    _fail(
        'Store platform account purchase history must match the recorded paid account state.');
  }
  final anyAgreementAccepted =
      googlePlayAccount['developerAccountCreated'] == true ||
          appleAccount['agreementsAccepted'] == true ||
          firebaseAccount['ownerTermsAccepted'] == true;
  if ((accountBoundaries['agreementAccepted'] == true) !=
      anyAgreementAccepted) {
    _fail(
        'Store platform account agreement history must match the recorded account state.');
  }

  final googlePlayReady = googlePlayAccount['status'] == 'ready' &&
      const {'personal', 'organization'}
          .contains(googlePlayAccount['accountType']) &&
      googlePlayAccount['developerAccountCreated'] == true &&
      googlePlayAccount['registrationFeePaid'] == true &&
      googlePlayAccount['identityVerification'] == 'verified' &&
      googlePlayAccount['deviceVerification'] == 'verified' &&
      googlePlayAccount['phoneVerification'] == 'verified' &&
      googlePlayAccount['appRecordCreated'] == true;
  final appleReady = appleAccount['status'] == 'ready' &&
      appleAccount['developerAccountCreated'] == true &&
      appleAccount['membershipActive'] == true &&
      appleAccount['identityVerification'] == 'verified' &&
      appleAccount['agreementsAccepted'] == true &&
      appleAccount['signingTeamAvailable'] == true &&
      appleAccount['appRecordCreated'] == true;
  final firebaseReady = firebaseAccount['status'] == 'owner-terms-accepted' &&
      firebaseAccount['ownerTermsAccepted'] == true;
  if ((gates['googlePlayAccountAndFee'] == 'closed') != googlePlayReady) {
    _fail(
        'googlePlayAccountAndFee must match verified Play account readiness.');
  }
  if ((gates['googlePlayClosedTestingRequirement'] == 'closed') !=
      closedTestProductionReady) {
    _fail(
        'googlePlayClosedTestingRequirement must match evidenced Play production access.');
  }
  if ((gates['appleAccountXcodeAndSigning'] == 'closed') != appleReady) {
    _fail(
        'appleAccountXcodeAndSigning must match verified Apple account readiness.');
  }
  if ((gates['firebaseTermsAcceptedByOwner'] == 'closed') != firebaseReady) {
    _fail('firebaseTermsAcceptedByOwner must match the owner confirmation.');
  }
  final allPlatformAccountsReady =
      googlePlayReady && appleReady && firebaseReady;
  if (accountReadiness['state'] !=
      (allPlatformAccountsReady ? 'ready' : 'setup-required')) {
    _fail('Store platform account readiness state is inconsistent.');
  }

  final evidenceRefs = <String>{};
  for (final entry in [googlePlayAccount, appleAccount, firebaseAccount]) {
    final ref = entry['evidenceRef'];
    if (ref == null) continue;
    if (ref is! String ||
        !ref.startsWith('docs/evidence/b11/') ||
        ref.contains('..') ||
        !ref.endsWith('.json')) {
      _fail(
          'Store platform account evidence must stay under docs/evidence/b11.');
    }
    evidenceRefs.add(ref);
  }
  if (googlePlayAccount['evidenceRef'] == null ||
      appleAccount['evidenceRef'] == null ||
      (firebaseReady && firebaseAccount['evidenceRef'] == null)) {
    _fail('Store platform account readiness is missing required evidence.');
  }
  for (final ref in evidenceRefs) {
    final evidence = _readJsonMapFile(
      File('${root.path}/$ref'),
      'Store platform account evidence',
    );
    if (evidence['schemaVersion'] != 1 ||
        evidence['kind'] != 'store-platform-account-readiness-observation' ||
        !const {'setup-required', 'ready'}.contains(evidence['status']) ||
        DateTime.tryParse(evidence['capturedAt']?.toString() ?? '') == null ||
        jsonEncode(evidence).contains('@')) {
      _fail(
          'Store platform account evidence is invalid or contains account data.');
    }
    final boundaries = _map(
      evidence['boundaries'],
      'storePlatformAccountEvidence.boundaries',
    );
    for (final key in [
      'containsEmailAddresses',
      'containsAccountIdentifiers',
      'containsSecrets',
      'storeSubmissionChanged',
    ]) {
      if (boundaries[key] != false) {
        _fail(
            'Store platform account evidence must remain sanitized and must not change a Store submission.');
      }
    }
    for (final key in ['purchaseMade', 'agreementAccepted']) {
      if (boundaries[key] is! bool) {
        _fail(
            'Store platform account evidence side-effect flags must be booleans.');
      }
    }
    final evidenceGoogle = _map(
      evidence['googlePlay'],
      'storePlatformAccountEvidence.googlePlay',
    );
    final evidenceApple = _map(
      evidence['apple'],
      'storePlatformAccountEvidence.apple',
    );
    final evidencePaid = evidenceGoogle['registrationFeePaid'] == true ||
        evidenceApple['membershipActive'] == true;
    if ((boundaries['purchaseMade'] == true) != evidencePaid) {
      _fail(
          'Store platform account evidence purchase history must match its observed paid state.');
    }
    final evidenceAgreement =
        evidenceGoogle['developerAccountCreated'] == true ||
            evidenceApple['agreementsAccepted'] == true;
    if ((boundaries['agreementAccepted'] == true) != evidenceAgreement) {
      _fail(
          'Store platform account evidence agreement history must match its observed account state.');
    }
    if (ref == googlePlayAccount['evidenceRef']) {
      final playEvidenceMatches = evidenceGoogle['developerAccountCreated'] ==
              googlePlayAccount['developerAccountCreated'] &&
          evidenceGoogle['registrationFeePaid'] ==
              googlePlayAccount['registrationFeePaid'] &&
          evidenceGoogle['identityVerified'] ==
              (googlePlayAccount['identityVerification'] == 'verified') &&
          evidenceGoogle['deviceVerified'] ==
              (googlePlayAccount['deviceVerification'] == 'verified') &&
          evidenceGoogle['phoneVerified'] ==
              (googlePlayAccount['phoneVerification'] == 'verified') &&
          evidenceGoogle['appRecordCreated'] ==
              googlePlayAccount['appRecordCreated'];
      if (!playEvidenceMatches) {
        _fail(
            'Google Play account readiness must match its sanitized Console evidence.');
      }
    }
  }

  const expectedId = 'com.shareittoo.app';
  if (_string(identity, 'applicationId') != expectedId ||
      _string(identity, 'bundleId') != expectedId) {
    _fail('Android and iOS store identifiers must both be $expectedId.');
  }

  final pubspecVersion = _pubspecVersion(root, pubspecPath: pubspecPath);
  final match =
      RegExp(r'^(\d+\.\d+\.\d+)\+(\d{10})$').firstMatch(pubspecVersion);
  if (match == null) _fail('pubspec version must use semantic+YYYYMMDDNN.');
  if (match.group(1) != _string(identity, 'versionName')) {
    _fail('Store versionName does not match pubspec.yaml.');
  }
  final currentBuild = BigInt.parse(match.group(2)!);
  final minimumStoreBuild =
      BigInt.parse(_string(identity, 'minimumStoreBuildNumber'));
  if (minimumStoreBuild < BigInt.from(2026080903)) {
    _fail('minimumStoreBuildNumber must be at least 2026080903.');
  }

  if (_string(identity, 'releaseChannel') != 'internal') {
    _fail('B11 store metadata must remain on the internal release channel.');
  }
  if (_string(identity, 'apiBaseUrl') !=
      'https://staging.shareittoo.com/api/v1') {
    _fail('B11 store metadata must target the isolated staging API.');
  }

  if (product['physicalGoodsRental'] != true ||
      product['minimumUserAge'] != 18 ||
      product['designedForChildren'] != false ||
      product['containsAds'] != false ||
      product['advertisingTracking'] != false ||
      product['firebaseAnalytics'] != false) {
    _fail('Product truth flags do not match the approved B11 scope.');
  }

  final googleTitle = _readText(root, _string(googleFiles, 'title'));
  final googleShort = _readText(root, _string(googleFiles, 'shortDescription'));
  final googleFull = _readText(root, _string(googleFiles, 'fullDescription'));
  final googleNotes =
      _readText(root, _string(googleFiles, 'internalReleaseNotes'));
  final googleScreenshotAltTexts =
      _readJsonList(root, _string(googleFiles, 'screenshotAltTexts'));
  final googleConsoleWorksheet =
      _readText(root, _string(googleFiles, 'consoleEntryWorksheet'));
  final googleInternalUploadHandoffPath =
      _string(googleFiles, 'internalUploadHandoff');
  final googleInternalUploadHandoff = _readJsonMapFile(
    File('${root.path}/$googleInternalUploadHandoffPath'),
    'Google Play internal upload handoff',
  );
  final handoffCandidate = _map(googleInternalUploadHandoff['candidate'],
      'Google Play handoff candidate');
  final handoffPreUploadGates = _map(
    googleInternalUploadHandoff['preUploadGates'],
    'Google Play handoff pre-upload gates',
  );
  final handoffBuild =
      BigInt.tryParse(handoffCandidate['buildNumber']?.toString() ?? '');
  if (handoffBuild == null) {
    _fail('Google Play handoff buildNumber must be numeric.');
  }
  final googleProductionAccessApplication = _readJsonMapFile(
    File('${root.path}/$productionAccessApplicationBinding'),
    'Google Play production-access application',
  );
  final googleClosedTestingFeedbackPlan = _readJsonMapFile(
    File('${root.path}/$closedTestingFeedbackPlanBinding'),
    'Google Play closed-testing feedback plan',
  );
  if (googleClosedTestingFeedbackPlan['schemaVersion'] != 1 ||
      googleClosedTestingFeedbackPlan['applicationId'] !=
          'com.shareittoo.app' ||
      !const {'planned', 'collecting', 'summarized'}
          .contains(googleClosedTestingFeedbackPlan['state'])) {
    _fail('Google Play closed-testing feedback plan is invalid.');
  }
  if (jsonEncode(googleClosedTestingFeedbackPlan).contains('@')) {
    _fail(
        'Google Play closed-testing feedback plan must not contain account addresses.');
  }
  if (googleProductionAccessApplication['schemaVersion'] != 1 ||
      googleProductionAccessApplication['applicationId'] !=
          'com.shareittoo.app' ||
      !const {
        'draft-before-closed-test',
        'ready-to-apply',
        'submitted',
        'production-access-approved',
      }.contains(googleProductionAccessApplication['state'])) {
    _fail('Google Play production-access application is invalid.');
  }
  if (jsonEncode(googleProductionAccessApplication).contains('@')) {
    _fail(
        'Google Play production-access application must not contain account addresses.');
  }
  final appleName = _readText(root, _string(appleFiles, 'name'));
  final appleSubtitle = _readText(root, _string(appleFiles, 'subtitle'));
  final applePromo = _readText(root, _string(appleFiles, 'promotionalText'));
  final appleDescription = _readText(root, _string(appleFiles, 'description'));
  final appleKeywords = _readText(root, _string(appleFiles, 'keywords'));
  final appleReviewNotes =
      _readText(root, _string(appleFiles, 'reviewNotesTemplate'));
  final appleTestFlightHandoff = _readJsonMapFile(
    File('${root.path}/${_string(appleFiles, 'testFlightHandoff')}'),
    'Apple TestFlight handoff',
  );
  final appleDeveloperWorksheet =
      _readText(root, _string(appleFiles, 'developerWorksheet'));
  _validateGooglePlayIcon(root, _string(googleAssets, 'storeIcon'));
  _validateGooglePlayFeatureGraphic(
      root, _string(googleAssets, 'featureGraphic'));
  final phoneScreenshots = googleAssets['phoneScreenshots'];
  if (phoneScreenshots is! List ||
      phoneScreenshots.length != 4 ||
      phoneScreenshots.any((value) =>
          value is! String ||
          !value.startsWith('store/assets/google-play/phone-screenshots/'))) {
    _fail(
        'Google Play phone screenshots must bind exactly four validated local candidates.');
  }
  for (final screenshot in phoneScreenshots.cast<String>()) {
    _validateGooglePlayPhoneScreenshot(root, screenshot);
  }

  _maxRunes('Google title', googleTitle, 30);
  _maxRunes('Google short description', googleShort, 80);
  _maxRunes('Google full description', googleFull, 4000);
  _maxRunes('Apple name', appleName, 30);
  _maxRunes('Apple subtitle', appleSubtitle, 30);
  _maxRunes('Apple promotional text', applePromo, 170);
  _maxRunes('Apple description', appleDescription, 4000);
  _maxUtf8Bytes('Apple keywords', appleKeywords, 100);
  _maxUtf8Bytes('Apple review notes', appleReviewNotes, 4000);

  const expectedScreenshotIds = <String>{
    'feed',
    'search',
    'listing-detail',
    'create-listing',
    'booking-request',
    'booking-chat',
    'handover-return',
    'trust-controls',
  };
  if (googleScreenshotAltTexts.length != expectedScreenshotIds.length) {
    _fail('Google screenshot alt texts must contain exactly eight scenes.');
  }
  final observedScreenshotIds = <String>{};
  for (final raw in googleScreenshotAltTexts) {
    final entry = _map(raw, 'Google screenshot alt text entry');
    final id = _string(entry, 'id');
    final altText = _string(entry, 'altText');
    if (!expectedScreenshotIds.contains(id) || !observedScreenshotIds.add(id)) {
      _fail('Google screenshot alt text ids must be unique approved scenes.');
    }
    _maxRunes('Google screenshot alt text $id', altText, 140);
    _rejectPublicCopy('Google screenshot alt text $id', altText);
  }

  for (final required in [
    'com.shareittoo.app',
    handoffBuild.toString(),
    'Nein, die App enthält keine Werbung.',
    'kein Google Play Billing',
    'keine Store-Einreichung erlaubt',
    'Identität mit amtlichem Lichtbildausweis',
    'Data Safety',
    'Internal Testing',
  ]) {
    if (!googleConsoleWorksheet.contains(required)) {
      _fail('Google Play Console worksheet is missing: $required');
    }
  }

  final handoffSuperseded = const {
    'superseded-privacy-rescan-failed-replacement-pending',
    'superseded-product-truth-failed-replacement-pending',
  }.contains(googleInternalUploadHandoff['status']);
  final candidateBuildMatches = handoffSuperseded
      ? allowCandidateRollover &&
          googleInternalUploadHandoff['replacementBuildNumber'] ==
              currentBuild.toString()
      : allowCandidateRollover
          ? handoffBuild <= currentBuild
          : handoffBuild == currentBuild;
  if (allowCandidateRollover &&
      (manifest['state'] != 'draft' ||
          manifest['submissionAllowed'] != false ||
          requireSubmittable)) {
    _fail('Candidate rollover is restricted to a fail-closed Store draft.');
  }
  final handoffInternalActive = const {
    'internal-release-active-store-install-pending',
    'internal-release-active-store-install-verified',
  }.contains(googleInternalUploadHandoff['status']);
  if ((!handoffSuperseded &&
          !handoffInternalActive &&
          googleInternalUploadHandoff['status'] !=
              'verified-artifact-ready-immediate-reverification-pending') ||
      googleInternalUploadHandoff['submissionAllowed'] != false ||
      googleInternalUploadHandoff['track'] != 'internal' ||
      handoffCandidate['applicationId'] != identity['applicationId'] ||
      handoffCandidate['versionName'] != identity['versionName'] ||
      !candidateBuildMatches ||
      handoffCandidate['apiBaseUrl'] != identity['apiBaseUrl'] ||
      handoffPreUploadGates['personalIdentityVerification'] != 'verified' ||
      handoffPreUploadGates['deviceVerification'] != 'verified' ||
      handoffPreUploadGates['phoneVerification'] != 'verified' ||
      handoffPreUploadGates['developerProgramPoliciesDeclaration'] !=
          'accepted-with-owner-approval' ||
      handoffPreUploadGates['playAppSigningTerms'] !=
          'accepted-with-owner-approval' ||
      handoffPreUploadGates['usExportLawsDeclaration'] !=
          'accepted-with-owner-approval' ||
      handoffPreUploadGates['playAppRecordCreated'] != true ||
      handoffPreUploadGates['immediateArtifactReverification'] !=
          handoffInternalActive) {
    _fail(
        'Google Play internal upload handoff must remain bound and fail-closed.');
  }

  if (googleTitle != appleName || googleTitle != 'ShareItToo') {
    _fail('Google and Apple names must use the ShareItToo product name.');
  }
  if (appleKeywords.toLowerCase().contains('shareittoo')) {
    _fail('Apple keywords must not duplicate the app name.');
  }

  for (final entry in <String, String>{
    'Google title': googleTitle,
    'Google short description': googleShort,
    'Google full description': googleFull,
    'Apple name': appleName,
    'Apple subtitle': appleSubtitle,
    'Apple promotional text': applePromo,
    'Apple description': appleDescription,
  }.entries) {
    _rejectPublicCopy(entry.key, entry.value);
  }

  if (!googleNotes.toLowerCase().contains('staging') ||
      !googleNotes.toLowerCase().contains('testzahlung')) {
    _fail(
        'Internal Google release notes must state staging and test payments.');
  }
  if (!appleReviewNotes.toLowerCase().contains('physical items') ||
      !appleReviewNotes.toLowerCase().contains('test payments') ||
      !appleReviewNotes.toLowerCase().contains('no ads') ||
      !appleReviewNotes.toLowerCase().contains('no credentials')) {
    _fail('Apple review notes omit a required B11 truth boundary.');
  }

  final appleHandoffCandidate =
      _map(appleTestFlightHandoff['candidate'], 'Apple TestFlight candidate');
  final appleHandoffBuildNumber = _string(appleHandoffCandidate, 'buildNumber');
  if (appleTestFlightHandoff['status'] !=
          'static-config-ready-tooling-and-account-gates-pending' ||
      appleTestFlightHandoff['submissionAllowed'] != false ||
      appleTestFlightHandoff['distribution'] != 'testflight-internal' ||
      appleHandoffCandidate['bundleId'] != identity['bundleId'] ||
      appleHandoffCandidate['versionName'] != identity['versionName'] ||
      BigInt.tryParse(appleHandoffCandidate['buildNumber']?.toString() ?? '') ==
          null ||
      BigInt.parse(appleHandoffCandidate['buildNumber'].toString()) >
          currentBuild ||
      appleHandoffCandidate['apiBaseUrl'] != identity['apiBaseUrl']) {
    _fail('Apple TestFlight handoff must remain bound and fail-closed.');
  }
  for (final required in const [
    'com.shareittoo.app',
    'TestFlight',
    'Privacy Manifest',
    'Export Compliance',
    'keine Apple-Zahlung',
  ]) {
    if (!appleDeveloperWorksheet.contains(required)) {
      _fail('Apple Developer worksheet is missing: $required');
    }
  }
  if (!appleDeveloperWorksheet.contains(appleHandoffBuildNumber)) {
    _fail('Apple Developer worksheet is missing the bound TestFlight build: '
        '$appleHandoffBuildNumber');
  }

  final sourceDocuments = manifest['sourceDocuments'];
  if (sourceDocuments is! List || sourceDocuments.isEmpty) {
    _fail('sourceDocuments must contain the B11 evidence documents.');
  }
  for (final value in sourceDocuments) {
    if (value is! String || !File('${root.path}/$value').existsSync()) {
      _fail('Missing source document: $value');
    }
  }

  final marketing = _map(urls['marketing'], 'publicUrls.marketing');
  if (marketing['status'] != 'verified') {
    _fail('Marketing URL must remain verified.');
  }
  _requireHttps('publicUrls.marketing.url', marketing['url']);

  const requiredPublicUrls = <String>['support', 'privacy', 'accountDeletion'];
  const expectedPublicUrls = <String, String>{
    'support': 'https://shareittoo.com/support',
    'privacy': 'https://shareittoo.com/privacy',
    'accountDeletion': 'https://shareittoo.com/account-deletion',
  };
  final openUrlGates = <String>[];
  for (final key in requiredPublicUrls) {
    final value = _map(urls[key], 'publicUrls.$key');
    final status = value['status'];
    if (status == 'verified') {
      _requireHttps('publicUrls.$key.url', value['url']);
    } else if (status == 'draft') {
      _requireHttps('publicUrls.$key.url', value['url']);
      openUrlGates.add(key);
    } else if (status == 'open' && value['url'] == null) {
      openUrlGates.add(key);
    } else {
      _fail(
          'publicUrls.$key must be verified/draft with HTTPS or open with null URL.');
    }
    if (value['url'] != null && value['url'] != expectedPublicUrls[key]) {
      _fail('publicUrls.$key.url must be ${expectedPublicUrls[key]}.');
    }
  }
  final deletion = _map(urls['accountDeletion'], 'publicUrls.accountDeletion');
  _requireHttps(
    'publicUrls.accountDeletion.stagingEvidenceUrl',
    deletion['stagingEvidenceUrl'],
  );

  final openGates = <String>[];
  for (final entry in gates.entries) {
    if (entry.value == 'open') {
      openGates.add(entry.key);
    } else if (entry.value != 'closed') {
      _fail('Gate ${entry.key} must be open or closed.');
    }
  }

  final submissionAllowed = manifest['submissionAllowed'] == true;
  final state = manifest['state'];
  if (state != 'draft' && state != 'ready') {
    _fail('state must be draft or ready.');
  }

  if (submissionAllowed || state == 'ready') {
    if (!submissionAllowed || state != 'ready') {
      _fail('ready and submissionAllowed must change together.');
    }
    if (openUrlGates.isNotEmpty || openGates.isNotEmpty) {
      _fail('A submittable manifest cannot contain open URLs or gates.');
    }
    if (currentBuild < minimumStoreBuild) {
      _fail('Current pubspec build is below the minimum store build.');
    }
  } else if (state != 'draft') {
    _fail('A non-submittable manifest must remain in draft state.');
  }

  if (requireSubmittable && !submissionAllowed) {
    _fail(
      'Store submission remains blocked: URLs=${openUrlGates.join(',')}; '
      'gates=${openGates.join(',')}; currentBuild=$currentBuild; '
      'minimumBuild=$minimumStoreBuild.',
    );
  }

  stdout.writeln(
    'Store metadata valid: state=$state, submissionAllowed=$submissionAllowed, '
    'currentBuild=$currentBuild, storeCandidateBuild=$handoffBuild, '
    'minimumStoreBuild=$minimumStoreBuild, '
    'openUrls=${openUrlGates.length}, openGates=${openGates.length}.',
  );
}
