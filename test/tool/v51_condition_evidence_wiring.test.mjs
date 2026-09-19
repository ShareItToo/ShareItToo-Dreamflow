import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const migration = read('backend/sql/migrations/019_v51_condition_evidence.up.sql');
const evidence = read('backend/src/booking_condition_evidence_workflow.js');
const messages = read('backend/src/message_workflow.js');
const confirmation = read('backend/src/booking_confirmation_workflow.js');
const app = read('backend/src/app.js');
const dataService = read('lib/services/data_service.dart');
const repository = read('lib/services/backend_repository.dart');
const stepper = read('lib/widgets/return_handover_stepper_sheet.dart');
const messageScreen = read('lib/screens/message_thread_screen.dart');
const privacy = read('lib/screens/legal_privacy_screen.dart');
const privacyExport = read('backend/src/privacy_export.js');
const retention = read('backend/src/retention_inventory.js');

test('condition evidence is private, append-only and role-bound in PostgreSQL', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS booking_condition_evidence/);
  assert.match(migration, /upload_id UUID NOT NULL UNIQUE REFERENCES uploads\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /message_id TEXT NOT NULL UNIQUE REFERENCES messages\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /segment = 'pickup'[\s\S]*?presenter_photo'[\s\S]*?actor_role = 'owner'/);
  assert.match(migration, /segment = 'return'[\s\S]*?presenter_photo'[\s\S]*?actor_role = 'renter'/);
  assert.match(migration, /booking_condition_evidence_immutable/);
  assert.match(migration, /booking_condition_confirmations_immutable/);
});

test('protected chat accepts only the exact evidence upload purpose and binds it atomically', () => {
  assert.match(messages, /parseConditionEvidence\(raw\?\.conditionEvidence/);
  assert.match(messages, /requiredPurpose: conditionEvidence\?\.requiredUploadPurpose/);
  assert.match(messages, /purpose = \$3 AND visibility = 'private'/);
  assert.match(messages, /recordConditionEvidenceForMessage\(client/);
  assert.match(evidence, /attachments\.length !== 1/);
  assert.match(evidence, /INSERT INTO booking_condition_evidence/);
  assert.match(repository, /'conditionEvidence': conditionEvidence/);
  assert.match(repository, /\.\.fields\['purpose'\] = purpose/);
});

test('QR or code verification cannot consume the challenge before photo confirmation', () => {
  const evidenceGuard = confirmation.indexOf('assertConditionEvidenceReadyForVerification(client');
  const consume = confirmation.indexOf('UPDATE booking_confirmation_challenges\n        SET verifier_user_id');
  assert.ok(evidenceGuard > 0);
  assert.ok(consume > evidenceGuard);
  assert.match(evidence, /presenterPhotos < 4/);
  assert.match(evidence, /condition_confirmation_required/);
});

test('authenticated evidence summary and counterparty-confirmation routes stay separate', () => {
  assert.match(app, /app\.get\('\/v1\/bookings\/:id\/condition-evidence', requireAuth, requireActiveAccount/);
  assert.match(app, /app\.post\('\/v1\/bookings\/:id\/condition-confirmations', requireAuth, requireActiveAccount, requireUnsuspendedScope\('booking'\)/);
  assert.match(evidence, /condition_confirmation_counterparty_required/);
  assert.match(evidence, /deviation_photo_required/);
});

test('Flutter presenter and counterparty flows persist role-specific evidence', () => {
  assert.match(stepper, /bool get _viewerIsPresenter/);
  assert.match(stepper, /_presenterEvidenceCount \+ _checkoutPhotos\.length >= 4/);
  assert.match(stepper, /'Fotos stimmen überein'/);
  assert.match(stepper, /'Abweichung dokumentieren'/);
  assert.match(stepper, /DataService\.addConditionEvidencePhoto\(/);
  assert.match(stepper, /DataService\.recordConditionConfirmation\(/);
  assert.match(dataService, /static Future<void> addConditionEvidencePhoto/);
  assert.match(dataService, /purpose: normalizedSegment == 'pickup'[\s\S]*?'handover_evidence'[\s\S]*?'return_evidence'/);
});

test('ordinary chat photos can never inflate legal evidence counters', () => {
  const pickStart = messageScreen.indexOf('Future<void> _pickPhoto(ImageSource source)');
  const galleryStart = messageScreen.indexOf('Future<void> _pickGalleryPhoto()', pickStart);
  const pickSection = messageScreen.slice(pickStart, galleryStart);
  assert.doesNotMatch(pickSection, /incrementHandoverPhotos|incrementReturnPhotos|addConditionEvidencePhoto/);

  const inlineStart = messageScreen.indexOf('Future<void> _addPhotosInline()');
  const inlineEnd = messageScreen.indexOf('String _sharedByNameFromLocation', inlineStart);
  const inlineSection = messageScreen.slice(inlineStart, inlineEnd);
  assert.doesNotMatch(inlineSection, /incrementHandoverPhotos|incrementReturnPhotos/);
});

test('privacy copy declares private role-bound evidence and no AI transfer', () => {
  assert.match(privacy, /mindestens vier aktuelle Zustandsfotos/);
  assert.match(privacy, /nicht an eine KI übermittelt/);
});

test('evidence is exportable and retention-inventoried without inventing a deletion period', () => {
  assert.match(privacyExport, /FROM booking_condition_evidence AS evidence/);
  assert.match(privacyExport, /FROM booking_condition_confirmations AS confirmation/);
  assert.match(retention, /'handoverEvidence', 'booking_condition_evidence'/);
  assert.match(retention, /'handoverEvidence', 'booking_condition_confirmations'/);
  assert.match(retention, /handoverEvidence: 'transactionalRecordPeriod'/);
});
