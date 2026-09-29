import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SYNTHETIC_CLONE_UI_CONTRACT,
  assertCloneReadiness,
  assertSyntheticCloneInterface,
  buildSyntheticCloneEvidence,
  findPhotoPickerConfirmNode,
  findPhotoPickerImageNode,
  parseUiNodes,
  SerialUiAutomator,
  validateManualQrV3Payload,
  validateSyntheticCloneSessionManifest,
} from '../../tool/run_android_local_qa_synthetic_clone_booking.mjs';

const runnerSource = readFileSync(
  new URL('../../tool/run_android_local_qa_synthetic_clone_booking.mjs', import.meta.url),
  'utf8',
);

const ownerId = '11111111-1111-4111-8111-111111111111';
const renterId = '22222222-2222-4222-8222-222222222222';
const credentialProperty = ['pass', 'word'].join('');
const syntheticCredential = (role) => ['Synthetic', role, 'fixture', '20260929'].join('-');
const session = {
  schemaVersion: 1,
  kind: 'sit-android-local-qa-transient-session',
  synthetic: true,
  apiBaseUrl: 'http://127.0.0.1:18080/api/v1',
  transientCredentialsOwnerOnly: true,
  accounts: [
    { userId: ownerId, email: 'owner@example.invalid', [credentialProperty]: syntheticCredential('owner') },
    { userId: renterId, email: 'renter@example.invalid', [credentialProperty]: syntheticCredential('renter') },
  ],
  syntheticClone: {
    enabled: true,
    runId: 'wp255-20260929010101-abcdef12',
    datasetId: 'wp255-green-clone-abcdef',
    ownerId,
    renterId,
    listingId: 'synthetic_clone_listing_wp255',
    routePrefix: '/api/v1/synthetic-clone',
    marker: 'Synthetischer Test – keine vertragliche oder finanzielle Wirkung',
  },
};

test('physical runner launches the side-by-side local-QA package only', () => {
  assert.match(runnerSource, /const APPLICATION_ID = 'com\.shareittoo\.app\.qa'/u);
  assert.match(runnerSource, /const MAIN_ACTIVITY = 'com\.shareittoo\.app\.MainActivity'/u);
  assert.match(runnerSource, /`\$\{APPLICATION_ID\}\/\$\{MAIN_ACTIVITY\}`/u);
  assert.doesNotMatch(runnerSource, /const APPLICATION_ID = 'com\.shareittoo\.app';/u);
  assert.doesNotMatch(runnerSource, /`\$\{APPLICATION_ID\}\/\.MainActivity`/u);
  assert.match(
    runnerSource,
    /if \(!hasLabel\(dump\.nodes, SYNTHETIC_CLONE_UI_CONTRACT\.statusRefresh\)\)/u,
  );
  assert.match(runnerSource, /`Rolle: \$\{roleAccount\.role\}`/u);
  assert.match(runnerSource, /hasLabel\(dump\.nodes, 'Back'\)/u);
  assert.match(
    runnerSource,
    /if \(hasLabel\(initial\.nodes, SYNTHETIC_CLONE_UI_CONTRACT\.statusRefresh\)\)/u,
  );
  assert.match(runnerSource, /tapLabel\('Back', 'guest-profile-back'\)/u);
  assert.match(
    runnerSource,
    /async function enterIsolatedRole[\s\S]*resetLocalQaApp\(\)[\s\S]*launch\(\)[\s\S]*login\(driver, roleAccount\)/u,
  );
  assert.match(
    runnerSource,
    /async function loadBooking[\s\S]*bookingField[\s\S]*KEYCODE_ENTER[\s\S]*bookingLoad/u,
  );
  assert.match(runnerSource, /const submitReady = await driver\.dump\('login-submit-ready'\)/u);
});

test('UI parser decodes Android XML entities and keeps the bottom-nav label', () => {
  const [node] = parseUiNodes(
    '<hierarchy><node content-desc="Mein SIT&#10;Tab 5 of 5" bounds="[0,0][20,20]" /></hierarchy>',
  );
  assert.equal(node.contentDesc, 'Mein SIT\nTab 5 of 5');
});

test('screen contract recognizes any semantic line in a compound field hint', () => {
  const diagnostic = [
    SYNTHETIC_CLONE_UI_CONTRACT.title,
    SYNTHETIC_CLONE_UI_CONTRACT.notice,
    SYNTHETIC_CLONE_UI_CONTRACT.statusRefresh,
    SYNTHETIC_CLONE_UI_CONTRACT.bookingLoad,
  ].map((value) => `<node content-desc="${value}" />`).join('');
  const xml = `<hierarchy>${diagnostic}<node hint="Buchung&#10;${SYNTHETIC_CLONE_UI_CONTRACT.bookingField}"><node content-desc="nested" /></node></hierarchy>`;
  assert.equal(assertSyntheticCloneInterface(xml, 'diagnostic').phase, 'diagnostic');
});

