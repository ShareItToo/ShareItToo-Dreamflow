#!/usr/bin/env node

/**
 * Physical, local-only runner for the synthetic clone booking screen.
 *
 * This file deliberately does not use the normal booking API.  It consumes the
 * owner-only manifest written by run_android_local_qa_backend.mjs and drives
 * only the visible diagnostic screen.  The manifest is read through the same
 * private-file helper as the login runner; secrets and device serials never
 * enter the returned evidence.
 */

import { execFile as execFileCallback, spawn as spawnCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { readStablePrivateFile } from '../backend/ops/stable_private_file.mjs';
import { runSyntheticPaymentUiFlow } from './synthetic_payment_ui_flow.mjs';
import { validateSyntheticPaymentReadback } from './run_android_local_qa_backend.mjs';

const execFile = promisify(execFileCallback);
const DEFAULT_MANIFEST_PATH = resolve(
  homedir(),
  'Library',
  'Application Support',
  'ShareItToo',
  'qa',
  'android',
  'live-r3',
  'session.json',
);
const LOOPBACK_API_BASE = 'http://127.0.0.1:18080/api/v1';
const APPLICATION_ID = 'com.shareittoo.app.qa';
const MAIN_ACTIVITY = 'com.shareittoo.app.MainActivity';
const MARKER = 'Synthetischer Test – keine vertragliche oder finanzielle Wirkung';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PHOTO_SLOTS = Object.freeze(['Übersicht', 'Detail', 'Zubehör', 'Kritischer Bereich']);
const STATUS_SEQUENCE = Object.freeze(['requested', 'accepted', 'active', 'returned']);

export const SYNTHETIC_CLONE_UI_CONTRACT = Object.freeze({
  version: 1,
  stability: 'visible-text-contract-until-explicit-android-semantics-land',
  title: 'Synthetischer Zwei-Rollen-Test',
  notice: MARKER,
  navigation: Object.freeze({ profile: 'Mein SIT', logout: 'Abmelden' }),
  statusRefresh: 'Status aktualisieren',
  bookingField: 'Booking-ID aus dem laufenden Run',
  bookingLoad: 'Laden',
  createRequested: 'Requested erstellen',
  accept: 'Accepted setzen',
  pickupPhotos: '4 Pickup-Fotos (Owner)',
  returnPhotos: '4 Return-Fotos (Renter)',
  pickerSuffix: 'Photo Picker',
  pickupChallenge: 'Pickup-QR-v3 ausstellen',
  returnChallenge: 'Return-QR-v3 ausstellen',
  qrScan: 'QR-v3 scannen und verifizieren',
  challengeIdField: 'Challenge-ID',
  qrPayloadField: 'QR-v3-Payload eingeben (kein Kamera-Scan)',
  qrPayloadVerify: 'QR-v3-Payload verifizieren',
  fallbackField: 'Exakter 6-stelliger Fallback-Code',
  fallbackVerify: 'Fallback verifizieren',
  audit: 'Audit / Cleanup',
  auditLoad: 'Audit laden',
  cleanup: 'Cleanup',
  returned: 'Returned abgeschlossen; keine bindende Wirkung.',
  status: Object.freeze(Object.fromEntries(STATUS_SEQUENCE.map((value) => [
    value,
    `Status: ${value}`,
  ]))),
});

function fail(message) {
  throw new Error(message);
}

function exactLoopbackApiBase(value) {
  if (value !== LOOPBACK_API_BASE) fail('synthetic_clone_runner_loopback_api_required');
  return value;
}

function center(bounds) {
  return [
    Math.round((bounds.left + bounds.right) / 2),
    Math.round((bounds.top + bounds.bottom) / 2),
  ];
}

export function parseBounds(value) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(value ?? '');
  if (!match) return null;
  const [, left, top, right, bottom] = match.map(Number);
  return { left, top, right, bottom };
}

