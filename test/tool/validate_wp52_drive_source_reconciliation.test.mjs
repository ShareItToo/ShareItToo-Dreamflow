import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp52DriveSourceReconciliation,
} from '../../tool/validate_wp52_drive_source_reconciliation.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp52-drive-source-reconciliation-20260907.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateWp52DriveSourceReconciliation({
    repositoryRoot: root,
    evidence: changed,
  });
}

test('accepts the exact read-only WP52 Drive source reconciliation', () => {
  assert.deepEqual(validate(), {
    status: 'verified-no-source-drift-external-holds-retained',
    sourceCount: 6,
    v52SourceDrift: false,
    supportSourceDrift: false,
    newerSupportPacketFound: false,
    portfolio: {
      done: 16,
      partial: 2,
      open: 6,
      decision: 'hold-no-go',
      nextLane: 'staging-backend-parity',
    },
  });
});

test('rejects Drive identity, timestamp, byte-size and hash drift', () => {
  for (const key of ['driveFileId', 'modifiedTime', 'bytes', 'sha256']) {
    const changed = structuredClone(evidence);
    changed.authoritativeSources[0][key] = key === 'bytes' ? 1 : 'changed';
    assert.throws(() => validate(changed), /source inventory/u);
  }
});

test('rejects a newer-packet or legal-approval overclaim', () => {
  const packet = structuredClone(evidence);
  packet.driveInventory.supportFolder.newerPacketFound = true;
  assert.throws(() => validate(packet), /folder inventory/u);

  const legal = structuredClone(evidence);
  legal.reconciliation.newerProfessionalLegalApprovalFound = true;
  assert.throws(() => validate(legal), /invalid or overstated/u);
});

test('rejects promotion of Maximus or historical handover to product authority', () => {
  for (const index of [0, 1]) {
    const changed = structuredClone(evidence);
    changed.contextDocuments[index].productSourceOfTruth = true;
    assert.throws(() => validate(changed), /context-document authority/u);
  }
});

test('rejects support-gate and current-candidate portfolio dilution', () => {
  const support = structuredClone(evidence);
  support.reconciliation.supportDeadlineScenario.gate = 'QUALITY';
  assert.throws(() => validate(support), /invalid or overstated/u);

  const portfolio = structuredClone(evidence);
  portfolio.reconciliation.portfolio.done = 17;
  portfolio.reconciliation.portfolio.open = 5;
  assert.throws(() => validate(portfolio), /invalid or overstated/u);
});

test('rejects external mutation and private or secret-shaped additions', () => {
  const mutation = structuredClone(evidence);
  mutation.boundaries.driveChanged = true;
  assert.throws(() => validate(mutation), /external or runtime mutation/u);

  const privateField = structuredClone(evidence);
  privateField.email = 'forbidden';
  assert.throws(() => validate(privateField), /private field/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = '/Users/example/private';
  assert.throws(() => validate(privateValue), /private or secret-shaped/u);
});
