const REQUIRED_FACTS = Object.freeze([
  'GOOGLE_MAPS_PROVIDER_NAME',
  'GOOGLE_MAPS_PURPOSE',
  'GOOGLE_MAPS_DATA_FIELDS',
  'GOOGLE_MAPS_PROCESSING_REGIONS',
  'GOOGLE_MAPS_TRANSFER_MECHANISM',
  'GOOGLE_MAPS_DPA_ACCEPTED_DATE',
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function evaluateGoogleMapsActivation(environment = {}) {
  const activationApproved = text(environment.GOOGLE_MAPS_ACTIVATION_APPROVED)
    .toLowerCase() === 'true';
  const serverApiKey = text(environment.GOOGLE_MAPS_SERVER_API_KEY);
  const credentialValid = /^AIza[0-9A-Za-z_-]{20,}$/u.test(serverApiKey);
  const missingFacts = REQUIRED_FACTS.filter((name) => !text(environment[name]));
  const dpaDate = text(environment.GOOGLE_MAPS_DPA_ACCEPTED_DATE);
  if (dpaDate && !/^\d{4}-\d{2}-\d{2}$/u.test(dpaDate)) {
    missingFacts.push('GOOGLE_MAPS_DPA_ACCEPTED_DATE');
  }

  if (activationApproved && (!credentialValid || missingFacts.length > 0)) {
    const required = [
      ...(!credentialValid ? ['GOOGLE_MAPS_SERVER_API_KEY'] : []),
      ...new Set(missingFacts),
    ];
    throw new Error(
      `GOOGLE_MAPS_ACTIVATION_APPROVED requires verified configuration: ${required.join(', ')}`,
    );
  }

  const enabled = activationApproved && credentialValid && missingFacts.length === 0;
  return Object.freeze({
    enabled,
    activationApproved,
    providerFactsComplete: missingFacts.length === 0,
    serverApiKey: enabled ? serverApiKey : '',
  });
}