function decodeXmlAttribute(value) {
  const named = Object.freeze({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' });
  return String(value ?? '').replace(
    /&#(\d+);|&#x([0-9a-f]+);|&(amp|quot|apos|lt|gt);/giu,
    (_match, decimal, hexadecimal, entity) => {
      if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
      if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      return named[String(entity).toLowerCase()] ?? '';
    },
  );
}

export function parseUiNodes(xml) {
  return [...String(xml ?? '').matchAll(/<node\b([^>]*)>/gu)].map((match) => {
    const attrs = {};
    for (const [, key, value] of match[1].matchAll(/([\w-]+)="([^"]*)"/gu)) attrs[key] = value;
    return {
      text: decodeXmlAttribute(attrs.text),
      hint: decodeXmlAttribute(attrs.hint),
      contentDesc: decodeXmlAttribute(attrs['content-desc']),
      className: attrs.class ?? '',
      clickable: attrs.clickable === 'true',
      enabled: attrs.enabled !== 'false',
      bounds: parseBounds(attrs.bounds),
    };
  });
}

function labelVariants(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return [];
  return [...new Set([
    normalized,
    ...normalized.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean),
  ])];
}

function nodeLabels(nodes) {
  return new Set(nodes.flatMap((node) => (
    [node.text, node.contentDesc, node.hint].flatMap(labelVariants)
  )));
}

function hasLabel(nodes, label) {
  return nodeLabels(nodes).has(label);
}

export function viewportBounds(nodes) {
  const root = nodes.find((node) => (
    node.bounds?.left === 0 && node.bounds?.top === 0
      && node.bounds.right > 0 && node.bounds.bottom > 0
  ));
  if (root) return root.bounds;
  return {
    left: 0,
    top: 0,
    right: Math.max(0, ...nodes.map((node) => node.bounds?.right ?? 0)),
    bottom: Math.max(0, ...nodes.map((node) => node.bounds?.bottom ?? 0)),
  };
}

export function scrollViewportBounds(nodes) {
  return nodes.find((node) => (
    node.className === 'android.widget.ScrollView'
      && node.bounds?.right > 0 && node.bounds?.bottom > 0
  ))?.bounds ?? viewportBounds(nodes);
}

function requiredForPhase(phase) {
  const common = [SYNTHETIC_CLONE_UI_CONTRACT.title];
  const c = SYNTHETIC_CLONE_UI_CONTRACT;
  const stages = {
    // The audit card is rendered only after a booking exists; requiring it on
    // the initial route would make the route readiness check self-contradictory.
    diagnostic: [...common, c.notice, c.statusRefresh, c.bookingField, c.bookingLoad],
    requested: [...common, c.status.requested, c.bookingField, c.bookingLoad],
    accepted: [...common, c.status.accepted, c.pickupPhotos],
    pickupPhotos: [...common, c.status.accepted, c.pickupPhotos, ...PHOTO_SLOTS.map((slot) => `${slot} – ${c.pickerSuffix}`)],
    pickupChallenge: [...common, c.status.accepted, c.pickupChallenge],
    pickupVerifier: [...common, c.status.accepted, c.qrScan, c.qrPayloadField, c.qrPayloadVerify, c.fallbackField, c.fallbackVerify],
    active: [...common, c.status.active, c.returnPhotos],
    returnPhotos: [...common, c.status.active, c.returnPhotos, ...PHOTO_SLOTS.map((slot) => `${slot} – ${c.pickerSuffix}`)],
    returnChallenge: [...common, c.status.active, c.returnChallenge],
    returnVerifier: [
      ...common,
      c.status.active,
      c.challengeIdField,
      c.fallbackField,
      c.fallbackVerify,
    ],
    returned: [...common, c.status.returned, c.returned],
    audit: [...common, c.audit, c.auditLoad, c.cleanup],
  };
  return stages[phase] ?? fail(`synthetic_clone_runner_unknown_ui_phase:${phase}`);
}

export function findPhotoPickerImageNode(nodes) {
  return nodes.find((node) => (
    node.bounds && node.enabled
      && /(?:Foto|Photo|Image).*(?:aufgenommen|taken)/iu.test(node.contentDesc)
  ));
}

export function findPhotoPickerConfirmNode(nodes) {
  const labels = new Set([
    'Done',
    'Fertig',
    'Select',
    'Auswählen',
    'Dieses Foto verwenden',
    'Use this photo',
  ]);
  return nodes.find((node) => node.bounds && node.enabled
    && (labels.has(node.text) || labels.has(node.contentDesc)));
}

/**
 * Validate the exact screen contract before an action.  This intentionally
 * checks visible semantics, not a shared bottom-nav label, and returns only
 * public labels suitable for evidence.
 */
export function assertSyntheticCloneInterface(xml, phase) {
  const nodes = Array.isArray(xml) ? xml : parseUiNodes(xml);
  const labels = nodeLabels(nodes);
  const missing = requiredForPhase(phase).filter((label) => !labels.has(label));
  if (missing.length > 0) {
    fail(`synthetic_clone_ui_contract_missing:${phase}:${missing.join('|')}`);
  }
  return { phase, contractVersion: SYNTHETIC_CLONE_UI_CONTRACT.version, labels: requiredForPhase(phase) };
}

function account(value, role) {
  if (!value || typeof value !== 'object') fail(`synthetic_clone_manifest_${role}_account_missing`);
  if (!UUID.test(value.userId ?? '') || typeof value.email !== 'string' || value.email.trim() === ''
      || typeof value.password !== 'string' || value.password.length === 0) {
    fail(`synthetic_clone_manifest_${role}_account_invalid`);
  }
  return { role, userId: value.userId, email: value.email, password: value.password };
}

export function validateSyntheticCloneSessionManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('synthetic_clone_manifest_invalid');
  }
  if (manifest.synthetic !== true || manifest.kind !== 'sit-android-local-qa-transient-session') {
    fail('synthetic_clone_manifest_not_local_synthetic');
  }
  exactLoopbackApiBase(manifest.apiBaseUrl);
  if (!Array.isArray(manifest.accounts) || manifest.accounts.length !== 2) {
    fail('synthetic_clone_manifest_two_accounts_required');
  }
  const clone = manifest.syntheticClone;
  if (!clone || clone.enabled !== true || clone.routePrefix !== '/api/v1/synthetic-clone'
      || clone.listingId !== 'synthetic_clone_listing_wp255' || clone.marker !== MARKER
      || !/^wp255-[0-9]{14}-[0-9a-f]{8}$/u.test(clone.runId ?? '')
      || !/^wp255-green-clone-[a-z0-9-]+$/u.test(clone.datasetId ?? '')
      || !UUID.test(clone.ownerId ?? '') || !UUID.test(clone.renterId ?? '')
      || clone.ownerId === clone.renterId) {
    fail('synthetic_clone_manifest_binding_invalid');
  }
  const owner = account(manifest.accounts[0], 'owner');
  const renter = account(manifest.accounts[1], 'renter');
  if (owner.userId !== clone.ownerId || renter.userId !== clone.renterId) {
    fail('synthetic_clone_manifest_account_principal_mismatch');
  }
  if (manifest.transientCredentialsOwnerOnly !== true) fail('synthetic_clone_manifest_credentials_scope_invalid');
  if (clone.paymentTest !== undefined) validateSyntheticPaymentReadback(clone.paymentTest, { enabled: true, runId: clone.runId });
  return Object.freeze({
    apiBaseUrl: manifest.apiBaseUrl,
    owner,
    renter,
    runId: String(clone.runId),
    datasetId: String(clone.datasetId),
    listingId: clone.listingId,
    marker: clone.marker,
  });
}

