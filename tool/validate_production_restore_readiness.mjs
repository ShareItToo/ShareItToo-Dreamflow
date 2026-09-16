#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function fail(message) { throw new Error(message); }

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
  const sourceText = readFileSync(resolve(repositoryRoot, source.path ?? ''), 'utf8');
  const sourceHash = createHash('sha256').update(sourceText).digest('hex');
  if (source.path !== 'backend/ops/verify_restore.sh' ||
      source.sha256 !== sourceHash || source.tcpReadinessHost !== '127.0.0.1' ||
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
  };
}

function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = validateProductionRestoreReadiness({ repositoryRoot });
  process.stdout.write(
    `Production restore readiness: PASS (${result.databaseTables} tables, ${result.uploadFiles} upload files)\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.message ?? 'Production restore validation failed.'}\n`);
    process.exitCode = 1;
  }
}
