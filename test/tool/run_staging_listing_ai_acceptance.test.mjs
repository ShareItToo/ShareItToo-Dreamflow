import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  listingAiDraftFieldKeys,
} from '../../backend/src/listing_ai_draft_domain.js';
import {
  runStagingListingAiAcceptance,
} from '../../tool/run_staging_listing_ai_acceptance.mjs';

const commit = 'a'.repeat(40);
const ownerEmail = 'owner+wp08@example.test';
const ownerPassword = ['private', 'test', 'password', 'not', 'real'].join('-');
const renterPassword = ['second', 'private', 'test', 'password', 'not', 'real'].join('-');
const token = ['test', 'access', 'token', 'not', 'real'].join('-');
const imageReference = 'listing_image_wp08_opaque_reference';

function response(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function testPath(url) {
  return new URL(url).pathname.replace(/^\/api(?:\/v1)?/u, '');
}

function providerField(value, confidence = 'HIGH') {
  return {
    value,
    confidence,
    source: {
      type: 'provider_output',
      imageReference,
      detail: 'visible synthetic acceptance fixture',
    },
    confirmationRequired: true,
    reasonCode: confidence === 'LOW' ? 'insufficient_visible_evidence' : 'visible_fixture',
    ownerConfirmed: false,
    promptVersion: 'listing-ai-prompt-v1',
    schemaVersion: 'listing-ai-draft-v1',
  };
}

function assistant(draftId) {
  const fields = Object.fromEntries(listingAiDraftFieldKeys.map((key) => [
    key,
    providerField(null, 'LOW'),
  ]));
  Object.assign(fields, {
    title: providerField('Blauer Akku-Bohrschrauber'),
    category: providerField('cat8'),
    subcategory: providerField('Bohrmaschinen'),
    description: providerField('Ein blauer Akku-Bohrschrauber mit eingesetztem Akku.'),
    condition: providerField('good', 'MEDIUM'),
    accessories: providerField([], 'MEDIUM'),
    projectTags: providerField(['bohren'], 'MEDIUM'),
    useCases: providerField(['bohren'], 'MEDIUM'),
  });
  return {
    workflowVersion: 'N6-2026-08-24.1',
    status: 'draft_ready',
    revision: {
      domainVersion: 'N2-2026-08-23.1',
      schemaVersion: 'listing-ai-draft-v1',
      promptVersion: 'listing-ai-prompt-v1',
      draftId,
      ownerId: 'wp08-owner-principal',
      revision: 1,
      generationMode: 'provider',
      imageReferences: [imageReference],
      fields,
      clarificationQuestions: [],
      ownerConfirmations: {},
      generatedAt: '2026-09-05T00:00:00.000Z',
      publicationAction: 'explicit_owner_action_required',
      autoPublishAllowed: false,
      historicalListingRewriteAllowed: false,
      payloadSha256: 'b'.repeat(64),
    },
    imageReview: {
      realImageSafetyReviewCompleted: true,
      temporaryDerivativeBytesPurged: true,
      originalMetadataRetained: false,
    },
    disclosureVersion: 'listing-ai-image-disclosure-v1',
    disclosureAccepted: true,
    clarificationLimit: 3,
    ownerConfirmationIds: [],
    providerCallCount: 2,
    paidCallPerformed: true,
    estimatedCostCents: 2,
    billedCostCents: null,
    autoPublishAllowed: false,
  };
}

async function privateVault(t) {
  const directory = await mkdtemp(join(tmpdir(), 'sit-wp08-listing-ai-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'accounts.json');
  await writeFile(path, `${JSON.stringify({
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    runId: 'n22-wp08-test-fixture',
    status: 'email-linked-product-journey-retired',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    stripeLivemode: false,
    verificationMethod: 'email-link',
    accounts: [
      {
        role: 'owner',
        displayName: 'SIT Test Owner',
        email: ownerEmail,
        password: ownerPassword,
        registrationStatus: 'accepted',
        verificationStatus: 'email-link-verified',
      },
      {
        role: 'renter',
        displayName: 'SIT Test Renter',
        email: 'renter+wp08@example.test',
        password: renterPassword,
        registrationStatus: 'accepted',
        verificationStatus: 'email-link-verified',
      },
    ],
  })}\n`, { mode: 0o600 });
  return path;
}

function successfulFetch({ changeInventory = false } = {}) {
  let inventoryReads = 0;
  return async (url, options = {}) => {
    const path = testPath(url);
    if (path === '/version') return response(200, { commit });
    if (path === '/health/ready') {
      return response(200, {
        listingAi: {
          status: 'enabled',
          provider: 'openai',
          model: 'gpt-4o-mini-2024-07-18',
          promptVersion: 'listing-ai-prompt-v1',
          schemaVersion: 'listing-ai-draft-v1',
          budgetCents: 500,
          externalProviderExecutionAllowed: true,
          automaticPublicationAllowed: false,
        },
      });
    }
    if (path === '/auth/login') {
      assert.deepEqual(JSON.parse(options.body), {
        email: ownerEmail,
        password: ownerPassword,
      });
      return response(200, { accessToken: token });
    }
    assert.equal(options.headers.authorization, `Bearer ${token}`);
    if (path === '/auth/me') {
      return response(200, { user: { id: 'wp08-owner-principal', email: ownerEmail } });
    }
    if (path === '/listings/mine') {
      inventoryReads += 1;
      return response(200, {
        listings: inventoryReads === 2 && changeInventory
          ? [{ id: 'unexpected-auto-publication' }]
          : [],
      });
    }
    if (path === '/uploads') {
      assert.equal(options.method, 'POST');
      assert.ok(options.body instanceof FormData);
      return response(201, {
        url: 'https://staging.shareittoo.com/api/v1/uploads/listing_image_wp08_opaque_reference',
      });
    }
    if (path === '/blue-ocean/listing-drafts/analyze') {
      const body = JSON.parse(options.body);
      assert.equal(body.consent.explicitlyInitiated, true);
      assert.equal(body.consent.accepted, true);
      assert.equal(body.consent.disclosureVersion, 'listing-ai-image-disclosure-v1');
      assert.equal(Object.hasOwn(body, 'explicitAction'), false);
      return response(201, { assistant: assistant(body.draftId), replayed: false });
    }
    throw new Error(`Unexpected test request: ${path}`);
  };
}

test('accepts one real-provider-shaped Staging draft without publication or secret output', async (t) => {
  const result = await runStagingListingAiAcceptance({
    vaultFile: await privateVault(t),
    expectedCommit: commit,
    fetchImpl: successfulFetch(),
    random: () => Buffer.alloc(16, 7),
  });
  assert.deepEqual(result, {
    status: 'real-staging-listing-ai-draft-accepted',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    backendCommit: commit,
    provider: 'openai',
    model: 'gpt-4o-mini-2024-07-18',
    budgetCents: 500,
    fixtureSha256: '85458cb5bc4777c587bfb8994ff0f960c8549f5423df9cc33b4c90fc65ffd420',
    catalogPair: 'cat8/Bohrmaschinen',
    titleSuggested: true,
    descriptionSuggested: true,
    conditionRequiresOwnerReview: true,
    replacementValueRequiresOwnerReview: true,
    providerOutputSha256: result.providerOutputSha256,
    providerCallCount: 2,
    estimatedCostCents: 2,
    billedCostKnown: false,
    temporaryDerivativeBytesPurged: true,
    listingInventoryUnchanged: true,
    automaticPublicationAllowed: false,
    containsCredentials: false,
    containsTokens: false,
    containsEmailAddresses: false,
    containsFixtureIdentifiers: false,
  });
  assert.match(result.providerOutputSha256, /^[0-9a-f]{64}$/u);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(ownerEmail), false);
  assert.equal(serialized.includes(ownerPassword), false);
  assert.equal(serialized.includes(token), false);
});

test('rejects a mock Staging provider before authenticating an owner', async (t) => {
  const vaultFile = await privateVault(t);
  let requests = 0;
  await assert.rejects(runStagingListingAiAcceptance({
    vaultFile,
    expectedCommit: commit,
    fetchImpl: async (url) => {
      requests += 1;
      const path = testPath(url);
      if (path === '/version') return response(200, { commit });
      return response(200, {
        listingAi: {
          status: 'enabled',
          provider: 'mock',
          externalProviderExecutionAllowed: false,
          automaticPublicationAllowed: false,
        },
      });
    },
  }), /exact approved Listing-AI provider boundary/u);
  assert.equal(requests, 2);
});

test('rejects any owner listing inventory change after analysis', async (t) => {
  await assert.rejects(runStagingListingAiAcceptance({
    vaultFile: await privateVault(t),
    expectedCommit: commit,
    fetchImpl: successfulFetch({ changeInventory: true }),
    random: () => Buffer.alloc(16, 8),
  }), /changed the owner listing inventory without publication/u);
});
