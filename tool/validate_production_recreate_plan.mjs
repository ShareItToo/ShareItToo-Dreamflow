#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const requiredChecks = [
  'website',
  'api',
  'database',
  'mail',
  'containers',
  'disk',
  'backupFreshness',
];

const requiredPostReadback = [
  ...requiredChecks,
  'healthService',
  'healthTimer',
  'automaticHealthRun',
];

function fail(message) {
  throw new Error(message);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

function isDigest(value) {
  return /^sha256:[a-f0-9]{64}$/u.test(value ?? '');
}

function assertImmutableImage(image, label) {
  if (!nonEmptyString(image?.reference) || !isDigest(image?.digest)
      || image.reference !== `${image.name}@${image.digest}`) {
    fail(`${label} image must be bound to an exact sha256 digest.`);
  }
  if (/(?:^|:)(?:local|latest)$/iu.test(image.name)
      || /shareittoo-api:local/iu.test(image.reference)) {
    fail(`${label} image uses a forbidden fallback tag.`);
  }
}

function inspectForSecrets(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectForSecrets(entry, [...trail, index]));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (/^(?:password|secret|token|credential|environmentcontents|envcontents|privatekey)$/iu.test(key)) {
        fail(`Secret-bearing field is forbidden: ${[...trail, key].join('.')}`);
      }
      inspectForSecrets(entry, [...trail, key]);
    }
    return;
  }
  if (typeof value === 'string'
      && /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|\b(?:sk|rk)_(?:test|live)_|\bwhsec_/u.test(value)) {
    fail(`Secret-shaped value is forbidden at ${trail.join('.')}.`);
  }
}

export function validateProductionRecreatePlan(plan) {
  inspectForSecrets(plan);
  if (plan?.schemaVersion !== 1
      || plan.kind !== 'sit-production-recreate-plan'
      || plan.status !== 'prepared') {
    fail('Production recreate plan identity is invalid.');
  }
  if (plan.target?.environment !== 'production'
      || !nonEmptyString(plan.target?.host)
      || !nonEmptyString(plan.target?.service)) {
    fail('Production target binding is incomplete.');
  }

  assertImmutableImage(plan.currentRuntime?.image, 'Current runtime');
  assertImmutableImage(plan.proposedRuntime?.image, 'Proposed runtime');
  assertImmutableImage(plan.rollback?.image, 'Rollback');

  const proof = plan.proposedRuntime?.availabilityProof;
  if (!['local-image-id', 'registry-digest'].includes(proof?.kind)
      || proof.digest !== plan.proposedRuntime.image.digest) {
    fail('Proposed image availability is not proven by immutable identity.');
  }

  const runtime = plan.currentRuntime ?? {};
  if (!nonEmptyStringArray(runtime.composeFiles)
      || !nonEmptyString(runtime.environmentFilePath)
      || !nonEmptyStringArray(runtime.persistentVolumes)
      || !nonEmptyStringArray(runtime.networks)
      || !nonEmptyStringArray(runtime.dependencies)) {
    fail('Current runtime topology or rollback prerequisites are incomplete.');
  }

  for (const check of requiredChecks) {
    if (plan.preflight?.[check] !== 'passed') {
      fail(`Preflight check is not passed: ${check}.`);
    }
  }
  for (const check of requiredPostReadback) {
    if (plan.postReadback?.[check] !== 'required') {
      fail(`Post-readback requirement is missing: ${check}.`);
    }
  }
  if (plan.abortPolicy?.stopAfterPullOrRecreateFailure !== true
      || plan.abortPolicy?.rereadDependenciesBeforeRetry !== true) {
    fail('Fail-closed abort policy is incomplete.');
  }

  return {
    status: 'prepared',
    target: `${plan.target.host}/${plan.target.service}`,
    proposedImageDigest: plan.proposedRuntime.image.digest,
    productionAuthorized: false,
  };
}

function main() {
  const planPath = process.argv[2];
  if (!nonEmptyString(planPath)) {
    fail('Usage: node tool/validate_production_recreate_plan.mjs <plan.json>');
  }
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const result = validateProductionRecreatePlan(plan);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Production recreate plan failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
