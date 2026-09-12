import crypto from 'node:crypto';
import fs from 'node:fs';

import { SupportCaseError } from './support_case_domain.js';
import {
  normalizeSupportAccountRecoveryGuidance,
} from './support_account_recovery_domain.js';
import { readConsumerDisputeConfiguration } from './consumer_dispute_config.js';

const TEMPLATE_SOURCE_SHA256 = '947f307e7919eed543c28e36af4d2b364d87dcde52025649d0d4620d64baaaa5';
const identifiers = /^[A-Za-z0-9_.:-]+$/u;
const hashes = /^[0-9a-f]{64}$/u;
const uuids = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const placeholderPattern = /\{\{([a-z0-9_]+)\}\}/gu;
const moneyPlaceholderPattern = /(?:amount|payout|refund|fee|payment_total|cancellation_breakdown)/u;
const nextUpdatePlaceholderPattern = /^next_update_(?:date|time|datetime)$/u;
const serverBoundPlaceholders = new Set([
  'case_id',
  'booking_reference',
  'listing_reference',
  'appointment_datetime',
  'next_update_date',
  'next_update_time',
  'next_update_datetime',
  'evidence_deadline_date',
  'evidence_deadline_time',
  'evidence_deadline_datetime',
  'statement_deadline_datetime',
  'other_party_deadline_date',
  'other_party_deadline_time',
  'appeal_deadline',
  'original_case_id',
  'implemented_datetime',
  'request_received_date',
  'privacy_response_deadline',
  'provider_reference',
  'provider_submitted_datetime',
  'provider_confirmed_datetime',
  'legal_rule_version',
  'authority_reference',
  'received_datetime',
  'conciliation_body_address',
  'conciliation_body_name',
  'conciliation_body_website',
  'participation_status_plain',
]);
const consumerDisputeServerBindings = new Set([
  'conciliation_body_address',
  'conciliation_body_name',
  'conciliation_body_website',
  'participation_status_plain',
]);
const accountRecoveryServerBindings = new Set([
  'first_name',
  'secure_recovery_channel',
  'temporary_account_effect',
]);
export const supportMessageContentGuardVersion = 'sit_support_content_guard_v1';
const automaticTemplateStatuses = Object.freeze({
  'T-001': new Set(['received', 'acknowledged']),
  'T-003': new Set(['received', 'acknowledged', 'under_review', 'escalated']),
  'T-007': new Set(['waiting_for_user']),
  'T-015': new Set(['received', 'acknowledged', 'under_review', 'escalated']),
  'T-034': new Set([
    'received', 'acknowledged', 'waiting_for_user', 'waiting_for_other_party',
    'under_review', 'escalated', 'decision_pending_approval', 'decided',
    'resolved', 'closed', 'reopened',
  ]),
});
const secretValuePatterns = Object.freeze([
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/u,
  /\b(?:api[_ -]?key|passwort|password|pin|otp|recovery[_ -]?code)\s*[:=]\s*\S+/iu,
]);
const personalDataValuePatterns = Object.freeze([
  /\bDE\d{20}\b/u,
  /\b(?:\d[ -]*?){13,19}\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /(?:\+49|0049)[\s()/.-]*\d(?:[\s()/.-]*\d){6,}/u,
  /\b\d{5}\s+[\p{L}][\p{L} .'-]{2,60}\b/u,
]);
const unsafeClaimPatterns = Object.freeze([
  /\b(?:ist|war|bleibt)\s+(?:eindeutig\s+)?schuld(?:ig)?\b/iu,
  /\b(?:garantiert|garantie|hundertprozentig|100\s*prozent\s+sicher)\b/iu,
  /\b(?:erstattung|refund|auszahlung)\b.{0,40}\b(?:garantiert|abgeschlossen|bestaetigt|bestätigt)\b/iu,
]);
const credentialSolicitationPatterns = Object.freeze([
  /(?:^|[^\p{L}])(?:sende|schicke|teile|nenne|uebermittle|übermittle|gib)(?![^.!?]{0,100}(?:kein(?:e|en|er|es)?|nicht|niemals))[^.!?]{0,100}(?:passwort|pin|otp|tan|einmalcode|wiederherstellungscode|recovery[ _-]?code|karten(?:zugangs)?daten|kontozugangsdaten)(?:$|[^\p{L}])/iu,
  /(?:^|[^\p{L}])(?:wir|der support)\s+(?:brauchen|benoetigen|benötigen|verlangen|fordern)(?![^.!?]{0,100}(?:kein(?:e|en|er|es)?|nicht|niemals))[^.!?]{0,100}(?:passwort|pin|otp|tan|einmalcode|wiederherstellungscode|recovery[ _-]?code|karten(?:zugangs)?daten|kontozugangsdaten)(?:$|[^\p{L}])/iu,
]);
const supportMessageContentClasses = new Set(['secret', 'personal_data']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function requiredText(value, maximum, code, minimum = 1) {
  if (typeof value !== 'string') throw new SupportCaseError(400, code);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function requiredObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SupportCaseError(400, code);
  }
  return value;
}

function exactHash(value, code) {
  const result = requiredText(value, 64, code).toLowerCase();
  if (!hashes.test(result)) throw new SupportCaseError(400, code);
  return result;
}

function integer(value, code) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new SupportCaseError(400, code);
  return result;
}

