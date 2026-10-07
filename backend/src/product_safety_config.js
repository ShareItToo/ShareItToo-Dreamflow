const configurationVersionPattern = /^[A-Za-z0-9_.:-]{3,120}$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function approved(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function text(value, maximum) {
  if (typeof value !== 'string') return '';
  const result = value.trim();
  return result.length <= maximum ? result : '';
}

export function readProductSafetyConfiguration(environment = process.env) {
  const configurationVersion = text(
    environment.SIT_PRODUCT_SAFETY_CONFIGURATION_VERSION,
    120,
  );
  const consumerContactEmail = text(
    environment.SIT_PRODUCT_SAFETY_CONSUMER_CONTACT_EMAIL,
    320,
  ).toLowerCase();
  const isApproved = approved(environment.SIT_PRODUCT_SAFETY_APPROVED);
  const authorityContactRegistered = approved(
    environment.SIT_PRODUCT_SAFETY_AUTHORITY_CONTACT_REGISTERED,
  );
  const safetyGateRegistered = approved(
    environment.SIT_PRODUCT_SAFETY_SAFETY_GATE_REGISTERED,
  );
  const internalProcessApproved = approved(
    environment.SIT_PRODUCT_SAFETY_INTERNAL_PROCESS_APPROVED,
  );
  const isComplete = isApproved
    && configurationVersionPattern.test(configurationVersion)
    && emailPattern.test(consumerContactEmail)
    && authorityContactRegistered
    && safetyGateRegistered
    && internalProcessApproved;

  return Object.freeze({
    isApproved,
    isComplete,
    configurationVersion,
    consumerContactEmail,
    authorityContactRegistered,
    safetyGateRegistered,
    internalProcessApproved,
  });
}

export const productSafetyConfigurationContract = Object.freeze({
  intakeVersion: 'sit_product_safety_intake_v1',
  consumerContactPointVersion: 'sit_product_safety_contact_point_v1',
  maximumCandidateTriageMinutes: 60,
});
