import crypto from 'node:crypto';

import {
  normalizeSupportCaseInput,
  SupportCaseError,
  supportCaseIdempotencyKey,
} from './support_case_domain.js';
import {
  createSupportCase,
  listMySupportCases,
  transitionSupportCase,
} from './support_case_workflow.js';

const sourceSystem = 'local_shared_preferences_message_threads_v1';
const canonicalCaseReference = /\bSIT-[A-HJ-NP-Z2-9]{12}\b/u;
const sourceIdentifier = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const explicitTimestamp = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/u;
const localIsoTimestamp = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?$/u;
const allowedPausedMappings = new Set([
  'waiting_for_user',
  'waiting_for_other_party',
  'under_review',
  'escalated',
]);

function exactObject(value, allowedKeys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SupportCaseError(400, code);
  }
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new SupportCaseError(400, code);
  }
  return value;
}

function text(value, maximum, code, minimum = 1) {
  if (typeof value !== 'string') throw new SupportCaseError(400, code);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function optionalTimestampText(value, code) {
  if (value == null || value === '') return null;
  return text(value, 80, code);
}

function normalizeTimestamp(value) {
  const sourceTimestamp = text(value, 80, 'support_legacy_timestamp_invalid');
  if (explicitTimestamp.test(sourceTimestamp)) {
    const occurredAt = new Date(sourceTimestamp);
    if (!Number.isFinite(occurredAt.getTime())) {
      throw new SupportCaseError(400, 'support_legacy_timestamp_invalid');
    }
    return Object.freeze({
      sourceTimestamp,
      occurredAt,
      interpretation: sourceTimestamp.endsWith('Z') ? 'utc' : 'explicit_offset',
    });
  }
  if (!localIsoTimestamp.test(sourceTimestamp)
      || !Number.isFinite(new Date(`${sourceTimestamp}Z`).getTime())) {
    throw new SupportCaseError(400, 'support_legacy_timestamp_invalid');
  }
  return Object.freeze({
    sourceTimestamp,
    occurredAt: null,
    interpretation: 'unresolved_local_time',
  });
}

function normalizeIntake(raw, now) {
  const intake = exactObject(raw, new Set([
    'caseType',
    'caseSubType',
    'summary',
    'safetyTriage',
    'issueScope',
    'immediateDanger',
    'accountTakeover',
    'possibleHighRiskDataExposure',
    'imminentAuthorityDeadline',
    'linkedBookingId',
    'linkedListingId',
    'linkedPaymentId',
    'linkedRefundId',
    'linkedPayoutId',
    'dsaNotice',
    'productSafetyNotice',
    'privacyRightsRequest',
  ]), 'support_legacy_intake_invalid');
  for (const signal of [
    'accountTakeover',
    'possibleHighRiskDataExposure',
    'imminentAuthorityDeadline',
  ]) {
    if (intake[signal] !== undefined && typeof intake[signal] !== 'boolean') {
      throw new SupportCaseError(400, 'support_legacy_intake_invalid');
    }
  }
  const normalized = normalizeSupportCaseInput(intake, {
    sourceChannel: 'app',
    operatingMode: 'simulation',
    now,
  });
  return Object.freeze({ raw: Object.freeze({ ...intake }), normalized });
}

function normalizeSource(raw, actorId) {
  const source = exactObject(raw, new Set(['system', 'thread']), 'support_legacy_source_invalid');
  if (source.system !== sourceSystem) {
    throw new SupportCaseError(400, 'support_legacy_source_invalid');
  }
  const thread = exactObject(source.thread, new Set([
    'id',
    'threadType',
    'user1Id',
    'user2Id',
    'archivedForUserIds',
    'createdAt',
    'lastMessageAt',
    'legacyStatus',
    'pausedMapping',
    'pauseReason',
    'messages',
  ]), 'support_legacy_thread_invalid');
  const threadId = text(thread.id, 160, 'support_legacy_thread_id_invalid');
  if (!sourceIdentifier.test(threadId)) {
    throw new SupportCaseError(400, 'support_legacy_thread_id_invalid');
  }
  if (thread.threadType !== 'support') {
    throw new SupportCaseError(400, 'support_legacy_thread_type_invalid');
  }
  const participants = [thread.user1Id, thread.user2Id];
  if (participants.length !== 2
      || new Set(participants).size !== 2
      || !participants.includes(actorId)
      || !participants.includes('support')) {
    throw new SupportCaseError(403, 'support_legacy_thread_participants_forbidden');
  }
  if (!Array.isArray(thread.archivedForUserIds)
      || thread.archivedForUserIds.some((entry) => typeof entry !== 'string')) {
    throw new SupportCaseError(400, 'support_legacy_thread_archive_invalid');
  }
  const archived = thread.archivedForUserIds.includes(actorId);
  const legacyStatus = thread.legacyStatus ?? 'open';
  if (!['open', 'paused'].includes(legacyStatus)) {
    throw new SupportCaseError(400, 'support_legacy_status_invalid');
  }
  let mappedStatus = 'acknowledged';
  let pauseReason = null;
  if (legacyStatus === 'paused') {
    mappedStatus = text(
      thread.pausedMapping,
      40,
      'support_legacy_paused_mapping_required',
    );
    if (!allowedPausedMappings.has(mappedStatus)) {
      throw new SupportCaseError(400, 'support_legacy_paused_mapping_invalid');
    }
    pauseReason = text(thread.pauseReason, 1000, 'support_legacy_pause_reason_required', 3);
  } else if (thread.pausedMapping != null || thread.pauseReason != null) {
    throw new SupportCaseError(400, 'support_legacy_paused_mapping_not_applicable');
  }
  if (!Array.isArray(thread.messages)
      || thread.messages.length < 1
      || thread.messages.length > 500) {
    throw new SupportCaseError(400, 'support_legacy_history_size_invalid');
  }
  const seenMessageIds = new Set();
  let totalBytes = 0;
  let containsCanonicalCaseReference = false;
  const messages = thread.messages.map((entry, sequence) => {
    const message = exactObject(entry, new Set([
      'id', 'senderId', 'text', 'timestamp', 'isRead',
    ]), 'support_legacy_message_invalid');
    const id = text(message.id, 160, 'support_legacy_message_id_invalid');
    if (!sourceIdentifier.test(id) || seenMessageIds.has(id)) {
      throw new SupportCaseError(400, 'support_legacy_message_id_invalid');
    }
    seenMessageIds.add(id);
    if (![actorId, 'support', 'system'].includes(message.senderId)) {
      throw new SupportCaseError(403, 'support_legacy_message_sender_forbidden');
    }
    const renderedContent = text(
      message.text,
      4000,
      'support_legacy_message_content_invalid',
    );
    totalBytes += Buffer.byteLength(renderedContent, 'utf8');
    if (totalBytes > 256 * 1024) {
      throw new SupportCaseError(413, 'support_legacy_history_too_large');
    }
    containsCanonicalCaseReference ||= canonicalCaseReference.test(renderedContent);
    if (typeof message.isRead !== 'boolean') {
      throw new SupportCaseError(400, 'support_legacy_message_read_state_invalid');
    }
    const timestamp = normalizeTimestamp(message.timestamp);
    return Object.freeze({
      id,
      sequence,
      senderType: message.senderId === actorId ? 'user' : message.senderId,
      senderUserId: message.senderId === actorId ? actorId : null,
      renderedContent,
      contentSha256: crypto.createHash('sha256').update(renderedContent).digest('hex'),
      ...timestamp,
      wasRead: message.isRead,
    });
  });
  const sourceCreatedAtText = optionalTimestampText(
    thread.createdAt,
    'support_legacy_created_at_invalid',
  );
  const sourceUpdatedAtText = optionalTimestampText(
    thread.lastMessageAt,
    'support_legacy_updated_at_invalid',
  );
  const fingerprintPayload = {
    sourceSystem,
    threadId,
    actorId,
    legacyStatus,
    mappedStatus,
    pauseReason,
    archived,
    sourceCreatedAtText,
    sourceUpdatedAtText,
    messages: messages.map((message) => ({
      id: message.id,
      sequence: message.sequence,
      senderType: message.senderType,
      senderUserId: message.senderUserId,
      renderedContent: message.renderedContent,
      sourceTimestamp: message.sourceTimestamp,
      wasRead: message.wasRead,
    })),
  };
  return Object.freeze({
    sourceSystem,
    threadId,
    legacyStatus,
    mappedStatus,
    pauseReason,
    archived,
    sourceCreatedAtText,
    sourceUpdatedAtText,
    containsCanonicalCaseReference,
    fingerprint: crypto.createHash('sha256')
      .update(JSON.stringify(fingerprintPayload))
      .digest('hex'),
    messages: Object.freeze(messages),
  });
}

export function previewLegacySupportMigration(raw, {
  actorId,
  now = new Date(),
} = {}) {
  if (!actorId) throw new SupportCaseError(403, 'support_legacy_actor_required');
  const request = exactObject(raw, new Set([
    'schemaVersion', 'source', 'intake',
  ]), 'support_legacy_migration_invalid');
  if (request.schemaVersion !== 1) {
    throw new SupportCaseError(400, 'support_legacy_schema_version_invalid');
  }
  const source = normalizeSource(request.source, actorId);
  const intake = normalizeIntake(request.intake, now);
  const blockers = [];
  if (source.archived) blockers.push('archived_thread_not_open');
  if (source.containsCanonicalCaseReference) {
    blockers.push('canonical_case_reference_present');
  }
  const unresolvedLocalTimestampCount = source.messages.filter(
    (message) => message.interpretation === 'unresolved_local_time',
  ).length;
  return Object.freeze({
    eligible: blockers.length === 0,
    blockers: Object.freeze(blockers),
    sourceSystem: source.sourceSystem,
    sourceFingerprint: source.fingerprint,
    legacyStatus: source.legacyStatus,
    mappedStatus: source.mappedStatus,
    historyEntryCount: source.messages.length,
    unresolvedLocalTimestampCount,
    plannedCaseType: intake.normalized.caseType,
    plannedCaseSubType: intake.normalized.caseSubType,
    operatingMode: 'simulation',
    templateState: 'historical_disabled',
    verificationState: 'unverified_user_device_source',
    usableAsDecisionEvidence: false,
    dataMutation: false,
    externalMessagesSent: false,
    requiresExplicitCommit: true,
    source,
    intake,
  });
}

function publicPreview(preview) {
  const { source: _source, intake: _intake, ...result } = preview;
  return Object.freeze(result);
}

async function userCase(client, actorId, caseId) {
  const cases = await listMySupportCases(client, actorId);
  const supportCase = cases.find((entry) => entry.id === caseId);
  if (!supportCase) throw new SupportCaseError(404, 'support_case_not_found');
  return supportCase;
}

async function transitionImportedCase(client, {
  caseId,
  source,
  ownerRole,
  initialVersion,
  keyStem,
  now,
}) {
  const deadline = new Date(now.getTime() + (24 * 60 * 60 * 1000));
  let version = initialVersion;
  let result = await transitionSupportCase(client, {
    actor: { role: 'system', id: null },
    caseId,
    idempotencyKey: `${keyStem}-ack`,
    now: new Date(now.getTime() + 1),
    raw: {
      status: 'acknowledged',
      expectedVersion: version,
      reason: 'Legacy-Supportverlauf übernommen; fachliche Zuordnung bleibt offen.',
      nextAction: 'Übernommenen Verlauf fachlich prüfen und nächsten Schritt bestätigen.',
      nextUpdateAt: deadline,
      waitingOn: 'support_owner',
    },
  });
  version = result.supportCase.version;
  if (source.mappedStatus === 'acknowledged') return result;

  const common = {
    expectedVersion: version,
    reason: source.pauseReason ?? 'Legacy-Wartezustand konkret zugeordnet.',
    nextAction: source.mappedStatus === 'waiting_for_user'
      ? 'Nutzeraktion aus dem übernommenen Verlauf fachlich bestätigen.'
      : 'Übernommenen Verlauf fachlich prüfen und nächsten Schritt bestätigen.',
    nextUpdateAt: deadline,
  };
  if (source.mappedStatus === 'waiting_for_user') {
    result = await transitionSupportCase(client, {
      actor: { role: 'system', id: null },
      caseId,
      idempotencyKey: `${keyStem}-wait-user`,
      now: new Date(now.getTime() + 2),
      raw: {
        ...common,
        status: 'waiting_for_user',
        waitingReason: source.pauseReason,
        userActionDueAt: new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)),
      },
    });
    return result;
  }
  if (source.mappedStatus === 'waiting_for_other_party') {
    result = await transitionSupportCase(client, {
      actor: { role: 'system', id: null },
      caseId,
      idempotencyKey: `${keyStem}-wait-other`,
      now: new Date(now.getTime() + 2),
      raw: {
        ...common,
        status: 'waiting_for_other_party',
        waitingReason: source.pauseReason,
      },
    });
    return result;
  }
  result = await transitionSupportCase(client, {
    actor: { role: 'system', id: null },
    caseId,
    idempotencyKey: `${keyStem}-review`,
    now: new Date(now.getTime() + 2),
    raw: { ...common, status: 'under_review', waitingOn: 'support_owner' },
  });
  if (source.mappedStatus !== 'escalated') return result;
  return transitionSupportCase(client, {
    actor: { role: 'system', id: null },
    caseId,
    idempotencyKey: `${keyStem}-escalate`,
    now: new Date(now.getTime() + 3),
    raw: {
      status: 'escalated',
      expectedVersion: result.supportCase.version,
      reason: source.pauseReason,
      nextAction: 'Eskalation des übernommenen Verlaufs fachlich übernehmen.',
      nextUpdateAt: deadline,
      escalationTargetRole: ownerRole,
    },
  });
}