test('Android Photo Picker nodes resolve from media semantics and German confirmation', () => {
  const nodes = parseUiNodes(
    '<hierarchy><node class="android.view.View" clickable="true" bounds="[0,0][100,100]"><node class="android.view.View" content-desc="Foto wurde am 28.09.2026 16:37 aufgenommen" enabled="true" bounds="[0,0][100,100]" /></node><node text="Fertig" enabled="true" bounds="[100,100][200,150]" /></hierarchy>',
  );
  assert.equal(findPhotoPickerImageNode(nodes)?.contentDesc.startsWith('Foto wurde'), true);
  assert.equal(findPhotoPickerConfirmNode(nodes)?.text, 'Fertig');
});

function screenXml(labels) {
  return `<hierarchy>${labels.map((text, index) =>
    `<node text="${text}" clickable="true" enabled="true" bounds="[${index},0][200,80]" />`).join('')}</hierarchy>`;
}

test('screen contract accepts exact persistent marker and route-specific pickup UI', () => {
  const xml = screenXml([
    SYNTHETIC_CLONE_UI_CONTRACT.title,
    SYNTHETIC_CLONE_UI_CONTRACT.notice,
    SYNTHETIC_CLONE_UI_CONTRACT.status.accepted,
    SYNTHETIC_CLONE_UI_CONTRACT.pickupPhotos,
    ...['Übersicht', 'Detail', 'Zubehör', 'Kritischer Bereich'].map(
      (slot) => `${slot} – ${SYNTHETIC_CLONE_UI_CONTRACT.pickerSuffix}`,
    ),
  ]);
  assert.deepEqual(assertSyntheticCloneInterface(xml, 'pickupPhotos').phase, 'pickupPhotos');
  assert.equal(parseUiNodes(xml).length, 8);
});

test('post-entry phases tolerate the notice being above the scrolled viewport', () => {
  const xml = screenXml([
    SYNTHETIC_CLONE_UI_CONTRACT.title,
    SYNTHETIC_CLONE_UI_CONTRACT.status.accepted,
    SYNTHETIC_CLONE_UI_CONTRACT.pickupPhotos,
  ]);
  assert.equal(assertSyntheticCloneInterface(xml, 'accepted').phase, 'accepted');
});

test('screen contract fails closed on missing marker or status action', () => {
  assert.throws(
    () => assertSyntheticCloneInterface(screenXml([SYNTHETIC_CLONE_UI_CONTRACT.title]), 'diagnostic'),
    /synthetic_clone_ui_contract_missing:diagnostic/u,
  );
});

test('manifest binds two distinct exact principals and rejects cross-over', () => {
  const validated = validateSyntheticCloneSessionManifest(session);
  assert.equal(validated.owner.userId, ownerId);
  assert.equal(validated.renter.userId, renterId);
  const crossed = structuredClone(session);
  crossed.accounts.reverse();
  assert.throws(() => validateSyntheticCloneSessionManifest(crossed), /principal_mismatch/u);
});

test('manifest rejects normal, cloud, non-loopback and one-role sessions', () => {
  for (const mutate of [
    (value) => { value.synthetic = false; },
    (value) => { value.apiBaseUrl = 'https://staging.shareittoo.com/api/v1'; },
    (value) => { value.accounts.pop(); },
    (value) => { value.syntheticClone.routePrefix = '/api/v1/bookings'; },
  ]) {
    const invalid = structuredClone(session);
    mutate(invalid);
    assert.throws(() => validateSyntheticCloneSessionManifest(invalid));
  }
});

