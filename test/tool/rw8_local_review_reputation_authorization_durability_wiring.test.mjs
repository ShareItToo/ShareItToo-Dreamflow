import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

test('RW8 is permanently invoked by the supported regression', () => {
  const regression = read('scripts/technical_regression_check.sh');
  for (const marker of [
    'rw8_local_review_reputation_authorization_durability_test.dart',
    'rw8_local_review_reputation_authorization_durability_wiring.test.mjs',
    'validate_rw8_local_review_reputation_authorization_durability.mjs',
  ]) assert.match(regression, new RegExp(escaped(marker), 'u'));
});

test('review writes bind the exact current booking participant context', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    '_reviewMutationQueue',
    '_requireCurrentOperationalUser(',
    '_assertCurrentOperationalUserId(',
    "request.status != 'completed'",
    'request.needsReview',
    'reviewerMatchesDirection',
    'latestRequestRaw != requestRaw',
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
});

test('strict bounded review documents preserve history and reject overflow', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    '_maxLocalReviews = 1000',
    '_maxLocalReviewDocumentBytes = 8 * 1024 * 1024',
    '_decodeClassicReviewsStrict(',
    '_decodeMultiReviewsStrict(',
    '_persistMultiReviews(',
    'Der lokale Bewertungsspeicher ist voll.',
    'failNextReviewPersistenceForTesting()',
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(
    service,
    /static Future<List<Review>> _getAllReviews[\s\S]*?_buildDemoReviews/u,
  );
});

test('review privacy export and shared-record retention truth are explicit', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    'exportReviewRecordsForPrivacy()',
    "'authoredClassicReviews'",
    "'receivedClassicReviews'",
    "'authoredMultiReviews'",
    "'receivedMultiReviews'",
    "'sharedPublicReviewsRetainedAfterDeletion': true",
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
  assert.match(
    read('lib/services/privacy_export_service.dart'),
    /exportReviewRecordsForPrivacy\(\)/u,
  );
});

test('review submission and read surfaces expose deterministic retry', () => {
  const prompt = read('lib/widgets/review_prompt_sheet.dart');
  for (const marker of [
    'Deine Eingaben bleiben erhalten',
    'Erneut versuchen',
    'review_submit_button',
  ]) assert.match(prompt, new RegExp(escaped(marker), 'u'));
  for (const path of [
    'lib/screens/public_profile_screen.dart',
    'lib/screens/own_profile_screen.dart',
  ]) {
    const source = read(path);
    assert.match(source, /Bewertungen konnten nicht sicher geladen werden/u);
    assert.match(source, /Erneut laden/u);
  }
});

test('lifecycle privacy and retention manifests bind local reviews', () => {
  const lifecycle = JSON.parse(read('store/g2-data-lifecycle.json'));
  assert.equal(
    lifecycle.localReviewReputation.mutationIdentityBinding,
    'matching-auth-session-exact-completed-booking-direction-counterparty-item-and-needs-review-clear',
  );
  const privacy = JSON.parse(read('store/privacy-disclosures.json'));
  assert.equal(
    privacy.localReviewReputation.privacyExport,
    'current-account-authored-and-received-reviews-only',
  );
  const retention = JSON.parse(read('store/retention-deletion-readiness.json'));
  assert.equal(
    retention.implementedControls.localReviewReputation
      .retentionPeriodInvented,
    false,
  );
});

test('RW8 proof is deterministic and covers the local threat matrix', () => {
  const source = read(
    'test/rw8_local_review_reputation_authorization_durability_test.dart',
  );
  for (const marker of [
    'guest, outsider and stale sessions cannot submit for a participant',
    'corrupt classic and multi-review documents fail closed unchanged',
    'parallel same-context submissions persist exactly one review',
    'parallel distinct submissions are serialized without lost updates',
    'failed verified write restores exact bytes and the queue recovers',
    'bounded review capacity fails closed without pruning history',
    'privacy export is current-account scoped and records retention truth',
    'verified review survives process-style preference recreation',
  ]) assert.match(source, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(source, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});
