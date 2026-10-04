import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants, chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertGreenCatalogLocalDocument,
  greenDatabaseStateBaseline,
  finalizeGreenCatalogLocal,
  greenCatalogLocalBinding,
  greenSyntheticCatalogItemKeys,
  greenSyntheticCatalogProjection,
} from '../ops/green_catalog_local_finalizer.mjs';

const nowUtc = '2026-10-03T20:00:00.000Z';
const capturedAtUtc = '2026-10-03T19:59:59.000Z';

const catalogReadback = Object.freeze({
  attempts: 1,
  bookingAllowed: false,
  canonicalValues: true,
  catalogClass: greenSyntheticCatalogProjection.catalogClass,
  city: greenSyntheticCatalogProjection.city,
  converged: true,
  count: 1,
  country: greenSyntheticCatalogProjection.country,
  idDigest: greenSyntheticCatalogProjection.idDigest,
  isActive: true,
  lat: greenSyntheticCatalogProjection.lat,
  listingStatus: greenSyntheticCatalogProjection.status,
  lng: greenSyntheticCatalogProjection.lng,
  locationText: greenSyntheticCatalogProjection.locationText,
  noticeDigest: greenSyntheticCatalogProjection.noticeDigest,
  ownerDeclaration: false,
  ownerIdDigest: greenSyntheticCatalogProjection.ownerIdDigest,
  pageCount: 1,
  paymentAllowed: false,
  photoCount: 1,
  photoDigest: greenSyntheticCatalogProjection.photoDigest,
  photoReachable: null,
  realOffer: false,
  rowKeys: greenSyntheticCatalogItemKeys,
  status: 200,
  strictItemCompatible: true,
  titleDigest: greenSyntheticCatalogProjection.titleDigest,
  verificationStatus: greenSyntheticCatalogProjection.verificationStatus,
});

function validDocument() {
  return {
    schemaVersion: greenCatalogLocalBinding.schemaVersion,
    kind: greenCatalogLocalBinding.kind,
    status: 'passed',
    runtime: { ...greenCatalogLocalBinding.runtime },
    ops: { ...greenCatalogLocalBinding.ops },
    consumerSource: { ...greenCatalogLocalBinding.consumerSource },
    image: { ...greenCatalogLocalBinding.image },
    attempt: { ...greenCatalogLocalBinding.attempt },
    capturedAtUtc,
    catalog: { source: 'local-readback', readback: { ...catalogReadback } },
    database: { before: { ...greenDatabaseStateBaseline }, after: { ...greenDatabaseStateBaseline } },
  };
}

function fixtureRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-green-catalog-finalizer-'));
  chmodSync(root, 0o700);
  return root;
}

function writeInput(root, value, { newline = '\n', mode = 0o600 } = {}) {
  const file = path.join(root, 'input.json');
  writeFileSync(file, `${JSON.stringify(value, null, 2)}${newline}`, { mode });
  chmodSync(file, mode);
  return file;
}

async function readFinalizedOutput(file, afterValidation = async () => {}) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.nlink, 1);
    assert.equal(metadata.mode & 0o777, 0o600);
    await afterValidation();
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