export async function importLegacySupportMigration(client, {
  actor,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (!actor?.id || actor.role !== 'user') {
    throw new SupportCaseError(403, 'support_legacy_import_forbidden');
  }
  supportCaseIdempotencyKey(idempotencyKey, 'support.legacy.request');
  const preview = previewLegacySupportMigration(raw, { actorId: actor.id, now });
  if (!preview.eligible) {
    throw new SupportCaseError(409, 'support_legacy_import_blocked', {
      blockers: preview.blockers,
    });
  }
  const existing = await client.query(
    `SELECT * FROM support_legacy_imports
      WHERE reporter_user_id = $1 AND source_system = $2 AND source_thread_id = $3`,
    [actor.id, preview.source.sourceSystem, preview.source.threadId],
  );
  if (existing.rowCount) {
    if (existing.rows[0].source_fingerprint !== preview.source.fingerprint) {
      throw new SupportCaseError(409, 'support_legacy_source_changed_after_import');
    }
    return Object.freeze({
      supportCase: await userCase(client, actor.id, existing.rows[0].case_id),
      migration: Object.freeze({
        ...publicPreview(preview),
        importId: existing.rows[0].id,
      }),
      replayed: true,
    });
  }

  const keyStem = `legacy-${crypto.createHash('sha256')
    .update(`${actor.id}:${preview.source.sourceSystem}:${preview.source.threadId}`)
    .digest('hex')
    .slice(0, 48)}`;
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`${actor.id}:${preview.source.sourceSystem}:${preview.source.threadId}`],
  );
  const serializedExisting = await client.query(
    `SELECT * FROM support_legacy_imports
      WHERE reporter_user_id = $1 AND source_system = $2 AND source_thread_id = $3`,
    [actor.id, preview.source.sourceSystem, preview.source.threadId],
  );
  if (serializedExisting.rowCount) {
    if (serializedExisting.rows[0].source_fingerprint !== preview.source.fingerprint) {
      throw new SupportCaseError(409, 'support_legacy_source_changed_after_import');
    }
    return Object.freeze({
      supportCase: await userCase(client, actor.id, serializedExisting.rows[0].case_id),
      migration: Object.freeze({
        ...publicPreview(preview),
        importId: serializedExisting.rows[0].id,
      }),
      replayed: true,
    });
  }
  const created = await createSupportCase(client, {
    actor,
    raw: preview.intake.raw,
    idempotencyKey: keyStem,
    sourceChannel: 'app',
    operatingMode: 'simulation',
    now,
  });
  const importId = crypto.randomUUID();
  await client.query(
    `INSERT INTO support_legacy_imports (
       id, case_id, reporter_user_id, source_system, source_thread_id,
       source_fingerprint, source_created_at_text, source_updated_at_text,
       legacy_status, mapped_status, template_state, verification_state,
       history_entry_count,
       unresolved_local_timestamp_count, imported_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8,
       $9, $10, 'historical_disabled', 'unverified_user_device_source', $11,
       $12, $13
     )`,
    [
      importId,
      created.supportCase.id,
      actor.id,
      preview.source.sourceSystem,
      preview.source.threadId,
      preview.source.fingerprint,
      preview.source.sourceCreatedAtText,
      preview.source.sourceUpdatedAtText,
      preview.source.legacyStatus,
      preview.source.mappedStatus,
      preview.source.messages.length,
      preview.unresolvedLocalTimestampCount,
      now,
    ],
  );
  for (const message of preview.source.messages) {
    await client.query(
      `INSERT INTO support_legacy_history_entries (
         id, import_id, case_id, source_message_id, sequence_number,
         sender_type, sender_user_id, source_trust, rendered_content,
         rendered_content_sha256, source_timestamp_text, occurred_at,
         timestamp_interpretation, was_read, archived_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, 'unverified_user_device_source', $8,
         $9, $10, $11,
         $12, $13, $14
       )`,
      [
        crypto.randomUUID(),
        importId,
        created.supportCase.id,
        message.id,
        message.sequence,
        message.senderType,
        message.senderUserId,
        message.renderedContent,
        message.contentSha256,
        message.sourceTimestamp,
        message.occurredAt,
        message.interpretation,
        message.wasRead,
        now,
      ],
    );
  }
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, from_status, to_status,
       transition_reason, entity_type, entity_id, structured_payload,
       automation_used, visibility, idempotency_key, source_system, created_at
     ) VALUES (
       $1, 'case.legacy_history_imported', 'system', NULL, 'received', 'received',
       'Unverifizierter lokaler Legacy-Supportverlauf append-only archiviert',
       'support_legacy_import', $2, $3::jsonb,
       true, 'user_visible', $4, 'sit-legacy-migration', $5
     )`,
    [
      created.supportCase.id,
      importId,
      JSON.stringify({
        sourceSystem: preview.source.sourceSystem,
        sourceFingerprint: preview.source.fingerprint,
        historyEntryCount: preview.source.messages.length,
        unresolvedLocalTimestampCount: preview.unresolvedLocalTimestampCount,
        legacyStatus: preview.source.legacyStatus,
        mappedStatus: preview.source.mappedStatus,
        templateState: 'historical_disabled',
        verificationState: 'unverified_user_device_source',
        usableAsDecisionEvidence: false,
      }),
      `support.legacy.import:${preview.source.fingerprint}`,
      now,
    ],
  );
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, 'support.legacy_history_imported', 'support_case', $3, $4::jsonb)`,
    [
      actor.id,
      actor.role,
      created.supportCase.id,
      JSON.stringify({
        sourceSystem: preview.source.sourceSystem,
        sourceFingerprint: preview.source.fingerprint,
        historyEntryCount: preview.source.messages.length,
        unresolvedLocalTimestampCount: preview.unresolvedLocalTimestampCount,
        mappedStatus: preview.source.mappedStatus,
      }),
    ],
  );
  await transitionImportedCase(client, {
    caseId: created.supportCase.id,
    source: preview.source,
    ownerRole: preview.intake.normalized.ownerRole,
    initialVersion: created.supportCase.version,
    keyStem,
    now,
  });
  return Object.freeze({
    supportCase: await userCase(client, actor.id, created.supportCase.id),
    migration: Object.freeze({ ...publicPreview(preview), importId }),
    replayed: false,
  });
}

