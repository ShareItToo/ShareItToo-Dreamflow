export const registrationBundleType = 'account_registration_bundle';
export const registrationBundleLanguage = 'de';
export const registrationBundleTermsDocumentName = 'ShareItToo Plattformbedingungen';
export const registrationBundlePrivacyDocumentName = 'ShareItToo Datenschutzerklärung';
export const registrationBundleDocumentVersion = 'V5.2-2026-08-16';

export const registrationActionLabels = Object.freeze(new Set([
  'Kostenlos registrieren',
  'Mit Google registrieren',
  'Mit Apple registrieren',
  'Mit Facebook registrieren',
]));

export function registrationActionLabelForProvider(provider) {
  const normalized = String(provider ?? '').trim().toLowerCase();
  const label = `Mit ${normalized.charAt(0).toUpperCase()}${normalized.slice(1)} registrieren`;
  if (!registrationActionLabels.has(label)) {
    throw new Error('registration_provider_invalid');
  }
  return label;
}

export function registrationConsentActionText(actionLabel) {
  if (!registrationActionLabels.has(actionLabel)) {
    throw new Error('registration_action_label_invalid');
  }
  return `Mit Klick auf „${actionLabel}“ bestätigst du, mindestens 18 Jahre alt zu sein und ShareItToo ausschließlich privat zu nutzen. Du akzeptierst die SIT-Plattformbedingungen und nimmst die Datenschutzerklärung zur Kenntnis.`;
}

export function buildRegistrationConsentBundle({ actionLabel, appVersion, declaredAt }) {
  return {
    type: registrationBundleType,
    localTestOnly: false,
    actionLabel,
    exactCtaText: registrationConsentActionText(actionLabel),
    facts: {
      minimumAge18: true,
      privateUseOnly: true,
      termsAccepted: true,
      privacyAcknowledged: true,
    },
    documents: {
      terms: {
        name: registrationBundleTermsDocumentName,
        version: registrationBundleDocumentVersion,
      },
      privacy: {
        name: registrationBundlePrivacyDocumentName,
        version: registrationBundleDocumentVersion,
      },
    },
    appVersion,
    language: registrationBundleLanguage,
    ...(declaredAt ? { declaredAt } : {}),
    accepted: true,
  };
}
