import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/codeql.yml', import.meta.url),
  'utf8',
);
const backendApp = readFileSync(
  new URL('../../backend/src/app.js', import.meta.url),
  'utf8',
);
const rateLimitPolicy = readFileSync(
  new URL('../../backend/src/rate_limit_policy.js', import.meta.url),
  'utf8',
);

test('CodeQL covers main, pull request, schedule and manual entry points', () => {
  assert.match(workflow, /^name: codeql$/mu);
  assert.match(workflow, /^  push:$/mu);
  assert.match(workflow, /^      - main$/mu);
  assert.doesNotMatch(workflow, /^      - codex\//mu);
  assert.match(workflow, /^  pull_request:$/mu);
  assert.match(workflow, /^  schedule:$/mu);
  assert.match(workflow, /^  workflow_dispatch:$/mu);
});

test('CodeQL uses the current supported action and extended JavaScript queries', () => {
  assert.match(workflow, /uses: github\/codeql-action\/init@v4/u);
  assert.match(workflow, /languages: javascript-typescript/u);
  assert.match(workflow, /queries: security-extended/u);
  assert.match(workflow, /uses: github\/codeql-action\/analyze@v4/u);
  assert.doesNotMatch(workflow, /github\/codeql-action\/(?:init|analyze)@v[123]\b/u);
});

test('CodeQL is bounded and cannot silently ignore findings or workflow failures', () => {
  assert.match(workflow, /^permissions:\n  contents: read$/mu);
  assert.match(workflow, /^      security-events: write$/mu);
  assert.match(workflow, /^    timeout-minutes: 20$/mu);
  assert.match(workflow, /^  cancel-in-progress: true$/mu);
  assert.doesNotMatch(workflow, /continue-on-error/u);
  assert.doesNotMatch(workflow, /secrets\./u);
  assert.doesNotMatch(workflow, /(?:deploy|publish|upload-artifact|workflow_run)/u);
});

test('every general API route remains behind the global limiter', () => {
  const globalLimiter = backendApp.indexOf('app.use(rateLimit({');
  const firstGeneralRoute = backendApp.indexOf("app.get('/v1/maps/places/autocomplete'");
  const webhookRoute = backendApp.indexOf("app.post('/v1/payments/webhook'");
  assert.ok(webhookRoute >= 0 && webhookRoute < globalLimiter);
  assert.ok(globalLimiter >= 0 && globalLimiter < firstGeneralRoute);
  assert.equal(
    backendApp.slice(globalLimiter, firstGeneralRoute).includes(
      'skip: isProtectedSafetyRateLimitRequest',
    ),
    true,
  );
  assert.equal(
    backendApp.slice(webhookRoute, globalLimiter).includes('webhookLimiter'),
    true,
  );
  for (const contract of [
    'general: Object.freeze({ windowMs: 60_000, limit: 240 })',
    'supportIntake: Object.freeze({ windowMs: 15 * 60_000, limit: 10 })',
    'supportSafetyIntake: Object.freeze({ windowMs: 15 * 60_000, limit: 30 })',
  ]) {
    assert.equal(rateLimitPolicy.includes(contract), true, `missing policy: ${contract}`);
  }
});

test('Blue-Ocean listing mutations retain a dedicated bounded limiter before authentication', () => {
  assert.match(
    backendApp,
    /const blueOceanListingMutationLimiter = rateLimit\(\{ windowMs: 15 \* 60_000, limit: 30,[^\n]+\}\);/u,
  );
  for (const route of [
    '/v1/blue-ocean/listing-drafts/analyze',
    '/v1/blue-ocean/listing-drafts/:id/review',
    '/v1/blue-ocean/listing-drafts/:id/publish',
  ]) {
    assert.equal(
      backendApp.includes(
        `app.post('${route}', blueOceanListingMutationLimiter, requireAuth, requireActiveAccount, requireUnsuspendedScope('listing')`,
      ),
      true,
      `missing dedicated pre-authentication limiter: ${route}`,
    );
  }
});

test('planner inventory resolution retains an inline bounded limiter before authentication', () => {
  assert.equal(
    backendApp.includes(
      "app.post('/v1/planner/resolve', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, handler: limitHandler }), requireAuth, requireActiveAccount, requireUnsuspendedScope('booking')",
    ),
    true,
  );
});
