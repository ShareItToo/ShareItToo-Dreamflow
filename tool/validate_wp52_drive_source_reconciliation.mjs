#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp52-drive-source-reconciliation-20260907.json';

const sources = Object.freeze([
  Object.freeze(['v52-core-specification', '1HQR2EWJg6FUcU41l5uwditfFzNoCe6Zx', '01_V5.2_CORE_SPECIFICATION.md', '2026-08-18T17:51:27.257Z', 31826, '4c51ac1001389ebcac57d4502f6d2185eed77a389e63aa27aca4c6594eabceb9']),
  Object.freeze(['v52-legal-folder', '1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2', '02_V5.2_RECHTSMAPPE_PRIVATLAUNCH.pdf', '2026-08-18T17:51:36.056Z', 285180, 'aa6f631457c9b73fdae3c5d4415ba6681b86f63b51df3fd5937c50f80a27b8a8']),
  Object.freeze(['support-source-of-truth', '1j8cpz2uwZBZiu6RLXjPQfo6bAWotUNLN', '09_SIT_SUPPORT_SOURCE_OF_TRUTH_V1.md', '2026-08-20T22:27:16.931Z', 2538, 'ae1ce047453b2efd6e0da80718da57de43a9efb8b93ef4ed6a0850c55abcc80b']),
  Object.freeze(['support-status-machine', '1qj0md6DoHt7lDAfIvFtmMiT0vQ48KbYG', '10_SIT_SUPPORT_STATUS_MACHINE_V1.json', '2026-08-20T22:28:17.857Z', 7532, '3cc58111a6079f9f82ce90d9fed18d4a8b10bd27191777ed30130d03fbbf2f55']),
  Object.freeze(['support-test-matrix', '1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le', '13_SIT_SUPPORT_TEST_MATRIX_V1.md', '2026-08-20T22:29:02.738Z', 21598, '83cc25371f24b3486230f3ac4e2b7e9c26c49a48bd5aca22a5449636c9ffc6d3']),
  Object.freeze(['support-packet-manifest', '1mBarnBNtUV_1wKwEj5KezyNVkdTV4wjJ', '15_SIT_SUPPORT_MANIFEST_SHA256_V1.json', '2026-08-20T22:29:38.186Z', 5028, 'c9fbc7e98374fd366c2a97e59c07547f0b27a67225f5d5954259943ff2f9f9c2']),
]);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function readJson(repositoryRoot, path) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
}

function inspectPrivateShape(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPrivateShape(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phone|accountId|credential|deviceId|serial|ssid|bssid|ipAddress)$/iu.test(key)) {
      fail(`WP52 private field is forbidden: ${[...trail, key].join('.')}`);
    }
    inspectPrivateShape(entry, [...trail, key]);
  }
}

function validateRepositoryBindings(repositoryRoot, value) {
  const legal = readJson(repositoryRoot, 'assets/legal/de/legal_manifest_v52.json');
  const matrix = readJson(
    repositoryRoot,
    'docs/evidence/support/support-test-matrix-v1-traceability.json',
  );
  const scanner = readJson(
    repositoryRoot,
    'docs/evidence/external-gates/support-evidence-scanner-readiness.json',
  );
  const wp49 = readJson(
    repositoryRoot,
    'docs/evidence/release-readiness/wp49-current-candidate-external-intervention-map-20260907.json',
  );

  const byRole = new Map(value.authoritativeSources.map((entry) => [entry.role, entry]));
  if (legal.source?.driveFileId !== byRole.get('v52-legal-folder')?.driveFileId
      || legal.source?.modifiedTime !== byRole.get('v52-legal-folder')?.modifiedTime
      || legal.source?.bytes !== byRole.get('v52-legal-folder')?.bytes
      || legal.source?.sha256 !== byRole.get('v52-legal-folder')?.sha256
      || legal.status !== 'draft-blocked'
      || legal.activationAllowed !== false) {
    fail('WP52 V5.2 legal binding or hold has drifted.');
  }
  if (matrix.source?.driveFileId !== byRole.get('support-test-matrix')?.driveFileId
      || matrix.source?.sha256 !== byRole.get('support-test-matrix')?.sha256
      || matrix.summary?.scenarioCount !== 167
      || matrix.summary?.strictReleaseReady !== false) {
    fail('WP52 Support Packet test-matrix binding has drifted.');
  }
  const scannerSource = scanner.sourceBindings?.drive;
  if (scannerSource?.fileId !== byRole.get('support-source-of-truth')?.driveFileId
      || scannerSource?.modifiedTime !== byRole.get('support-source-of-truth')?.modifiedTime
      || scannerSource?.sha256 !== byRole.get('support-source-of-truth')?.sha256) {
    fail('WP52 Support Packet source-of-truth binding has drifted.');
  }
  if (wp49.repository?.branch !== value.repository.branch
      || wp49.candidate?.buildNumber !== value.repository.candidateBuild
      || wp49.candidate?.candidateSourceHead !== value.repository.candidateSourceHead
      || !exact(wp49.portfolio && {
        done: wp49.portfolio.doneCount,
        partial: wp49.portfolio.partialCount,
        open: wp49.portfolio.openCount,
        decision: wp49.aggregate?.releaseDecision,
        nextLane: wp49.aggregate?.nextLane,
      }, value.reconciliation.portfolio)) {
    fail('WP52 current-candidate portfolio binding has drifted.');
  }

  const supportDomain = readFileSync(resolve(repositoryRoot, 'backend/src/support_case_domain.js'), 'utf8');
  if (!supportDomain.includes(byRole.get('support-status-machine')?.sha256)) {
    fail('WP52 Support Packet status-machine implementation binding has drifted.');
  }
}