test('local finalizer repairs JSON newline and emits canonical UTC evidence', async () => {
  const root = fixtureRoot();
  try {
    const input = writeInput(root, validDocument(), { newline: '\r\n' });
    const output = path.join(root, 'final.json');
    const result = await finalizeGreenCatalogLocal({ inputFile: input, outputFile: output, nowUtc });
    const bytes = await readFinalizedOutput(output);
    assert.equal(bytes.toString('utf8').endsWith('\n'), true);
    assert.equal(bytes.toString('utf8').endsWith('\n\n'), false);
    assert.equal(bytes.includes(0x0d), false);
    assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
    const parsed = JSON.parse(bytes);
    assertGreenCatalogLocalDocument(parsed, { finalized: true, nowUtc });
    assert.equal(parsed.finalizedAtUtc, nowUtc);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('finalizer evidence read stays on its validated descriptor across a path replacement', async () => {
  const root = fixtureRoot();
  try {
    const input = writeInput(root, validDocument());
    const output = path.join(root, 'final.json');
    const foreign = path.join(root, 'foreign.json');
    writeFileSync(foreign, '{"foreign":true}\n', { mode: 0o600 });
    const result = await finalizeGreenCatalogLocal({ inputFile: input, outputFile: output, nowUtc });
    const bytes = await readFinalizedOutput(output, async () => {
      rmSync(output);
      symlinkSync(foreign, output);
    });
    assert.equal(createHash('sha256').update(bytes).digest('hex'), result.sha256);
    assertGreenCatalogLocalDocument(JSON.parse(bytes), { finalized: true, nowUtc });
    await assert.rejects(() => readFinalizedOutput(output), { code: 'ELOOP' });
    assert.equal(readFileSync(foreign, 'utf8'), '{"foreign":true}\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('local finalizer keeps runtime, Ops, digest and attempt bindings separate', () => {
  const document = validDocument();
  assertGreenCatalogLocalDocument(document);
  assert.deepEqual(greenCatalogLocalBinding.consumerSource, {
    commit: '64468ddaa1f0cf2494559ff11e82c0e1eca14db0',
    path: 'backend/ops/green_staging_promotion.mjs',
    sha256: '8e2dd7d47038555b36b917ca88b2e78e61d7e5365886929000004b1814abd8d3',
  });
  assert.notEqual(greenCatalogLocalBinding.consumerSource.commit, greenCatalogLocalBinding.ops.commit);
  assert.notEqual(greenCatalogLocalBinding.consumerSource.commit, greenCatalogLocalBinding.runtime.commit);
  assert.doesNotMatch(readFileSync(new URL('../ops/green_catalog_local_finalizer.mjs', import.meta.url), 'utf8'), /from ['"]\.\/green_staging_promotion\.mjs/u);
  for (const [pathParts, value] of [
    [['runtime', 'commit'], '6c0ef70db2656df3e378add858d5f5157388127e'],
    [['ops', 'commit'], '8fecd57018ab10a0c6733531539472e6179a02db'],
    [['consumerSource', 'commit'], '64468ddaa1f0cf2494559ff11e82c0e1eca14db0-wrong'],
    [['consumerSource', 'path'], 'backend/ops/green_staging_promotion.mjs.drift'],
    [['consumerSource', 'sha256'], '0'.repeat(64)],
    [['image', 'digest'], 'sha256:' + '0'.repeat(64)],
    [['attempt', 'number'], 2],
    [['attempt', 'id'], 'attempt-02'],
  ]) {
    const drift = structuredClone(document);
    drift[pathParts[0]][pathParts[1]] = value;
    assert.throws(() => assertGreenCatalogLocalDocument(drift), /green_catalog_local_(?:runtime|ops|consumer_source|image|attempt)_/u);
  }
});

test('local finalizer removes only its own output after post-create failure', async () => {
  const root = fixtureRoot();
  try {
    const input = writeInput(root, validDocument());
    const partialOutput = path.join(root, 'partial.json');
    await assert.rejects(() => finalizeGreenCatalogLocal({
      inputFile: input,
      outputFile: partialOutput,
      nowUtc,
      onOutputWriteForTest: async () => {
        truncateSync(partialOutput, 3);
        throw new Error('green_catalog_local_test_post_create_failure');
      },
    }), /green_catalog_local_test_post_create_failure/u);
    await assert.rejects(() => lstat(partialOutput), { code: 'ENOENT' });

    const replacedOutput = path.join(root, 'replaced.json');
    await assert.rejects(() => finalizeGreenCatalogLocal({
      inputFile: input,
      outputFile: replacedOutput,
      nowUtc,
      onOutputWriteForTest: async () => {
        rmSync(replacedOutput);
        writeFileSync(replacedOutput, '{"foreign":true}\n', { mode: 0o600 });
        chmodSync(replacedOutput, 0o600);
        throw new Error('green_catalog_local_test_foreign_replacement');
      },
    }), /green_catalog_local_test_foreign_replacement/u);
    assert.equal(readFileSync(replacedOutput, 'utf8'), '{"foreign":true}\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('local finalizer rejects extra fields, symlinks and unsafe modes before writing', async () => {
  const root = fixtureRoot();
  try {
    const extra = validDocument();
    extra.catalog.extra = true;
    assert.throws(() => assertGreenCatalogLocalDocument(extra), /green_catalog_local_catalog_shape_invalid/u);

    const source = writeInput(root, validDocument());
    const hardlinkInput = path.join(root, 'hardlink-input.json');
    linkSync(source, hardlinkInput);
    await assert.rejects(() => finalizeGreenCatalogLocal({ inputFile: hardlinkInput, outputFile: path.join(root, 'hardlink-out.json'), nowUtc }), /green_catalog_local_input_unsafe/u);
    rmSync(hardlinkInput);

    const symlinkInput = path.join(root, 'symlink-input.json');
    symlinkSync(source, symlinkInput);
    await assert.rejects(() => finalizeGreenCatalogLocal({ inputFile: symlinkInput, outputFile: path.join(root, 'out.json'), nowUtc }), /green_catalog_local_input_symlink_forbidden/u);
    rmSync(symlinkInput);

    const realParent = path.join(root, 'real-parent');
    mkdirSync(realParent, { mode: 0o700 });
    chmodSync(realParent, 0o700);
    const linkedParent = path.join(root, 'linked-parent');
    symlinkSync(realParent, linkedParent);
    const linkedInput = path.join(linkedParent, 'linked-input.json');
    writeFileSync(path.join(realParent, 'linked-input.json'), `${JSON.stringify(validDocument())}\n`, { mode: 0o600 });
    await assert.rejects(() => finalizeGreenCatalogLocal({ inputFile: linkedInput, outputFile: path.join(root, 'linked-out.json'), nowUtc }), /green_catalog_local_parent_unsafe/u);

    const safeSource = writeInput(root, validDocument());
    const outputTarget = path.join(root, 'output-target.json');
    const symlinkOutput = path.join(root, 'symlink-output.json');
    symlinkSync(outputTarget, symlinkOutput);
    await assert.rejects(() => finalizeGreenCatalogLocal({ inputFile: safeSource, outputFile: symlinkOutput, nowUtc }), /green_catalog_local_output_(?:exists|symlink_forbidden)/u);

    const occupied = path.join(root, 'occupied.json');
    writeFileSync(occupied, '{}\n', { mode: 0o600 });
    const occupiedHardlink = path.join(root, 'occupied-hardlink.json');
    linkSync(occupied, occupiedHardlink);
    await assert.rejects(() => finalizeGreenCatalogLocal({ inputFile: safeSource, outputFile: occupiedHardlink, nowUtc }), /green_catalog_local_output_exists/u);

    const unsafe = writeInput(root, validDocument(), { mode: 0o644 });
    await assert.rejects(() => finalizeGreenCatalogLocal({ inputFile: unsafe, outputFile: path.join(root, 'unsafe-out.json'), nowUtc }), /green_catalog_local_input_unsafe/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('local finalizer rejects non-UTC and future timestamps', async () => {
  const offset = validDocument();
  offset.capturedAtUtc = '2026-10-03T21:00:00.000+01:00';
  assert.throws(() => assertGreenCatalogLocalDocument(offset), /green_catalog_local_captured_at_invalid/u);
  const future = validDocument();
  future.capturedAtUtc = '2026-10-03T20:00:01.000Z';
  const root = fixtureRoot();
  try {
    const input = writeInput(root, future);
    await assert.rejects(() => finalizeGreenCatalogLocal({ inputFile: input, outputFile: path.join(root, 'future.json'), nowUtc }), /green_catalog_local_time_order_invalid/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
