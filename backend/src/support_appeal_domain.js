import crypto from 'node:crypto';

import {
  newHumanReadableCaseNumber,
  SupportCaseError,
  supportCaseIdempotencyKey,
  supportPriorities,
} from './support_case_domain.js';

export const supportAppealStatuses = Object.freeze([
  'submitted',
  'under_review',
  'upheld',
  'modified',
  'reversed',
  'closed',
]);

function requiredText(value, maximum, code, minimum = 1) {
  if (typeof value !== 'string') throw new SupportCaseError(400, code);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

export function normalizeSupportAppealInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_appeal_invalid');
  }
  const expectedVersion = Number(raw.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new SupportCaseError(400, 'support_appeal_version_required');
  }
  return Object.freeze({
    expectedVersion,
    grounds: requiredText(raw.grounds, 8000, 'support_appeal_grounds_required', 3),
  });
}

export function supportAppealIdempotencyKey(value) {
  return supportCaseIdempotencyKey(value, 'support.appeal.submit');
}

export function newHumanReadableAppealNumber(randomBytes = crypto.randomBytes(9)) {
  return `SIT-R-${newHumanReadableCaseNumber(randomBytes).slice(4)}`;
}

export function supportAppealNextUpdateAt(priority, now = new Date()) {
  if (!supportPriorities.includes(priority)) {
    throw new SupportCaseError(409, 'support_appeal_priority_invalid');
  }
  const checkpointMinutes = {
    p0: 15,
    p1: 60,
    p2: 240,
    p3: 1440,
    p4: 1440,
  }[priority];
  return new Date(now.getTime() + (checkpointMinutes * 60 * 1000));
}
