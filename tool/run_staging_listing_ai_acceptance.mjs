#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  listingAiDraftFieldKeys,
} from '../backend/src/listing_ai_draft_domain.js';
import {
  privatePilotAllowedCatalogKeys,
  privatePilotCatalogKey,
} from '../backend/src/private_pilot_domain.js';
import {
  readEmailVerifiedJourneyVault,
} from './run_staging_email_verified_two_role_journey.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingOrigin = 'https://staging.shareittoo.com';
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const reviewedModel = 'gpt-4o-mini-2024-07-18';
const fixturePath = resolve(
  repositoryRoot,
  'test/fixtures/listing-ai/generic-cordless-drill.png',
);
const fixtureSha256 = '85458cb5bc4777c587bfb8994ff0f960c8549f5423df9cc33b4c90fc65ffd420';
const expectedDrillSubcategories = new Set(['Bohrmaschinen', 'Elektrowerkzeuge']);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeCommit(value) {
  const commit = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    fail('The exact expected Staging commit is required.');
  }
  return commit;
}

function safeError(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/u.test(value)
    ? value
    : null;
}

function verifiedFixture(path) {
  const candidate = resolve(path);
  let descriptor;
  let bytes;
  try {
    descriptor = openSync(
      candidate,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC,
    );
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size < 100 || metadata.size > 4 * 1024 * 1024) {
      fail('The Listing-AI acceptance image is invalid.');
    }
    bytes = readFileSync(descriptor);
  } catch (error) {
    if (error?.message === 'The Listing-AI acceptance image is invalid.') throw error;
    fail('The Listing-AI acceptance image is invalid.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (sha256(bytes) !== fixtureSha256) {
    fail('The Listing-AI acceptance image does not match the reviewed fixture.');
  }
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    fail('The Listing-AI acceptance image is not the expected PNG fixture.');
  }
  return bytes;
}

