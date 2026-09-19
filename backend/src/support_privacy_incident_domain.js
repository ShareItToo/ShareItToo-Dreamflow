import { SupportCaseError } from './support_case_domain.js';

export const privacyIncidentCaseSubtypes = Object.freeze([
  'unauthorized_data_exposure',
  'suspected_personal_data_breach',
  'wrong_recipient_or_wrong_account',
]);

export const privacyIncidentActionCodes = Object.freeze([
  'test_access_revoked',
  'test_recipient_access_restricted',
  'test_session_revoked',
  'test_storage_visibility_restricted',
  'test_misconfiguration_isolated',
]);

const actionOutcomes = new Set(['successful', 'unsuccessful']);
const containmentStates = new Set(['partial', 'contained']);
const exactKeys = Object.freeze([
  'actionCode',
  'actionReference',
  'containmentStatus',
  'expectedVersion',
  'outcome',
]);

function exactObject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_privacy_incident_action_shape_invalid');
  }
  const keys = Object.keys(raw).sort();
  if (keys.length !== exactKeys.length
      || keys.some((key, index) => key !== exactKeys[index])) {
    throw new SupportCaseError(400, 'support_privacy_incident_action_shape_invalid');
  }
}

function exactEnum(value, allowed, code) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new SupportCaseError(400, code);
  }
  return value;
}

function safeReference(value) {
  if (typeof value !== 'string'
      || value.length < 3
      || value.length > 200
      || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,199}$/u.test(value)) {
    throw new SupportCaseError(400, 'support_privacy_incident_action_reference_invalid');
  }
  return value;
}

export function normalizePrivacyIncidentContainmentAction(raw) {
  exactObject(raw);
  const expectedVersion = Number(raw.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new SupportCaseError(400, 'support_privacy_incident_version_invalid');
  }
  const actionCode = exactEnum(
    raw.actionCode,
    new Set(privacyIncidentActionCodes),
    'support_privacy_incident_action_code_invalid',
  );
  const outcome = exactEnum(
    raw.outcome,
    actionOutcomes,
    'support_privacy_incident_action_outcome_invalid',
  );
  const containmentStatus = exactEnum(
    raw.containmentStatus,
    containmentStates,
    'support_privacy_incident_containment_status_invalid',
  );
  if (outcome !== 'successful' && containmentStatus === 'contained') {
    throw new SupportCaseError(400, 'support_privacy_incident_containment_result_invalid');
  }
  return Object.freeze({
    expectedVersion,
    actionCode,
    outcome,
    containmentStatus,
    actionReference: safeReference(raw.actionReference),
  });
}
