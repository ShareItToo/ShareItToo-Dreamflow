#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultBaselinePath = fileURLToPath(new URL(
  '../docs/evidence/release-readiness/flutter-analyzer-debt-baseline.json',
  import.meta.url,
));
const severities = new Set(['error', 'warning', 'info']);

function fail(message) {
  throw new Error(message);
}

function sortedObject(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

export function parseAnalyzerDiagnostics(logText) {
  const diagnostics = [];
  let reportedTotal = null;

  for (const line of logText.split(/\r?\n/u)) {
    const totalMatch = /\b([0-9]+) issues? found\./u.exec(line);
    if (totalMatch !== null) reportedTotal = Number.parseInt(totalMatch[1], 10);
    if (/\bNo issues found!/u.test(line)) reportedTotal = 0;

    const parts = line.split(' • ');
    if (parts.length < 4) continue;
    const severity = parts.shift().trim();
    const code = parts.pop().trim();
    const location = parts.pop().trim();
    const message = parts.join(' • ').trim();
    if (!severities.has(severity) || !/^[a-z_]+$/u.test(code)) continue;
    const locationMatch = /^(.*):([0-9]+):([0-9]+)$/u.exec(location);
    if (locationMatch === null || message === '') continue;
    diagnostics.push({
      severity,
      message,
      path: locationMatch[1],
      line: Number.parseInt(locationMatch[2], 10),
      column: Number.parseInt(locationMatch[3], 10),
      code,
    });
  }

  if (reportedTotal === null) fail('Analyzer output does not contain a parseable issue total.');
  if (diagnostics.length !== reportedTotal) {
    fail(`Analyzer output reported ${reportedTotal} issues but ${diagnostics.length} diagnostics were parsed.`);
  }
  return diagnostics;
}

export function buildAnalyzerDebtSnapshot(logText) {
  const diagnostics = parseAnalyzerDiagnostics(logText);
  const normalized = diagnostics
    .map(({ severity, message, path, code }) => `${severity}|${path}|${code}|${message}`)
    .sort();
  const byCode = new Map();
  const byPathCode = new Map();
  for (const diagnostic of diagnostics) {
    byCode.set(diagnostic.code, (byCode.get(diagnostic.code) ?? 0) + 1);
    const bucket = `${diagnostic.path}|${diagnostic.code}`;
    byPathCode.set(bucket, (byPathCode.get(bucket) ?? 0) + 1);
  }
  return {
    schemaVersion: 1,
    kind: 'flutter-analyzer-debt-baseline',
    flutterVersion: '3.41.7',
    dartVersion: '3.11.5',
    total: diagnostics.length,
    fingerprintSha256: createHash('sha256')
      .update(`${normalized.join('\n')}\n`)
      .digest('hex'),
    byCode: sortedObject(byCode),
    byPathCode: sortedObject(byPathCode),
  };
}

function firstBucketDifference(actual, expected) {
  const keys = [...new Set([
    ...Object.keys(actual.byPathCode ?? {}),
    ...Object.keys(expected.byPathCode ?? {}),
  ])].sort();
  return keys.find((key) => actual.byPathCode?.[key] !== expected.byPathCode?.[key]) ?? null;
}

export function validateAnalyzerDebt({ logText, baseline }) {
  if (baseline?.schemaVersion !== 1
      || baseline?.kind !== 'flutter-analyzer-debt-baseline'
      || !Number.isSafeInteger(baseline?.total)
      || !/^[a-f0-9]{64}$/u.test(baseline?.fingerprintSha256 ?? '')) {
    fail('Flutter analyzer debt baseline is malformed.');
  }
  const snapshot = buildAnalyzerDebtSnapshot(logText);
  if (snapshot.total !== baseline.total
      || snapshot.fingerprintSha256 !== baseline.fingerprintSha256) {
    const bucket = firstBucketDifference(snapshot, baseline);
    const detail = bucket === null
      ? 'diagnostic message fingerprint changed'
      : `${bucket} expected ${baseline.byPathCode?.[bucket] ?? 0}, actual ${snapshot.byPathCode?.[bucket] ?? 0}`;
    fail(
      `Flutter analyzer debt drifted: expected ${baseline.total}, actual ${snapshot.total}; ${detail}. `
      + 'Fix the source and ratchet the committed baseline in the same bounded change.',
    );
  }
  return snapshot;
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function run() {
  const args = process.argv.slice(2);
  const logPath = argumentValue(args, '--log');
  if (logPath === null) fail('Usage: validate_flutter_analyzer_debt.mjs --log <path|-> [--print-current]');
  const logText = logPath === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(logPath), 'utf8');
  const snapshot = buildAnalyzerDebtSnapshot(logText);
  if (args.includes('--print-current')) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }
  const baselinePath = argumentValue(args, '--baseline') ?? defaultBaselinePath;
  const baseline = JSON.parse(readFileSync(resolve(baselinePath), 'utf8'));
  validateAnalyzerDebt({ logText, baseline });
  process.stdout.write(
    `Flutter analyzer debt baseline accepted (${snapshot.total} exact diagnostics, ${snapshot.fingerprintSha256}).\n`,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
