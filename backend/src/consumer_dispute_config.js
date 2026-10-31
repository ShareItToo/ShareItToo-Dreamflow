const policyVersion = 'V52-VSBG-2026-08-22.1';
const approvedParticipationStatus =
  'not_willing_or_obliged_except_mandatory_case';
const participationStatusPlain =
  'nicht bereit und nicht verpflichtet, soweit keine gesetzliche Verpflichtung im Einzelfall besteht';
const oldOdrHostPattern = /(?:ec\.europa\.eu\/consumers\/odr|consumer-redress\.ec\.europa\.eu|webgate\.ec\.europa\.eu\/odr)/iu;
const versionPattern = /^[A-Za-z0-9_.:-]{3,120}$/u;

function text(value, maximum) {
  if (typeof value !== 'string') return '';
  const result = value.trim();
  return result.length <= maximum ? result : '';
}

function approved(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function httpsWebsite(value) {
  const candidate = text(value, 500);
  if (!candidate || oldOdrHostPattern.test(candidate)) return '';
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function readConsumerDisputeConfiguration(environment = process.env) {
  const configurationVersion = text(
    environment.SIT_CONSUMER_DISPUTE_CONFIGURATION_VERSION,
    120,
  );
  const conciliationBodyName = text(environment.SIT_CONSUMER_DISPUTE_BODY_NAME, 300);
  const conciliationBodyAddress = text(environment.SIT_CONSUMER_DISPUTE_BODY_ADDRESS, 500);
  const conciliationBodyWebsite = httpsWebsite(
    environment.SIT_CONSUMER_DISPUTE_BODY_WEBSITE,
  );
  const participationStatus = text(
    environment.SIT_CONSUMER_DISPUTE_PARTICIPATION_STATUS,
    100,
  );
  const isApproved = approved(environment.SIT_CONSUMER_DISPUTE_APPROVED);
  const isComplete = isApproved
    && versionPattern.test(configurationVersion)
    && conciliationBodyName.length >= 3
    && conciliationBodyAddress.length >= 8
    && conciliationBodyWebsite.length > 0
    && participationStatus === approvedParticipationStatus;

  return Object.freeze({
    policyVersion,
    isApproved,
    isComplete,
    configurationVersion,
    conciliationBodyName,
    conciliationBodyAddress,
    conciliationBodyWebsite,
    participationStatus,
    participationStatusPlain,
    oldOdrLinkPresent: oldOdrHostPattern.test(
      String(environment.SIT_CONSUMER_DISPUTE_BODY_WEBSITE ?? ''),
    ),
  });
}

export const consumerDisputeConfigurationContract = Object.freeze({
  policyVersion,
  approvedParticipationStatus,
  participationStatusPlain,
});