function optionalUuid(value, code) {
  if (value === undefined || value === null || value === '') return null;
  const result = requiredText(value, 36, code).toLowerCase();
  if (!uuids.test(result)) throw new SupportCaseError(400, code);
  return result;
}

function validateTemplateCatalog() {
  const raw = fs.readFileSync(new URL('./support_message_templates_v1.json', import.meta.url), 'utf8');
  if (sha256(raw.trimEnd()) !== TEMPLATE_SOURCE_SHA256) {
    throw new Error('support_message_template_source_hash_mismatch');
  }
  const parsed = JSON.parse(raw);
  if (parsed.schema_version !== '1.0.0'
      || parsed.packet_version !== 'SIT_SUPPORT_PACKET_V1_2026-08-20'
      || parsed.locale !== 'de-DE'
      || parsed.rules?.unresolved_placeholders_block_send !== true
      || parsed.rules?.store_rendered_text_and_template_version !== true
      || parsed.rules?.no_sensitive_content_in_push !== true
      || parsed.rules?.red_templates_never_auto_send !== true
      || !Array.isArray(parsed.templates)
      || parsed.templates.length !== 55) {
    throw new Error('support_message_template_catalog_invalid');
  }
  const catalog = new Map();
  for (const entry of parsed.templates) {
    if (!/^T-\d{3}$/u.test(entry?.id)
        || typeof entry?.title !== 'string'
        || !['GREEN', 'YELLOW', 'RED'].includes(entry?.approval_level)
        || entry?.locale !== 'de-DE'
        || entry?.version !== '1.0.0'
        || typeof entry?.body_de !== 'string'
        || !Array.isArray(entry?.required_placeholders)
        || typeof entry?.send_rule !== 'string'
        || catalog.has(entry.id)) {
      throw new Error('support_message_template_catalog_invalid');
    }
    const bodyPlaceholders = [...entry.body_de.matchAll(placeholderPattern)].map((match) => match[1]);
    const required = [...entry.required_placeholders].sort();
    if (new Set(bodyPlaceholders).size !== bodyPlaceholders.length
        || JSON.stringify([...bodyPlaceholders].sort()) !== JSON.stringify(required)
        || required.some((key) => !/^[a-z0-9_]+$/u.test(key))) {
      throw new Error('support_message_template_placeholder_contract_invalid');
    }
    catalog.set(entry.id, Object.freeze({
      id: entry.id,
      category: entry.category,
      title: entry.title,
      approvalLevel: entry.approval_level,
      body: entry.body_de,
      locale: entry.locale,
      version: entry.version,
      requiredPlaceholders: Object.freeze([...entry.required_placeholders]),
      sendRule: entry.send_rule,
    }));
  }
  return catalog;
}

const templateCatalog = validateTemplateCatalog();

function sensitiveContentClass(value) {
  if (secretValuePatterns.some((pattern) => pattern.test(value))) return 'secret';
  if (personalDataValuePatterns.some((pattern) => pattern.test(value))) {
    return 'personal_data';
  }
  return null;
}

