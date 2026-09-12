import crypto from 'node:crypto';

import { fileTypeFromBuffer } from 'file-type';

import { sanitizeImage } from './media_pipeline.js';
import { SupportCaseError } from './support_case_domain.js';

const allowedMimeTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const identifierPattern = /^[A-Za-z0-9_.:-]{8,160}$/u;
const hashPattern = /^[0-9a-f]{64}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const safeReferencePattern = /^[A-Za-z0-9_.:-]{3,160}$/u;
const generatedStoragePattern = /^support-evidence-[0-9a-f-]{36}-(?:original\.(?:jpg|png|webp|quarantine)|preview\.webp)$/u;
const htmlLikePattern = /<\/?[A-Za-z][^>]*>/u;
const unsafeControlPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const activeSubmissionStatuses = new Set([
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function iso(value) {
  return value == null ? null : new Date(value).toISOString();
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SupportCaseError(400, code);
  }
  if (Object.keys(value).some((key) => !keys.has(key))) {
    throw new SupportCaseError(400, code);
  }
  return value;
}

function safeText(value, { minimum, maximum, code }) {
  if (typeof value !== 'string') throw new SupportCaseError(400, code);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum
      || htmlLikePattern.test(normalized) || unsafeControlPattern.test(normalized)) {
    throw new SupportCaseError(400, code);
  }
  return normalized;
}

function normalizeClaimedTime(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 80) {
    throw new SupportCaseError(400, 'support_evidence_claimed_time_invalid');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new SupportCaseError(400, 'support_evidence_claimed_time_invalid');
  }
  return parsed;
}

export function normalizeSupportEvidenceMetadata(raw) {
  const value = exactObject(raw, new Set([
    'description',
    'purpose',
    'claimedEventTime',
    'thirdPartyData',
  ]), 'support_evidence_metadata_invalid');
  if (value.thirdPartyData !== undefined && typeof value.thirdPartyData !== 'boolean') {
    throw new SupportCaseError(400, 'support_evidence_third_party_flag_invalid');
  }
  return Object.freeze({
    description: safeText(value.description, {
      minimum: 3,
      maximum: 2000,
      code: 'support_evidence_description_invalid',
    }),
    purpose: safeText(value.purpose, {
      minimum: 3,
      maximum: 1000,
      code: 'support_evidence_purpose_invalid',
    }),
    claimedEventTime: normalizeClaimedTime(value.claimedEventTime),
    thirdPartyData: value.thirdPartyData === true,
  });
}

function containsDeterministicMalwareFixture(buffer) {
  const source = buffer.toString('latin1');
  return source.includes('X5O!P%@AP')
    && source.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');
}

export async function prepareSupportEvidenceFile(buffer, { claimedMimeType = null } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > 8 * 1024 * 1024) {
    throw new SupportCaseError(400, 'support_evidence_file_invalid');
  }
  const originalSha256 = sha256(buffer);
  if (containsDeterministicMalwareFixture(buffer)) {
    return Object.freeze({
      detectedMimeType: 'application/x-eicar-test',
      extension: 'quarantine',
      originalByteSize: buffer.length,
      originalSha256,
      preview: null,
      scanStatus: 'quarantined',
      scanEngine: 'deterministic_signature',
      quarantineReasonCode: 'malware_signature_detected',
      scannedAt: new Date(),
      externalAiUsed: false,
    });
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !allowedMimeTypes.has(detected.mime)) {
    throw new SupportCaseError(415, 'support_evidence_mime_not_allowed');
  }
  const normalizedClaim = typeof claimedMimeType === 'string'
    ? claimedMimeType.trim().toLowerCase()
    : '';
  if (normalizedClaim && normalizedClaim !== 'application/octet-stream'
      && normalizedClaim !== detected.mime) {
    throw new SupportCaseError(415, 'support_evidence_mime_mismatch');
  }

  const processed = await sanitizeImage(buffer, { purpose: 'report_evidence' });
  return Object.freeze({
    detectedMimeType: detected.mime,
    extension: allowedMimeTypes.get(detected.mime),
    originalByteSize: buffer.length,
    originalSha256,
    preview: Object.freeze({
      bytes: processed.full,
      mimeType: processed.mimeType,
      byteSize: processed.full.length,
      sha256: processed.sha256,
      width: processed.width,
      height: processed.height,
    }),
    scanStatus: 'pending',
    scanEngine: 'none',
    quarantineReasonCode: null,
    scannedAt: null,
    externalAiUsed: false,
  });
}

