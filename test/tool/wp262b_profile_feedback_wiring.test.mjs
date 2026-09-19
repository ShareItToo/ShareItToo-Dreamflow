import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profile = readFileSync('lib/screens/profile_screen.dart', 'utf8');
const coordinator = readFileSync(
  'lib/services/profile_feedback_coordinator.dart',
  'utf8',
);

test('WP262-B profile feedback submits the existing server support route', () => {
  assert.match(profile, /BackendRepository\.createSupportCase/u);
  assert.match(profile, /caseType': 'general_help'/u);
  assert.match(profile, /caseSubType': 'feedback_or_improvement'/u);
  assert.match(profile, /feedbackContext/u);
  assert.match(profile, /einzelnes, nicht dringendes Thema/u);
  assert.match(profile, /Mit „Absenden“ bestätigst du diese Einordnung/u);
  assert.match(profile, /'guidanceShown': false/u);
  assert.doesNotMatch(profile, /await DataService\.addFeedback/u);
});

test('WP262-B profile feedback binds owner, idempotency and retry semantics', () => {
  assert.match(profile, /_activeSessionOwner/u);
  assert.equal(
    [...profile.matchAll(/sameProfileFeedbackOwner\(_activeSessionOwner, owner\)/gu)]
      .length,
    2,
  );
  assert.match(profile, /isOwnerCurrent\(owner\)/u);
  assert.match(profile, /_feedbackSubmissionKey/u);
  assert.match(profile, /idempotencyKey/u);
  assert.match(profile, /Random\.secure\(\)/u);
  assert.match(profile, /profileFeedbackMaxLength/u);
  assert.doesNotMatch(profile, /profile-feedback-\$\{owner\.authOwner\.sessionId\}/u);
  assert.match(profile, /Der Entwurf bleibt erhalten/u);
  assert.match(coordinator, /if \(_inFlight/u);
  assert.match(coordinator, /readDraft\(\) == submittedDraft/u);
  assert.match(coordinator, /staleContext/u);
});
