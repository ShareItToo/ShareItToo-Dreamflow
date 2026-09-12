#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readConsumerDisputeConfiguration } from
  '../backend/src/consumer_dispute_config.js';

const oldOdrUrlPattern = /https?:\/\/(?:[^/]+\.)?(?:ec\.europa\.eu\/consumers\/odr|consumer-redress\.ec\.europa\.eu|webgate\.ec\.europa\.eu\/odr)(?:[/?#][^\s"'<>)]*)?/iu;
const scannedExtensions = new Set([
  '.dart', '.html', '.js', '.json', '.md', '.mjs', '.txt',
]);
const requiredDisputeEnvironment = Object.freeze([
  'SIT_CONSUMER_DISPUTE_APPROVED',
  'SIT_CONSUMER_DISPUTE_CONFIGURATION_VERSION',
  'SIT_CONSUMER_DISPUTE_BODY_NAME',
  'SIT_CONSUMER_DISPUTE_BODY_ADDRESS',
  'SIT_CONSUMER_DISPUTE_BODY_WEBSITE',
  'SIT_CONSUMER_DISPUTE_PARTICIPATION_STATUS',
]);

function fail(message) {
  throw new Error(message);
}

function containsExternalAiHost(value) {
  return value.toLowerCase().includes(['api', 'openai', 'com'].join('.'));
}

function source(root, path, overrides) {
  return Object.hasOwn(overrides, path)
    ? overrides[path]
    : readFileSync(resolve(root, path), 'utf8');
}

function filesBelow(root, relativePath) {
  const absolute = resolve(root, relativePath);
  const entries = readdirSync(absolute, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) return filesBelow(root, child);
    return scannedExtensions.has(extname(entry.name).toLowerCase()) ? [child] : [];
  });
}

