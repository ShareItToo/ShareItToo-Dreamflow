const registrationBundleType = 'account_registration_bundle';
const registrationBundleLanguage = 'de';
const registrationBundleTermsDocumentName = 'ShareItToo Plattformbedingungen';
const registrationBundlePrivacyDocumentName = 'ShareItToo Datenschutzerklärung';
const registrationBundleDocumentVersion = 'V5.2-2026-08-16';

String registrationConsentActionText(String actionLabel) =>
    'Mit Klick auf „$actionLabel“ bestätigst du, mindestens 18 Jahre alt zu '
    'sein und ShareItToo ausschließlich privat zu nutzen. Du akzeptierst die '
    'SIT-Plattformbedingungen und nimmst die Datenschutzerklärung zur '
    'Kenntnis.';

Map<String, dynamic> localRegistrationConsentBundle({
  required String actionLabel,
  required String appVersion,
  required String declaredAt,
}) =>
    <String, dynamic>{
      'type': registrationBundleType,
      'localTestOnly': true,
      'actionLabel': actionLabel,
      'exactCtaText': registrationConsentActionText(actionLabel),
      'facts': <String, dynamic>{
        'minimumAge18': true,
        'privateUseOnly': true,
        'termsAccepted': true,
        'privacyAcknowledged': true,
      },
      'documents': <String, dynamic>{
        'terms': <String, dynamic>{
          'name': registrationBundleTermsDocumentName,
          'version': registrationBundleDocumentVersion,
        },
        'privacy': <String, dynamic>{
          'name': registrationBundlePrivacyDocumentName,
          'version': registrationBundleDocumentVersion,
        },
      },
      'appVersion': appVersion,
      'language': registrationBundleLanguage,
      'declaredAt': declaredAt,
      'accepted': true,
    };