export function validateManualQrV3Payload(value) {
  const payload = typeof value === 'string' ? value.trim() : '';
  if (!/^shareittoo:v3:pickup:owner:[0-9a-f-]{36}:\d{6}:[0-9a-f-]{36}$/iu.test(payload)) {
    fail('synthetic_clone_runner_manual_qr_payload_invalid');
  }
  return payload;
}

export function extractVisibleChallengeParts(nodes, phase) {
  const challengeId = nodes
    .find((node) => /Challenge-ID:\s*[0-9a-f-]{36}/iu.test(node.text))
    ?.text.match(/[0-9a-f-]{36}/iu)?.[0];
  const fallbackCode = nodes
    .find((node) => /Fallback-Code:\s*\d{6}/u.test(node.text))
    ?.text.match(/\d{6}/u)?.[0];
  if (!challengeId || !fallbackCode) {
    fail(`synthetic_clone_runner_${phase}_challenge_parts_not_visible`);
  }
  return Object.freeze({ challengeId, fallbackCode });
}

function safeEvidenceText(value) {
  return String(value).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu, '[uuid]').replace(/\b\d{6}\b/gu, '[code]');
}

export function buildSyntheticCloneEvidence({ session, physicalDevice, statuses = STATUS_SEQUENCE, pickupVerification = 'qr-v3', qrVerificationMode = 'manual-payload', returnVerification = 'six_digit_fallback', auditRead = true, cleanupVerified = true }) {
  const validated = validateSyntheticCloneSessionManifest(session);
  if (!Array.isArray(statuses) || JSON.stringify(statuses) !== JSON.stringify(STATUS_SEQUENCE)) {
    fail('synthetic_clone_evidence_status_sequence_invalid');
  }
  if (pickupVerification !== 'qr-v3'
      || !['manual-payload', 'camera'].includes(qrVerificationMode)
      || returnVerification !== 'six_digit_fallback') {
    fail('synthetic_clone_evidence_verification_paths_invalid');
  }
  if (auditRead !== true || cleanupVerified !== true) fail('synthetic_clone_evidence_cleanup_or_audit_missing');
  return {
    schemaVersion: 1,
    kind: 'sit-android-local-qa-synthetic-clone-booking-runner',
    status: 'passed-local-qa-synthetic-clone-physical-booking',
    capturedAt: new Date().toISOString(),
    route: {
      apiBaseUrl: validated.apiBaseUrl,
      prefix: '/api/v1/synthetic-clone',
      readiness: 'route-specific-visible-contract',
    },
    physicalDevice: {
      physical: physicalDevice?.physical === true,
      apiLevel: Number.isInteger(physicalDevice?.apiLevel) ? physicalDevice.apiLevel : null,
      containsRawDeviceIdentifier: false,
    },
    flow: {
      statuses: [...STATUS_SEQUENCE],
      pickupPhotos: PHOTO_SLOTS.length,
      returnPhotos: PHOTO_SLOTS.length,
      pickupVerification,
      qrVerificationMode,
      returnVerification,
      auditRead,
      cleanupVerified,
    },
    verification: {
      pickup: pickupVerification,
      qrVerificationMode,
      return: returnVerification,
    },
    uiContract: {
      version: SYNTHETIC_CLONE_UI_CONTRACT.version,
      stability: SYNTHETIC_CLONE_UI_CONTRACT.stability,
      persistentMarker: MARKER,
    },
    syntheticClone: {
      runId: safeEvidenceText(validated.runId),
      datasetId: safeEvidenceText(validated.datasetId),
      listingId: validated.listingId,
      roles: ['owner', 'renter'],
    },
    boundaries: {
      store: false,
      aab: false,
      provider: false,
      payment: false,
      platformContract: false,
      c2cContract: false,
      payout: false,
      review: false,
      ranking: false,
      notification: false,
      containsCredentials: false,
      containsRawDeviceIdentifiers: false,
    },
  };
}

export class SerialUiAutomator {
  #tail = Promise.resolve();
  #busy = false;

  constructor({ device, adbPath = 'adb', execFileImpl = execFile, spawnImpl = spawnCallback, now = Date.now } = {}) {
    if (!/^[A-Za-z0-9._:-]+$/u.test(device ?? '')) fail('synthetic_clone_runner_device_required');
    this.device = device;
    this.adbPath = adbPath;
    this.execFileImpl = execFileImpl;
    this.spawnImpl = spawnImpl;
    this.now = now;
  }

