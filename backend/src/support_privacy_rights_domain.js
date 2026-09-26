import { SupportCaseError } from './support_case_domain.js';

export const supportPrivacyRightsRequestVersion = 'sit_privacy_rights_request_v1';
export const supportPrivacyRightsTimeZone = 'Europe/Berlin';

export const supportPrivacyRightsRequestKinds = Object.freeze([
  'access',
  'rectification',
  'erasure',
  'restriction',
  'objection',
  'portability',
]);

const requestKinds = new Set(supportPrivacyRightsRequestKinds);
const subtypeKinds = Object.freeze({
  access_or_copy_request: new Set(['access', 'portability']),
  correction_or_deletion_request: new Set(['rectification', 'erasure']),
  objection_or_restriction_request: new Set(['objection', 'restriction']),
});

function requiredText(value, maximum, code, minimum = 1) {
  if (typeof value !== 'string') throw new SupportCaseError(400, code);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function expectedVersion(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new SupportCaseError(400, 'support_privacy_expected_version_invalid');
  }
  return parsed;
}

function zonedDateParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: supportPrivacyRightsTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function zonedDateTimeParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: supportPrivacyRightsTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const result = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(result.year),
    month: Number(result.month),
    day: Number(result.day),
    hour: Number(result.hour),
    minute: Number(result.minute),
    second: Number(result.second),
  };
}

function zonedLocalToUtc(parts) {
  let candidate = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond ?? 0,
  );
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observed = zonedDateTimeParts(new Date(candidate));
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
      parts.millisecond ?? 0,
    );
    const wantedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond ?? 0,
    );
    candidate += wantedAsUtc - observedAsUtc;
  }
  return new Date(candidate);
}

export function privacyRightsResponseDeadline(receivedAt, months = 1) {
  const received = new Date(receivedAt);
  if (!Number.isFinite(received.getTime())
      || !Number.isSafeInteger(months)
      || months < 1
      || months > 3) {
    throw new SupportCaseError(400, 'support_privacy_deadline_input_invalid');
  }
  const local = zonedDateParts(received);
  const year = Number(local.year);
  const month = Number(local.month);
  const day = Number(local.day);
  const targetMonthIndex = (year * 12) + (month - 1) + months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return zonedLocalToUtc({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, lastTargetDay),
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999,
  });
}

export function normalizeSupportPrivacyRightsRequest(raw, {
  caseType,
  caseSubType,
} = {}) {
  const allowedKinds = caseType === 'privacy_security'
    ? subtypeKinds[caseSubType]
    : null;
  if (!allowedKinds) {
    if (raw !== undefined && raw !== null) {
      throw new SupportCaseError(400, 'support_privacy_rights_request_not_applicable');
    }
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_privacy_rights_request_required');
  }
  const allowedKeys = new Set(['version', 'requestKind']);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    throw new SupportCaseError(400, 'support_privacy_rights_request_shape_invalid');
  }
  const version = requiredText(
    raw.version,
    80,
    'support_privacy_rights_request_version_invalid',
  );
  if (version !== supportPrivacyRightsRequestVersion) {
    throw new SupportCaseError(400, 'support_privacy_rights_request_version_invalid');
  }
  const requestKind = requiredText(
    raw.requestKind,
    40,
    'support_privacy_rights_request_kind_invalid',
  ).toLowerCase();
  if (!requestKinds.has(requestKind) || !allowedKinds.has(requestKind)) {
    throw new SupportCaseError(400, 'support_privacy_rights_request_kind_invalid');
  }
  return Object.freeze({ version, requestKind });
}

export function normalizePrivacyIdentityVerification(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_privacy_identity_verification_invalid');
  }
  const allowedKeys = new Set(['expectedVersion']);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    throw new SupportCaseError(400, 'support_privacy_identity_verification_invalid');
  }
  return Object.freeze({ expectedVersion: expectedVersion(raw.expectedVersion) });
}

export function normalizePrivacyDeadlineExtension(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_privacy_extension_invalid');
  }
  const allowedKeys = new Set(['expectedVersion', 'userFacingReason']);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    throw new SupportCaseError(400, 'support_privacy_extension_invalid');
  }
  return Object.freeze({
    expectedVersion: expectedVersion(raw.expectedVersion),
    userFacingReason: requiredText(
      raw.userFacingReason,
      2000,
      'support_privacy_extension_reason_invalid',
      20,
    ),
  });
}
