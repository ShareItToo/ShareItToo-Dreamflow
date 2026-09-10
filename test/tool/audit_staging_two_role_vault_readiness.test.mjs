import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertNoActiveStagingTwoRoleSource,
  auditStagingTwoRoleVaultReadiness,
} from '../../tool/audit_staging_two_role_vault_readiness.mjs';

function root() {
  const value = mkdtempSync(join(tmpdir(), 'sit-two-role-vault-audit-'));
  chmodSync(value, 0o700);
  return value;
}

function writeVault(rootPath, name, status) {
  const file = join(rootPath, name);
  writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    status,
  }), { mode: 0o600 });
  chmodSync(file, 0o600);
}

test('accepts an owner-only QA vault containing only retired two-role journeys', () => {
  const vaultRoot = root();
  try {
    writeVault(vaultRoot, 'retired.json', 'email-linked-product-journey-retired');
    const result = auditStagingTwoRoleVaultReadiness({ vaultRoot });
    assert.deepEqual(result, {
      schemaVersion: 1,
      kind: 'sit-staging-two-role-vault-readiness',
      rootPresent: true,
      recognizedVaultCount: 1,
      activeSourceVaultCount: 0,
      retiredJourneyVaultCount: 1,
      otherRecognizedVaultCount: 0,
      invalidRecognizedVaultCount: 0,
      unsafeEntryCount: 0,
      unsafeEntryKinds: { symlink: 0, directory: 0, file: 0, depth: 0, invalidJson: 0 },
      freshSourceProvenanceAvailable: false,
      safeForFreshSourceProvisioning: true,
      containsCredentialMaterial: false,
      containsPrivatePath: false,
    });
    assert.equal(assertNoActiveStagingTwoRoleSource(result), result);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
  }
});

test('refuses an existing active source even when its file is owner-only', () => {
  const vaultRoot = root();
  try {
    writeVault(vaultRoot, 'active.json', 'email-link-verified-ready-for-login');
    const result = auditStagingTwoRoleVaultReadiness({ vaultRoot });
    assert.equal(result.activeSourceVaultCount, 1);
    assert.equal(result.safeForFreshSourceProvisioning, false);
    assert.throws(() => assertNoActiveStagingTwoRoleSource(result), /cannot be provisioned safely/u);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
  }
});

test('refuses symlinked or non-owner-only material without exposing its path', () => {
  const vaultRoot = root();
  try {
    const nested = join(vaultRoot, 'nested');
    mkdirSync(nested, { mode: 0o700 });
    chmodSync(nested, 0o700);
    symlinkSync('/tmp', join(nested, 'unexpected-link'));
    const result = auditStagingTwoRoleVaultReadiness({ vaultRoot });
    assert.equal(result.unsafeEntryCount, 1);
    assert.equal(result.unsafeEntryKinds.symlink, 1);
    assert.equal(result.containsPrivatePath, false);
    assert.throws(() => assertNoActiveStagingTwoRoleSource(result), /cannot be provisioned safely/u);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
  }
});