  #serial(operation) {
    const next = this.#tail.then(async () => {
      if (this.#busy) fail('synthetic_clone_runner_ui_overlap');
      this.#busy = true;
      try {
        return await operation();
      } finally {
        this.#busy = false;
      }
    });
    this.#tail = next.catch(() => {});
    return next;
  }

  async shell(args) {
    return this.#serial(async () => {
      const result = await this.execFileImpl(this.adbPath, ['-s', this.device, 'shell', ...args], {
        maxBuffer: 8 * 1024 * 1024,
      });
      return result.stdout ?? '';
    });
  }

  async #inputText(value) {
    // Keep credentials out of argv and command logs.  ADB receives this over
    // its stdin shell transport, matching the existing local-QA login helper.
    return this.#serial(() => new Promise((resolvePromise, reject) => {
      const child = this.spawnImpl(this.adbPath, ['-s', this.device, 'shell'], {
        stdio: ['pipe', 'ignore', 'ignore'],
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
      });
      const finish = (error) => (error ? reject(error) : resolvePromise());
      child.once('error', () => finish(new Error('synthetic_clone_runner_adb_input_failed')));
      child.once('close', (code) => finish(code === 0 ? null : new Error('synthetic_clone_runner_adb_input_failed')));
      child.stdin.end(`input text '${String(value).replaceAll("'", "'\\''")}'\n`);
    }));
  }

  async dump(phase) {
    return this.#serial(async () => {
      const dumpPath = `/sdcard/sit_clone_${this.now()}_${String(phase).replace(/[^a-z0-9_-]/giu, '_')}.xml`;
      try {
        await this.execFileImpl(this.adbPath, ['-s', this.device, 'shell', 'uiautomator', 'dump', dumpPath], { maxBuffer: 1_024 * 1_024 });
        const { stdout } = await this.execFileImpl(this.adbPath, ['-s', this.device, 'shell', 'cat', dumpPath], { maxBuffer: 8 * 1_024 * 1_024 });
        return { xml: stdout, nodes: parseUiNodes(stdout) };
      } finally {
        await this.execFileImpl(this.adbPath, ['-s', this.device, 'shell', 'rm', '-f', dumpPath], { maxBuffer: 1_024 * 1_024 }).catch(() => {});
      }
    });
  }

  async tapLabel(label, phase) {
    const { nodes } = await this.dump(phase);
    const node = nodes.find((candidate) => candidate.bounds && candidate.enabled && candidate.clickable
      && [candidate.text, candidate.contentDesc, candidate.hint]
        .flatMap(labelVariants).includes(label));
    if (!node) fail(`synthetic_clone_runner_action_missing:${phase}:${label}`);
    const [x, y] = center(node.bounds);
    await this.shell(['input', 'tap', String(x), String(y)]);
  }

  async #scrollForward(nodes) {
    const viewport = scrollViewportBounds(nodes);
    if (viewport.right <= 0 || viewport.bottom <= 0) {
      fail('synthetic_clone_runner_viewport_missing');
    }
    await this.shell([
      'input',
      'swipe',
      String(Math.round(viewport.right * 0.5)),
      String(Math.round(viewport.bottom * 0.78)),
      String(Math.round(viewport.right * 0.5)),
      String(Math.round(viewport.bottom * 0.35)),
      '350',
    ]);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }

  async revealLabel(label, phase, { maxScrolls = 4 } = {}) {
    for (let attempt = 0; attempt <= maxScrolls; attempt += 1) {
      const { nodes } = await this.dump(`${phase}-reveal-${attempt}`);
      const node = nodes.find((candidate) => candidate.bounds && candidate.enabled && candidate.clickable
        && [candidate.text, candidate.contentDesc, candidate.hint]
          .flatMap(labelVariants).includes(label));
      const viewport = scrollViewportBounds(nodes);
      if (node && node.bounds.top < viewport.bottom * 0.85) return node;
      if (attempt < maxScrolls) await this.#scrollForward(nodes);
    }
    fail(`synthetic_clone_runner_action_missing:${phase}:${label}`);
  }

  async tapVisibleLabel(label, phase) {
    const node = await this.revealLabel(label, phase);
    const [x, y] = center(node.bounds);
    await this.shell(['input', 'tap', String(x), String(y)]);
  }

  async enterField(label, value, phase, { maxScrolls = 4 } = {}) {
    let node;
    for (let attempt = 0; attempt <= maxScrolls; attempt += 1) {
      const { nodes } = await this.dump(`${phase}-field-${attempt}`);
      node = nodes.find((candidate) => candidate.bounds
        && [candidate.hint, candidate.text].flatMap(labelVariants).includes(label));
      const viewport = scrollViewportBounds(nodes);
      if (node && node.bounds.top < viewport.bottom * 0.92) break;
      node = undefined;
      if (attempt < maxScrolls) await this.#scrollForward(nodes);
    }
    if (!node) fail(`synthetic_clone_runner_field_missing:${phase}:${label}`);
    const [x, y] = center(node.bounds);
    await this.shell(['input', 'tap', String(x), String(y)]);
    await this.shell(['input', 'keycombination', 'KEYCODE_CTRL_LEFT', 'KEYCODE_A']);
    await this.shell(['input', 'keyevent', 'KEYCODE_DEL']);
    await this.#inputText(value);
  }

  async waitContract(phase, { timeoutMs = 8_000, intervalMs = 250 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastMissing;
    while (Date.now() < deadline) {
      try {
        const dump = await this.dump(phase);
        assertSyntheticCloneInterface(dump.nodes, phase);
        return dump;
      } catch (error) {
        lastMissing = error;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
      }
    }
    throw lastMissing ?? new Error(`synthetic_clone_runner_readiness_timeout:${phase}`);
  }

  async waitForAny(labels, phase, { timeoutMs = 8_000, intervalMs = 250 } = {}) {
    const expected = new Set(labels);
    const deadline = Date.now() + timeoutMs;
    let lastDump;
    while (Date.now() < deadline) {
      lastDump = await this.dump(phase);
      if ([...nodeLabels(lastDump.nodes)].some((label) => expected.has(label))) return lastDump;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
    }
    throw new Error(`synthetic_clone_runner_readiness_timeout:${phase}`);
  }

  async waitForPattern(
    pattern,
    phase,
    { timeoutMs = 8_000, intervalMs = 250, revealBelowViewport = false } = {},
  ) {
    const deadline = Date.now() + timeoutMs;
    let revealed = false;
    while (Date.now() < deadline) {
      const dump = await this.dump(phase);
      if ([...nodeLabels(dump.nodes)].some((label) => pattern.test(label))) return dump;
      if (revealBelowViewport && !revealed) {
        const viewport = scrollViewportBounds(dump.nodes);
        const screenRight = viewport.right;
        const screenBottom = viewport.bottom;
        if (screenRight > 0 && screenBottom > 0) {
          await this.shell([
            'input',
            'swipe',
            String(Math.round(screenRight * 0.5)),
            String(Math.round(screenBottom * 0.78)),
            String(Math.round(screenRight * 0.5)),
            String(Math.round(screenBottom * 0.35)),
            '350',
          ]);
          revealed = true;
        }
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
    }
    throw new Error(`synthetic_clone_runner_readiness_timeout:${phase}`);
  }

  async launch() {
    await this.shell(['am', 'start', '-W', '-n', `${APPLICATION_ID}/${MAIN_ACTIVITY}`]);
  }

  async resetLocalQaApp() {
    const output = await this.shell(['pm', 'clear', APPLICATION_ID]);
    if (String(output).trim() !== 'Success') fail('synthetic_clone_runner_qa_reset_failed');
  }

  async reverseLoopback(port = 18080) {
    return this.#serial(async () => {
      await this.execFileImpl(this.adbPath, [
        '-s', this.device,
        'reverse',
        `tcp:${port}`,
        `tcp:${port}`,
      ], { maxBuffer: 1_024 * 1_024 });
    });
  }
}

