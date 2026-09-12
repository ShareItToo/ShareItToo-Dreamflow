import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('backend/src/app.js', 'utf8');
const config = readFileSync('backend/src/config.js', 'utf8');
const workflow = readFileSync('backend/src/support_evidence_workflow.js', 'utf8');
const migrationUp = readFileSync(
  'backend/sql/migrations/051_support_evidence_security.up.sql',
  'utf8',
);
const migrationDown = readFileSync(
  'backend/sql/migrations/051_support_evidence_security.down.sql',
  'utf8',
);
const privacyExport = readFileSync('backend/src/privacy_export.js', 'utf8');
const retentionInventory = readFileSync('backend/src/retention_inventory.js', 'utf8');

test('SUP-099 accepts only detected image bytes and ignores hostile client filenames', () => {
  assert.match(workflow, /fileTypeFromBuffer\(buffer\)/u);
  assert.match(workflow, /allowedMimeTypes\.has\(detected\.mime\)/u);
  assert.match(workflow, /normalizedClaim !== detected\.mime/u);
  assert.doesNotMatch(workflow, /originalname|originalName|clientFileName/u);
  assert.doesNotMatch(app, /req\.file\.originalname/u);
  assert.match(app, /supportEvidenceUpload\.single\('file'\)/u);
  assert.match(config, /maxFileBytes: 8 \* 1024 \* 1024/u);
});

test('SUP-100 quarantines the deterministic malware fixture and never exposes it', () => {
  assert.match(workflow, /containsDeterministicMalwareFixture/u);
  assert.match(workflow, /scanStatus: 'quarantined'/u);
  assert.match(workflow, /preview: null/u);
  assert.match(workflow, /support_evidence_preview_unavailable/u);
  assert.match(workflow, /evidence_file\.scan_status = 'clean'/u);
  assert.doesNotMatch(app, /original_storage_name[\s\S]{0,500}res\.send/u);
});

test('SUP-101 rejects active markup and never persists or returns a client filename', () => {
  assert.match(workflow, /htmlLikePattern/u);
  assert.match(workflow, /unsafeControlPattern/u);
  assert.match(workflow, /support_evidence_description_invalid/u);
  assert.doesNotMatch(migrationUp, /original_file_name|client_file_name/u);
  assert.doesNotMatch(privacyExport, /original_file_name|client_file_name/u);
});

test('SUP-102 and SUP-103 bind short-lived access to actor, session and live authorization', () => {
  assert.match(migrationUp, /expires_at > created_at/u);
  assert.match(migrationUp, /expires_at <= created_at \+ interval '5 minutes'/u);
  assert.match(workflow, /access_grant\.subject_user_id = \$3/u);
  assert.match(workflow, /access_grant\.session_id = \$4/u);
  assert.match(workflow, /access_grant\.expires_at > \$5/u);
  assert.match(workflow, /session\.user_id = \$3 AND session\.revoked_at IS NULL/u);
  assert.match(
    workflow,
    /support_case\.reporter_user_id = \$3 OR \$3 = ANY\(support_case\.affected_user_ids\)/u,
  );
  assert.match(app, /X-Support-Evidence-Grant/u);
  assert.match(app, /Cache-Control': 'private, no-store'/u);
});

test('SUP-104 preserves an immutable original while serving only a verified preview', () => {
  assert.match(workflow, /originalSha256 = sha256\(buffer\)/u);
  assert.match(workflow, /sanitizeImage\(buffer, \{ purpose: 'report_evidence' \}\)/u);
  assert.match(migrationUp, /support evidence source and preview are immutable/u);
  assert.match(migrationUp, /OLD\.original_sha256 IS DISTINCT FROM NEW\.original_sha256/u);
  assert.match(app, /support_evidence_preview_integrity_mismatch/u);
  assert.match(app, /X-SIT-Evidence-SHA256/u);
  assert.match(migrationDown, /rollback would lose retained evidence/u);
});

test('SUP-105 keeps private evidence away from external AI and external scanner traffic', () => {
  assert.match(config, /scannerTransport: 'none'/u);
  assert.match(config, /externalAiAllowed: false/u);
  assert.match(config, /originalPublicAccessAllowed: false/u);
  assert.match(migrationUp, /external_ai_used BOOLEAN NOT NULL DEFAULT false CHECK \(external_ai_used = false\)/u);
  assert.doesNotMatch(workflow, /fetch\s*\(|https?:\/\//u);
  assert.match(app, /externalScannerTraffic: false/u);
  assert.match(app, /externalAiUsed: false/u);
});

test('support evidence is default-off in production and covered by privacy and retention inventories', () => {
  assert.match(config, /SUPPORT_EVIDENCE_INTAKE_ENABLED/u);
  assert.match(config, /supportEvidenceIntakeEnabled && deploymentEnvironment === 'production'/u);
  assert.match(app, /support_evidence_intake_disabled/u);
  assert.match(privacyExport, /submittedEvidenceFiles/u);
  assert.doesNotMatch(privacyExport, /original_storage_name|preview_storage_name/u);
  assert.match(retentionInventory, /'moderation', 'support_evidence_files'/u);
  assert.match(retentionInventory, /'securityAudit', 'support_evidence_access_grants'/u);
});
