import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const builder = read('scripts/build_android_release_candidate.sh');
const archive = read('tool/archive_android_release_candidate.mjs');
const deployment = read('backend/ops/deploy_release.sh');
const pilotCompose = read('backend/compose.staging.pilot.yml');
const smtpCompose = read('backend/compose.staging.smtp.yml');
const workflow = read('.github/workflows/regression.yml');
const regression = read('scripts/technical_regression_check.sh');

test('signed pilot envelope is bound to exact Internal Staging Wave-0 identity', () => {
  for (const marker of [
    'SIT_CLOSED_PILOT_ENVELOPE',
    'SIT_STAGE_A_PILOT_ID',
    'heilbronn_wave0',
    'https://staging.shareittoo.com/api/v1',
    'SIT_REQUIRE_STORE_SUBMISSION',
    '--dart-define=SIT_CLIENT_BUILD=$build_name+$build_number',
    '--dart-define=SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED=$booking_groups_technical_ui',
    '--dart-define=SIT_PLANNER_TECHNICAL_UI_ENABLED=$planner_technical_ui',
    '--dart-define=SIT_SUPPLY_ENRICHMENT_TECHNICAL_UI_ENABLED=$supply_enrichment_technical_ui',
    '--dart-define=SIT_LISTING_SETS_TECHNICAL_UI_ENABLED=$listing_sets_technical_ui',
    'listingAiExecutionLocation',
    'android_on_device',
  ]) assert.ok(builder.includes(marker), marker);
  assert.match(builder, /SIT_BOOKING_GROUPS_PUBLIC_RELEASE_ALLOWED=false/u);
});

test('private archive rejects partial pilot identity or surface truth', () => {
  for (const marker of [
    'closedPilotEnvelopeEnabled',
    "manifest.stageAPilotId !== 'heilbronn_wave0'",
    'manifest.g3TechnicalUiEnabled !== true',
    'manifest.g4TechnicalUiEnabled !== true',
    'manifest.g5SupplyEnrichmentTechnicalUiEnabled !== true',
    'manifest.g5ListingSetsTechnicalUiEnabled !== true',
    'manifest.listingAiExecutionLocation',
    'manifest.listingAiExternalImageProviderEnabled',
  ]) assert.ok(archive.includes(marker), marker);
});

test('staging pilot compose enables only on-device, zero-cost and memory transports', () => {
  for (const marker of [
    'BOOKING_PILOT_MODE: pilot',
    'PRIVATE_PILOT_V4_ENABLED: "true"',
    'PRIVATE_PILOT_ALLOWED_REGIONS: heilbronn',
    'BOOKING_GROUPS_ENABLED: "true"',
    'PLANNER_CORE_ENABLED: "true"',
    'PLANNER_INVENTORY_ENABLED: "true"',
    'LISTING_SUPPLY_ENRICHMENT_ENABLED: "true"',
    'LISTING_SETS_ENABLED: "true"',
    'SIT_LISTING_AI_PROVIDER: on_device',
    'SIT_LISTING_AI_MODEL: mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1',
    'SIT_LISTING_AI_BUDGET_CENTS: "0"',
    'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: "0"',
    'MAIL_TRANSPORT: memory',
    'PUSH_TRANSPORT: memory',
  ]) assert.ok(pilotCompose.includes(marker), marker);
  assert.doesNotMatch(pilotCompose, /production|gpt-4o|smtp|fcm|webhook/iu);
});

test('real Staging mail is isolated behind a TLS-only unauthenticated relay overlay', () => {
  for (const marker of [
    'MAIL_TRANSPORT: smtp',
    'SMTP_HOST: ${SMTP_HOST:?',
    'SMTP_PORT: ${SMTP_PORT:?',
    'SMTP_SECURE: ${SMTP_SECURE:?',
    'SMTP_REQUIRE_TLS: ${SMTP_REQUIRE_TLS:?',
    'SMTP_USER: ${SMTP_USER:-}',
    'SMTP_PASSWORD: ${SMTP_PASSWORD:-}',
    'MAIL_FROM: ${MAIL_FROM:?',
    'MAIL_REPLY_TO: ${MAIL_REPLY_TO:?',
  ]) assert.ok(smtpCompose.includes(marker), marker);
  assert.doesNotMatch(smtpCompose, /production|OPENAI_API_KEY|STRIPE_SECRET_KEY/u);
});

test('deployment requires exact pilot id and forbids it in production', () => {
  assert.match(deployment, /SIT_STAGING_PILOT_ID/u);
  assert.match(deployment, /task_environment" == production && -n "\$task_staging_pilot_id/u);
  assert.match(deployment, /task_staging_pilot_id" != heilbronn_wave0/u);
  assert.match(deployment, /compose\.staging\.pilot\.yml/u);
  assert.match(deployment, /PULL_RELEASE_IMAGE requires an explicit GHCR/u);
  assert.match(deployment, /ENABLE_STAGING_SMTP must be 0 or 1/u);
  assert.match(deployment, /staging SMTP override is forbidden for production/u);
  assert.match(deployment, /compose\.staging\.smtp\.yml/u);
  assert.match(deployment, /SMTP_HOST=smtp-relay\.gmail\.com/u);
  assert.match(deployment, /MAIL_FROM=ShareItToo Staging <contact@shareittoo\.com>/u);
  assert.match(deployment, /"stagingSmtp":%s/u);
});

test('manual image publication still waits for all exact regression jobs', () => {
  assert.match(workflow, /publish_api_image:/u);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && inputs\.publish_api_image/u);
  for (const job of [
    'backend-regression',
    'postgres-runner-proof',
    'r10-clean-reproducibility',
    'flutter-regression',
  ]) assert.match(workflow, new RegExp(`- ${job}`, 'u'));
});

test('full regression compiles the exact closed pilot Flutter profile', () => {
  const profilePath = 'test/closed_pilot_release_envelope_profile_test.dart';
  const profileEnd = regression.indexOf(profilePath);
  const profileStart = regression.lastIndexOf(
    'flutter test --reporter expanded',
    profileEnd,
  );
  assert.ok(profileStart >= 0 && profileEnd > profileStart);
  const profileCommand = regression.slice(
    profileStart,
    profileEnd + profilePath.length,
  );
  for (const marker of [
    'SIT_CLOSED_PILOT_PROFILE_TEST=true',
    'SIT_STAGE_A_PILOT_ID=heilbronn_wave0',
    'SIT_RELEASE_CHANNEL=internal',
    'SIT_API_BASE_URL=https://staging.shareittoo.com/api/v1',
    profilePath,
  ]) assert.ok(profileCommand.includes(marker), marker);
});