async function apiJson(baseUrl, path, { token, method = 'GET', body, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${exactLoopbackApiBase(baseUrl)}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5_000),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

export async function assertCloneReadiness(session, { fetchImpl = fetch } = {}) {
  const validated = validateSyntheticCloneSessionManifest(session);
  const login = await apiJson(validated.apiBaseUrl, '/auth/login', {
    method: 'POST',
    body: { email: validated.owner.email, password: validated.owner.password },
    fetchImpl,
  });
  if (!login.response.ok || typeof login.payload.accessToken !== 'string') fail('synthetic_clone_runner_owner_login_not_ready');
  const token = login.payload.accessToken;
  const me = await apiJson(validated.apiBaseUrl, '/auth/me', { token, fetchImpl });
  if (!me.response.ok || me.payload.user?.id !== validated.owner.userId) fail('synthetic_clone_runner_owner_identity_mismatch');
  const status = await apiJson(validated.apiBaseUrl, '/synthetic-clone/status', { token, fetchImpl });
  if (!status.response.ok || status.payload.principals?.ownerId !== validated.owner.userId
      || status.payload.principals?.renterId !== validated.renter.userId
      || status.payload.principals?.listingId !== validated.listingId
      || status.payload.marker?.persistentNotice !== MARKER
      || status.payload.sideEffects?.platformContract !== false
      || status.payload.sideEffects?.c2cContract !== false
      || status.payload.sideEffects?.payment !== false
      || status.payload.sideEffects?.payout !== false
      || status.payload.sideEffects?.stripe !== false
      || status.payload.sideEffects?.review !== false
      || status.payload.sideEffects?.ranking !== false
      || status.payload.sideEffects?.notification !== false) {
    fail('synthetic_clone_runner_route_readiness_invalid');
  }
  if (session.syntheticClone?.paymentTest) validateSyntheticPaymentReadback(status.payload.paymentTest, { enabled: true, runId: validated.runId });
  return { validated, ownerToken: token, status: status.payload };
}

async function login(driver, roleAccount) {
  let initial = await driver.dump('login');
  if (hasLabel(initial.nodes, SYNTHETIC_CLONE_UI_CONTRACT.statusRefresh)) {
    if (hasLabel(initial.nodes, `Rolle: ${roleAccount.role}`)) return;
    await logout(driver);
    initial = await driver.dump('login-after-role-switch');
  }
  if (!hasLabel(initial.nodes, 'E-Mail') || !hasLabel(initial.nodes, 'Passwort')) {
    if (!hasLabel(initial.nodes, 'Anmelden') && hasLabel(initial.nodes, 'Back')) {
      await driver.tapLabel('Back', 'guest-profile-back');
      initial = await driver.waitForAny(
        [SYNTHETIC_CLONE_UI_CONTRACT.navigation.profile],
        'guest-profile-back',
      );
    }
    if (!hasLabel(initial.nodes, 'Anmelden')
        && hasLabel(initial.nodes, SYNTHETIC_CLONE_UI_CONTRACT.navigation.profile)) {
      await driver.tapLabel(SYNTHETIC_CLONE_UI_CONTRACT.navigation.profile, 'guest-navigation');
      initial = await driver.waitForAny(
        ['Anmelden', SYNTHETIC_CLONE_UI_CONTRACT.statusRefresh],
        'guest-profile',
      );
    }
    if (hasLabel(initial.nodes, SYNTHETIC_CLONE_UI_CONTRACT.statusRefresh)
        && hasLabel(initial.nodes, `Rolle: ${roleAccount.role}`)) return;
    if (hasLabel(initial.nodes, 'Anmelden')) {
      await driver.tapLabel('Anmelden', 'guest-profile');
      initial = await driver.waitForAny(['E-Mail'], 'login-route');
    }
  }
  const emailField = initial.nodes.find((node) => node.hint === 'E-Mail' && node.bounds);
  const passwordField = initial.nodes.find((node) => node.hint === 'Passwort' && node.bounds);
  const submit = initial.nodes.find((node) => (
    node.contentDesc === 'Anmelden' && node.bounds && node.clickable
  ));
  if (!emailField || !passwordField || !submit) fail('synthetic_clone_runner_login_contract_missing');
  await driver.enterField('E-Mail', roleAccount.email, 'login');
  await driver.enterField('Passwort', roleAccount.password, 'login');
  await driver.shell(['input', 'keyevent', 'KEYCODE_ENTER']);
  const submitReady = await driver.dump('login-submit-ready');
  if (!hasLabel(submitReady.nodes, SYNTHETIC_CLONE_UI_CONTRACT.navigation.profile)
      && !hasLabel(submitReady.nodes, SYNTHETIC_CLONE_UI_CONTRACT.navigation.logout)
      && !hasLabel(submitReady.nodes, SYNTHETIC_CLONE_UI_CONTRACT.statusRefresh)) {
    await driver.tapLabel('Anmelden', 'login');
  }
  await driver.waitForAny(['Mein SIT', SYNTHETIC_CLONE_UI_CONTRACT.title], 'post-login');
}

async function openClone(driver, expectedRole) {
  let dump = await driver.dump('navigation');
  if (!hasLabel(dump.nodes, SYNTHETIC_CLONE_UI_CONTRACT.statusRefresh)) {
    if (!hasLabel(dump.nodes, SYNTHETIC_CLONE_UI_CONTRACT.title)) {
      await driver.tapLabel(SYNTHETIC_CLONE_UI_CONTRACT.navigation.profile, 'navigation');
    }
    dump = await driver.dump('profile-clone-route');
    if (!hasLabel(dump.nodes, SYNTHETIC_CLONE_UI_CONTRACT.title)) {
      fail('synthetic_clone_runner_clone_route_missing');
    }
    let opened = false;
    let lastOpenError;
    for (let attempt = 0; attempt < 2 && !opened; attempt += 1) {
      try {
        await driver.revealLabel(SYNTHETIC_CLONE_UI_CONTRACT.title, 'profile-clone-route');
        await driver.tapLabel(SYNTHETIC_CLONE_UI_CONTRACT.title, 'profile-clone-route');
        await driver.waitForAny(
          [SYNTHETIC_CLONE_UI_CONTRACT.statusRefresh],
          'profile-clone-open',
          { timeoutMs: 5_000 },
        );
        opened = true;
      } catch (error) {
        lastOpenError = error;
      }
    }
    if (!opened) throw lastOpenError ?? new Error('synthetic_clone_runner_clone_route_open_failed');
  }
  dump = await driver.waitContract('diagnostic');
  if (!hasLabel(dump.nodes, `Rolle: ${expectedRole}`)) {
    fail(`synthetic_clone_runner_role_readback_mismatch:${expectedRole}`);
  }
  return dump;
}

async function logout(driver) {
  let dump = await driver.dump('logout');
  if (!hasLabel(dump.nodes, SYNTHETIC_CLONE_UI_CONTRACT.navigation.logout)
      && hasLabel(dump.nodes, 'Back')) {
    await driver.tapLabel('Back', 'logout-back');
    dump = await driver.waitForAny(
      [SYNTHETIC_CLONE_UI_CONTRACT.navigation.logout,
        SYNTHETIC_CLONE_UI_CONTRACT.navigation.profile],
      'logout-back',
    );
  }
  if (!hasLabel(dump.nodes, SYNTHETIC_CLONE_UI_CONTRACT.navigation.logout)
      && hasLabel(dump.nodes, SYNTHETIC_CLONE_UI_CONTRACT.navigation.profile)) {
    await driver.tapLabel(SYNTHETIC_CLONE_UI_CONTRACT.navigation.profile, 'logout-profile');
    dump = await driver.dump('logout-profile');
  }
  if (hasLabel(dump.nodes, SYNTHETIC_CLONE_UI_CONTRACT.navigation.logout)) {
    await driver.tapLabel(SYNTHETIC_CLONE_UI_CONTRACT.navigation.logout, 'logout');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 400));
    const confirm = await driver.dump('logout-confirm');
    if (hasLabel(confirm.nodes, SYNTHETIC_CLONE_UI_CONTRACT.navigation.logout)) {
      await driver.tapLabel(SYNTHETIC_CLONE_UI_CONTRACT.navigation.logout, 'logout-confirm');
    }
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      const signedOut = await driver.dump('post-logout');
      if (!hasLabel(signedOut.nodes, SYNTHETIC_CLONE_UI_CONTRACT.navigation.logout)) return;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    fail('synthetic_clone_runner_logout_not_completed');
  }
}

