#!/usr/bin/env node

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  parseEligibleVault,
  selectLatestEligibleVault,
} from './diagnose_store_review_accounts.mjs';

const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const defaultVaultRoot = join(
  homedir(),
  'Library',
  'Application Support',
  'ShareItToo',
  'qa',
  'staging-accounts',
);

function fail(message) {
  throw new Error(message);
}

function safeIdentifier(value, label) {
  if (typeof value !== 'string'
      || value.length < 1
      || value.length > 160
      || !/^[A-Za-z0-9_.:-]+$/.test(value)) {
    fail(`The ${label} is not a safe synthetic identifier.`);
  }
  return value;
}

async function request(fetchImpl, path, {
  method = 'GET',
  token = null,
  body = undefined,
  headers = {},
  expected = [200],
} = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
    fail('A Staging API path is invalid.');
  }
  let response;
  try {
    response = await fetchImpl(`${stagingApiBaseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    fail(`Staging ${method} request transport failed.`);
  }
  const raw = await response.text();
  let value = null;
  if (raw) {
    try {
      value = JSON.parse(raw);
    } catch {
      fail(`Staging ${method} request did not return JSON.`);
    }
  }
  if (!expected.includes(response.status)) {
    fail(`Staging ${method} request failed with HTTP ${response.status}.`);
  }
  return { status: response.status, headers: response.headers, value };
}

async function login(fetchImpl, account) {
  const result = await request(fetchImpl, '/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  });
  const token = result.value?.accessToken;
  if (typeof token !== 'string' || token.length < 20) {
    fail(`The ${account.role} safety diagnostic login did not return a usable session.`);
  }
  return token;
}

function assertPrivateExport(result, expectedAccountId) {
  const cacheControl = result.headers.get('cache-control') ?? '';
  const disposition = result.headers.get('content-disposition') ?? '';
  const document = result.value;
  const data = document?.data;
  if (!/\bprivate\b/i.test(cacheControl)
      || !/\bno-store\b/i.test(cacheControl)
      || !/attachment;\s*filename="shareittoo-data-export\.json"/i.test(disposition)
      || document?.schemaVersion !== '1.0'
      || document?.accountId !== expectedAccountId
      || data?.account?.id !== expectedAccountId
      || !data.authentication
      || !data.marketplace
      || !data.communication
      || !data.notifications
      || !data.trustAndSafety
      || !data.financialActivity
      || !Array.isArray(data.auditEvents)) {
    fail('The review account export is not private, complete, and bound to the requesting role.');
  }
}

export async function diagnoseStoreReviewSafetyActions({
  vaultRoot = defaultVaultRoot,
  vaultFile = null,
  fetchImpl = globalThis.fetch,
  capturedAt = new Date(),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('A fetch implementation is required.');
  if (!(capturedAt instanceof Date) || !Number.isFinite(capturedAt.getTime())) {
    fail('The evidence timestamp is invalid.');
  }
  const selected = vaultFile ? parseEligibleVault(vaultFile) : selectLatestEligibleVault(vaultRoot);
  const ownerToken = await login(fetchImpl, selected.accounts.get('owner'));
  const renterToken = await login(fetchImpl, selected.accounts.get('renter'));
  const [ownerMe, renterMe] = await Promise.all([
    request(fetchImpl, '/auth/me', { token: ownerToken }),
    request(fetchImpl, '/auth/me', { token: renterToken }),
  ]);
  const ownerId = safeIdentifier(ownerMe.value?.user?.id, 'owner account');
  const renterId = safeIdentifier(renterMe.value?.user?.id, 'renter account');
  if (ownerId === renterId) fail('The synthetic review roles are not distinct.');

  const accountExport = await request(fetchImpl, '/account/export', {
    method: 'POST',
    token: renterToken,
    body: { currentPassword: selected.accounts.get('renter').password },
  });
  assertPrivateExport(accountExport, renterId);

  const report = await request(fetchImpl, '/reports', {
    method: 'POST',
    token: renterToken,
    headers: { 'Idempotency-Key': `${selected.fixture.bookingId}-store-review-report` },
    body: {
      targetType: 'listing',
      targetId: selected.fixture.listingId,
      reasonCode: 'controlled_store_review_diagnostic',
      details: 'Kontrollierter synthetischer Store-Review-Nachweis.',
      evidenceUploadIds: [],
    },
    expected: [200, 201],
  });
  const reportId = safeIdentifier(report.value?.report?.id, 'report');
  if (report.value?.report?.targetType !== 'listing'
      || report.value?.report?.targetId !== selected.fixture.listingId
      || !['open', 'triaged', 'investigating', 'actioned'].includes(report.value?.report?.status)) {
    fail('The controlled synthetic listing report was not accepted.');
  }
  const mine = await request(fetchImpl, '/reports/mine', { token: renterToken });
  if (!Array.isArray(mine.value?.reports)
      || !mine.value.reports.some((entry) => entry?.id === reportId)) {
    fail('The controlled synthetic report is not visible to its reporter.');
  }

  let blockCreated = false;
  let blockRemoved = false;
  try {
    await request(fetchImpl, `/user-blocks/${encodeURIComponent(ownerId)}`, {
      method: 'PUT',
      token: renterToken,
      body: { reasonCode: 'controlled_store_review_diagnostic' },
      expected: [204],
    });
    blockCreated = true;
    const active = await request(fetchImpl, '/user-blocks', { token: renterToken });
    if (!Array.isArray(active.value?.blocks)
        || !active.value.blocks.some((entry) => entry?.userId === ownerId)) {
      fail('The controlled synthetic user block is not visible to its creator.');
    }
  } finally {
    if (blockCreated) {
      await request(fetchImpl, `/user-blocks/${encodeURIComponent(ownerId)}`, {
        method: 'DELETE',
        token: renterToken,
        expected: [204],
      });
      await request(fetchImpl, `/message-threads/${encodeURIComponent(selected.fixture.threadId)}`, {
        method: 'PATCH',
        token: renterToken,
        body: { archived: false },
      });
      const remaining = await request(fetchImpl, '/user-blocks', { token: renterToken });
      blockRemoved = Array.isArray(remaining.value?.blocks)
        && !remaining.value.blocks.some((entry) => entry?.userId === ownerId);
      if (!blockRemoved) fail('The temporary synthetic user block was not removed.');
    }
  }
  if (!blockCreated || !blockRemoved) fail('The temporary synthetic block cycle did not complete.');
  const threads = await request(fetchImpl, '/message-threads', { token: renterToken });
  if (!Array.isArray(threads.value?.threads)
      || !threads.value.threads.some((entry) => entry?.id === selected.fixture.threadId)) {
    fail('The prepared review chat was not restored after the temporary block cycle.');
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: 'store-review-safety-actions-diagnostic',
    status: 'report-block-export-passed-deletion-pending',
    capturedAt: capturedAt.toISOString(),
    scenarios: {
      reportAndBlock: 'passed',
      accountExport: 'passed',
      accountDeletion: 'pending',
    },
    checks: {
      privateNoStoreAccountExport: true,
      completeStructuredAccountExport: true,
      syntheticListingReportCreated: true,
      reportVisibleToReporter: true,
      temporaryUserBlockCreated: true,
      temporaryUserBlockRemoved: true,
      sharedChatRestored: true,
    },
    environment: {
      apiBaseUrl: stagingApiBaseUrl,
      fixtureKind: selected.fixtureKind,
      paymentMode: 'memory',
      stripeLivemode: false,
      paymentEndpointCalled: false,
    },
    boundaries: {
      authenticationSessionsCreated: true,
      auditEventCreatedByExport: true,
      syntheticModerationRecordCreated: true,
      lastingUserBlockCreated: false,
      reviewerAccountDeleted: false,
      containsSecrets: false,
      containsEmailAddresses: false,
      containsTokens: false,
      containsAccountIdentifiers: false,
      containsFixtureIdentifiers: false,
      syntheticAccountsOnly: true,
      bindingContractRequiredForDiagnostic: false,
      publicStoreChanged: false,
      productionChanged: false,
    },
  });
}

function cliOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--vault-root' && argv[index + 1]) options.vaultRoot = resolve(argv[++index]);
    else if (argv[index] === '--vault-file' && argv[index + 1]) options.vaultFile = resolve(argv[++index]);
    else fail(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  diagnoseStoreReviewSafetyActions(cliOptions(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
