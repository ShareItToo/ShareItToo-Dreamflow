const placeholderPattern = /(?:^|[\s<[_-])(?:change[- ]?me|example|muster|placeholder|replace|tbd|todo|unknown|unbekannt|offen)(?:$|[\s>\]_-])/iu;
const formationPattern = /\bi\.?\s*g\.?\b/iu;

function value(env, name) {
  return typeof env?.[name] === 'string' ? env[name].trim() : '';
}

function validEmail(candidate) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(candidate);
}

function validDate(candidate) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(candidate)
    && Number.isFinite(Date.parse(`${candidate}T00:00:00.000Z`));
}

function validHttpsUrl(candidate) {
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function placeholder(candidate) {
  return placeholderPattern.test(candidate) || formationPattern.test(candidate);
}

export function evaluateOperatorReadiness(env, {
  approvalRequested = false,
  mailEnabled = false,
  paymentProviderEnabled = false,
  firebaseEnabled = false,
  mapsEnabled = false,
} = {}) {
  const required = [
    'PUBLIC_SUPPORT_EMAIL',
    'PUBLIC_PRIVACY_EMAIL',
    'PUBLIC_LEGAL_PROVIDER_NAME',
    'PUBLIC_LEGAL_PROVIDER_ADDRESS',
    'PUBLIC_LEGAL_REPRESENTATIVE',
    'PUBLIC_LEGAL_CONTENT_RESPONSIBLE',
    'PUBLIC_LEGAL_REGISTER_COURT',
    'PUBLIC_LEGAL_REGISTER_NUMBER',
    'PUBLIC_LEGAL_COMPETENT_AUTHORITY',
    'PUBLIC_LEGAL_WITHDRAWAL_URL',
    'PUBLIC_PRIVACY_EFFECTIVE_DATE',
    'LEGAL_HOSTING_PROVIDER_NAME',
    'LEGAL_HOSTING_PROCESSING_REGIONS',
    'LEGAL_HOSTING_DPA_ACCEPTED_DATE',
  ];
  if (mailEnabled) {
    required.push(
      'LEGAL_SMTP_PROVIDER_NAME',
      'LEGAL_SMTP_PROCESSING_REGIONS',
      'LEGAL_SMTP_DPA_ACCEPTED_DATE',
    );
  }
  if (paymentProviderEnabled) {
    required.push(
      'LEGAL_PSP_PROVIDER_NAME',
      'LEGAL_PSP_PROCESSING_REGIONS',
      'LEGAL_PSP_DPA_ACCEPTED_DATE',
      'LEGAL_PSP_TRANSFER_MECHANISM',
    );
  }
  if (firebaseEnabled) {
    required.push(
      'LEGAL_FIREBASE_CONTRACTING_ENTITY',
      'LEGAL_FIREBASE_PROCESSING_REGIONS',
      'LEGAL_FIREBASE_DPA_ACCEPTED_DATE',
      'LEGAL_FIREBASE_TRANSFER_MECHANISM',
    );
  }
  if (mapsEnabled) {
    required.push(
      'GOOGLE_MAPS_PROVIDER_NAME',
      'GOOGLE_MAPS_PROCESSING_REGIONS',
      'GOOGLE_MAPS_DPA_ACCEPTED_DATE',
      'GOOGLE_MAPS_TRANSFER_MECHANISM',
    );
  }
  const missingFields = required.filter((name) => !value(env, name));
  const invalidFields = required.filter((name) => {
    const candidate = value(env, name);
    if (!candidate) return false;
    if (placeholder(candidate)) return true;
    if (name.endsWith('_EMAIL')) return !validEmail(candidate);
    if (name.endsWith('_DATE')) return !validDate(candidate);
    if (name.endsWith('_URL')) return !validHttpsUrl(candidate);
    return false;
  });
  const providerName = value(env, 'PUBLIC_LEGAL_PROVIDER_NAME');
  if (providerName && formationPattern.test(providerName)
      && !invalidFields.includes('PUBLIC_LEGAL_PROVIDER_NAME')) {
    invalidFields.push('PUBLIC_LEGAL_PROVIDER_NAME');
  }
  const factsComplete = missingFields.length === 0 && invalidFields.length === 0;
  return Object.freeze({
    state: factsComplete ? 'facts-complete' : 'facts-open',
    approvalRequested: approvalRequested === true,
    factsComplete,
    activationAllowed: approvalRequested === true && factsComplete,
    missingFields: Object.freeze([...missingFields]),
    invalidFields: Object.freeze([...new Set(invalidFields)]),
    providerRequirements: Object.freeze({
      hosting: true,
      smtp: mailEnabled,
      payment: paymentProviderEnabled,
      firebase: firebaseEnabled,
      maps: mapsEnabled,
    }),
    containsValues: false,
  });
}