function evidenceShape(row) {
  return Object.freeze({
    id: row.evidence_id,
    fileId: row.file_id,
    caseId: row.case_id,
    description: row.description,
    purpose: row.purpose,
    claimedEventTime: iso(row.claimed_event_time),
    receivedAt: iso(row.received_at),
    thirdPartyData: row.third_party_data_flag === true,
    scanStatus: row.scan_status,
    originalMimeType: row.detected_mime_type,
    originalByteSize: Number(row.original_byte_size),
    originalSha256: row.original_sha256,
    previewAvailable: row.scan_status === 'clean' && row.preview_storage_name != null,
    externalAiUsed: false,
    accessRequiresActiveAccount: true,
    accessRequiresOriginalSession: true,
  });
}

async function accessibleCase(client, { actor, caseId, forUpdate = false }) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const result = await client.query(
    `SELECT id, human_readable_case_number, reporter_user_id,
            affected_user_ids, linked_booking_id, linked_listing_id, status
       FROM support_cases
      WHERE (id::text = $1 OR human_readable_case_number = $1)
        AND (reporter_user_id = $2 OR $2 = ANY(affected_user_ids))${lock}`,
    [caseId, actor.id],
  );
  if (!result.rowCount) throw new SupportCaseError(404, 'support_case_not_found');
  return result.rows[0];
}