export async function getLegacySupportHistory(client, { actor, caseId }) {
  if (!actor?.id) throw new SupportCaseError(403, 'support_legacy_actor_required');
  const imported = await client.query(
    `SELECT legacy_import.id, legacy_import.source_system,
            legacy_import.legacy_status, legacy_import.mapped_status,
            legacy_import.template_state, legacy_import.verification_state,
            legacy_import.history_entry_count,
            legacy_import.unresolved_local_timestamp_count,
            legacy_import.imported_at
       FROM support_legacy_imports AS legacy_import
       JOIN support_cases AS support_case ON support_case.id = legacy_import.case_id
      WHERE legacy_import.case_id::text = $1
        AND support_case.reporter_user_id = $2`,
    [caseId, actor.id],
  );
  if (!imported.rowCount) {
    throw new SupportCaseError(404, 'support_legacy_history_not_found');
  }
  const entries = await client.query(
    `SELECT source_message_id, sequence_number, sender_type, source_trust,
            rendered_content,
            source_timestamp_text, occurred_at, timestamp_interpretation, was_read
       FROM support_legacy_history_entries
      WHERE import_id = $1
      ORDER BY sequence_number, id`,
    [imported.rows[0].id],
  );
  const metadata = imported.rows[0];
  return Object.freeze({
    sourceSystem: metadata.source_system,
    legacyStatus: metadata.legacy_status,
    mappedStatus: metadata.mapped_status,
    templateState: metadata.template_state,
    verificationState: metadata.verification_state,
    usableAsDecisionEvidence: false,
    historyEntryCount: Number(metadata.history_entry_count),
    unresolvedLocalTimestampCount: Number(metadata.unresolved_local_timestamp_count),
    importedAt: new Date(metadata.imported_at).toISOString(),
    externalMessagesSent: false,
    entries: Object.freeze(entries.rows.map((entry) => Object.freeze({
      sourceMessageId: entry.source_message_id,
      sequence: Number(entry.sequence_number),
      senderType: entry.sender_type,
      sourceTrust: entry.source_trust,
      text: entry.rendered_content,
      sourceTimestamp: entry.source_timestamp_text,
      occurredAt: entry.occurred_at ? new Date(entry.occurred_at).toISOString() : null,
      timestampInterpretation: entry.timestamp_interpretation,
      wasRead: entry.was_read === true,
    }))),
  });
}

