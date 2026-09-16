#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  bindExactRole,
  openMainDestination,
  tapLabel,
  waitForHierarchy,
} from './diagnose_android_email_verified_two_role_product_journey.mjs';
import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  verifyCurrentHeadAndroidInstalledCandidate,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import { readEmailVerifiedJourneyVault } from './run_staging_email_verified_two_role_journey.mjs';
import { validatePrivateAndroidReleaseArchive } from './validate_current_head_android_release_archive.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const fixtureRelativePath = 'test/fixtures/listing-ai/generic-cordless-drill.png';
const fixtureSha256 = '85458cb5bc4777c587bfb8994ff0f960c8549f5423df9cc33b4c90fc65ffd420';
const remoteFixture = '/sdcard/Download/SIT_WP112_CONTROLLED_DRILL.png';
const fixtureDisplayName = 'SIT_WP112_CONTROLLED_DRILL.png';
const providerModel = 'mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1';
const disclosureVersion = 'listing-ai-on-device-disclosure-v1';

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sanitizedFailure(error) {
  const detail = typeof error?.message === 'string' ? error.message.trim() : '';
  if (detail.length === 0 || detail.length > 300
      || /(?:@|https?:\/\/|\/Users\/|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|fixture identifier)/iu.test(detail)
      || !/^[A-Za-z0-9_ .,:;()[\]'/-]+$/u.test(detail)) {
    return 'safe diagnostic reason unavailable';
  }
  return detail;
}

function bounds(node) {
  const value = currentHeadAndroidNodeAttribute(node, 'bounds') ?? '';
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(value);
  if (match === null) return null;
  const [left, top, right, bottom] = match.slice(1).map(Number);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function allNodes(hierarchy) {
  return String(hierarchy).match(/<node\b[^>]*>/gu) ?? [];
}

export function newestPhotoPickerTile(hierarchy) {
  const tiles = allNodes(hierarchy)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'package')
      === 'com.google.android.photopicker')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true')
    .map((node) => ({ node, area: bounds(node) }))
    .filter(({ area }) => area !== null
      && area.top > 700
      && area.width >= 200
      && area.height >= 200
      && Math.abs(area.width - area.height) <= 8)
    .toSorted((left, right) => left.area.top - right.area.top
      || left.area.left - right.area.left);
  if (tiles.length === 0) fail('The sanitized Android photo-picker tile is unavailable.');
  return tiles[0];
}

export function controlledMediaRow(output) {
  const rows = String(output).split(/\r?\n/u).map((line) => {
    const id = /(?:^|\s)_id=(\d+)(?:,|$)/u.exec(line)?.[1];
    const name = /(?:^|\s)_display_name=([^,]+)(?:,|$)/u.exec(line)?.[1];
    const added = /(?:^|\s)date_added=(\d+)(?:,|$)/u.exec(line)?.[1];
    return id && name && added
      ? { id: Number(id), name, added: Number(added) }
      : null;
  }).filter(Boolean);
  const exact = rows.filter((row) => row.name === fixtureDisplayName);
  if (exact.length !== 1) fail('The controlled Android media fixture is not unique.');
  const newest = rows.toSorted((left, right) => right.added - left.added || right.id - left.id)[0];
  if (newest?.id !== exact[0].id) {
    fail('The controlled Android media fixture is not the newest photo-picker item.');
  }
  return exact[0];
}

export function onDeviceListingAiUiProof(hierarchy) {
  const count = (label) => currentHeadAndroidNamedNodes(hierarchy, label).length;
  const proof = {
    draftReady: count('Bearbeitbarer Entwurf ist bereit.') > 0,
    editableDraftVisible: count('Bearbeitbarer KI-Entwurf') > 0,
    titleSuggested: count('title: bitte prüfen') + count('title: hoch – bearbeitbar') > 0,
    categorySuggested: count('category: bitte prüfen') + count('category: hoch – bearbeitbar') > 0,
    subcategorySuggested: count('subcategory: bitte prüfen')
      + count('subcategory: hoch – bearbeitbar') > 0,
    descriptionSuggested: count('description: bitte prüfen')
      + count('description: hoch – bearbeitbar') > 0,
    projectTagsSuggested: count('projectTags: bitte prüfen')
      + count('projectTags: hoch – bearbeitbar') > 0,
    useCasesSuggested: count('useCases: bitte prüfen')
      + count('useCases: hoch – bearbeitbar') > 0,
    safeFallbackAbsent: count('Manueller Fallback aktiv.') === 0
      && count('Manueller Editor geöffnet.') === 0,
  };
  if (Object.values(proof).some((value) => value !== true)) {
    fail('The sanitized on-device Listing-AI result is incomplete.');
  }
  return Object.freeze(proof);
}

