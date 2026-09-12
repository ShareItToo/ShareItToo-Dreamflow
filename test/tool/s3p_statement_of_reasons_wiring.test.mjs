import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('S3P wires exact reasons from admin input to the authenticated user surface', () => {
  const app = source('backend/src/app.js');
  const repository = source('lib/services/backend_repository.dart');
  const admin = source('lib/screens/moderation_admin_screen.dart');
  const decisions = source('lib/screens/moderation_decisions_screen.dart');
  const helpCenter = source('lib/screens/help_center_screen.dart');

  assert.match(
    app,
    /app\.get\('\/v1\/moderation\/decisions'[\s\S]*?private, no-store/u,
  );
  assert.match(
    app,
    /app\.post\('\/v1\/moderation\/decisions\/:id\/review'[\s\S]*?moderationReviewLimiter[\s\S]*?private, no-store/u,
  );
  assert.match(repository, /path: '\/moderation\/decisions'/u);
  assert.match(
    repository,
    /path: '\/moderation\/decisions\/\$\{Uri\.encodeComponent\(decisionId\)\}\/review'/u,
  );
  assert.match(repository, /'decision': decision/u);

  for (const field of [
    'facts',
    'basis',
    'reasoning',
    'detectionMethod',
    'decisionGround',
    'decisionOrigin',
    'territorialScope',
    'durationType',
    'automationRole',
  ]) {
    assert.match(admin, new RegExp(`'${field}'`, 'u'));
  }
  assert.doesNotMatch(admin, /value: 'automated'/u);
  assert.match(decisions, /sit_dsa_statement_of_reasons_v1/u);
  assert.match(decisions, /keine vollständig bestätigte digitale Begründung/u);
  assert.match(decisions, /Menschliche Prüfung beantragen/u);
  assert.match(helpCenter, /open-moderation-decisions/u);
  assert.match(helpCenter, /ModerationDecisionsScreen/u);
});