export function supportMessageContentBlockAuditMetadata(error) {
  if (error?.code !== 'support_message_sensitive_content_blocked') return null;
  const contentClass = error?.details?.contentClass;
  const blockedField = error?.details?.key;
  const templateId = error?.details?.templateId;
  const detectionVersion = error?.details?.detectionVersion;
  if (!supportMessageContentClasses.has(contentClass)
      || typeof blockedField !== 'string'
      || !/^[a-z0-9_]{1,80}$/u.test(blockedField)
      || typeof templateId !== 'string'
      || !/^T-\d{3}$/u.test(templateId)
      || detectionVersion !== supportMessageContentGuardVersion) {
    return null;
  }
  return Object.freeze({
    reasonCode: error.code,
    contentClass,
    blockedField,
    templateId,
    detectionVersion,
    inputStored: false,
    messageCreated: false,
    externalMessageSent: false,
  });
}

function safeVariable(key, value, { templateId }) {
  const result = requiredText(value, 2000, 'support_message_variable_invalid');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(result)
      || /\{\{|\}\}/u.test(result)) {
    throw new SupportCaseError(400, 'support_message_variable_unsafe', { key });
  }
  const contentClass = sensitiveContentClass(result);
  if (contentClass) {
    throw new SupportCaseError(400, 'support_message_sensitive_content_blocked', {
      key,
      templateId,
      contentClass,
      detectionVersion: supportMessageContentGuardVersion,
    });
  }
  if (credentialSolicitationPatterns.some((pattern) => pattern.test(result))) {
    throw new SupportCaseError(400, 'support_message_credential_request_blocked', { key });
  }
  if (unsafeClaimPatterns.some((pattern) => pattern.test(result))) {
    throw new SupportCaseError(400, 'support_message_policy_claim_blocked', { key });
  }
  return result;
}

function berlinParts(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const dateText = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  const timeText = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return Object.freeze({ date: dateText, time: timeText, dateTime: `${dateText}, ${timeText} Uhr` });
}

function supportCaseBindings(supportCase) {
  const bindings = { case_id: supportCase.human_readable_case_number };
  const nextUpdate = berlinParts(supportCase.next_update_at);
  if (nextUpdate) {
    bindings.next_update_date = nextUpdate.date;
    bindings.next_update_time = nextUpdate.time;
    bindings.next_update_datetime = nextUpdate.dateTime;
  }
  const evidenceDeadline = berlinParts(supportCase.evidence_due_at);
  if (evidenceDeadline) {
    bindings.evidence_deadline_date = evidenceDeadline.date;
    bindings.evidence_deadline_time = evidenceDeadline.time;
    bindings.evidence_deadline_datetime = evidenceDeadline.dateTime;
    bindings.statement_deadline_datetime = evidenceDeadline.dateTime;
  }
  const otherPartyDeadline = berlinParts(supportCase.response_due_at);
  if (otherPartyDeadline) {
    bindings.other_party_deadline_date = otherPartyDeadline.date;
    bindings.other_party_deadline_time = otherPartyDeadline.time;
  }
  const appealDeadline = berlinParts(supportCase.appeal_deadline);
  if (appealDeadline) bindings.appeal_deadline = appealDeadline.dateTime;
  return Object.freeze(bindings);
}

function renderTemplate(template, rawVariables, bindings, { serverOnly = new Set() } = {}) {
  const source = requiredObject(rawVariables, 'support_message_variables_required');
  const allowed = new Set(template.requiredPlaceholders);
  const supplied = Object.keys(source);
  if (supplied.some((key) => !allowed.has(key))) {
    throw new SupportCaseError(400, 'support_message_variable_unexpected');
  }
  if (supplied.some((key) => serverOnly.has(key))) {
    throw new SupportCaseError(400, 'support_message_server_variable_forbidden');
  }
  const variables = {};
  for (const key of template.requiredPlaceholders) {
    if (key in bindings) {
      if (source[key] !== undefined && String(source[key]).trim() !== bindings[key]) {
        throw new SupportCaseError(400, 'support_message_server_binding_mismatch', { key });
      }
      variables[key] = bindings[key];
      continue;
    }
    if (serverBoundPlaceholders.has(key)) {
      throw new SupportCaseError(409, 'support_message_server_binding_unavailable', { key });
    }
    if (!(key in source)) throw new SupportCaseError(400, 'support_message_placeholder_missing', { key });
    variables[key] = safeVariable(key, source[key], { templateId: template.id });
  }
  const rendered = template.body.replace(placeholderPattern, (_match, key) => variables[key]);
  if (/\{\{[a-z0-9_]+\}\}/u.test(rendered)) {
    throw new SupportCaseError(400, 'support_message_placeholder_unresolved');
  }
  if (rendered.length < 1 || rendered.length > 8000) {
    throw new SupportCaseError(400, 'support_message_rendered_content_invalid');
  }
  return Object.freeze({ variables: Object.freeze(variables), rendered });
}