function assertExternalAiFailClosed(root, overrides) {
  const ai = source(root, 'lib/openai/openai_config.dart', overrides);
  for (const marker of [
    'static const bool aiHelpersEnabled = false',
    'static const bool externalAiNetworkAllowed = false',
    'static const bool directAiChatEnabled = false',
    'static const bool directAiTransparencyReady = false',
    'static bool get isAvailable => false',
    'parseSearchQuery',
    'suggestPrice',
    'suggestDiscountTiers',
    'availabilityDiscountTip',
    'suggestCategories',
  ]) {
    if (!ai.includes(marker)) fail(`External-AI fail-closed contract is missing: ${marker}`);
  }
  if (containsExternalAiHost(ai)) {
    fail('Dormant external-AI client path is forbidden: api.openai.com');
  }
  for (const forbidden of [
    /package:http\/http\.dart/u,
    /dart:convert/u,
    /OPENAI_[A-Z_]+/u,
    /http\.(?:post|get|put|delete|patch)\s*\(/u,
    /Uri\.parse\s*\(/u,
    /\bgpt-[a-z0-9.-]+/iu,
    /debugPrint\s*\(/u,
  ]) {
    if (forbidden.test(ai)) fail(`Dormant external-AI client path is forbidden: ${forbidden}`);
  }

  for (const path of filesBelow(root, 'lib')) {
    const content = source(root, path, overrides);
    if (containsExternalAiHost(content)) {
      fail(`External-AI transport or provider marker is forbidden: ${path}`);
    }
    for (const forbidden of [
      /OPENAI_(?:PROXY|API|ENDPOINT|MODEL|KEY)/u,
      /package:(?:google_generative_ai|anthropic|openai)/iu,
      /\bgpt-[a-z0-9.-]+/iu,
      /\bChatGPT\b/iu,
    ]) {
      if (forbidden.test(content)) {
        fail(`External-AI transport or provider marker is forbidden: ${path}`);
      }
    }
  }

  const serverAiFiles = new Set([
    'backend/src/app.js',
    'backend/src/listing_ai_gateway.js',
    'backend/src/listing_ai_gateway_config.js',
    'backend/src/openai_listing_ai_provider.js',
  ]);
  for (const path of filesBelow(root, 'backend/src')) {
    if (serverAiFiles.has(path)) continue;
    const content = source(root, path, overrides);
    if (containsExternalAiHost(content)
        || /OPENAI_(?:PROXY|API|ENDPOINT|MODEL|KEY)|\bgpt-[a-z0-9.-]+|\bChatGPT\b/iu.test(content)) {
      fail(`External-AI transport or provider marker is outside the server allowlist: ${path}`);
    }
  }

  const config = source(root, 'backend/src/listing_ai_gateway_config.js', overrides);
  const gateway = source(root, 'backend/src/listing_ai_gateway.js', overrides);
  const provider = source(root, 'backend/src/openai_listing_ai_provider.js', overrides);
  const app = source(root, 'backend/src/app.js', overrides);
  for (const [content, marker] of [
    [config, "SIT_LISTING_AI_PROVIDER ?? 'disabled'"],
    [config, 'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED'],
    [config, 'listing AI cannot be enabled in production before the release gate'],
    [config, 'secretConfiguredInClient: false'],
    [gateway, 'tools: []'],
    [gateway, 'publicationAllowed: false'],
    [gateway, 'authoritativePriceAllowed: false'],
    [provider, "responsesEndpoint = 'https://api.openai.com/v1/responses'"],
    [provider, 'store: false'],
    [provider, 'detail: \'low\''],
    [provider, 'listing_ai_provider_credentials_conflicting'],
    [provider, 'constants.O_NOFOLLOW'],
    [provider, 'bytes?.fill(0)'],
    [app, 'apiKey: readOpenAiListingAiApiKey(process.env)'],
  ]) {
    if (!content.includes(marker)) {
      fail(`Server listing-AI fail-closed contract is missing: ${marker}`);
    }
  }
  if ((app.match(/readOpenAiListingAiApiKey\(process\.env\)/gu) ?? []).length !== 1
      || /process\.env/u.test(provider)
      || !/OPENAI_API_KEY_FILE/u.test(provider)
      || !/OPENAI_API_KEY/u.test(provider)
      || /process\.env|OPENAI_API_KEY/u.test(gateway)
      || /OPENAI_API_KEY/u.test(config)) {
    fail('Server listing-AI credential boundary is invalid.');
  }

  const privacy = JSON.parse(source(root, 'store/privacy-disclosures.json', overrides));
  if (privacy.externalServices?.openAiHelpers?.enabledInCandidate !== false
      || privacy.externalServices?.openAiHelpers?.endpointEmbedded !== false
      || privacy.externalServices?.openAiHelpers?.dataTypes?.length !== 0) {
    fail('Candidate privacy inventory must keep external AI disabled and endpoint-free.');
  }
}

function assertConsumerDisputeWiring(root, overrides) {
  const flutter = source(root, 'lib/config/consumer_dispute_config.dart', overrides);
  const imprint = source(root, 'lib/screens/legal_imprint_screen.dart', overrides);
  const backend = source(root, 'backend/src/consumer_dispute_config.js', overrides);
  const backendConfig = source(root, 'backend/src/config.js', overrides);
  const publicPages = source(root, 'backend/src/account_actions.js', overrides);
  const app = source(root, 'backend/src/app.js', overrides);
  const domain = source(root, 'backend/src/support_message_domain.js', overrides);
  const workflow = source(root, 'backend/src/support_message_workflow.js', overrides);
  const catalog = source(root, 'backend/src/support_message_templates_v1.json', overrides);

  for (const field of requiredDisputeEnvironment) {
    if (!flutter.includes(field) || !backend.includes(field)) {
      fail(`Consumer-dispute configuration field is not shared across app and server: ${field}`);
    }
  }
  for (const marker of [
    "template.id === 'T-053'",
    "supportCase.case_type !== 'legal_authority'",
    "supportCase.case_subtype !== 'consumer_dispute_information'",
    'support_consumer_dispute_configuration_incomplete',
    'consumer_dispute_configuration_version',
    'serverOnly: consumerDisputeNotice',
  ]) {
    if (!domain.includes(marker)) fail(`T-053 fail-closed binding is missing: ${marker}`);
  }
  for (const marker of [
    "toUpperCase() === 'T-053'",
    'support_consumer_dispute_notice_requires_admin',
    "row.approval_level === 'red_explicit_decision'",
    "row.template_id === 'T-053'",
    'isHumanReviewableMessage(row)',
  ]) {
    if (!workflow.includes(marker)) fail(`T-053 review workflow is missing: ${marker}`);
  }
  for (const [content, marker] of [
    [backendConfig, 'PUBLIC_COMPLIANCE_APPROVED requires a complete approved VSBG configuration'],
    [backendConfig, 'consumerDispute,'],
    [publicPages, 'compliance.approved && consumerDispute.isComplete'],
    [publicPages, "consumerDispute: consumerDispute.isComplete ? 'approved' : 'draft'"],
    [app, 'config.consumerDispute.isComplete'],
  ]) {
    if (!content.includes(marker)) fail(`Public VSBG fail-closed wiring is missing: ${marker}`);
  }
  if (!imprint.includes('ConsumerDisputeConfig.generalInformationText')
      || !catalog.includes('Dieser Hinweis betrifft eine Streitigkeit ueber den Vertrag mit SIT und wird in Textform erteilt.')
      || !catalog.includes('Die fruehere EU-OS-Plattform ist nicht mehr in Betrieb.')) {
    fail('Consumer-dispute app or text-form notice wiring is incomplete.');
  }
}

function assertNoOldOdrLinks(root, overrides, scanDocuments) {
  const paths = scanDocuments ?? [
    ...filesBelow(root, 'lib'),
    ...filesBelow(root, 'assets/legal/de'),
    'backend/src/support_message_templates_v1.json',
  ];
  for (const path of paths) {
    const content = source(root, path, overrides);
    if (oldOdrUrlPattern.test(content)) fail(`Old EU ODR link is forbidden in app/support text: ${path}`);
  }
}

export function validateSupportLaunchContent({
  root,
  sourceOverrides = {},
  environment = process.env,
  requireApproved = false,
  scanDocuments,
} = {}) {
  const repositoryRoot = root ?? resolve(fileURLToPath(new URL('..', import.meta.url)));
  assertExternalAiFailClosed(repositoryRoot, sourceOverrides);
  assertConsumerDisputeWiring(repositoryRoot, sourceOverrides);
  assertNoOldOdrLinks(repositoryRoot, sourceOverrides, scanDocuments);

  const dispute = readConsumerDisputeConfiguration(environment);
  if (requireApproved && (!dispute.isComplete || dispute.oldOdrLinkPresent)) {
    fail('Store/public release requires a complete approved VSBG configuration.');
  }
  return Object.freeze({
    externalAiEnabled: false,
    directAiChatEnabled: false,
    consumerDisputeConfigurationReady: dispute.isComplete,
    oldOdrLinkPresent: false,
    publicReleaseAllowed: requireApproved && dispute.isComplete,
  });
}

function main() {
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--require-approved');
  if (unknown.length) fail(`Unknown argument: ${unknown[0]}`);
  const result = validateSupportLaunchContent({
    requireApproved: process.argv.includes('--require-approved'),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