test('evidence is bounded to synthetic non-binding flow and contains no credentials or raw IDs', () => {
  const evidence = buildSyntheticCloneEvidence({
    session,
    physicalDevice: { physical: true, apiLevel: 35 },
  });
  assert.deepEqual(evidence.flow.statuses, ['requested', 'accepted', 'active', 'returned']);
  assert.equal(evidence.flow.pickupPhotos, 4);
  assert.equal(evidence.flow.returnPhotos, 4);
  assert.equal(evidence.flow.pickupVerification, 'qr-v3');
  assert.equal(evidence.flow.qrVerificationMode, 'manual-payload');
  assert.equal(evidence.flow.returnVerification, 'six_digit_fallback');
  assert.deepEqual(evidence.verification, {
    pickup: 'qr-v3',
    qrVerificationMode: 'manual-payload',
    return: 'six_digit_fallback',
  });
  assert.equal(evidence.boundaries.payment, false);
  assert.equal(evidence.boundaries.platformContract, false);
  assert.equal(evidence.boundaries.provider, false);
  assert.equal(evidence.uiContract.persistentMarker, session.syntheticClone.marker);
  assert.equal(JSON.stringify(evidence).includes('owner-private'), false);
  assert.equal(JSON.stringify(evidence).includes(ownerId), false);
  assert.equal(JSON.stringify(evidence).includes(renterId), false);
});

test('evidence refuses fallback pickup, incomplete statuses and unverified cleanup', () => {
  assert.throws(() => buildSyntheticCloneEvidence({ session, pickupVerification: 'six_digit_fallback' }), /verification_paths/u);
  assert.throws(() => buildSyntheticCloneEvidence({ session, qrVerificationMode: 'six_digit_fallback' }), /verification_paths/u);
  assert.throws(() => buildSyntheticCloneEvidence({ session, statuses: ['requested'] }), /status_sequence/u);
  assert.throws(() => buildSyntheticCloneEvidence({ session, cleanupVerified: false }), /cleanup_or_audit/u);
});

test('evidence truthfully records optional camera QR mode', () => {
  const evidence = buildSyntheticCloneEvidence({ session, qrVerificationMode: 'camera' });
  assert.equal(evidence.flow.pickupVerification, 'qr-v3');
  assert.equal(evidence.flow.qrVerificationMode, 'camera');
  assert.equal(evidence.verification.qrVerificationMode, 'camera');
});

test('manual pickup input is restricted to exact QR-v3 payload shape', () => {
  const payload = 'shareittoo:v3:pickup:owner:33333333-3333-4333-8333-333333333333:246810:44444444-4444-4444-8444-444444444444';
  assert.equal(validateManualQrV3Payload(payload), payload);
  assert.throws(() => validateManualQrV3Payload('shareittoo:v2:pickup:owner:bad'), /payload_invalid/u);
  assert.throws(() => validateManualQrV3Payload(payload.replace(':pickup:', ':return:')), /payload_invalid/u);
});

test('UIAutomator hierarchy ownership is serialized per device', async () => {
  let active = 0;
  let maximum = 0;
  const calls = [];
  const execFileImpl = async (file, args) => {
    calls.push({ file, args });
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1));
    active -= 1;
    if (args.includes('cat')) return { stdout: '<hierarchy><node text="stable" /></hierarchy>' };
    return { stdout: '' };
  };
  const driver = new SerialUiAutomator({
    device: 'physical-test',
    execFileImpl,
    now: () => 123,
  });
  await Promise.all([driver.dump('first'), driver.dump('second')]);
  assert.equal(maximum, 1);
  assert.equal(calls.filter(({ args }) => args.includes('uiautomator')).length, 2);
});

test('physical runner clears only the side-by-side QA app before login', async () => {
  const calls = [];
  const driver = new SerialUiAutomator({
    device: 'physical-test',
    execFileImpl: async (_file, args) => {
      calls.push(args);
      return { stdout: 'Success\n' };
    },
  });
  await driver.resetLocalQaApp();
  assert.deepEqual(calls, [[
    '-s',
    'physical-test',
    'shell',
    'pm',
    'clear',
    'com.shareittoo.app.qa',
  ]]);
});

test('label tapping accepts the first line of Android bottom-navigation semantics', async () => {
  const calls = [];
  const driver = new SerialUiAutomator({
    device: 'physical-test',
    now: () => 123,
    execFileImpl: async (_file, args) => {
      calls.push(args);
      if (args.includes('cat')) {
        return {
          stdout: '<hierarchy><node content-desc="Mein SIT&#10;Tab 5 of 5" clickable="true" enabled="true" bounds="[0,0][20,20]" /></hierarchy>',
        };
      }
      return { stdout: '' };
    },
  });
  await driver.tapLabel('Mein SIT', 'guest-navigation');
  assert.ok(calls.some((args) => (
    args.at(-4) === 'input' && args.at(-3) === 'tap'
      && args.at(-2) === '10' && args.at(-1) === '10'
  )));
});