async function writeEvidenceAudit(client, { actor, action, resourceId, metadata }) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, $3, 'support_evidence', $4, $5::jsonb)`,
    [actor.id, actor.role, action, resourceId, JSON.stringify(metadata)],
  );
}

export async function createSupportEvidence(client, {
  actor,
  caseId,
  rawMetadata,
  preparedFile,
  evidenceId,
  fileId,
  originalStorageName,
  previewStorageName,
  idempotencyKey,
}) {
  if (!identifierPattern.test(idempotencyKey ?? '')) {
    throw new SupportCaseError(400, 'idempotency_key_required');
  }
  if (!uuidPattern.test(evidenceId ?? '') || !uuidPattern.test(fileId ?? '')
      || !hashPattern.test(preparedFile?.originalSha256 ?? '')
      || !generatedStoragePattern.test(originalStorageName ?? '')
      || (previewStorageName != null && !generatedStoragePattern.test(previewStorageName))) {
    throw new SupportCaseError(400, 'support_evidence_file_binding_invalid');
  }
  const metadata = normalizeSupportEvidenceMetadata(rawMetadata);
  const requestSha256 = sha256(JSON.stringify({
    caseId,
    description: metadata.description,
    purpose: metadata.purpose,
    claimedEventTime: metadata.claimedEventTime?.toISOString() ?? null,
    thirdPartyData: metadata.thirdPartyData,
    originalSha256: preparedFile.originalSha256,
  }));

  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
    [`support-evidence:${actor.id}:${idempotencyKey}`],
  );
  const existing = await client.query(
    `SELECT evidence.id AS evidence_id, evidence_file.id AS file_id,
            evidence.case_id, evidence.description, evidence.purpose,
            evidence.claimed_event_time, evidence.received_at,
            evidence.third_party_data_flag, evidence_file.scan_status,
            evidence_file.detected_mime_type, evidence_file.original_byte_size,
            evidence_file.original_sha256, evidence_file.preview_storage_name,
            evidence_file.request_sha256
       FROM support_evidence_files AS evidence_file
       JOIN support_evidence AS evidence ON evidence.id = evidence_file.evidence_id
      WHERE evidence_file.uploader_user_id = $1
        AND evidence_file.idempotency_key = $2`,
    [actor.id, idempotencyKey],
  );
  if (existing.rowCount) {
    if (existing.rows[0].request_sha256 !== requestSha256) {
      throw new SupportCaseError(409, 'support_evidence_idempotency_conflict');
    }
    return Object.freeze({ evidence: evidenceShape(existing.rows[0]), replayed: true });
  }

  const supportCase = await accessibleCase(client, { actor, caseId, forUpdate: true });
  if (!activeSubmissionStatuses.has(supportCase.status)) {
    throw new SupportCaseError(409, 'support_evidence_case_not_accepting_files');
  }

  await client.query(
    `INSERT INTO support_evidence (
       id, case_id, evidence_class, submitter_id, file_reference,
       description, purpose, claimed_event_time, linked_booking_id,
       linked_listing_id, integrity_metadata, third_party_data_flag,
       access_level, retention_category, legal_hold_flag
     ) VALUES (
       $1, $2, 'uploaded_evidence', $3, $4, $5, $6, $7, $8, $9,
       $10::jsonb, $11, 'user_visible', 'support_evidence', false
     )`,
    [
      evidenceId,
      supportCase.id,
      actor.id,
      `support-evidence-file:${fileId}`,
      metadata.description,
      metadata.purpose,
      metadata.claimedEventTime,
      supportCase.linked_booking_id,
      supportCase.linked_listing_id,
      JSON.stringify({
        originalSha256: preparedFile.originalSha256,
        previewSha256: preparedFile.preview?.sha256 ?? null,
        sourceTrust: 'user_submitted_unverified',
        usableAsDecisionEvidenceWithoutReview: false,
        externalAiUsed: false,
      }),
      metadata.thirdPartyData,
    ],
  );
  const inserted = await client.query(
    `INSERT INTO support_evidence_files (
       id, evidence_id, uploader_user_id, original_storage_name,
       preview_storage_name, detected_mime_type, original_byte_size,
       original_sha256, preview_mime_type, preview_byte_size, preview_sha256,
       image_width, image_height, scan_status, scan_engine, scan_reference,
       quarantine_reason_code, external_ai_used, idempotency_key,
       request_sha256, scanned_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       $14, $15, NULL, $16, false, $17, $18, $19
     )
     RETURNING id AS file_id, evidence_id, scan_status, detected_mime_type,
               original_byte_size, original_sha256, preview_storage_name`,
    [
      fileId,
      evidenceId,
      actor.id,
      originalStorageName,
      previewStorageName,
      preparedFile.detectedMimeType,
      preparedFile.originalByteSize,
      preparedFile.originalSha256,
      preparedFile.preview?.mimeType ?? null,
      preparedFile.preview?.byteSize ?? null,
      preparedFile.preview?.sha256 ?? null,
      preparedFile.preview?.width ?? null,
      preparedFile.preview?.height ?? null,
      preparedFile.scanStatus,
      preparedFile.scanEngine,
      preparedFile.quarantineReasonCode,
      idempotencyKey,
      requestSha256,
      preparedFile.scannedAt,
    ],
  );
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system
     ) VALUES (
       $1, 'evidence.submitted', 'user', $2, 'support_evidence', $3,
       $4::jsonb, false, 'user_visible', $5, 'sit-support-evidence'
     )`,
    [
      supportCase.id,
      actor.id,
      evidenceId,
      JSON.stringify({
        scanStatus: preparedFile.scanStatus,
        originalByteSize: preparedFile.originalByteSize,
        thirdPartyData: metadata.thirdPartyData,
        externalAiUsed: false,
      }),
      `evidence-submit:${actor.id}:${idempotencyKey}`,
    ],
  );
  await writeEvidenceAudit(client, {
    actor,
    action: 'support.evidence_submitted',
    resourceId: evidenceId,
    metadata: {
      caseId: supportCase.id,
      scanStatus: preparedFile.scanStatus,
      originalByteSize: preparedFile.originalByteSize,
      externalAiUsed: false,
    },
  });
  return Object.freeze({
    evidence: evidenceShape({
      ...inserted.rows[0],
      case_id: supportCase.id,
      description: metadata.description,
      purpose: metadata.purpose,
      claimed_event_time: metadata.claimedEventTime,
      received_at: new Date(),
      third_party_data_flag: metadata.thirdPartyData,
    }),
    replayed: false,
  });
}