async function collectOnDeviceListingAiUiProof({
  commandRunner,
  adbPath,
  device,
  initialHierarchy,
  wait,
}) {
  let combined = String(initialHierarchy);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      onDeviceListingAiUiProof(combined);
      return combined;
    } catch {
      currentHeadAndroidAdb(commandRunner, adbPath, device, [
        'shell', 'input', 'swipe', '540', '1700', '540', '900', '220',
      ]);
      await wait(300);
      combined += dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    }
  }
  onDeviceListingAiUiProof(combined);
  return combined;
}

function exactServerProof(value) {
  const expected = [
    'recentDraftFound',
    'exactlyOneRecentDraft',
    'ageBounded',
    'statusEditing',
    'revisionOne',
    'disclosureExact',
    'preflightConsumed',
    'oneVersion',
    'suggestionsNonempty',
    'allOwnerConfirmationsFalse',
    'providerOnDevice',
    'modelExact',
    'zeroUnitsAndCost',
    'outcomeSucceeded',
    'notPublished',
    'generationAuditExact',
  ];
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected.sort())
      || expected.some((key) => value[key] !== true)) {
    fail('The sanitized Staging Listing-AI readback did not close exactly.');
  }
  return Object.freeze({ ...value });
}

export async function runAndroidOnDeviceListingAiAcceptance({
  candidate,
  deviceSummary,
  operations,
  capturedAt = new Date().toISOString(),
} = {}) {
  const required = ['perform', 'verifyServer', 'cleanup', 'restoreOwner'];
  if (operations === null || typeof operations !== 'object'
      || required.some((key) => typeof operations[key] !== 'function')) {
    fail('The on-device Listing-AI acceptance operations are incomplete.');
  }
  let performed = null;
  let server = null;
  let cleanup = null;
  let primaryFailure = null;
  let cleanupFailure = null;
  try {
    performed = await operations.perform();
    server = exactServerProof(await operations.verifyServer(performed));
  } catch (error) {
    primaryFailure = error;
  } finally {
    try {
      cleanup = await operations.cleanup(performed);
      if (primaryFailure === null
          && (cleanup?.localRecoveryCleared !== true
            || cleanup?.controlledMediaRemoved !== true)) {
        fail('The controlled Listing-AI device cleanup did not close exactly.');
      }
    } catch (error) {
      cleanupFailure = error;
    }
    try {
      if (await operations.restoreOwner() !== true) {
        fail('The protected owner session was not restored.');
      }
    } catch (error) {
      cleanupFailure ??= error;
    }
  }
  if (primaryFailure !== null) throw primaryFailure;
  if (cleanupFailure !== null) throw cleanupFailure;
  if (performed?.ui === undefined || performed?.fixtureSelected !== true) {
    fail('The physical on-device Listing-AI result is incomplete.');
  }
  const ui = onDeviceListingAiUiProof(performed.ui);
  return Object.freeze({
    schemaVersion: 1,
    workPackage: 'WP112_PIXEL_ON_DEVICE_LISTING_AI_ACCEPTANCE',
    status: 'passed-physical-pixel-on-device-listing-ai',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      versionCode: candidate.buildNumber,
      sourceCommit: candidate.commit,
      apkSha256: candidate.apkSha256,
      signingCertificateSha256: candidate.signingCertificateSha256,
      apiBaseUrl: candidate.apiBaseUrl,
    },
    device: {
      platform: 'android',
      physical: deviceSummary.physical,
      manufacturer: deviceSummary.manufacturer,
      model: deviceSummary.model,
      apiLevel: deviceSummary.apiLevel,
      securityPatch: deviceSummary.securityPatch,
      containsRawDeviceIdentifier: false,
    },
    fixture: {
      kind: 'repository-controlled-synthetic-cordless-drill-image',
      sha256: fixtureSha256,
      personalMediaRead: false,
      retainedOnDevice: false,
    },
    tests: {
      exactSignedCandidateInstalled: true,
      exactProtectedOwnerPrincipal: true,
      explicitDisclosureConsent: true,
      physicalAndroidMlKitExecuted: true,
      ...ui,
      ...server,
      localRecoveryCleared: cleanup.localRecoveryCleared,
      controlledMediaRemoved: cleanup.controlledMediaRemoved,
      protectedOwnerSessionRestored: true,
    },
    runtime: {
      provider: 'on_device',
      model: providerModel,
      externalProviderExecutionAllowed: false,
      estimatedCostCents: 0,
      billedCostCents: 0,
      automaticPublicationAllowed: false,
    },
    boundaries: {
      listingPublished: false,
      paymentEndpointCalled: false,
      realMoneyUsed: false,
      productionChanged: false,
      googlePlayChanged: false,
      firebaseChanged: false,
      onePlusContacted: false,
      containsAccountIdentity: false,
      containsSecrets: false,
      containsTokens: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
    },
  });
}