export const supportMessageTemplateSource = Object.freeze({
  packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
  sourceSha256: TEMPLATE_SOURCE_SHA256,
  templateCount: templateCatalog.size,
});

export function supportMessageIdempotencyKey(value, suffix = 'support.message') {
  const key = requiredText(value, 160, 'idempotency_key_required');
  if (!identifiers.test(key)) throw new SupportCaseError(400, 'invalid_idempotency_key');
  return `${suffix}:${key}`;
}

export function assertSupportMessageDeadlineCurrent(templateOrMessage, supportCase, now = new Date()) {
  const placeholders = Array.isArray(templateOrMessage?.requiredPlaceholders)
    ? templateOrMessage.requiredPlaceholders
    : Object.keys(templateOrMessage?.structured_variables ?? {});
  if (!placeholders.some((key) => nextUpdatePlaceholderPattern.test(key))) return;
  const deadline = supportCase?.next_update_at ? new Date(supportCase.next_update_at) : null;
  if (!deadline || !Number.isFinite(deadline.getTime()) || deadline <= now) {
    throw new SupportCaseError(409, 'support_message_next_update_overdue');
  }
}

export function assertSupportMessageNextUpdateBindingCurrent(message, supportCase) {
  const variables = message?.structured_variables;
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    throw new SupportCaseError(409, 'support_message_structured_variables_invalid');
  }
  const current = supportCaseBindings(supportCase);
  for (const key of ['next_update_date', 'next_update_time', 'next_update_datetime']) {
    if (key in variables && variables[key] !== current[key]) {
      throw new SupportCaseError(409, 'support_message_next_update_binding_changed', { key });
    }
  }
}

