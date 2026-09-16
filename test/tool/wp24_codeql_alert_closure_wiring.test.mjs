import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('credential-bearing journal bytes use private keyed integrity rather than a fast public hash', () => {
  const value = source('tool/diagnose_android_password_change.mjs');
  assert.match(value, /createHmac\('sha256', Buffer\.from\(integrityKey, 'base64url'\)\)/u);
  assert.match(value, /timingSafeEqual/u);
  assert.match(value, /sourceVaultIntegrityKey/u);
  assert.match(value, /sourceVaultMac/u);
  assert.doesNotMatch(value, /sourceVaultSha256/u);
  assert.doesNotMatch(value, /sha256\(JSON\.stringify\(journal\)\)/u);
  assert.doesNotMatch(value, /createHash/u);
});

test('security-sensitive local files are consumed through no-follow descriptors', () => {
  const buildCache = source('tool/run_with_local_build_cache.mjs');
  assert.match(buildCache, /openSync\([\s\S]*constants\.O_RDONLY \| constants\.O_NOFOLLOW/u);
  assert.match(buildCache, /fstatSync\(descriptor\)/u);
  assert.match(buildCache, /JSON\.parse\(readFileSync\(descriptor, 'utf8'\)\)/u);
  assert.doesNotMatch(buildCache, /lstatSync\(request\.profilePath\)/u);
  assert.doesNotMatch(buildCache, /readFileSync\(request\.profilePath/u);

  const listingAcceptance = source('tool/run_staging_listing_ai_acceptance.mjs');
  assert.match(listingAcceptance, /openSync\([\s\S]*constants\.O_RDONLY \| constants\.O_NOFOLLOW/u);
  assert.match(listingAcceptance, /fstatSync\(descriptor\)/u);
  assert.match(listingAcceptance, /bytes = readFileSync\(descriptor\)/u);
  assert.doesNotMatch(listingAcceptance, /readFileSync\(candidate\)/u);

  const stripe = source('backend/ops/validate_stripe_staging_secrets.mjs');
  const opened = stripe.indexOf('descriptor = openSync(');
  const compared = stripe.indexOf('metadata.dev !== linkMetadata.dev');
  const read = stripe.indexOf('bytes = readFileSync(descriptor)');
  assert.ok(opened >= 0 && compared > opened && read > compared);
  assert.match(stripe, /constants\.O_RDONLY \| constants\.O_NOFOLLOW \| constants\.O_CLOEXEC/u);
});

test('the password-reset source assertion escapes every regular-expression metacharacter', () => {
  const value = source('test/tool/diagnose_android_password_reset.test.mjs');
  assert.match(value, /function escapeRegExp\(value\)/u);
  assert.match(value, /\[\.\*\+\?\^\$\{\}\(\)\|\[\\\]\\\\\]/u);
  assert.match(value, /new RegExp\(escapeRegExp\(marker\), 'u'\)/u);
  assert.doesNotMatch(value, /marker\.replace\(\/\[\?\]\//u);
});

test('intentional file-backed egress remains fixed, bounded and locally documented', () => {
  const provider = source('backend/src/openai_listing_ai_provider.js');
  assert.match(provider, /const responsesEndpoint = 'https:\/\/api\.openai\.com\/v1\/responses';/u);
  assert.match(provider, /externalProviderExecutionAllowed !== true/u);
  assert.match(provider, /providerExecutionAllowed !== true/u);
  assert.match(provider, /constants\.O_NOFOLLOW/u);
  assert.match(provider, /SIT-INTENTIONAL-EGRESS/u);

  const passwordReset = source('tool/diagnose_android_password_reset.mjs');
  assert.match(passwordReset, /const apiBaseUrl = 'https:\/\/staging\.shareittoo\.com\/api\/v1';/u);
  assert.match(passwordReset, /constants\.O_NOFOLLOW/u);
  assert.match(passwordReset, /\^\[A-Za-z0-9\._\+@-\]\+\$/u);
  assert.match(passwordReset, /SIT-INTENTIONAL-EGRESS/u);

  const messaging = source('tool/diagnose_android_messaging_media_time_location.mjs');
  assert.match(messaging, /const stagingApiBaseUrl = 'https:\/\/staging\.shareittoo\.com\/api\/v1';/u);
  assert.match(messaging, /!path\.startsWith\('\/'\) \|\| path\.includes\(':\/\/'\)/u);
  assert.ok((messaging.match(/encodeURIComponent\(/gu) ?? []).length >= 2);
  assert.match(messaging, /SIT-INTENTIONAL-EGRESS/u);
});
