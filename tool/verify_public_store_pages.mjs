import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'store', 'submission.json'), 'utf8'),
);
const args = process.argv.slice(2);
let originOverride = null;
let allowDraft = false;
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--allow-draft') {
    allowDraft = true;
  } else if (argument === '--origin') {
    originOverride = args[index + 1] ?? fail('--origin requires a URL.');
    index += 1;
  } else {
    fail(`Unknown argument: ${argument}`);
  }
}

if (originOverride) {
  let parsed;
  try {
    parsed = new URL(originOverride);
  } catch {
    fail('--origin must be an absolute HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    fail('--origin must be an absolute HTTP or HTTPS URL.');
  }
  originOverride = parsed;
}

const expectations = {
  support: {
    url: 'https://shareittoo.com/support',
    pageId: 'support',
    approvedStatus: 'approved',
    required: ['mailto:', 'Fragen zu Konten'],
  },
  privacy: {
    url: 'https://shareittoo.com/privacy',
    pageId: 'privacy',
    approvedStatus: 'approved',
    required: [
      'Verantwortlicher',
      'Welche Daten verarbeitet werden',
      'Zwecke und Rechtsgrundlagen',
      'Empfänger und Dienstleister',
      'Speicherung, Löschung und Rechte',
      'Datenschutzkontakt',
    ],
  },
  accountDeletion: {
    url: 'https://shareittoo.com/account-deletion',
    pageId: 'account-deletion',
    approvedStatus: 'operational',
    required: ['Konto löschen', 'Löschung anfordern', 'name="email"'],
  },
};

const results = [];
for (const [key, expectation] of Object.entries(expectations)) {
  const entry = manifest.publicUrls?.[key];
  if (!entry || typeof entry.url !== 'string') {
    fail(`publicUrls.${key}.url is not configured.`);
  }
  if (entry.status !== 'verified' && !allowDraft) {
    fail(`publicUrls.${key} is ${entry.status}; verified is required.`);
  }
  if (!['verified', 'draft'].includes(entry.status)) {
    fail(`publicUrls.${key} must be verified or draft for content checks.`);
  }
  if (entry.url !== expectation.url) {
    fail(`publicUrls.${key}.url must match the frozen canonical public URL.`);
  }

  const configured = new URL(expectation.url);
  const target = originOverride
    ? new URL(`${configured.pathname}${configured.search}`, originOverride)
    : configured;
  const response = await fetch(target, {
    redirect: 'error',
    headers: { 'User-Agent': 'ShareItToo-Store-Readiness/1.0' },
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => fail(`${key} request failed: ${error.message}`));
  const body = await response.text();
  const expectedHttpStatus = entry.status === 'draft' && key !== 'accountDeletion'
    ? 503
    : 200;
  if (response.status !== expectedHttpStatus) {
    fail(`${key} returned HTTP ${response.status}; expected ${expectedHttpStatus}.`);
  }
  if (!body.includes(`data-sit-public-page="${expectation.pageId}"`)) {
    fail(`${key} is missing its machine-readable page marker.`);
  }
  const expectedComplianceStatus = entry.status === 'draft' && key !== 'accountDeletion'
    ? 'draft'
    : expectation.approvedStatus;
  if (!body.includes(`data-sit-compliance-status="${expectedComplianceStatus}"`)) {
    fail(`${key} is missing compliance status ${expectedComplianceStatus}.`);
  }
  if (entry.status === 'verified') {
    for (const phrase of expectation.required) {
      if (!body.includes(phrase)) fail(`${key} is missing required content: ${phrase}`);
    }
  }
  results.push(`${key}=${entry.status}/HTTP${response.status}`);
}

console.log(`Public store pages verified: ${results.join(', ')}.`);
