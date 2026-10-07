#!/usr/bin/env node

import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const stagingOrigin = 'https://staging.shareittoo.com';
const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const actionPaths = Object.freeze({
  'email-verification': '/api/v1/auth/email-verification/confirm',
  'password-reset': '/api/v1/auth/password-reset/form',
});

function fail(message) {
  throw new Error(message);
}

function htmlHasExactHeading(html, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`<h1(?:\\s[^>]*)?>\\s*${escaped}\\s*</h1>`, 'iu').test(String(html));
}

function exactActionUrl(value, kind) {
  const expectedPath = actionPaths[kind] ?? fail('The Staging email-action kind is invalid.');
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('The Staging email action does not contain a valid URL.');
  }
  const tokenValues = url.searchParams.getAll('token');
  if (url.origin !== stagingOrigin
      || url.pathname !== expectedPath
      || url.username !== ''
      || url.password !== ''
      || url.hash !== ''
      || [...url.searchParams.keys()].some((key) => key !== 'token')
      || tokenValues.length !== 1
      || tokenValues[0].length < 32
      || tokenValues[0].length > 500
      || !/^[A-Za-z0-9_-]+$/u.test(tokenValues[0])) {
    fail('The email action is not bound to the exact TLS Staging route.');
  }
  return url;
}

export function extractStagingEmailActionUrl(content, kind) {
  const expectedPath = actionPaths[kind] ?? fail('The Staging email-action kind is invalid.');
  const normalized = String(content).replaceAll('&amp;', '&');
  const candidates = normalized.match(/https:\/\/staging\.shareittoo\.com\/api\/v1\/auth\/[A-Za-z0-9/_-]+\?[^\s<>"']+/gu) ?? [];
  const exact = new Map();
  for (const candidate of candidates) {
    try {
      const url = exactActionUrl(candidate.replace(/[),.;]+$/u, ''), kind);
      if (url.pathname === expectedPath) exact.set(url.href, url);
    } catch {
      // Ignore unrelated or malformed URLs; exact cardinality is enforced below.
    }
  }
  if (exact.size !== 1) fail('The email does not contain one unique exact Staging action.');
  return [...exact.values()][0];
}

async function boundedFetch(fetchImpl, url, options = {}) {
  if (typeof fetchImpl !== 'function') fail('The Staging email-action transport is invalid.');
  try {
    return await fetchImpl(url, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      ...options,
    });
  } catch {
    fail('The Staging email-action result is unknown after a transport failure; do not replay it.');
  }
}

async function htmlResponse(response) {
  const type = response.headers?.get?.('content-type') ?? '';
  if (!/^text\/html(?:;|$)/iu.test(type)) {
    fail('The Staging email action returned a non-HTML response.');
  }
  return response.text();
}

async function inspectConsumedLink(fetchImpl, url) {
  const replay = await boundedFetch(fetchImpl, url);
  const type = replay.headers?.get?.('content-type') ?? '';
  if (replay.status === 400 && /^text\/html(?:;|$)/iu.test(type)) {
    const body = await replay.text();
    if (htmlHasExactHeading(body, 'Link nicht mehr gültig')) {
      return Object.freeze({ status: 'consumed', httpStatus: 400, retryAfterSeconds: null });
    }
  }
  if (replay.status === 429 && /^application\/json(?:;|$)/iu.test(type)) {
    let value;
    try { value = await replay.json(); } catch { value = null; }
    const retryAfter = Number(replay.headers?.get?.('retry-after'));
    if (value?.error === 'rate_limit_exceeded'
        && Number.isSafeInteger(retryAfter)
        && retryAfter > 0
        && retryAfter <= 900) {
      return Object.freeze({
        status: 'rate-limited-reconciliation-required',
        httpStatus: 429,
        retryAfterSeconds: retryAfter,
      });
    }
  }
  fail('The Staging email action did not prove single-use consumption.');
}

export async function verifyConsumedStagingEmailAction({
  content,
  kind,
  fetchImpl = globalThis.fetch,
} = {}) {
  const url = extractStagingEmailActionUrl(content, kind);
  const result = await inspectConsumedLink(fetchImpl, url);
  return Object.freeze({
    status: result.status,
    httpStatus: result.httpStatus,
    retryAfterSeconds: result.retryAfterSeconds,
    containsActionUrl: false,
    containsToken: false,
    containsCredential: false,
  });
}

export async function consumeStagingEmailVerification({
  content,
  fetchImpl = globalThis.fetch,
} = {}) {
  const url = extractStagingEmailActionUrl(content, 'email-verification');
  const response = await boundedFetch(fetchImpl, url);
  const body = await htmlResponse(response);
  if (response.status !== 200 || !htmlHasExactHeading(body, 'E-Mail bestätigt')) {
    fail('The Staging email-verification result is not a definite success.');
  }
  const replay = await inspectConsumedLink(fetchImpl, url);
  return Object.freeze({
    status: replay.status === 'consumed'
      ? 'email-verification-confirmed-single-use'
      : 'email-verification-confirmed-replay-reconciliation-required',
    initialHttpStatus: 200,
    replayHttpStatus: replay.httpStatus,
    replayRetryAfterSeconds: replay.retryAfterSeconds,
    containsActionUrl: false,
    containsToken: false,
    containsCredential: false,
  });
}

