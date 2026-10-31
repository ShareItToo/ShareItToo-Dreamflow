import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('backend/src/app.js', 'utf8');
const config = readFileSync('backend/src/config.js', 'utf8');
const migration = readFileSync('backend/src/support_legacy_migration.js', 'utf8');
const migrationUp = readFileSync(
  'backend/sql/migrations/050_support_legacy_history_import.up.sql',
  'utf8',
);
const migrationDown = readFileSync(
  'backend/sql/migrations/050_support_legacy_history_import.down.sql',
  'utf8',
);
const dataService = readFileSync('lib/services/data_service.dart', 'utf8');
const messageThread = readFileSync('lib/screens/message_thread_screen.dart', 'utf8');
const repository = readFileSync('lib/services/backend_repository.dart', 'utf8');
const supportCallSites = [
  'lib/screens/booking_detail_screen.dart',
  'lib/screens/ongoing_owner_detail_screen.dart',
  'lib/screens/public_profile_screen.dart',
  'lib/widgets/item_details_overlay.dart',
  'lib/screens/message_thread_screen.dart',
].map((path) => readFileSync(path, 'utf8'));

test('SUP-153 imports only eligible non-canonical legacy history as unverified simulation data', () => {
  assert.match(app, /\/v1\/support\/legacy-migrations\/preview/u);
  assert.match(app, /\/v1\/support\/legacy-migrations'/u);
  assert.match(app, /supportLegacyMigration\.enabled/u);
  assert.match(app, /supportLegacyMigrationLimiter/u);
  assert.match(migration, /canonicalCaseReference/u);
  assert.match(migration, /canonical_case_reference_present/u);
  assert.match(migration, /operatingMode: 'simulation'/u);
  assert.match(migration, /verificationState: 'unverified_user_device_source'/u);
  assert.match(migration, /usableAsDecisionEvidence: false/u);
  assert.match(migration, /case\.legacy_history_imported/u);
  assert.match(migration, /'sit-legacy-migration'/u);
  assert.match(migrationUp, /support_legacy_history_entries/u);
  assert.match(migrationUp, /rendered_content_sha256/u);
  assert.match(migrationUp, /source_timestamp_text/u);
  assert.match(migrationUp, /unresolved_local_time/u);
  assert.match(migrationUp, /source_trust TEXT NOT NULL DEFAULT 'unverified_user_device_source'/u);
});

test('SUP-154 maps paused explicitly and never admits paused as a case status', () => {
  assert.match(migration, /allowedPausedMappings/u);
  assert.match(migration, /support_legacy_paused_mapping_required/u);
  assert.match(migration, /support_legacy_pause_reason_required/u);
  assert.doesNotMatch(
    migrationUp,
    /mapped_status TEXT[^;]*'paused'/su,
  );
});

test('SUP-155 keeps legacy templates historical and local support history read-only', () => {
  assert.match(migrationUp, /template_state = 'historical_disabled'/u);
  const createMethod = dataService.slice(
    dataService.indexOf('static Future<MessageThread?> createSupportThread'),
    dataService.indexOf('/// Findet einen Thread anhand der Thread-ID'),
  );
  assert.match(createMethod, /required String canonicalCaseNumber/u);
  assert.match(createMethod, /canonical receipt required/u);
  assert.doesNotMatch(createMethod, /Hallo! Wie können wir dir helfen/u);
  assert.match(createMethod, /messages: const <Message>\[\]/u);
  for (const source of supportCallSites) {
    assert.match(source, /canonicalCaseNumber: result\.canonicalCaseNumber/u);
  }
  assert.match(messageThread, /st != _ChatState\.support/u);
  assert.match(messageThread, /Historischer Supportverlauf/u);
  assert.match(
    messageThread,
    /if \(_deriveChatState\(\) == _ChatState\.support\)/u,
  );
});

test('SUP-156 source identity and fingerprint make import replay-safe', () => {
  assert.match(
    migrationUp,
    /UNIQUE \(reporter_user_id, source_system, source_thread_id\)/u,
  );
  assert.match(migration, /source_changed_after_import/u);
  assert.match(migration, /sourceFingerprint/u);
  assert.match(migration, /pg_advisory_xact_lock/u);
  assert.match(repository, /previewLegacySupportMigration/u);
  assert.match(repository, /importLegacySupportMigration/u);
  assert.match(repository, /Idempotency-Key/u);
});

test('SUP-157 rollback is dry-run only and cannot delete archived history', () => {
  assert.match(
    app,
    /\/v1\/admin\/support\/legacy-migrations\/:id\/rollback-preview[^\n]*requireAdminRole[^\n]*requireStaffElevation/u,
  );
  assert.match(migration, /dryRun: true/u);
  assert.match(migration, /dataMutation: false/u);
  assert.match(migration, /destructiveSchemaRollbackAllowed: false/u);
  assert.match(migrationDown, /rollback would lose history/u);
  assert.match(migrationUp, /support_legacy_imports_append_only/u);
  assert.match(migrationUp, /support_legacy_history_entries_append_only/u);
  assert.match(config, /automaticImportAllowed: false/u);
  assert.match(config, /externalMessagesAllowed: false/u);
});