export async function previewLegacySupportRollback(client, { importId }) {
  const result = await client.query(
    `SELECT legacy_import.id, legacy_import.case_id,
            legacy_import.history_entry_count,
            (SELECT count(*)::int FROM support_messages
              WHERE case_id = legacy_import.case_id) AS support_message_count,
            (SELECT count(*)::int FROM support_evidence
              WHERE case_id = legacy_import.case_id) AS evidence_count,
            (SELECT count(*)::int FROM support_decisions
              WHERE case_id = legacy_import.case_id) AS decision_count,
            (SELECT count(*)::int FROM support_appeals
              WHERE case_id = legacy_import.case_id) AS appeal_count,
            (SELECT count(*)::int FROM support_case_events
              WHERE case_id = legacy_import.case_id
                AND source_system NOT IN ('sit-api', 'sit-legacy-migration')) AS external_event_count
       FROM support_legacy_imports AS legacy_import
      WHERE legacy_import.id::text = $1`,
    [importId],
  );
  if (!result.rowCount) {
    throw new SupportCaseError(404, 'support_legacy_import_not_found');
  }
  const row = result.rows[0];
  const downstreamRecordCount = [
    row.support_message_count,
    row.evidence_count,
    row.decision_count,
    row.appeal_count,
    row.external_event_count,
  ].reduce((sum, value) => sum + Number(value), 0);
  return Object.freeze({
    importId: row.id,
    caseId: row.case_id,
    dryRun: true,
    dataMutation: false,
    featureDisableSafe: true,
    historyPreservedOnFeatureDisable: true,
    destructiveSchemaRollbackAllowed: false,
    requiredAction: 'disable_support_legacy_migration_and_keep_append_only_archive',
    historyEntryCount: Number(row.history_entry_count),
    downstreamRecordCount,
    externalMessagesSent: false,
  });
}

export function publicLegacyMigrationPreview(raw, options) {
  return publicPreview(previewLegacySupportMigration(raw, options));
}
