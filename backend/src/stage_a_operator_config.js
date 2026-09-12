const requiredStageAOperatorFields = Object.freeze([
  'SIT_OPERATOR_LEGAL_NAME',
  'SIT_OPERATOR_POSTAL_ADDRESS',
  'SIT_OPERATOR_CONTACT_EMAIL',
]);

const placeholderPattern = /(?:change[- ]?me|example|muster|placeholder|replace|tbd|todo|unknown|unbekannt|offen)/iu;

function normalized(environment, field) {
  const candidate = environment?.[field];
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function validEmail(candidate) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(candidate);
}

export function evaluateStageAOperatorConfig(environment = {}) {
  const missingFields = requiredStageAOperatorFields.filter(
    (field) => normalized(environment, field) === '',
  );
  const invalidFields = requiredStageAOperatorFields.filter((field) => {
    const candidate = normalized(environment, field);
    if (candidate === '') return false;
    if (placeholderPattern.test(candidate)) return true;
    if (field === 'SIT_OPERATOR_CONTACT_EMAIL') return !validEmail(candidate);
    if (field === 'SIT_OPERATOR_LEGAL_NAME') return candidate.length < 2;
    if (field === 'SIT_OPERATOR_POSTAL_ADDRESS') return candidate.length < 8;
    return false;
  });
  const factsComplete = missingFields.length === 0 && invalidFields.length === 0;
  return Object.freeze({
    state: factsComplete ? 'facts-complete-activation-still-separate' : 'facts-open',
    factsComplete,
    activationAllowed: false,
    requiredFields: requiredStageAOperatorFields,
    missingFields: Object.freeze(missingFields),
    invalidFields: Object.freeze(invalidFields),
    containsValues: false,
  });
}