export function normalizeSupportMessageDraft(raw, {
  supportCase,
  now = new Date(),
  consumerDisputeEnvironment = process.env,
  accountRecoveryContext = null,
}) {
  requiredObject(raw, 'support_message_invalid');
  requiredObject(supportCase, 'support_message_case_context_required');
  const templateId = requiredText(raw.templateId, 20, 'support_message_template_required').toUpperCase();
  const template = templateCatalog.get(templateId);
  if (!template) throw new SupportCaseError(400, 'support_message_template_unknown');
  const consumerDisputeNotice = template.id === 'T-053';
  const accountRecoveryNotice = template.id === 'T-035';
  if (accountRecoveryNotice && !accountRecoveryContext) {
    throw new SupportCaseError(409, 'support_account_recovery_workflow_required');
  }
  if (template.approvalLevel === 'RED' && !consumerDisputeNotice) {
    throw new SupportCaseError(409, 'support_message_red_template_requires_decision_workflow');
  }
  let consumerDisputeConfiguration = null;
  if (consumerDisputeNotice) {
    if (supportCase.case_type !== 'legal_authority'
        || supportCase.case_subtype !== 'consumer_dispute_information') {
      throw new SupportCaseError(409, 'support_consumer_dispute_case_required');
    }
    consumerDisputeConfiguration = readConsumerDisputeConfiguration(
      consumerDisputeEnvironment,
    );
    if (!consumerDisputeConfiguration.isComplete
        || consumerDisputeConfiguration.oldOdrLinkPresent) {
      throw new SupportCaseError(409, 'support_consumer_dispute_configuration_incomplete');
    }
  }
  if (template.requiredPlaceholders.some((key) => moneyPlaceholderPattern.test(key))) {
    throw new SupportCaseError(409, 'support_message_money_template_requires_snapshot_workflow');
  }
  if (raw.publishNow !== undefined && typeof raw.publishNow !== 'boolean') {
    throw new SupportCaseError(400, 'support_message_publish_mode_invalid');
  }
  const publishNow = raw.publishNow === true;
  if (publishNow && template.approvalLevel !== 'GREEN') {
    throw new SupportCaseError(409, 'support_message_human_review_required');
  }
  if (publishNow) {
    const allowedStatuses = automaticTemplateStatuses[template.id];
    if (!allowedStatuses?.has(supportCase.status)
        || (['T-003', 'T-015'].includes(template.id) && supportCase.safety_flag !== true)) {
      throw new SupportCaseError(409, 'support_message_automatic_template_not_enabled');
    }
  }
  assertSupportMessageDeadlineCurrent(template, supportCase, now);
  const bindings = { ...supportCaseBindings(supportCase) };
  let accountRecoveryGuidance = null;
  if (accountRecoveryNotice) {
    accountRecoveryGuidance = normalizeSupportAccountRecoveryGuidance({
      supportCase,
      ...accountRecoveryContext,
    });
    Object.assign(bindings, accountRecoveryGuidance.bindings);
  }
  if (consumerDisputeConfiguration) {
    Object.assign(bindings, {
      conciliation_body_address: consumerDisputeConfiguration.conciliationBodyAddress,
      conciliation_body_name: consumerDisputeConfiguration.conciliationBodyName,
      conciliation_body_website: consumerDisputeConfiguration.conciliationBodyWebsite,
      participation_status_plain: consumerDisputeConfiguration.participationStatusPlain,
    });
  }
  const { variables, rendered } = renderTemplate(
    template,
    raw.variables,
    bindings,
    {
      serverOnly: consumerDisputeNotice
        ? consumerDisputeServerBindings
        : (accountRecoveryNotice ? accountRecoveryServerBindings : new Set()),
    },
  );
  const approvalLevel = template.approvalLevel === 'GREEN'
    ? 'green_automatic'
    : (template.approvalLevel === 'RED' ? 'red_explicit_decision' : 'yellow_human_review');
  const structuredVariables = consumerDisputeConfiguration
    ? Object.freeze({
      ...variables,
      consumer_dispute_policy_version: consumerDisputeConfiguration.policyVersion,
      consumer_dispute_configuration_version:
        consumerDisputeConfiguration.configurationVersion,
    })
    : (accountRecoveryGuidance
      ? Object.freeze({
        ...variables,
        ...accountRecoveryGuidance.metadata,
      })
      : variables);
  return Object.freeze({
    templateId: template.id,
    templateVersion: template.version,
    title: template.title,
    locale: template.locale,
    approvalLevel,
    renderedContent: rendered,
    renderedContentSha256: sha256(rendered),
    structuredVariables,
    publishNow,
    sendStatus: publishNow ? 'sent' : (approvalLevel === 'green_automatic' ? 'draft' : 'pending_approval'),
    correctsMessageId: optionalUuid(raw.correctsMessageId, 'support_message_correction_id_invalid'),
  });
}

export function normalizeSupportMessageReview(raw) {
  requiredObject(raw, 'support_message_review_invalid');
  const outcome = requiredText(raw.outcome, 20, 'support_message_review_outcome_required').toLowerCase();
  if (!['approved', 'rejected'].includes(outcome)) {
    throw new SupportCaseError(400, 'support_message_review_outcome_invalid');
  }
  return Object.freeze({
    outcome,
    expectedVersion: integer(raw.expectedVersion, 'support_message_version_invalid'),
    expectedPayloadSha256: exactHash(raw.expectedPayloadSha256, 'support_message_payload_hash_required'),
    reviewNotes: requiredText(raw.reviewNotes, 1000, 'support_message_review_notes_required', 12),
  });
}

export function normalizeSupportMessagePublication(raw) {
  requiredObject(raw, 'support_message_publication_invalid');
  return Object.freeze({
    expectedPayloadSha256: exactHash(raw.expectedPayloadSha256, 'support_message_payload_hash_required'),
    expectedVersion: integer(raw.expectedVersion, 'support_message_version_invalid'),
  });
}

export function listSupportMessageTemplates() {
  return [...templateCatalog.values()].map((template) => Object.freeze({
    id: template.id,
    title: template.title,
    category: template.category,
    approvalLevel: template.approvalLevel,
    version: template.version,
    locale: template.locale,
    requiredPlaceholders: template.requiredPlaceholders,
    moneySnapshotRequired: template.requiredPlaceholders.some((key) => moneyPlaceholderPattern.test(key)),
    genericDraftAvailable: template.approvalLevel !== 'RED'
      && template.id !== 'T-035'
      && !template.requiredPlaceholders.some((key) => moneyPlaceholderPattern.test(key)),
  }));
}