async function selectPhoto(driver, slot, segment) {
  const label = `${slot} – ${SYNTHETIC_CLONE_UI_CONTRACT.pickerSuffix}`;
  await driver.tapVisibleLabel(label, `${segment}-photos`);
  const picker = await driver.dump(`${segment}-photo-picker`);
  const image = findPhotoPickerImageNode(picker.nodes);
  if (!image) fail(`synthetic_clone_runner_photo_picker_image_missing:${segment}`);
  const [x, y] = center(image.bounds);
  await driver.shell(['input', 'tap', String(x), String(y)]);
  const doneDump = await driver.dump(`${segment}-photo-picker-done`);
  const done = findPhotoPickerConfirmNode(doneDump.nodes);
  if (!done) fail(`synthetic_clone_runner_photo_picker_confirm_missing:${segment}`);
  const [doneX, doneY] = center(done.bounds);
  await driver.shell(['input', 'tap', String(doneX), String(doneY)]);
  // A completed slot intentionally disappears as a picker action.  Readiness
  // therefore checks the stable segment/status after each selection; the
  // challenge button itself proves that all four distinct slots are present.
  await driver.waitContract(segment === 'pickup' ? 'accepted' : 'active');
}

async function selectFourPhotos(driver, segment) {
  for (const slot of PHOTO_SLOTS) await selectPhoto(driver, slot, segment);
}

