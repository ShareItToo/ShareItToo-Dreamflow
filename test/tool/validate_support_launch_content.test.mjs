import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateSupportLaunchContent } from
  '../../tool/validate_support_launch_content.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const approvedEnvironment = Object.freeze({
  SIT_CONSUMER_DISPUTE_APPROVED: 'true',
  SIT_CONSUMER_DISPUTE_CONFIGURATION_VERSION: 'VSBG-REVIEW-1',
  SIT_CONSUMER_DISPUTE_BODY_NAME: 'Universalschlichtungsstelle des Bundes',
  SIT_CONSUMER_DISPUTE_BODY_ADDRESS: 'Beispielweg 1, 00000 Beispielstadt',
  SIT_CONSUMER_DISPUTE_BODY_WEBSITE: 'https://www.verbraucher-schlichter.de/',
  SIT_CONSUMER_DISPUTE_PARTICIPATION_STATUS:
    'not_willing_or_obliged_except_mandatory_case',
});

test('keeps external AI absent and consumer-dispute release configuration closed by default', () => {
  assert.deepEqual(validateSupportLaunchContent({ root, environment: {} }), {
    externalAiEnabled: false,
    directAiChatEnabled: false,
    consumerDisputeConfigurationReady: false,
    oldOdrLinkPresent: false,
    publicReleaseAllowed: false,
  });
});

test('accepts only a complete explicitly approved VSBG configuration for release mode', () => {
  assert.equal(validateSupportLaunchContent({
    root,
    environment: approvedEnvironment,
    requireApproved: true,
  }).publicReleaseAllowed, true);
  assert.throws(
    () => validateSupportLaunchContent({ root, environment: {}, requireApproved: true }),
    /complete approved VSBG configuration/u,
  );
  assert.throws(
    () => validateSupportLaunchContent({
      root,
      environment: {
        ...approvedEnvironment,
        SIT_CONSUMER_DISPUTE_PARTICIPATION_STATUS: 'TBD',
      },
      requireApproved: true,
    }),
    /complete approved VSBG configuration/u,
  );
});

test('rejects reintroducing an external-AI switch or dormant client transport', () => {
  const path = 'lib/openai/openai_config.dart';
  const original = read(path);
  assert.throws(
    () => validateSupportLaunchContent({
      root,
      sourceOverrides: { [path]: original.replace('aiHelpersEnabled = false', 'aiHelpersEnabled = true') },
      environment: {},
    }),
    /fail-closed contract/u,
  );
  assert.throws(
    () => validateSupportLaunchContent({
      root,
      sourceOverrides: { [path]: `${original}\n// http.post(Uri.parse(endpoint));` },
      environment: {},
    }),
    /client path is forbidden/u,
  );
});

test('rejects weakening the server-only listing AI execution and storage gates', () => {
  const configPath = 'backend/src/listing_ai_gateway_config.js';
  const providerPath = 'backend/src/openai_listing_ai_provider.js';
  assert.throws(
    () => validateSupportLaunchContent({
      root,
      sourceOverrides: {
        [configPath]: read(configPath).replace(
          "SIT_LISTING_AI_PROVIDER ?? 'disabled'",
          "SIT_LISTING_AI_PROVIDER ?? 'openai'",
        ),
      },
      environment: {},
    }),
    /Server listing-AI fail-closed contract/u,
  );
  assert.throws(
    () => validateSupportLaunchContent({
      root,
      sourceOverrides: {
        [providerPath]: read(providerPath).replace('store: false', 'store: true'),
      },
      environment: {},
    }),
    /Server listing-AI fail-closed contract/u,
  );
});

test('rejects every old EU ODR URL in app or support text', () => {
  const path = 'backend/src/support_message_templates_v1.json';
  assert.throws(
    () => validateSupportLaunchContent({
      root,
      sourceOverrides: {
        [path]: `${read(path)}\nhttps://ec.europa.eu/consumers/odr/`,
      },
      scanDocuments: [path],
      environment: {},
    }),
    /Old EU ODR link is forbidden/u,
  );
  assert.throws(
    () => validateSupportLaunchContent({
      root,
      environment: {
        ...approvedEnvironment,
        SIT_CONSUMER_DISPUTE_BODY_WEBSITE: 'https://consumer-redress.ec.europa.eu/',
      },
      requireApproved: true,
    }),
    /complete approved VSBG configuration/u,
  );
});

test('rejects a public compliance path that bypasses the VSBG gate', () => {
  const path = 'backend/src/account_actions.js';
  const original = read(path);
  assert.throws(
    () => validateSupportLaunchContent({
      root,
      sourceOverrides: {
        [path]: original.replaceAll(
          'compliance.approved && consumerDispute.isComplete',
          'compliance.approved',
        ),
      },
      environment: {},
    }),
    /Public VSBG fail-closed wiring is missing/u,
  );
});

test('keeps the validator in technical and release gates', () => {
  const regression = read('scripts/technical_regression_check.sh');
  const preflight = read('scripts/release_candidate_preflight.sh');
  const builder = read('scripts/build_android_release_candidate.sh');
  for (const command of [
    'node --check tool/validate_support_launch_content.mjs',
    'node --test test/tool/validate_support_launch_content.test.mjs',
    'node --test backend/test/consumer_dispute_config.test.js backend/test/support_message_domain.test.js backend/test/support_message_workflow.test.js',
    'node tool/validate_support_launch_content.mjs',
  ]) {
    assert.ok(regression.includes(command), `missing regression command: ${command}`);
  }
  assert.ok(preflight.includes('node tool/validate_support_launch_content.mjs'));
  assert.match(
    preflight,
    /SIT_REQUIRE_STORE_SUBMISSION[\s\S]*node tool\/validate_support_launch_content\.mjs --require-approved/u,
  );
  for (const field of [
    'SIT_CONSUMER_DISPUTE_APPROVED',
    'SIT_CONSUMER_DISPUTE_CONFIGURATION_VERSION',
    'SIT_CONSUMER_DISPUTE_BODY_NAME',
    'SIT_CONSUMER_DISPUTE_BODY_ADDRESS',
    'SIT_CONSUMER_DISPUTE_BODY_WEBSITE',
    'SIT_CONSUMER_DISPUTE_PARTICIPATION_STATUS',
  ]) {
    assert.ok(builder.includes(field), `release builder missing ${field}`);
  }
});
