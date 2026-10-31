#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function fail(message) { throw new Error(message); }

// The retained restore result predates this notification-only addition. Bind
// the complete prior body without rebinding historical live evidence to newer
// source bytes or implying that the current script ran against a backup.
const recoverySuffix = Buffer.from([
  '# Notification failure cannot retroactively fail the verified restore check.',
  'bash "$(dirname -- "${BASH_SOURCE[0]}")/alert.sh" shareittoo-restore-check.service recovery || true',
  '',
].join('\n'));

export function validateProductionRestoreReadiness({
  repositoryRoot,
  evidencePath = resolve(repositoryRoot,
    'docs/evidence/b11/production-restore-readiness-20260813.json'),
} = {}) {
  const evidenceText = readFileSync(evidencePath, 'utf8');
  const evidence = JSON.parse(evidenceText);
  if (evidence.schemaVersion !== 1 ||
      evidence.kind !== 'sit-production-restore-readiness' ||
      evidence.status !== 'isolated-restore-verified') {
    fail('Production restore-readiness evidence identity is invalid.');
  }
  const backup = evidence.backup ?? {};
  if (!/^\d{8}T\d{6}Z$/.test(backup.backupTimestamp ?? '') ||
      backup.manifestIntegrity !== 'passed' ||
      backup.databaseArchiveReadable !== true ||
      backup.uploadsArchiveReadable !== true) {
    fail('Backup integrity evidence is incomplete.');
  }
  const restore = evidence.restore ?? {};
  if (restore.previousScheduledResult !==
        'failed-transient-initialization-readiness-race' ||
      restore.rootCause !==
        'socket-probe-observed-temporary-postgres-initialization-server' ||
      restore.fix !== 'wait-for-final-postgres-tcp-server' ||
      restore.candidateDryRun !== 'passed' ||
      restore.officialSystemdRun !== 'passed' ||
      !Number.isInteger(restore.databaseTables) || restore.databaseTables < 1 ||
      !Number.isInteger(restore.uploadFiles) || restore.uploadFiles < 0 ||
      restore.temporaryContainersRemaining !== 0 ||
      restore.temporaryVolumesRemaining !== 0) {
    fail('Isolated restore result is incomplete or unsafe.');
  }
  if (Object.values(evidence.automation ?? {}).some((value) => value !== true) ||
      Object.keys(evidence.automation ?? {}).length !== 4 ||
      Object.values(evidence.liveVerification ?? {}).some((value) => value !== true) ||
      Object.keys(evidence.liveVerification ?? {}).length !== 4) {
    fail('Restore automation or live health verification is incomplete.');
  }
  const source = evidence.source ?? {};
  if (source.path !== 'backend/ops/verify_restore.sh') {
    fail('Restore script is not bound to stable TCP readiness.');
  }
  const sourceBytes = readFileSync(resolve(repositoryRoot, source.path));
  const suffixOffset = sourceBytes.length - recoverySuffix.length;
  if (suffixOffset < 0 || !sourceBytes.subarray(suffixOffset).equals(recoverySuffix)) {
    fail('Restore source compatibility requires the exact terminal recovery hook.');
  }
  const historicalBodyHash = createHash('sha256')
    .update(sourceBytes.subarray(0, suffixOffset)).digest('hex');
  const sourceText = sourceBytes.toString('utf8');
  if (source.sha256 !== historicalBodyHash || source.tcpReadinessHost !== '127.0.0.1' ||
      (sourceText.match(/pg_isready -h 127\.0\.0\.1/g) ?? []).length !== 2 ||
      /pg_isready -U shareittoo_restore/.test(sourceText)) {
    fail('Restore script is not bound to stable TCP readiness.');
  }
  const boundaries = evidence.boundaries ?? {};
  if (boundaries.restoreWasIsolated !== true ||
      Object.entries(boundaries).some(([key, value]) =>
        key !== 'restoreWasIsolated' && value !== false) ||
      evidenceText.includes('@')) {
    fail('Production restore boundaries are unsafe or unsanitized.');
  }
  return {
    status: evidence.status,
    databaseTables: restore.databaseTables,
    uploadFiles: restore.uploadFiles,
    retainedEvidenceValidated: true,
    currentSourceCompatible: true,
    currentRuntimeVerified: false,
  };
}

function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = validateProductionRestoreReadiness({ repositoryRoot });
  process.stdout.write(
    `Retained restore evidence validation and current source compatibility PASS (${result.databaseTables} historical tables, ${result.uploadFiles} historical upload files); current runtime NOT VERIFIED\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.message ?? 'Production restore validation failed.'}\n`);
    process.exitCode = 1;
  }
}