async function apiRequest(fetchImpl, path, {
  method = 'GET',
  token = null,
  body = undefined,
  expected = [200],
  timeoutMs = 20_000,
  releaseEndpoint = false,
} = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
    fail('A Staging Listing-AI API path is invalid.');
  }
  const form = typeof FormData !== 'undefined' && body instanceof FormData;
  const requestUrl = releaseEndpoint
    ? `${stagingOrigin}/api${path}`
    : `${stagingApiBaseUrl}${path}`;
  const response = await fetchImpl(requestUrl, {
    method,
    headers: {
      accept: 'application/json',
      'cache-control': 'no-store',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined || form ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined || form ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  let value = null;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    value = null;
  }
  if (!expected.includes(response.status)) {
    const code = safeError(value?.error);
    fail(
      `Staging ${method} Listing-AI request failed with HTTP ${response.status}`
      + `${code ? ` (${code})` : ''}.`,
    );
  }
  return value;
}

function exactListingIds(payload) {
  if (!Array.isArray(payload?.listings)) {
    fail('The owner listing inventory is invalid.');
  }
  const identifiers = payload.listings.map((listing) => listing?.id);
  if (identifiers.some((id) => typeof id !== 'string' || id.length < 1)) {
    fail('The owner listing inventory contains an invalid identifier.');
  }
  return identifiers.sort();
}

function validateProviderDraft(assistant, draftId) {
  if (assistant?.status !== 'draft_ready'
      || assistant.workflowVersion !== 'N6-2026-08-24.1'
      || assistant.disclosureVersion !== 'listing-ai-image-disclosure-v1'
      || assistant.disclosureAccepted !== true
      || assistant.autoPublishAllowed !== false
      || assistant.paidCallPerformed !== true
      || assistant.providerCallCount !== 2
      || !Number.isSafeInteger(assistant.estimatedCostCents)
      || assistant.estimatedCostCents < 0
      || assistant.estimatedCostCents > 4
      || assistant.billedCostCents !== null
      || assistant.imageReview?.realImageSafetyReviewCompleted !== true
      || assistant.imageReview?.temporaryDerivativeBytesPurged !== true
      || assistant.imageReview?.originalMetadataRetained !== false) {
    fail('The real Staging Listing-AI result does not satisfy the reviewed safety contract.');
  }
  const revision = assistant.revision;
  if (revision?.draftId !== draftId
      || revision.revision !== 1
      || revision.generationMode !== 'provider'
      || !Array.isArray(revision.imageReferences)
      || revision.imageReferences.length !== 1
      || !Array.isArray(revision.clarificationQuestions)
      || revision.clarificationQuestions.length > 3) {
    fail('The real Staging Listing-AI revision identity is invalid.');
  }
  const fields = revision.fields;
  if (!fields || Object.keys(fields).sort().join('\n') !== [...listingAiDraftFieldKeys].sort().join('\n')) {
    fail('The real Staging Listing-AI draft field set is invalid.');
  }
  for (const key of listingAiDraftFieldKeys) {
    const field = fields[key];
    if (!field
        || !['HIGH', 'MEDIUM', 'LOW'].includes(field.confidence)
        || field.source?.type !== 'provider_output'
        || field.ownerConfirmed !== false) {
      fail(`The real Staging Listing-AI ${key} field is not an unconfirmed provider suggestion.`);
    }
  }
  for (const key of ['title', 'description', 'category', 'subcategory']) {
    if (typeof fields[key].value !== 'string' || fields[key].value.trim().length === 0) {
      fail(`The clear drill fixture did not produce a usable ${key} suggestion.`);
    }
  }
  const catalogKey = privatePilotCatalogKey(fields.category.value, fields.subcategory.value);
  if (!privatePilotAllowedCatalogKeys.includes(catalogKey)) {
    fail('The real Staging Listing-AI draft selected a catalog pair outside the private pilot.');
  }
  if (fields.category.value !== 'cat8'
      || !expectedDrillSubcategories.has(fields.subcategory.value)) {
    fail('The clear drill fixture was not recognized as an allowed drill or power-tool item.');
  }
  if (fields.replacementValueMinor.value !== null
      && fields.replacementValueMinor.ownerConfirmed !== false) {
    fail('The provider attempted to create an owner-confirmed value claim.');
  }
  return {
    catalogPair: `${fields.category.value}/${fields.subcategory.value}`,
    titleSuggested: true,
    descriptionSuggested: true,
    conditionRequiresOwnerReview: fields.condition.confirmationRequired === true,
    replacementValueRequiresOwnerReview:
      fields.replacementValueMinor.confirmationRequired === true,
    outputSha256: sha256(Buffer.from(JSON.stringify(assistant), 'utf8')),
  };
}

export async function runStagingListingAiAcceptance({
  vaultFile,
  expectedCommit,
  imagePath = fixturePath,
  fetchImpl = globalThis.fetch,
  random = randomBytes,
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof random !== 'function') {
    fail('The Listing-AI acceptance dependencies are invalid.');
  }
  const commit = safeCommit(expectedCommit);
  const image = verifiedFixture(imagePath);
  const version = await apiRequest(fetchImpl, '/version', { releaseEndpoint: true });
  if (version?.commit !== commit) {
    fail('The Staging backend is not running the exact expected commit.');
  }
  const readiness = await apiRequest(fetchImpl, '/health/ready', { releaseEndpoint: true });
  if (readiness?.listingAi?.status !== 'enabled'
      || readiness.listingAi.provider !== 'openai'
      || readiness.listingAi.model !== reviewedModel
      || readiness.listingAi.promptVersion !== 'listing-ai-prompt-v1'
      || readiness.listingAi.schemaVersion !== 'listing-ai-draft-v1'
      || !Number.isSafeInteger(readiness.listingAi.budgetCents)
      || readiness.listingAi.budgetCents < 4
      || readiness.listingAi.budgetCents > 500
      || readiness.listingAi.externalProviderExecutionAllowed !== true
      || readiness.listingAi.automaticPublicationAllowed !== false) {
    fail('The Staging backend does not expose the exact approved Listing-AI provider boundary.');
  }

  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  const owner = vault.accounts.find((account) => account.role === 'owner');
  if (!owner) fail('The private acceptance vault has no exact owner role.');
  const session = await apiRequest(fetchImpl, '/auth/login', {
    method: 'POST',
    body: { email: owner.email, password: owner.password },
  });
  if (typeof session?.accessToken !== 'string' || session.accessToken.length < 20) {
    fail('The owner login did not return a usable Staging session.');
  }
  const me = await apiRequest(fetchImpl, '/auth/me', { token: session.accessToken });
  if (typeof me?.user?.id !== 'string'
      || String(me.user.email ?? '').toLowerCase() !== owner.email.toLowerCase()) {
    fail('The Staging session is not bound to the exact acceptance owner.');
  }

  const beforeIds = exactListingIds(await apiRequest(
    fetchImpl,
    '/listings/mine',
    { token: session.accessToken },
  ));
  const form = new FormData();
  form.append('purpose', 'listing_image');
  form.append('file', new Blob([image], { type: 'image/png' }), 'sit-listing-ai-drill.png');
  const upload = await apiRequest(fetchImpl, '/uploads', {
    method: 'POST',
    token: session.accessToken,
    body: form,
    expected: [201],
  });
  if (typeof upload?.url !== 'string'
      || !upload.url.startsWith('https://staging.shareittoo.com/')) {
    fail('The Listing-AI fixture upload did not return an exact Staging URL.');
  }

  const opaqueRunId = random(16).toString('hex');
  const draftId = `listing_ai_draft_wp08_${opaqueRunId}`;
  const generationKey = sha256(Buffer.from(`wp08:${opaqueRunId}`, 'utf8'));
  const response = await apiRequest(fetchImpl, '/blue-ocean/listing-drafts/analyze', {
    method: 'POST',
    token: session.accessToken,
    timeoutMs: 60_000,
    expected: [201],
    body: {
      draftId,
      generationKey,
      photoUrls: [upload.url],
      consent: {
        explicitlyInitiated: true,
        accepted: true,
        disclosureVersion: 'listing-ai-image-disclosure-v1',
        disclosureText:
          'SIT analysiert deine ausgewählten Bilder mit einem externen KI-Dienst, um einen bearbeitbaren Anzeigenentwurf zu erstellen. Es wird nichts automatisch veröffentlicht.',
      },
    },
  });
  if (response?.replayed !== false) {
    fail('The real Listing-AI acceptance request was unexpectedly replayed.');
  }
  const providerDraft = validateProviderDraft(response?.assistant, draftId);
  const afterIds = exactListingIds(await apiRequest(
    fetchImpl,
    '/listings/mine',
    { token: session.accessToken },
  ));
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
    fail('The Listing-AI analysis changed the owner listing inventory without publication.');
  }

  return Object.freeze({
    status: 'real-staging-listing-ai-draft-accepted',
    apiBaseUrl: stagingApiBaseUrl,
    backendCommit: commit,
    provider: 'openai',
    model: reviewedModel,
    budgetCents: readiness.listingAi.budgetCents,
    fixtureSha256,
    catalogPair: providerDraft.catalogPair,
    titleSuggested: providerDraft.titleSuggested,
    descriptionSuggested: providerDraft.descriptionSuggested,
    conditionRequiresOwnerReview: providerDraft.conditionRequiresOwnerReview,
    replacementValueRequiresOwnerReview:
      providerDraft.replacementValueRequiresOwnerReview,
    providerOutputSha256: providerDraft.outputSha256,
    providerCallCount: response.assistant.providerCallCount,
    estimatedCostCents: response.assistant.estimatedCostCents,
    billedCostKnown: false,
    temporaryDerivativeBytesPurged: true,
    listingInventoryUnchanged: true,
    automaticPublicationAllowed: false,
    containsCredentials: false,
    containsTokens: false,
    containsEmailAddresses: false,
    containsFixtureIdentifiers: false,
  });
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const vaultFile = argumentValue(args, '--vault-file')
    ?? fail('--vault-file is required.');
  if (!isAbsolute(vaultFile)) fail('--vault-file must be absolute.');
  const result = await runStagingListingAiAcceptance({
    vaultFile,
    expectedCommit: argumentValue(args, '--expected-commit')
      ?? fail('--expected-commit is required.'),
    ...(argumentValue(args, '--image') == null
      ? {}
      : { imagePath: resolve(argumentValue(args, '--image')) }),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error?.message ?? 'The real Staging Listing-AI acceptance failed safely.'}\n`);
    process.exitCode = 1;
  });
}