function scrollUntil({
  commandRunner,
  adbPath,
  device,
  predicate,
  attempts = 36,
  toward = 'later',
}) {
  return (async () => {
    if (!['earlier', 'later'].includes(toward)) {
      fail('The sanitized listing scroll direction is invalid.');
    }
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
      if (predicate(hierarchy)) return hierarchy;
      currentHeadAndroidAdb(commandRunner, adbPath, device, [
        'shell', 'input', 'swipe', '540',
        toward === 'later' ? '1660' : '430',
        '540',
        toward === 'later' ? '430' : '1740',
        '260',
      ]);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 260));
    }
    fail('The sanitized on-device Listing-AI action is unavailable after bounded scrolling.');
  })();
}

function mediaInventory(commandRunner, adbPath, device) {
  return currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'content', 'query',
    '--uri', 'content://media/external/images/media',
    '--projection', '_id:_display_name:date_added',
  ]);
}

function tapNode(commandRunner, adbPath, device, node, label) {
  const area = bounds(node);
  if (area === null) fail(`The sanitized ${label} bounds are unavailable.`);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap',
    String(Math.floor((area.left + area.right) / 2)),
    String(Math.floor((area.top + area.bottom) / 2)),
  ]);
}

function removeControlledThumbnail(commandRunner, adbPath, device) {
  return scrollUntil({
    commandRunner,
    adbPath,
    device,
    toward: 'earlier',
    predicate: (hierarchy) => allNodes(hierarchy).some((node) => (
      currentHeadAndroidNodeAttribute(node, 'hint') === 'Titel'
    )),
  }).then(async (hierarchy) => {
    const nodes = allNodes(hierarchy);
    const image = nodes
      .map((node) => ({ node, area: bounds(node) }))
      .find(({ node, area }) => area !== null
        && currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.ImageView'
        && currentHeadAndroidNodeAttribute(node, 'clickable') === 'true'
        && area.width >= 150 && area.height >= 150);
    if (image === undefined) return;
    const close = nodes
      .map((node) => ({ node, area: bounds(node) }))
      .find(({ node, area }) => area !== null
        && currentHeadAndroidNodeAttribute(node, 'class') === 'android.view.View'
        && currentHeadAndroidNodeAttribute(node, 'clickable') === 'true'
        && area.width <= 100 && area.height <= 100
        && Math.abs(area.top - image.area.top) <= 8
        && Math.abs(area.right - image.area.right) <= 8);
    if (close === undefined) fail('The controlled listing-photo cleanup action is unavailable.');
    tapNode(commandRunner, adbPath, device, close.node, 'controlled listing-photo cleanup');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 650));
    const cleared = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(cleared, 'Bearbeitbarer KI-Entwurf').length !== 0) {
      fail('The local Listing-AI recovery state was not cleared.');
    }
  });
}