function readPendingPassword(resetVaultFile) {
  if (typeof resetVaultFile !== 'string' || !isAbsolute(resetVaultFile)) {
    fail('The password-reset vault path must be absolute.');
  }
  let descriptor;
  try {
    const canonical = realpathSync(resetVaultFile);
    if (canonical === repositoryRoot || canonical.startsWith(`${repositoryRoot}/`)) {
      fail('The password-reset vault must remain outside the repository.');
    }
    descriptor = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size === 0 || (stat.mode & 0o077) !== 0) {
      fail('The password-reset vault must be a non-empty owner-only regular file.');
    }
    const vault = JSON.parse(readFileSync(descriptor, 'utf8'));
    if (vault?.schemaVersion !== 1
        || vault?.kind !== 'sit-staging-pixel-password-reset-vault'
        || vault?.apiBaseUrl !== `${stagingOrigin}/api/v1`
        || vault?.stripeLivemode !== false
        || vault?.containsProductionCredentials !== false
        || vault?.status !== 'pixel-password-reset-request-accepted-pending-email'
        || !/^S1tR[A-Za-z0-9_-]{24,}$/u.test(vault?.pendingPassword ?? '')) {
      fail('The password-reset vault is not ready for exact Staging confirmation.');
    }
    return vault.pendingPassword;
  } catch (error) {
    if (error instanceof SyntaxError) fail('The password-reset vault is invalid.');
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export async function consumeStagingPasswordReset({
  content,
  resetVaultFile,
  fetchImpl = globalThis.fetch,
} = {}) {
  const url = extractStagingEmailActionUrl(content, 'password-reset');
  const pendingPassword = readPendingPassword(resetVaultFile);
  const form = await boundedFetch(fetchImpl, url);
  const formBody = await htmlResponse(form);
  if (form.status !== 200
      || !htmlHasExactHeading(formBody, 'Neues Passwort festlegen')
      || !formBody.includes('name="token"')
      || !formBody.includes('name="password"')
      || !formBody.includes('name="passwordConfirm"')) {
    fail('The password-reset link did not expose the exact valid Staging form.');
  }

  const token = url.searchParams.get('token');
  const body = new URLSearchParams({
    token,
    password: pendingPassword,
    passwordConfirm: pendingPassword,
  });
  const submitted = await boundedFetch(fetchImpl, `${stagingOrigin}${actionPaths['password-reset']}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-store',
    },
    body,
  });
  const submittedBody = await htmlResponse(submitted);
  if (submitted.status !== 200 || !htmlHasExactHeading(submittedBody, 'Passwort geändert')) {
    fail('The Staging password-reset submission is not a definite success.');
  }
  const replay = await inspectConsumedLink(fetchImpl, url);
  return Object.freeze({
    status: replay.status === 'consumed'
      ? 'password-reset-confirmed-single-use'
      : 'password-reset-confirmed-replay-reconciliation-required',
    formHttpStatus: 200,
    submissionHttpStatus: 200,
    replayHttpStatus: replay.httpStatus,
    replayRetryAfterSeconds: replay.retryAfterSeconds,
    containsActionUrl: false,
    containsToken: false,
    containsCredential: false,
  });
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function readStandardInput() {
  const input = createInterface({ input: process.stdin, terminal: false });
  const value = await new Promise((resolvePromise, reject) => {
    input.once('line', resolvePromise);
    input.once('error', reject);
  });
  input.close();
  if (value.length > 1024 * 1024) fail('The private email input exceeds the bounded size.');
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed?.content !== 'string' || parsed.content.length === 0) {
      fail('The private email content is missing.');
    }
    return parsed.content;
  } catch (error) {
    if (error instanceof SyntaxError) fail('The private email input is invalid.');
    throw error;
  }
}

async function run() {
  const args = process.argv.slice(2);
  const kind = argumentValue(args, '--kind') ?? fail('--kind is required.');
  const content = await readStandardInput();
  const consumedKind = /^(email-verification|password-reset)-consumed$/u.exec(kind)?.[1] ?? null;
  const result = consumedKind !== null
    ? await verifyConsumedStagingEmailAction({ content, kind: consumedKind })
    : kind === 'email-verification'
    ? await consumeStagingEmailVerification({ content })
    : kind === 'password-reset'
      ? await consumeStagingPasswordReset({
        content,
        resetVaultFile: resolve(
          argumentValue(args, '--reset-vault-file') ?? fail('--reset-vault-file is required.'),
        ),
      })
      : fail('The Staging email-action kind is invalid.');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'The Staging email action failed.'}\n`);
    process.exitCode = 1;
  }
}