async function loadBooking(driver, bookingId, phase) {
  await driver.enterField(SYNTHETIC_CLONE_UI_CONTRACT.bookingField, bookingId, phase);
  await driver.shell(['input', 'keyevent', 'KEYCODE_ENTER']);
  await driver.tapLabel(SYNTHETIC_CLONE_UI_CONTRACT.bookingLoad, phase);
}

async function enterIsolatedRole(driver, roleAccount) {
  await driver.resetLocalQaApp();
  await driver.launch();
  await login(driver, roleAccount);
}

export async function runSyntheticClonePhysicalFlow({ primary, qrDisplay, qrPayload, session, paymentReadback, sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)) }) {
  const validated = validateSyntheticCloneSessionManifest(session);
  await enterIsolatedRole(primary, validated.renter);
  await openClone(primary, 'renter');
  await primary.waitContract('diagnostic');
  await primary.tapVisibleLabel(SYNTHETIC_CLONE_UI_CONTRACT.createRequested, 'requested');
  await primary.waitContract('requested');
  const requestedDump = await primary.dump('requested-booking-id');
  const bookingId = requestedDump.nodes.find((node) => UUID.test(node.text))?.text;
  if (!bookingId) fail('synthetic_clone_runner_booking_id_not_visible');
  let paymentTest;
  if (session.syntheticClone?.paymentTest) {
    if (!paymentReadback) fail('synthetic_payment_readback_required');
    paymentTest = await runSyntheticPaymentUiFlow({ driver: primary, runId: validated.runId, bookingId,
      readBooking: () => paymentReadback(`/synthetic-clone/bookings/${bookingId}`),
      readPayment: () => paymentReadback(`/synthetic-clone/bookings/${bookingId}/payment-test?runId=${encodeURIComponent(validated.runId)}`),
    });
  }

  await enterIsolatedRole(primary, validated.owner);
  await openClone(primary, 'owner');
  await loadBooking(primary, bookingId, 'owner-requested');
  await primary.waitContract('requested');
  await primary.tapVisibleLabel(SYNTHETIC_CLONE_UI_CONTRACT.accept, 'accepted');
  await primary.waitContract('accepted');
  await selectFourPhotos(primary, 'pickup');
  await primary.tapVisibleLabel(SYNTHETIC_CLONE_UI_CONTRACT.pickupChallenge, 'pickup-challenge');
  await primary.waitForPattern(
    /^Challenge-ID:\s*[0-9a-f-]{36}$/iu,
    'pickup-challenge-issued',
    { revealBelowViewport: true },
  );
  await primary.waitContract('pickupChallenge');
  let manualPayload = null;
  if (!qrDisplay) {
    // The owner screen exposes the exact challenge id and six-digit code.  The
    // v3 payload is deterministic from those visible values and the booking
    // id, so one-device mode can enter the exact payload in the diagnostic UI
    // without an API-side challenge mutation or a camera-scan claim.
    const presenter = await primary.dump('pickup-presenter-payload');
    const { challengeId, fallbackCode: code } = extractVisibleChallengeParts(
      presenter.nodes,
      'pickup',
    );
    manualPayload = validateManualQrV3Payload(
      `shareittoo:v3:pickup:owner:${challengeId}:${code}:${bookingId}`,
    );
    if (typeof qrPayload === 'string' && qrPayload.trim() !== ''
        && validateManualQrV3Payload(qrPayload) !== manualPayload) {
      fail('synthetic_clone_runner_manual_qr_payload_mismatch');
    }
  }

  if (qrDisplay) {
    // An optional second physical display enables a real camera scan.  The
    // verifier never receives a payload through ADB or an API shortcut.
    await enterIsolatedRole(qrDisplay, validated.owner);
    await openClone(qrDisplay, 'owner');
    await loadBooking(qrDisplay, bookingId, 'pickup-display');
    await qrDisplay.waitContract('pickupChallenge');
    // Re-issue on the display device so the QR is visible to the real camera;
    // the backend keeps this inside the same synthetic accepted booking.
    await qrDisplay.tapVisibleLabel(SYNTHETIC_CLONE_UI_CONTRACT.pickupChallenge, 'pickup-display');
    await qrDisplay.waitForPattern(
      /^Challenge-ID:\s*[0-9a-f-]{36}$/iu,
      'pickup-display-issued',
      { revealBelowViewport: true },
    );
    await qrDisplay.waitContract('pickupChallenge');
  }

  await enterIsolatedRole(primary, validated.renter);
  await openClone(primary, 'renter');
  await loadBooking(primary, bookingId, 'renter-pickup-verifier');
  await primary.waitContract('pickupVerifier');
  if (qrDisplay) {
    await primary.tapLabel(SYNTHETIC_CLONE_UI_CONTRACT.qrScan, 'pickup-qr-scan');
  } else {
    // One-device mode uses the screen's explicit manual QR-v3 payload field.
    // The server verifies the exact payload cryptographically; this is not a
    // fallback to the six-digit code and is reported separately in evidence.
    await primary.enterField(SYNTHETIC_CLONE_UI_CONTRACT.qrPayloadField, manualPayload, 'pickup-qr-payload');
    await primary.shell(['input', 'keyevent', 'KEYCODE_ENTER']);
    await primary.tapVisibleLabel(SYNTHETIC_CLONE_UI_CONTRACT.qrPayloadVerify, 'pickup-qr-payload');
  }
  await primary.waitContract('active', { timeoutMs: 60_000, intervalMs: 500 });
  await selectFourPhotos(primary, 'return');
  await primary.tapVisibleLabel(SYNTHETIC_CLONE_UI_CONTRACT.returnChallenge, 'return-challenge');
  await primary.waitForPattern(
    /^Fallback-Code:\s*\d{6}$/u,
    'return-challenge-issued',
    { revealBelowViewport: true },
  );
  await primary.waitContract('returnChallenge');

  // The return path intentionally uses the exact six-digit fallback after a
  // fresh role switch; the code is read transiently from the visible presenter
  // screen and never emitted into evidence or command arguments.
  const returnPresenter = await primary.dump('return-presenter-code');
  const { challengeId: returnChallengeId, fallbackCode: fallback } =
    extractVisibleChallengeParts(returnPresenter.nodes, 'return');
  await enterIsolatedRole(primary, validated.owner);
  await openClone(primary, 'owner');
  await loadBooking(primary, bookingId, 'owner-return-verifier');
  await primary.waitContract('returnVerifier');
  await primary.enterField(
    SYNTHETIC_CLONE_UI_CONTRACT.challengeIdField,
    returnChallengeId,
    'return-challenge-id',
  );
  await primary.enterField(SYNTHETIC_CLONE_UI_CONTRACT.fallbackField, fallback, 'return-fallback');
  await primary.shell(['input', 'keyevent', 'KEYCODE_ENTER']);
  await primary.tapVisibleLabel(SYNTHETIC_CLONE_UI_CONTRACT.fallbackVerify, 'return-fallback');
  await primary.waitContract('returned', { timeoutMs: 15_000 });
  if (paymentTest) {
    await primary.tapVisibleLabel('Lokalen Zahlungstest öffnen', 'payment-owner');
    await primary.waitForPattern(/^Server-Teststatus: refunded$/u, 'payment-owner-readback');
    await primary.waitForPattern(/^Vermieteransicht: nur Serverstatus; keine Zahlungsaktion\.$/u, 'payment-owner-role');
    await primary.shell(['input', 'keyevent', 'KEYCODE_BACK']);
    paymentTest.ownerReadback = true;
  }
  await primary.tapVisibleLabel(SYNTHETIC_CLONE_UI_CONTRACT.auditLoad, 'audit');
  await primary.waitContract('audit');
  await primary.tapVisibleLabel(SYNTHETIC_CLONE_UI_CONTRACT.cleanup, 'audit');
  await sleep(400);
  return {
    statuses: [...STATUS_SEQUENCE],
    bookingId,
    pickupPhotos: 4,
    returnPhotos: 4,
    pickupVerification: 'qr-v3',
    qrVerificationMode: qrDisplay ? 'camera' : 'manual-payload',
    returnVerification: 'six_digit_fallback',
    ...(paymentTest ? { paymentTest } : {}),
  };
}