function stagingReadbackSql(startedAt) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(startedAt)) {
    fail('The Listing-AI acceptance timestamp is invalid.');
  }
  return String.raw`
WITH recent AS (
  SELECT id,status,current_revision,disclosure_version,image_preflight_status,created_at
  FROM listing_ai_drafts
  WHERE created_at >= '${startedAt}'::timestamptz
), latest AS (
  SELECT * FROM recent ORDER BY created_at DESC LIMIT 1
)
SELECT json_build_object(
  'recentDraftFound', EXISTS(SELECT 1 FROM latest),
  'exactlyOneRecentDraft', (SELECT count(*)=1 FROM recent),
  'ageBounded', COALESCE((SELECT created_at >= '${startedAt}'::timestamptz AND created_at <= now() FROM latest), false),
  'statusEditing', COALESCE((SELECT status='editing' FROM latest), false),
  'revisionOne', COALESCE((SELECT current_revision=1 FROM latest), false),
  'disclosureExact', COALESCE((SELECT disclosure_version='${disclosureVersion}' FROM latest), false),
  'preflightConsumed', COALESCE((SELECT image_preflight_status='consumed' FROM latest), false),
  'oneVersion', (SELECT count(*)=1 FROM listing_ai_draft_versions v JOIN latest l ON l.id=v.draft_id),
  'suggestionsNonempty', COALESCE((SELECT (v.fields->'title'->>'value') IS NOT NULL AND (v.fields->'category'->>'value') IS NOT NULL AND (v.fields->'description'->>'value') IS NOT NULL FROM listing_ai_draft_versions v JOIN latest l ON l.id=v.draft_id), false),
  'allOwnerConfirmationsFalse', COALESCE((SELECT NOT EXISTS (SELECT 1 FROM jsonb_each_text(v.owner_confirmations) e WHERE e.value <> 'false') FROM listing_ai_draft_versions v JOIN latest l ON l.id=v.draft_id), false),
  'providerOnDevice', COALESCE((SELECT c.provider='on_device' FROM listing_ai_cost_ledger c JOIN latest l ON l.id=c.draft_id), false),
  'modelExact', COALESCE((SELECT c.model='${providerModel}' FROM listing_ai_cost_ledger c JOIN latest l ON l.id=c.draft_id), false),
  'zeroUnitsAndCost', COALESCE((SELECT c.input_units=0 AND c.output_units=0 AND c.estimated_cost_cents=0 AND c.billed_cost_cents=0 FROM listing_ai_cost_ledger c JOIN latest l ON l.id=c.draft_id), false),
  'outcomeSucceeded', COALESCE((SELECT c.outcome='succeeded' FROM listing_ai_cost_ledger c JOIN latest l ON l.id=c.draft_id), false),
  'notPublished', COALESCE((SELECT NOT EXISTS (SELECT 1 FROM listing_ai_publication_receipts p WHERE p.draft_id=l.id) FROM latest l), false),
  'generationAuditExact', COALESCE((SELECT count(*)=1 FROM audit_log a JOIN latest l ON a.resource_id=l.id WHERE a.action='blue_ocean.listing_draft.generated' AND a.resource_type='listing_ai_draft' AND a.metadata->>'provider'='on_device' AND (a.metadata->>'paidCallPerformed')::boolean=false AND (a.metadata->>'estimatedCostCents')::int=0 AND (a.metadata->>'billedCostCents')::int=0 AND (a.metadata->>'autoPublishAllowed')::boolean=false), false)
);
`;
}