export function validateWp52DriveSourceReconciliation({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? readJson(repositoryRoot, evidencePath);
  inspectPrivateShape(value);

  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp52-drive-source-reconciliation'
      || value.status !== 'verified-no-source-drift-external-holds-retained'
      || value.observedOn !== '2026-09-07') {
    fail('WP52 identity is invalid.');
  }
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    baseHead: 'b392964fe118c06d596d446ad10eb93561d19282',
    candidateBuild: '2026090610',
    candidateSourceHead: '2fd793bac970866aa94a2940f28d6bbc3e04e377',
  })) {
    fail('WP52 repository or candidate binding is invalid.');
  }
  if (!exact(value.driveInventory, {
    currentFolder: {
      title: '00_CODEX_AKTUELL_AB_2026-08-20',
      directItemCount: 17,
      latestRelevantProductHandover: '09_SIT_FULL_PILOT_READY_HANDOVER_2026-09-02.md',
    },
    supportFolder: {
      title: '10_SIT_SUPPORT_PACKET_V1_2026-08-20',
      directItemCount: 17,
      packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
      newerPacketFound: false,
    },
  })) {
    fail('WP52 Drive folder inventory is invalid.');
  }
  if (!Array.isArray(value.authoritativeSources)
      || !exact(value.authoritativeSources.map((entry) => [
        entry.role,
        entry.driveFileId,
        entry.title,
        entry.modifiedTime,
        entry.bytes,
        entry.sha256,
      ]), sources)) {
    fail('WP52 authoritative Drive source inventory has drifted.');
  }
  if (!exact(value.contextDocuments, [
    {
      title: '09_SIT_FULL_PILOT_READY_HANDOVER_2026-09-02.md',
      modifiedTime: '2026-09-02T05:26:59.845Z',
      bytes: 7444,
      sha256: 'e08adcf7d72b096157ac807530c0d1b981308935ffc2d4e4e2e122a84d79ab83',
      classification: 'historical-handover-superseded-by-current-repository-evidence',
      productSourceOfTruth: false,
    },
    {
      title: 'MAXIMUS_KONTEXT_UND_BETRIEBSSTAND_2026-09-06.md',
      modifiedTime: '2026-09-07T15:34:02.095Z',
      bytes: 45095,
      sha256: '2ab44e3434e60d45362c88f242a8680415cd241a2385ecd05a28ce6cd790215a',
      classification: 'current-operations-context-non-product-authority',
      productSourceOfTruth: false,
    },
  ])) {
    fail('WP52 context-document authority is invalid.');
  }
  if (!exact(value.reconciliation, {
    v52SourceDrift: false,
    supportSourceDrift: false,
    newerProfessionalLegalApprovalFound: false,
    newerSupportPacketFound: false,
    maximusMayReplaceProductLogic: false,
    maximusMayCloseExternalGates: false,
    supportDeadlineScenario: {
      id: 'SUP-159',
      gate: 'PILOT_BLOCKER',
      condition: 'next-update-overdue',
      currentRepositoryClassification: 'open-owner-action-required',
    },
    portfolio: {
      done: 16,
      partial: 2,
      open: 6,
      decision: 'hold-no-go',
      nextLane: 'staging-backend-parity',
    },
  })) {
    fail('WP52 reconciliation result is invalid or overstated.');
  }
  if (value.boundaries === null
      || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('WP52 cannot claim any external or runtime mutation.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP52 evidence contains private or secret-shaped content.');
  }

  validateRepositoryBindings(repositoryRoot, value);
  return Object.freeze({
    status: value.status,
    sourceCount: value.authoritativeSources.length,
    v52SourceDrift: value.reconciliation.v52SourceDrift,
    supportSourceDrift: value.reconciliation.supportSourceDrift,
    newerSupportPacketFound: value.reconciliation.newerSupportPacketFound,
    portfolio: value.reconciliation.portfolio,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateWp52DriveSourceReconciliation();
    process.stdout.write(
      `WP52 Drive sources valid: status=${result.status}, sources=${result.sourceCount}, `
      + `v52Drift=${result.v52SourceDrift}, supportDrift=${result.supportSourceDrift}, `
      + `newerSupport=${result.newerSupportPacketFound}, `
      + `portfolio=${result.portfolio.done}/${result.portfolio.partial}/${result.portfolio.open}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP52 Drive source reconciliation failed.'}\n`);
    process.exitCode = 1;
  }
}
