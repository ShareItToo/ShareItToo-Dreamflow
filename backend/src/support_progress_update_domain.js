import { SupportCaseError, supportCaseIdempotencyKey } from './support_case_domain.js';

export const supportProgressUpdateVersion = 'sit_support_progress_update_v1';

const activeStatuses = new Set([
  'received',
  'acknowledged',
  'waiting_for_user',
  'waiting_for_other_party',
  'under_review',
  'escalated',
  'decision_pending_approval',
  'decided',
  'reopened',
]);

const statusLabels = Object.freeze({
  received: 'Der Fall ist eingegangen',
  acknowledged: 'Der Fall wurde aufgenommen',
  waiting_for_user: 'Wir warten auf deine angeforderten Angaben',
  waiting_for_other_party: 'Wir warten auf die angeforderte Rückmeldung der anderen Partei',
  under_review: 'Der Fall wird weiter geprüft',
  escalated: 'Der Fall wird im zuständigen Fachbereich geprüft',
  decision_pending_approval: 'Die vorbereitete Entscheidung wird noch unabhängig geprüft',
  decided: 'Die freigegebene Entscheidung wird für die Umsetzung vorbereitet',
  reopened: 'Der Fall wird nach der Wiedereröffnung erneut geprüft',
});

function requiredText(value, maximum, code, minimum = 1) {
  if (typeof value !== 'string') throw new SupportCaseError(400, code);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function requiredFutureDate(value, now, code) {
  const result = new Date(value);
  const upperBound = new Date(now.getTime() + (31 * 24 * 60 * 60 * 1000));
  if (!Number.isFinite(result.getTime()) || result <= now || result > upperBound) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function requiredVersion(value, code) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function belongsToCase(supportCase, userId) {
  return supportCase.reporter_user_id === userId
    || (supportCase.affected_user_ids ?? []).includes(userId);
}

function withImpact(openCheck, impactStatement) {
  return `${openCheck} Vorläufige Auswirkung: ${impactStatement}`;
}

export function supportProgressUpdateIdempotencyKey(value, suffix = 'support.progress') {
  return supportCaseIdempotencyKey(value, suffix);
}

export function normalizeSupportProgressUpdate(supportCase, raw, {
  actor,
  now = new Date(),
} = {}) {
  if (!supportCase || typeof supportCase !== 'object'
      || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_progress_update_invalid');
  }
  if (!['support', 'admin'].includes(actor?.role) || !actor?.id) {
    throw new SupportCaseError(403, 'support_progress_update_forbidden');
  }
  if (!['simulation', 'internal_testing'].includes(supportCase.operating_mode)) {
    throw new SupportCaseError(409, 'support_progress_update_live_forbidden');
  }
  if (!activeStatuses.has(supportCase.status)) {
    throw new SupportCaseError(409, 'support_progress_update_case_inactive');
  }
  if (actor.role === 'support' && supportCase.current_owner_id !== actor.id) {
    throw new SupportCaseError(403, 'support_case_assignment_required');
  }

  const expectedVersion = requiredVersion(
    raw.expectedVersion,
    'support_progress_update_case_version_required',
  );
  if (expectedVersion !== Number(supportCase.lock_version)) {
    throw new SupportCaseError(409, 'support_case_version_conflict');
  }
  const priorNextUpdateAt = new Date(supportCase.next_update_at);
  if (!Number.isFinite(priorNextUpdateAt.getTime())) {
    throw new SupportCaseError(409, 'support_progress_update_prior_deadline_missing');
  }
  const nextUpdateAt = requiredFutureDate(
    raw.nextUpdateAt,
    now,
    'support_progress_update_next_deadline_invalid',
  );
  if (nextUpdateAt <= priorNextUpdateAt) {
    throw new SupportCaseError(409, 'support_progress_update_deadline_not_advanced');
  }

  const recipientUserId = requiredText(
    raw.recipientUserId,
    128,
    'support_progress_update_recipient_required',
  );
  if (!belongsToCase(supportCase, recipientUserId)) {
    throw new SupportCaseError(403, 'support_message_recipient_forbidden');
  }
  const firstName = requiredText(raw.firstName, 80, 'support_progress_update_name_required');
  const progressSinceLastUpdate = requiredText(
    raw.progressSinceLastUpdate,
    1200,
    'support_progress_update_progress_required',
    12,
  );
  const openCheck = requiredText(
    raw.openCheck,
    800,
    'support_progress_update_open_check_required',
    12,
  );
  const userActionOrNoAction = requiredText(
    raw.userActionOrNoAction,
    500,
    'support_progress_update_user_action_required',
    5,
  );
  const provisionalImpactStatement = requiredText(
    raw.provisionalImpactStatement,
    400,
    'support_progress_update_impact_required',
    12,
  );
  const nextAction = requiredText(
    raw.nextAction,
    2000,
    'support_progress_update_next_action_required',
    3,
  );
  const wasOverdue = priorNextUpdateAt <= now;
  const templateId = wasOverdue ? 'T-010' : 'T-008';
  const openCheckWithImpact = withImpact(openCheck, provisionalImpactStatement);
  const variables = wasOverdue
    ? Object.freeze({
      first_name: firstName,
      current_status_plain:
        `${statusLabels[supportCase.status]}. Seit dem letzten Update: ${progressSinceLastUpdate}`,
      open_check: `${openCheckWithImpact} Für dich gilt: ${userActionOrNoAction}`,
    })
    : Object.freeze({
      first_name: firstName,
      progress_since_last_update: progressSinceLastUpdate,
      open_check: openCheckWithImpact,
      user_action_or_no_action: userActionOrNoAction,
    });

  return Object.freeze({
    version: supportProgressUpdateVersion,
    expectedVersion,
    priorNextUpdateAt,
    nextUpdateAt,
    nextAction,
    recipientUserId,
    wasOverdue,
    templateId,
    variables,
  });
}

export function normalizeSupportProgressPublication(supportCase, progressUpdate, message, raw, {
  actor,
  now = new Date(),
} = {}) {
  if (!supportCase || !progressUpdate || !message
      || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_progress_publication_invalid');
  }
  if (!['support', 'admin'].includes(actor?.role) || !actor?.id) {
    throw new SupportCaseError(403, 'support_progress_publication_forbidden');
  }
  if (actor.role === 'support' && supportCase.current_owner_id !== actor.id) {
    throw new SupportCaseError(403, 'support_case_assignment_required');
  }
  if (!['simulation', 'internal_testing'].includes(supportCase.operating_mode)) {
    throw new SupportCaseError(409, 'support_progress_update_live_forbidden');
  }
  if (progressUpdate.proposal_status !== 'approved'
      || message.send_status !== 'approved'
      || message.approval_level !== 'yellow_human_review'
      || !message.approved_by
      || message.approval_payload_sha256 !== message.rendered_content_sha256) {
    throw new SupportCaseError(409, 'support_progress_update_not_approved');
  }
  if (Number(supportCase.lock_version) !== Number(progressUpdate.expected_case_version)
      || new Date(supportCase.next_update_at).getTime()
        !== new Date(progressUpdate.prior_next_update_at).getTime()) {
    throw new SupportCaseError(409, 'support_progress_update_case_changed');
  }
  const proposed = new Date(progressUpdate.proposed_next_update_at);
  if (!Number.isFinite(proposed.getTime()) || proposed <= now) {
    throw new SupportCaseError(409, 'support_progress_update_new_deadline_overdue');
  }
  const expectedProgressVersion = requiredVersion(
    raw.expectedProgressVersion,
    'support_progress_update_version_required',
  );
  if (expectedProgressVersion !== Number(progressUpdate.lock_version)) {
    throw new SupportCaseError(409, 'support_progress_update_version_conflict');
  }
  const expectedMessageVersion = requiredVersion(
    raw.expectedMessageVersion,
    'support_message_version_invalid',
  );
  if (expectedMessageVersion !== Number(message.lock_version)) {
    throw new SupportCaseError(409, 'support_message_version_conflict');
  }
  const expectedPayloadSha256 = requiredText(
    raw.expectedPayloadSha256,
    64,
    'support_message_payload_hash_required',
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(expectedPayloadSha256)
      || expectedPayloadSha256 !== message.rendered_content_sha256) {
    throw new SupportCaseError(409, 'support_message_payload_changed');
  }
  return Object.freeze({
    expectedProgressVersion,
    expectedMessageVersion,
    expectedPayloadSha256,
    nextAction: progressUpdate.next_action,
    nextUpdateAt: proposed,
  });
}