function verifyStaging(commandRunner, startedAt) {
  const output = commandRunner('ssh', [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    'sit-staging-vps',
    'docker exec -i shareittoo-staging-postgres sh -c \'exec psql -X -A -t -U "$POSTGRES_USER" -d "$POSTGRES_DB"\'',
  ], {
    encoding: 'utf8',
    input: stagingReadbackSql(startedAt),
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  });
  try {
    return JSON.parse(String(output).trim());
  } catch {
    fail('The sanitized Staging Listing-AI readback is invalid.');
  }
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const sourceVaultFile = resolve(
    argumentValue(args, '--source-vault-file') ?? fail('--source-vault-file is required.'),
  );
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir') ?? fail('--candidate-dir is required.'),
  );
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const commandRunner = defaultCurrentHeadAndroidCommandRunner;
  const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
  const candidate = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  const devices = parseAdbDevices(commandRunner(adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ commandRunner, adbPath, device });
  if (deviceSummary.model !== 'Pixel 7 Pro') fail('The physical Pixel 7 Pro is required.');
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);
  const vault = readEmailVerifiedJourneyVault(sourceVaultFile).vault;
  let mediaRow = null;
  let createSurfaceOpened = false;
  const operations = {
    perform: async () => {
      const startedAt = new Date().toISOString();
      const localFixture = resolve(repositoryRoot, fixtureRelativePath);
      if (sha256(readFileSync(localFixture)) !== fixtureSha256) {
        fail('The controlled Listing-AI image hash does not match.');
      }
      currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'rm', '-f', remoteFixture]);
      currentHeadAndroidAdb(commandRunner, adbPath, device, ['push', localFixture, remoteFixture]);
      currentHeadAndroidAdb(commandRunner, adbPath, device, [
        'shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
        '-d', `file://${remoteFixture}`,
      ]);
      await wait(800);
      mediaRow = controlledMediaRow(mediaInventory(commandRunner, adbPath, device));
      await bindExactRole({ vault, role: 'owner', commandRunner, adbPath, device, wait });
      let hierarchy = await openMainDestination({
        commandRunner, adbPath, device, wait, label: 'Entdecken',
      });
      tapLabel(commandRunner, adbPath, device, hierarchy, 'Neue Anzeige erstellen');
      hierarchy = await waitForHierarchy({
        commandRunner,
        adbPath,
        device,
        wait,
        label: 'new listing',
        predicate: (value) => currentHeadAndroidNamedNodes(value, 'Neue Anzeige').length === 1
          && currentHeadAndroidNamedNodes(value, 'Foto hinzufügen').length === 1,
      });
      createSurfaceOpened = true;
      tapLabel(commandRunner, adbPath, device, hierarchy, 'Foto hinzufügen');
      hierarchy = await waitForHierarchy({
        commandRunner,
        adbPath,
        device,
        wait,
        label: 'photo source',
        predicate: (value) => currentHeadAndroidNamedNodes(value, 'Aus Galerie auswählen').length === 1,
      });
      tapLabel(commandRunner, adbPath, device, hierarchy, 'Aus Galerie auswählen');
      hierarchy = await waitForHierarchy({
        commandRunner,
        adbPath,
        device,
        wait,
        label: 'system photo picker',
        predicate: (value) => String(value).includes('package="com.google.android.photopicker"'),
      });
      const currentMediaRow = controlledMediaRow(mediaInventory(commandRunner, adbPath, device));
      if (currentMediaRow.id !== mediaRow.id) {
        fail('The controlled Android media fixture changed before selection.');
      }
      tapNode(commandRunner, adbPath, device, newestPhotoPickerTile(hierarchy).node, 'controlled photo-picker tile');
      hierarchy = await waitForHierarchy({
        commandRunner,
        adbPath,
        device,
        wait,
        label: 'selected photo',
        predicate: (value) => currentHeadAndroidNamedNodes(value, 'Fertig').length === 1,
      });
      tapLabel(commandRunner, adbPath, device, hierarchy, 'Fertig');
      await waitForHierarchy({
        commandRunner,
        adbPath,
        device,
        wait,
        label: 'controlled listing photo',
        predicate: (value) => currentHeadAndroidNamedNodes(value, 'Neue Anzeige').length === 1
          && currentHeadAndroidNamedNodes(value, 'Foto hinzufügen').length === 1,
      });
      hierarchy = await scrollUntil({
        commandRunner,
        adbPath,
        device,
        predicate: (value) => currentHeadAndroidNamedNodes(
          value,
          'Ausgewählte Fotos analysieren',
        ).length === 1,
      });
      tapLabel(
        commandRunner,
        adbPath,
        device,
        hierarchy,
        'SIT wertet deine ausgewählten Bilder direkt auf diesem Android-Gerät aus.',
      );
      await wait(350);
      hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
      tapLabel(commandRunner, adbPath, device, hierarchy, 'Ausgewählte Fotos analysieren');
      hierarchy = await waitForHierarchy({
        commandRunner,
        adbPath,
        device,
        wait,
        attempts: 70,
        label: 'on-device Listing-AI result',
        predicate: (value) => currentHeadAndroidNamedNodes(
          value,
          'Bearbeitbarer Entwurf ist bereit.',
        ).length === 1,
      });
      hierarchy = await collectOnDeviceListingAiUiProof({
        commandRunner,
        adbPath,
        device,
        initialHierarchy: hierarchy,
        wait,
      });
      return { startedAt, ui: hierarchy, fixtureSelected: true };
    },
    verifyServer: async ({ startedAt }) => verifyStaging(execFileSync, startedAt),
    cleanup: async (performed) => {
      let localRecoveryCleared = performed === null;
      if (createSurfaceOpened && performed !== null) {
        await removeControlledThumbnail(commandRunner, adbPath, device);
        currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
        localRecoveryCleared = true;
      }
      if (mediaRow !== null) {
        currentHeadAndroidAdb(commandRunner, adbPath, device, [
          'shell', 'content', 'delete',
          '--uri', 'content://media/external/images/media',
          '--where', `_id=${mediaRow.id}`,
        ]);
      }
      currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'rm', '-f', remoteFixture]);
      return {
        localRecoveryCleared,
        controlledMediaRemoved:
          mediaInventory(commandRunner, adbPath, device).includes(fixtureDisplayName) === false,
      };
    },
    restoreOwner: async () => {
      const bound = await bindExactRole({
        vault, role: 'owner', commandRunner, adbPath, device, wait,
      });
      return currentHeadAndroidNamedNodes(bound.hierarchy, bound.account.displayName).length === 1
        && currentHeadAndroidNamedNodes(bound.hierarchy, bound.other.displayName).length === 0;
    },
  };
  const evidence = await runAndroidOnDeviceListingAiAcceptance({
    candidate,
    deviceSummary,
    operations,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${sanitizedFailure(error)}\n`);
    process.exitCode = 1;
  });
}