export async function listSupportEvidence(client, { actor, caseId }) {
  const supportCase = await accessibleCase(client, { actor, caseId });
  const result = await client.query(
    `SELECT evidence.id AS evidence_id, evidence_file.id AS file_id,
            evidence.case_id, evidence.description, evidence.purpose,
            evidence.claimed_event_time, evidence.received_at,
            evidence.third_party_data_flag, evidence_file.scan_status,
            evidence_file.detected_mime_type, evidence_file.original_byte_size,
            evidence_file.original_sha256, evidence_file.preview_storage_name
       FROM support_evidence AS evidence
       JOIN support_evidence_files AS evidence_file
         ON evidence_file.evidence_id = evidence.id
      WHERE evidence.case_id = $1 AND evidence.access_level = 'user_visible'
      ORDER BY evidence.received_at, evidence.id`,
    [supportCase.id],
  );
  return Object.freeze(result.rows.map(evidenceShape));
}

export async function recordSupportEvidenceScanResult(client, {
  actor,
  evidenceId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin') throw new SupportCaseError(403, 'admin_role_required');
  if (!identifierPattern.test(idempotencyKey ?? '')) {
    throw new SupportCaseError(400, 'idempotency_key_required');
  }
  const value = exactObject(raw, new Set([
    'result', 'expectedOriginalSha256', 'scanReference',
  ]), 'support_evidence_scan_result_invalid');
  if (!['clean', 'quarantined', 'failed'].includes(value.result)
      || !hashPattern.test(value.expectedOriginalSha256 ?? '')
      || !safeReferencePattern.test(value.scanReference ?? '')) {
    throw new SupportCaseError(400, 'support_evidence_scan_result_invalid');
  }
  const quarantineReason = value.result === 'clean'
    ? null
    : (value.result === 'quarantined' ? 'malware_detected_by_scanner' : 'scanner_failed');

  const result = await client.query(
    `UPDATE support_evidence_files AS evidence_file
        SET scan_status = $3, scan_engine = 'internal_test_fixture',
            scan_reference = $4, quarantine_reason_code = $5, scanned_at = $6
       FROM support_evidence AS evidence
      WHERE evidence_file.evidence_id = evidence.id
        AND evidence.id::text = $1
        AND evidence_file.original_sha256 = $2
        AND evidence_file.scan_status = 'pending'
      RETURNING evidence_file.id AS file_id, evidence.id AS evidence_id,
                evidence.case_id, evidence_file.scan_status,
                evidence_file.original_sha256,
                evidence_file.preview_storage_name`,
    [
      evidenceId,
      value.expectedOriginalSha256,
      value.result,
      value.scanReference,
      quarantineReason,
      now,
    ],
  );
  if (!result.rowCount) {
    const existing = await client.query(
      `SELECT evidence_file.scan_status, evidence_file.original_sha256,
              evidence_file.scan_reference
         FROM support_evidence_files AS evidence_file
         JOIN support_evidence AS evidence ON evidence.id = evidence_file.evidence_id
        WHERE evidence.id::text = $1`,
      [evidenceId],
    );
    if (!existing.rowCount) throw new SupportCaseError(404, 'support_evidence_not_found');
    if (existing.rows[0].original_sha256 !== value.expectedOriginalSha256) {
      throw new SupportCaseError(409, 'support_evidence_hash_mismatch');
    }
    if (existing.rows[0].scan_status === value.result
        && existing.rows[0].scan_reference === value.scanReference) {
      return Object.freeze({
        evidenceId,
        scanStatus: value.result,
        replayed: true,
        externalProviderTraffic: false,
      });
    }
    throw new SupportCaseError(409, 'support_evidence_scan_result_terminal');
  }
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system
     ) VALUES (
       $1, 'evidence.scan_recorded', 'admin', $2, 'support_evidence', $3,
       $4::jsonb, false, 'internal', $5, 'sit-support-evidence'
     )`,
    [
      result.rows[0].case_id,
      actor.id,
      evidenceId,
      JSON.stringify({ scanStatus: value.result, externalProviderTraffic: false }),
      `evidence-scan:${actor.id}:${idempotencyKey}`,
    ],
  );
  await writeEvidenceAudit(client, {
    actor,
    action: 'support.evidence_scan_recorded',
    resourceId: evidenceId,
    metadata: { scanStatus: value.result, externalProviderTraffic: false },
  });
  return Object.freeze({
    evidenceId,
    scanStatus: value.result,
    replayed: false,
    externalProviderTraffic: false,
  });
}

export async function issueSupportEvidenceAccessGrant(client, {
  actor,
  sessionId,
  evidenceId,
  lifetimeSeconds = 120,
  now = new Date(),
}) {
  const result = await client.query(
    `SELECT evidence_file.id AS file_id, evidence.id AS evidence_id,
            evidence.case_id, evidence_file.scan_status,
            evidence_file.preview_storage_name
       FROM support_evidence_files AS evidence_file
       JOIN support_evidence AS evidence ON evidence.id = evidence_file.evidence_id
       JOIN support_cases AS support_case ON support_case.id = evidence.case_id
      WHERE evidence.id::text = $1
        AND (support_case.reporter_user_id = $2 OR $2 = ANY(support_case.affected_user_ids))`,
    [evidenceId, actor.id],
  );
  if (!result.rowCount) throw new SupportCaseError(404, 'support_evidence_not_found');
  if (result.rows[0].scan_status !== 'clean' || !result.rows[0].preview_storage_name) {
    throw new SupportCaseError(409, 'support_evidence_preview_unavailable');
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + Math.min(300, Math.max(30, lifetimeSeconds)) * 1000);
  const grant = await client.query(
    `INSERT INTO support_evidence_access_grants (
       evidence_file_id, subject_user_id, session_id, token_digest,
       created_at, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, expires_at`,
    [result.rows[0].file_id, actor.id, sessionId, sha256(token), now, expiresAt],
  );
  await writeEvidenceAudit(client, {
    actor,
    action: 'support.evidence_access_granted',
    resourceId: evidenceId,
    metadata: { expiresAt: expiresAt.toISOString(), sessionBound: true },
  });
  return Object.freeze({
    evidenceId,
    accessToken: token,
    expiresAt: iso(grant.rows[0].expires_at),
    sessionBound: true,
    bearerTransferable: false,
  });
}

export async function authorizeSupportEvidencePreview(client, {
  actor,
  sessionId,
  evidenceId,
  accessToken,
  now = new Date(),
}) {
  if (typeof accessToken !== 'string' || accessToken.length < 32 || accessToken.length > 160) {
    throw new SupportCaseError(401, 'support_evidence_access_invalid');
  }
  const result = await client.query(
    `UPDATE support_evidence_access_grants AS access_grant
        SET last_used_at = $5
       FROM support_evidence_files AS evidence_file,
            support_evidence AS evidence,
            support_cases AS support_case,
            auth_sessions AS session
      WHERE access_grant.evidence_file_id = evidence_file.id
        AND evidence_file.evidence_id = evidence.id
        AND support_case.id = evidence.case_id
        AND session.id = access_grant.session_id
        AND evidence.id::text = $1
        AND access_grant.token_digest = $2
        AND access_grant.subject_user_id = $3
        AND access_grant.session_id = $4
        AND access_grant.expires_at > $5
        AND session.user_id = $3 AND session.revoked_at IS NULL
        AND (support_case.reporter_user_id = $3 OR $3 = ANY(support_case.affected_user_ids))
        AND evidence_file.scan_status = 'clean'
        AND evidence_file.preview_storage_name IS NOT NULL
      RETURNING evidence_file.preview_storage_name,
                evidence_file.preview_mime_type,
                evidence_file.preview_byte_size,
                evidence_file.preview_sha256`,
    [evidenceId, sha256(accessToken), actor.id, sessionId, now],
  );
  if (!result.rowCount) throw new SupportCaseError(403, 'support_evidence_access_denied');
  await writeEvidenceAudit(client, {
    actor,
    action: 'support.evidence_preview_viewed',
    resourceId: evidenceId,
    metadata: { sessionBound: true, originalReturned: false },
  });
  return Object.freeze({
    storageName: result.rows[0].preview_storage_name,
    mimeType: result.rows[0].preview_mime_type,
    byteSize: Number(result.rows[0].preview_byte_size),
    sha256: result.rows[0].preview_sha256,
  });
}