export function sanitizedRunnerError(error) {
  return safeEvidenceText(error?.message ?? 'synthetic_clone_runner_failed')
    .replace(/(?:password|token|secret|authorization)[^\s]*/giu, '[redacted]');
}

async function main() {
  const manifestPath = process.env.SIT_LOCAL_QA_SESSION_MANIFEST?.trim() || DEFAULT_MANIFEST_PATH;
  const device = process.env.SIT_ANDROID_DEVICE?.trim();
  const qrDevice = process.env.SIT_ANDROID_QR_DISPLAY_DEVICE?.trim();
  const qrPayload = process.env.SIT_SYNTHETIC_CLONE_QR_V3_PAYLOAD;
  if (!device) fail('synthetic_clone_runner_device_required');
  if (qrDevice && qrDevice === device) fail('synthetic_clone_runner_qr_display_device_must_differ');
  const session = JSON.parse(await readStablePrivateFile(manifestPath, {
    expectedMode: 0o600,
    minBytes: 1,
    maxBytes: 32 * 1024,
    code: 'synthetic_clone_runner_private_manifest_required',
  }));
  const readiness = await assertCloneReadiness(session);
  const primary = new SerialUiAutomator({ device });
  const qrDisplay = qrDevice ? new SerialUiAutomator({ device: qrDevice }) : null;
  if (qrDisplay) {
    // The backend helper binds the primary phone.  The optional QR display is
    // attached after manifest readiness and receives the same loopback reverse;
    // no public/server endpoint is introduced.
    await qrDisplay.reverseLoopback();
  }
  const flow = await runSyntheticClonePhysicalFlow({ primary, qrDisplay, qrPayload, session, paymentReadback: async (path) => {
    const value = await apiJson(readiness.validated.apiBaseUrl, path, { token: readiness.ownerToken });
    if (!value.response.ok) fail('synthetic_payment_readback_failed');
    return value.payload;
  } });
  const evidence = buildSyntheticCloneEvidence({
    session,
    physicalDevice: { physical: true, apiLevel: null },
    ...flow,
  });
  const finalStatus = await apiJson(readiness.validated.apiBaseUrl, '/synthetic-clone/status', { token: readiness.ownerToken });
  if (!finalStatus.response.ok || finalStatus.payload.cleaned !== true || finalStatus.payload.bookings !== 0) {
    fail('synthetic_clone_runner_cleanup_readback_failed');
  }
  if (flow.paymentTest) {
    const state = finalStatus.payload.paymentTest;
    if (state?.enabled !== false || state?.runId !== readiness.validated.runId || state.states !== 0 || state.commands !== 0 || state.auditEvents !== 0) fail('synthetic_payment_cleanup_readback_failed');
    evidence.paymentTest = { ...flow.paymentTest, cleanupVerified: true };
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${sanitizedRunnerError(error)}\n`);
    process.exitCode = 1;
  });
}
