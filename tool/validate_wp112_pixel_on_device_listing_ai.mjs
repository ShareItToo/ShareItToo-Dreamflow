#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const evidencePath = 'docs/evidence/release-readiness/wp112-pixel-on-device-listing-ai-20260911.json';
const operationPath = 'docs/operations/WP112_PIXEL_ON_DEVICE_LISTING_AI_ACCEPTANCE_2026-09-11.md';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`${label} does not match WP112.`);
}

function digest(path) {
  return createHash('sha256').update(readFileSync(resolve(repositoryRoot, path))).digest('hex');
}

export function validateWp112PixelOnDeviceListingAi({ root = repositoryRoot } = {}) {
  const canonicalRoot = realpathSync(resolve(root));
  const evidence = JSON.parse(readFileSync(resolve(canonicalRoot, evidencePath), 'utf8'));
  exact(evidence.schemaVersion, 1, 'schemaVersion');
  exact(evidence.workPackage, 'WP112_PIXEL_ON_DEVICE_LISTING_AI_ACCEPTANCE', 'workPackage');
  exact(evidence.status, 'passed-physical-pixel-on-device-listing-ai', 'status');
  exact(evidence.runnerSourceCommit, 'd25b34d743c04ee5a060c1d31c3c5127416ccd03', 'runnerSourceCommit');
  exact(evidence.stagingBackend.commit, 'cbe62931b79964465f2d3956afd3f698dd4c6dea', 'Staging commit');
  exact(evidence.stagingBackend.imageDigest, 'sha256:ac550be1b11d50323e75bd7d0967e2003ed92d5e0f30a05491a7c2123d783fb9', 'Staging image');
  exact(evidence.stagingBackend.restartCount, 0, 'Staging restart count');
  exact(evidence.candidate.applicationId, 'com.shareittoo.app', 'applicationId');
  exact(evidence.candidate.versionName, '1.0.0', 'versionName');
  exact(evidence.candidate.versionCode, '2026091109', 'versionCode');
  exact(evidence.candidate.sourceCommit, '5d8b89c82926a9f0a28627a7f36d26a88a9574fe', 'candidate source');
  exact(evidence.candidate.apkSha256, '381cbb6766772c2fba4f093913bf366e6bfe1deb0af7b7ae5efe2ae694cd21cf', 'APK SHA-256');
  exact(evidence.candidate.signingCertificateSha256, '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4', 'certificate SHA-256');
  exact(evidence.device.physical, true, 'physical device');
  exact(evidence.device.model, 'Pixel 7 Pro', 'device model');
  exact(evidence.device.containsRawDeviceIdentifier, false, 'device identifier boundary');
  exact(evidence.fixture.kind, 'repository-controlled-synthetic-cordless-drill-image', 'fixture kind');
  exact(evidence.fixture.sha256, '85458cb5bc4777c587bfb8994ff0f960c8549f5423df9cc33b4c90fc65ffd420', 'fixture SHA-256');
  exact(evidence.fixture.personalMediaRead, false, 'personal media boundary');
  exact(evidence.fixture.retainedOnDevice, false, 'device fixture retention');
  for (const [key, value] of Object.entries(evidence.tests)) {
    exact(value, true, `tests.${key}`);
  }
  exact(evidence.runtime.provider, 'on_device', 'runtime provider');
  exact(evidence.runtime.model, 'mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1', 'runtime model');
  exact(evidence.runtime.externalProviderExecutionAllowed, false, 'external provider boundary');
  exact(evidence.runtime.estimatedCostCents, 0, 'estimated cost');
  exact(evidence.runtime.billedCostCents, 0, 'billed cost');
  exact(evidence.runtime.automaticPublicationAllowed, false, 'automatic publication boundary');
  exact(evidence.runtime.paymentTransport, 'memory', 'payment transport');
  exact(evidence.runtime.stripeLivemode, false, 'Stripe livemode');
  for (const [key, value] of Object.entries(evidence.boundaries)) {
    exact(value, false, `boundaries.${key}`);
  }
  const inventory = evidence.sourceInventory;
  if (inventory === null || typeof inventory !== 'object' || Array.isArray(inventory)) {
    fail('WP112 sourceInventory is invalid.');
  }
  for (const [path, expected] of Object.entries(inventory)) {
    exact(digest.call(null, path), expected, `sourceInventory.${path}`);
  }
  const operation = readFileSync(resolve(canonicalRoot, operationPath), 'utf8');
  for (const statement of [
    'zero input units, zero output units, zero estimated cost and zero billed cost',
    'no publication receipt',
    'The first expected every chip in one scroll viewport',
    'Binding V5.2 workflows, Stripe sandbox payment/refund and',
  ]) {
    if (!operation.includes(statement)) fail('The WP112 handover is incomplete.');
  }
  return Object.freeze({
    status: 'passed-wp112-pixel-on-device-listing-ai-evidence',
    sourceInventoryEntries: Object.keys(inventory).length,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp112PixelOnDeviceListingAi())}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP112 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