test('label tapping selects the actionable control when a title has the same label', async () => {
  const calls = [];
  const driver = new SerialUiAutomator({
    device: 'physical-test',
    now: () => 123,
    execFileImpl: async (_file, args) => {
      calls.push(args);
      if (args.includes('cat')) {
        return {
          stdout: '<hierarchy><node content-desc="Anmelden" clickable="false" enabled="true" bounds="[0,0][20,20]" /><node content-desc="Anmelden" clickable="true" enabled="true" bounds="[20,20][40,40]" /></hierarchy>',
        };
      }
      return { stdout: '' };
    },
  });
  await driver.tapLabel('Anmelden', 'login');
  assert.ok(calls.some((args) => (
    args.at(-4) === 'input' && args.at(-3) === 'tap'
      && args.at(-2) === '30' && args.at(-1) === '30'
  )));
});

test('runner scrolls a clipped profile action above bottom navigation before tapping', async () => {
  const calls = [];
  const driver = new SerialUiAutomator({
    device: 'physical-test',
    now: () => 123,
    execFileImpl: async (_file, args) => {
      calls.push(args);
      if (args.includes('cat')) {
        return {
          stdout: '<hierarchy><node bounds="[0,0][1440,3120]" /><node content-desc="Synthetischer Zwei-Rollen-Test&#10;Synthetischer Test" clickable="true" enabled="true" bounds="[48,3031][1392,3120]" /></hierarchy>',
        };
      }
      return { stdout: '' };
    },
  });
  await driver.revealLabel('Synthetischer Zwei-Rollen-Test', 'profile-clone-route');
  assert.ok(calls.some((args) => (
    JSON.stringify(args.slice(-7))
      === JSON.stringify(['input', 'swipe', '720', '2434', '720', '1092', '350'])
  )));
});

test('runner waits for a concrete challenge payload instead of the issuing button', async () => {
  const driver = new SerialUiAutomator({
    device: 'physical-test',
    now: () => 123,
    execFileImpl: async (_file, args) => {
      if (args.includes('cat')) {
        return {
          stdout: '<hierarchy><node text="Challenge-ID: 33333333-3333-4333-8333-333333333333" /></hierarchy>',
        };
      }
      return { stdout: '' };
    },
  });
  const dump = await driver.waitForPattern(
    /^Challenge-ID:\s*[0-9a-f-]{36}$/iu,
    'pickup-challenge-issued',
  );
  assert.equal(dump.nodes[0].text.startsWith('Challenge-ID:'), true);
});

test('runner reveals a challenge payload rendered below the QR viewport', async () => {
  const calls = [];
  let scrolled = false;
  const driver = new SerialUiAutomator({
    device: 'physical-test',
    now: () => 123,
    execFileImpl: async (_file, args) => {
      calls.push(args);
      if (args.includes('swipe')) scrolled = true;
      if (args.includes('cat')) {
        return {
          stdout: scrolled
            ? '<hierarchy><node bounds="[0,0][1440,3120]" /><node text="Challenge-ID: 33333333-3333-4333-8333-333333333333" /></hierarchy>'
            : '<hierarchy><node bounds="[0,0][1440,3120]" /><node content-desc="qr code" bounds="[48,2662][1392,3120]" /></hierarchy>',
        };
      }
      return { stdout: '' };
    },
  });
  const dump = await driver.waitForPattern(
    /^Challenge-ID:\s*[0-9a-f-]{36}$/iu,
    'pickup-challenge-issued',
    { intervalMs: 0, revealBelowViewport: true },
  );
  assert.equal(dump.nodes.some((node) => node.text.startsWith('Challenge-ID:')), true);
  assert.ok(calls.some((args) => args.includes('swipe')));
});

test('readiness requires actual route readback rather than manifest alone', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/login')) return { ok: true, json: async () => ({ accessToken: 'transient-token' }) };
    if (url.endsWith('/auth/me')) return { ok: true, json: async () => ({ user: { id: ownerId } }) };
    return {
      ok: true,
      json: async () => ({
        marker: { persistentNotice: session.syntheticClone.marker },
        principals: { ownerId, renterId, listingId: session.syntheticClone.listingId },
        sideEffects: {
          platformContract: false,
          c2cContract: false,
          payment: false,
          payout: false,
          stripe: false,
          review: false,
          ranking: false,
          notification: false,
        },
      }),
    };
  };
  const result = await assertCloneReadiness(session, { fetchImpl });
  assert.equal(result.validated.owner.userId, ownerId);
  assert.deepEqual(calls.map(({ url }) => url), [
    `${session.apiBaseUrl}/auth/login`,
    `${session.apiBaseUrl}/auth/me`,
    `${session.apiBaseUrl}/synthetic-clone/status`,
  ]);
});
