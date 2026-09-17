#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp147-current-external-pilot-gate-refresh-20260914.json';
const handoverPath =
  'docs/operations/WP147_CURRENT_EXTERNAL_PILOT_GATE_REFRESH_2026-09-14.md';

function fail(message) {
  throw new Error(`WP147 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function defaultGitShow(repositoryRoot, revision, path) {
  return execFileSync('git', ['-C', repositoryRoot, 'show', `${revision}:${path}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function digestAtExactRevision(repositoryRoot, revision, path, gitShow = defaultGitShow) {
  if (!/^[A-Za-z0-9._/-]+$/u.test(path)) {
    fail(`source inventory path ${path} is invalid.`);
  }
  let bytes;
  try {
    bytes = gitShow(repositoryRoot, revision, path);
  } catch {
    fail(`source inventory ${path} is unavailable at exact revision ${revision}.`);
  }
  if (!Buffer.isBuffer(bytes)) fail(`source inventory ${path} did not return Git blob bytes.`);
  return createHash('sha256')
    .update(bytes)
    .digest('hex');
}

export function validateWp147CurrentExternalPilotGateRefresh({
  evidence,
  repositoryRoot = root,
  gitShow = defaultGitShow,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));

  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-wp147-current-external-pilot-gate-refresh', 'kind');
  exact(value?.status, 'verified-external-gates-still-fail-closed', 'status');
  exact(value?.repository, {
    branch: 'codex/master-workflow-20260808',
    baselineHead: '6132c363c6ef98afd1a81dad1d37ae43b6727c10',
    clean: true,
    remoteAhead: 0,
    remoteBehind: 0,
  }, 'repository');

  const drive = value?.driveReadback;
  exact(drive?.authenticatedReadOnly, true, 'Drive authentication');
  exact(drive?.driveChanged, false, 'Drive mutation');
  exact(drive?.currentFolder, {
    title: '00_CODEX_AKTUELL_AB_2026-08-20',
    directItemCount: 17,
    newerProfessionalLegalApprovalFound: false,
    newerP0bDecisionArtifactFound: false,
  }, 'Drive current folder');
  exact(drive?.v52, {
    coreTitle: '01_V5.2_CORE_SPECIFICATION.md',
    coreModifiedTime: '2026-08-18T17:51:27.257Z',
    legalTitle: '02_V5.2_RECHTSMAPPE_PRIVATLAUNCH.pdf',
    legalModifiedTime: '2026-08-18T17:51:36.056Z',
    sourceDrift: false,
    professionalApprovalPresent: false,
    sourceDisclosure: 'Entschiedene Launchfassung - keine anwaltliche Freigabe',
  }, 'Drive V5.2 result');
  exact(drive?.support, {
    folderTitle: '10_SIT_SUPPORT_PACKET_V1_2026-08-20',
    directItemCount: 17,
    newerPacketFound: false,
    sourceDrift: false,
    requiresProfessionalReviewBeforeRealMoney: true,
  }, 'Drive Support result');

  exact(value?.stripeReadback, {
    officialConnectorAuthenticated: true,
    accountCount: 1,
    selectedAccountName: 'ShareItToo Sandbox',
    accountMode: 'sandbox',
    livemode: false,
    connectedAccountCount: 0,
    webhookDestinationCount: 0,
    providerMutationPerformed: false,
    testMoneyPerformed: false,
    realMoneyPerformed: false,
  }, 'Stripe result');
  exact(value?.gateResults, {
    professionalV52Approval: 'OPEN',
    approvedImmutableLegalSnapshots: 'OPEN',
    marketplaceProviderContractAndConfiguration: 'OPEN',
    stripeSandboxPaymentRefundPayout: 'PARTIAL',
    invitedSyntheticPilot: 'HOLD',
    invitedSyntheticPilotPrerequisitesPassed: 0,
    invitedSyntheticPilotPrerequisiteCount: 4,
    stagingPaymentTransport: 'memory',
  }, 'gate results');
  exact(value?.portfolio, { pass: 22, partial: 5, open: 5 }, 'portfolio');
  exact(value?.nextIndependentLane, 'social-provider-readiness-audit', 'next lane');

  if (value?.boundaries === null
      || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('cannot claim an external or live mutation.');
  }
  if (Object.keys(value?.sourceInventory ?? {}).length !== 7) {
    fail('source inventory is incomplete.');
  }
  for (const [path, expected] of Object.entries(value.sourceInventory)) {
    exact(
      digestAtExactRevision(repositoryRoot, value.repository.baselineHead, path, gitShow),
      expected,
      `source inventory ${path}`,
    );
  }

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('evidence contains private or secret-shaped content.');
  }
  const handover = readFileSync(resolve(repositoryRoot, handoverPath), 'utf8');
  for (const marker of [
    'EXTERNAL GATES REMAIN FAIL-CLOSED',
    'keine anwaltliche Freigabe',
    'zero connected',
    'accounts and zero webhook destinations',
    '22 PASS / 5 PARTIAL / 5 OPEN',
    'No Drive, legal, Stripe, payment, deployment, Production, Store, Firebase',
  ]) {
    if (!handover.includes(marker)) fail('handover is incomplete.');
  }
  return Object.freeze({
    status: value.status,
    portfolio: value.portfolio,
    stripeConnectedAccounts: value.stripeReadback.connectedAccountCount,
    stripeWebhookDestinations: value.stripeReadback.webhookDestinationCount,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp147CurrentExternalPilotGateRefresh();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP147 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
