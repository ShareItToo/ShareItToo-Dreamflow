#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  containsConservativeRawByteMarker,
  r10ExpectedPermissions,
} from './run_r10_clean_reproducibility.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const expectedComponentCounts = Object.freeze({
  activity: 12,
  service: 13,
  receiver: 7,
  provider: 8,
});
const expectedComponentInventorySha256 =
  '0841da008ecf62aa2584dbd14ee551497f127671f63abd8bafe24c89bdc35e3f';
const expectedIntentInventorySha256 =
  '996ec536b88d2495e6557ea822c0942aa90cf925ea486c47a9d8e5e0b2407650';
const expectedExportedComponents = Object.freeze([
  Object.freeze({
    type: 'activity',
    name: 'com.shareittoo.app.MainActivity',
    permission: null,
  }),
  Object.freeze({
    type: 'receiver',
    name: 'io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingReceiver',
    permission: 'com.google.android.c2dm.permission.SEND',
  }),
  Object.freeze({
    type: 'activity',
    name: 'com.google.firebase.auth.internal.GenericIdpActivity',
    permission: null,
  }),
  Object.freeze({
    type: 'activity',
    name: 'com.google.firebase.auth.internal.RecaptchaActivity',
    permission: null,
  }),
  Object.freeze({
    type: 'service',
    name: 'com.google.android.gms.auth.api.signin.RevocationBoundService',
    permission: 'com.google.android.gms.auth.api.signin.permission.REVOCATION_NOTIFICATION',
  }),
  Object.freeze({
    type: 'activity',
    name: 'com.facebook.CustomTabActivity',
    permission: null,
  }),
  Object.freeze({
    type: 'receiver',
    name: 'com.google.firebase.iid.FirebaseInstanceIdReceiver',
    permission: 'com.google.android.c2dm.permission.SEND',
  }),
  Object.freeze({
    type: 'receiver',
    name: 'androidx.profileinstaller.ProfileInstallReceiver',
    permission: 'android.permission.DUMP',
  }),
]);
const expectedBrowsableRoutes = Object.freeze([
  Object.freeze({ component: 'com.shareittoo.app.MainActivity', autoVerify: true, scheme: 'https', host: 'shareittoo.com', path: null, pathPrefix: '/api/v1/open/' }),
  Object.freeze({ component: 'com.shareittoo.app.MainActivity', autoVerify: true, scheme: 'https', host: 'www.shareittoo.com', path: null, pathPrefix: '/api/v1/open/' }),
  Object.freeze({ component: 'com.shareittoo.app.MainActivity', autoVerify: true, scheme: 'https', host: 'staging.shareittoo.com', path: null, pathPrefix: '/api/v1/open/' }),
  Object.freeze({ component: 'com.shareittoo.app.MainActivity', autoVerify: false, scheme: 'shareittoo', host: null, path: null, pathPrefix: null }),
  Object.freeze({ component: 'com.google.firebase.auth.internal.GenericIdpActivity', autoVerify: false, scheme: 'genericidp', host: 'firebase.auth', path: '/', pathPrefix: null }),
  Object.freeze({ component: 'com.google.firebase.auth.internal.RecaptchaActivity', autoVerify: false, scheme: 'recaptcha', host: 'firebase.auth', path: '/', pathPrefix: null }),
  Object.freeze({ component: 'com.facebook.CustomTabActivity', autoVerify: false, scheme: 'fbconnect', host: 'cct.com.shareittoo.app', path: null, pathPrefix: null }),
]);
const expectedFileProviders = Object.freeze([
  Object.freeze({
    name: 'dev.fluttercommunity.plus.share.ShareFileProvider',
    authority: 'com.shareittoo.app.flutter.share_provider',
    pathsResource: 'flutter_share_file_paths',
  }),
  Object.freeze({
    name: 'io.flutter.plugins.imagepicker.ImagePickerFileProvider',
    authority: 'com.shareittoo.app.flutter.image_provider',
    pathsResource: 'flutter_image_picker_file_paths',
  }),
  Object.freeze({
    name: 'net.nfet.flutter.printing.PrintFileProvider',
    authority: 'com.shareittoo.app.flutter.printing',
    pathsResource: 'flutter_printing_file_paths',
  }),
]);

function fail(code) {
  throw new Error(code);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function requireExact(actual, expected, code) {
  if (!exact(actual, expected)) fail(code);
}

function parseAaptValue(value) {
  const raw = /\(Raw: "([^"]*)"\)\s*$/u.exec(value)?.[1];
  if (raw !== undefined) return raw;
  const quoted = /^"([^"]*)"/u.exec(value)?.[1];
  if (quoted !== undefined) return quoted;
  if (/\(type 0x12\)0xffffffff/u.test(value)) return true;
  if (/\(type 0x12\)0x0(?:\s|$)/u.test(value)) return false;
  return value.trim();
}

export function parseAaptXmlTree(value) {
  const root = { name: '$root', attributes: {}, children: [] };
  const stack = [{ indent: -1, node: root }];
  for (const line of value.split(/\r?\n/u)) {
    const elementMatch = /^(\s*)E:\s+([^\s(]+)/u.exec(line);
    if (elementMatch !== null) {
      const indent = elementMatch[1].length;
      while (stack.at(-1).indent >= indent) stack.pop();
      const node = { name: elementMatch[2], attributes: {}, children: [] };
      stack.at(-1).node.children.push(node);
      stack.push({ indent, node });
      continue;
    }
    const attributeMatch = /^(\s*)A:\s+([^\s=(]+)(?:\([^)]*\))?=(.*)$/u.exec(line);
    if (attributeMatch !== null) {
      const indent = attributeMatch[1].length;
      while (stack.length > 1 && stack.at(-1).indent >= indent) stack.pop();
      stack.at(-1).node.attributes[attributeMatch[2]] = parseAaptValue(attributeMatch[3]);
    }
  }
  if (root.children.length !== 1) fail('r11_xml_tree_root_invalid');
  return root.children[0];
}

function children(node, name) {
  return node.children.filter((child) => child.name === name);
}

function first(node, name) {
  const matches = children(node, name);
  if (matches.length !== 1) fail(`r11_expected_single_${name}`);
  return matches[0];
}

function attribute(node, name, fallback = null) {
  return node.attributes[name] ?? fallback;
}

function normalizedPermissions(value) {
  return value
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('uses-permission:'))
    .map((line) => Object.freeze({
      name: /name='([^']+)'/u.exec(line)?.[1] ?? fail('r11_permission_name_missing'),
      maxSdkVersion: (() => {
        const raw = /maxSdkVersion='([^']+)'/u.exec(line)?.[1];
        return raw === undefined ? null : Number.parseInt(raw, 10);
      })(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function components(application) {
  return application.children
    .filter((node) => ['activity', 'activity-alias', 'service', 'receiver', 'provider'].includes(node.name))
    .map((node) => ({
      node,
      type: node.name,
      name: attribute(node, 'android:name'),
      exported: attribute(node, 'android:exported', false),
      enabled: attribute(node, 'android:enabled', true),
      permission: attribute(node, 'android:permission'),
      authority: attribute(node, 'android:authorities'),
      grantUriPermissions: attribute(node, 'android:grantUriPermissions', false),
    }));
}

function componentCounts(values) {
  const result = { activity: 0, service: 0, receiver: 0, provider: 0 };
  for (const component of values) {
    if (result[component.type] === undefined) fail('r11_unexpected_component_type');
    result[component.type] += 1;
  }
  return result;
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function componentInventory(values) {
  return values.map((component) => ({
    type: component.type,
    name: component.name,
    exported: component.exported,
    enabled: component.enabled,
    permission: component.permission,
    authority: component.authority,
    grantUriPermissions: component.grantUriPermissions,
  })).sort((left, right) => {
    const leftKey = JSON.stringify(left);
    const rightKey = JSON.stringify(right);
    return leftKey < rightKey ? -1 : (leftKey > rightKey ? 1 : 0);
  });
}

function intentInventory(values) {
  return values.flatMap((component) => intentFilters(component).map((filter) => ({
    component: component.name,
    ...filter,
  })));
}

function intentFilters(component) {
  return children(component.node, 'intent-filter').map((filter) => ({
    autoVerify: attribute(filter, 'android:autoVerify', false),
    actions: children(filter, 'action').map((node) => attribute(node, 'android:name')),
    categories: children(filter, 'category').map((node) => attribute(node, 'android:name')),
    data: children(filter, 'data').map((node) => ({
      scheme: attribute(node, 'android:scheme'),
      host: attribute(node, 'android:host'),
      path: attribute(node, 'android:path'),
      pathPrefix: attribute(node, 'android:pathPrefix'),
      mimeType: attribute(node, 'android:mimeType'),
    })),
  }));
}

function browsableRoutes(values) {
  const result = [];
  for (const component of values) {
    for (const filter of intentFilters(component)) {
      if (!filter.categories.includes('android.intent.category.BROWSABLE')) continue;
      if (!filter.actions.includes('android.intent.action.VIEW')) fail('r11_browsable_without_view');
      for (const data of filter.data) {
        result.push({
          component: component.name,
          autoVerify: filter.autoVerify,
          scheme: data.scheme,
          host: data.host,
          path: data.path,
          pathPrefix: data.pathPrefix,
        });
      }
    }
  }
  return result;
}

function resourceNames(value) {
  const result = new Map();
  for (const match of value.matchAll(/spec resource (0x[0-9a-f]+) [^:\s]+:xml\/([^:\s]+):/gu)) {
    result.set(match[1], match[2]);
  }
  return result;
}

function providerPathsResource(component, resources) {
  const metadata = children(component.node, 'meta-data').find((node) =>
    attribute(node, 'android:name') === 'android.support.FILE_PROVIDER_PATHS');
  if (metadata === undefined) fail(`r11_file_provider_metadata_missing:${component.name}`);
  const reference = String(attribute(metadata, 'android:resource')).replace(/^@/u, '');
  return resources.get(reference) ?? fail(`r11_file_provider_resource_unknown:${component.name}`);
}

function querySurface(manifest) {
  const query = first(manifest, 'queries');
  return {
    intents: children(query, 'intent').map((node) => ({
      actions: children(node, 'action').map((entry) => attribute(entry, 'android:name')),
      mimeTypes: children(node, 'data').map((entry) => attribute(entry, 'android:mimeType')),
    })),
    packages: children(query, 'package').map((node) => attribute(node, 'android:name')),
  };
}

function metadataBoolean(application, name) {
  const matches = children(application, 'meta-data').filter((node) =>
    attribute(node, 'android:name') === name);
  if (matches.length !== 1) fail(`r11_metadata_missing:${name}`);
  return attribute(matches[0], 'android:value');
}

function validateFileProviderXml(resourceXml) {
  const expected = {
    flutter_share_file_paths: { element: 'cache-path', name: 'cache', path: 'share_plus/' },
    flutter_image_picker_file_paths: { element: 'cache-path', name: 'cached_files', path: '.' },
    flutter_printing_file_paths: { element: 'cache-path', name: 'share', path: '/share/' },
  };
  for (const [resource, contract] of Object.entries(expected)) {
    const tree = parseAaptXmlTree(resourceXml[resource] ?? fail(`r11_file_provider_xml_missing:${resource}`));
    const entry = first(tree, contract.element);
    requireExact({
      name: attribute(entry, 'name', attribute(entry, 'android:name')),
      path: attribute(entry, 'path', attribute(entry, 'android:path')),
    }, { name: contract.name, path: contract.path }, `r11_file_provider_scope_changed:${resource}`);
  }
}

function validateBackupXml(resourceXml) {
  const domains = ['root', 'file', 'database', 'sharedpref', 'external'];
  const legacy = parseAaptXmlTree(resourceXml.backup_rules ?? fail('r11_backup_rules_missing'));
  requireExact(
    children(legacy, 'exclude').map((node) => attribute(node, 'domain')),
    domains,
    'r11_legacy_backup_exclusions_changed',
  );
  const extraction = parseAaptXmlTree(
    resourceXml.data_extraction_rules ?? fail('r11_data_extraction_rules_missing'),
  );
  for (const sectionName of ['cloud-backup', 'device-transfer']) {
    const section = first(extraction, sectionName);
    requireExact(
      children(section, 'exclude').map((node) => attribute(node, 'domain')),
      domains,
      `r11_${sectionName}_exclusions_changed`,
    );
  }
}

function validateRuntimeSourceContracts(source) {
  const contracts = [
    ['backend', /'SIT_BACKEND_ENABLED',[\s\S]{0,100}defaultValue: kReleaseMode/u],
    ['external-ai', /externalAiNetworkAllowed = false/u],
    ['real-payment', /realPaymentsEnabled = false/u],
    ['g3-public', /publicReleaseAllowed = bool\.fromEnvironment\([\s\S]{0,120}defaultValue: false/u],
    ['g3-availability', /signedStageAInternalEnvelope[\s\S]{0,500}technicalSurfaceAvailableFor/u],
    ['g4-public', /publicReleaseAllowed = false/u],
    ['g4-external-ai', /externalGenerativeAiAllowed = false/u],
    ['g4-availability', /signedStageAInternalEnvelope[\s\S]{0,500}technicalSurfaceAvailableFor/u],
    ['g5a-public', /publicReleaseAllowed = false/u],
    ['g5a-external-ai', /externalGenerativeAiAllowed = false/u],
    ['g5a-availability', /signedStageAInternalEnvelope[\s\S]{0,500}technicalSurfaceAvailableFor/u],
    ['g5b-public', /publicReleaseAllowed = false/u],
    ['g5b-availability', /signedStageAInternalEnvelope[\s\S]{0,500}technicalSurfaceAvailableFor/u],
    ['support-intake-default', /SUPPORT_EVIDENCE_INTAKE_ENABLED \?\? 'false'/u],
    ['support-production-guard', /supportEvidenceIntakeEnabled && deploymentEnvironment === 'production'/u],
    ['support-scanner-none', /scannerTransport: 'none'/u],
  ];
  for (const [name, pattern] of contracts) {
    const category = name.split('-')[0];
    const body = source[category] ?? source[name] ?? '';
    if (!pattern.test(body)) fail(`r11_source_contract_missing:${name}`);
  }
}

export function auditR11AndroidSecuritySurface({
  manifestDump,
  badgingDump,
  permissionDump,
  resourcesDump,
  resourceXml,
  compiledPayload,
  source,
  artifact,
  expectedVersion,
}) {
  const manifest = parseAaptXmlTree(manifestDump);
  if (manifest.name !== 'manifest') fail('r11_manifest_root_invalid');
  const application = first(manifest, 'application');
  const values = components(application);
  const componentInventorySha256 = sha256Json(componentInventory(values));
  const intentInventorySha256 = sha256Json(intentInventory(values));

  const packageIdentity = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/u
    .exec(badgingDump);
  if (expectedVersion === undefined
      || !/^\d+$/u.test(expectedVersion.versionCode ?? '')
      || typeof expectedVersion.versionName !== 'string'
      || packageIdentity?.[1] !== 'com.shareittoo.app'
      || packageIdentity?.[2] !== expectedVersion.versionCode
      || packageIdentity?.[3] !== expectedVersion.versionName
      || !/compileSdkVersion='36'/u.test(badgingDump)
      || !/sdkVersion:'24'/u.test(badgingDump)
      || !/targetSdkVersion:'36'/u.test(badgingDump)) {
    fail('r11_android_identity_changed');
  }
  requireExact(
    normalizedPermissions(permissionDump),
    [...r10ExpectedPermissions].sort((left, right) => left.name.localeCompare(right.name)),
    'r11_permission_surface_changed',
  );
  requireExact(componentCounts(values), expectedComponentCounts, 'r11_component_counts_changed');
  requireExact(
    componentInventorySha256,
    expectedComponentInventorySha256,
    'r11_component_inventory_changed',
  );
  requireExact(
    intentInventorySha256,
    expectedIntentInventorySha256,
    'r11_intent_inventory_changed',
  );
  requireExact(
    values.filter((component) => component.exported).map(({ type, name, permission }) => ({
      type, name, permission,
    })),
    expectedExportedComponents,
    'r11_exported_component_surface_changed',
  );

  const main = values.find((component) => component.name === 'com.shareittoo.app.MainActivity')
    ?? fail('r11_main_activity_missing');
  requireExact(
    intentFilters(main).filter((filter) =>
      filter.actions.includes('com.shareittoo.app.SIT_NOTIFICATION_CLICK')).length,
    1,
    'r11_notification_action_not_package_scoped',
  );
  requireExact(browsableRoutes(values), expectedBrowsableRoutes, 'r11_browsable_routes_changed');

  const resources = resourceNames(resourcesDump);
  const fileProviders = values
    .filter((component) => expectedFileProviders.some((expected) => expected.name === component.name))
    .map((component) => ({
      name: component.name,
      authority: component.authority,
      pathsResource: providerPathsResource(component, resources),
      exported: component.exported,
      grantUriPermissions: component.grantUriPermissions,
    }));
  requireExact(fileProviders, expectedFileProviders.map((provider) => ({
    ...provider,
    exported: false,
    grantUriPermissions: true,
  })), 'r11_file_provider_surface_changed');
  if (values.some((component) => component.type === 'provider' && component.exported)) {
    fail('r11_exported_provider_detected');
  }
  validateFileProviderXml(resourceXml);
  validateBackupXml(resourceXml);

  requireExact(querySurface(manifest), {
    intents: [
      { actions: ['android.intent.action.PROCESS_TEXT'], mimeTypes: ['text/plain'] },
      { actions: ['android.intent.action.GET_CONTENT'], mimeTypes: ['*/*'] },
    ],
    packages: ['com.facebook.katana'],
  }, 'r11_package_visibility_changed');

  requireExact({
    debuggable: attribute(application, 'android:debuggable'),
    allowBackup: attribute(application, 'android:allowBackup'),
    usesCleartextTraffic: attribute(application, 'android:usesCleartextTraffic'),
    networkSecurityConfig: attribute(application, 'android:networkSecurityConfig'),
    requestLegacyExternalStorage: attribute(application, 'android:requestLegacyExternalStorage'),
  }, {
    debuggable: true,
    allowBackup: false,
    usesCleartextTraffic: false,
    networkSecurityConfig: null,
    requestLegacyExternalStorage: null,
  }, 'r11_application_security_policy_changed');

  requireExact({
    messagingAutoInit: metadataBoolean(application, 'firebase_messaging_auto_init_enabled'),
    analyticsCollection: metadataBoolean(application, 'firebase_analytics_collection_enabled'),
    crashlyticsCollection: metadataBoolean(application, 'firebase_crashlytics_collection_enabled'),
  }, {
    messagingAutoInit: false,
    analyticsCollection: false,
    crashlyticsCollection: false,
  }, 'r11_firebase_collection_state_changed');
  for (const registrar of [
    'FirebaseMessagingRegistrar',
    'CrashlyticsRegistrar',
    'FirebaseAuthRegistrar',
  ]) {
    if (!manifestDump.includes(registrar)) fail(`r11_firebase_registrar_missing:${registrar}`);
  }
  for (const marker of ['AnalyticsConnectorRegistrar', 'FirebaseAnalytics', 'AppMeasurement']) {
    if (compiledPayload.includes(Buffer.from(marker, 'utf8'))) {
      fail(`r11_analytics_marker_present:${marker}`);
    }
  }
  if (containsConservativeRawByteMarker(compiledPayload, 'https://api.openai.com')) {
    fail('r11_external_ai_origin_present');
  }
  if (!containsConservativeRawByteMarker(compiledPayload, 'https://shareittoo.com/api/v1')) {
    fail('r11_inactive_default_backend_origin_missing');
  }
  validateRuntimeSourceContracts(source);

  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-48h-r11-android-security-permission-surface',
    status: 'verified-local-merged-debug-artifact-ci-pending',
    observedOn: '2026-08-24',
    source: artifact.source,
    artifact: {
      buildType: 'debug',
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      applicationId: 'com.shareittoo.app',
      versionName: expectedVersion.versionName,
      versionCode: expectedVersion.versionCode,
      compileSdk: 36,
      minSdk: 24,
      targetSdk: 36,
    },
    permissions: normalizedPermissions(permissionDump),
    components: {
      counts: componentCounts(values),
      inventorySha256: componentInventorySha256,
      exported: expectedExportedComponents,
      allProvidersNonExported: true,
    },
    intentSurface: {
      notificationAction: 'com.shareittoo.app.SIT_NOTIFICATION_CLICK',
      inventorySha256: intentInventorySha256,
      browsableRoutes: expectedBrowsableRoutes,
    },
    fileProviders,
    packageVisibility: querySurface(manifest),
    policies: {
      debuggableTestArtifact: true,
      backupDisabled: true,
      completeBackupExclusionsPresent: true,
      cleartextTrafficDisabled: true,
      networkSecurityConfig: 'absent-platform-default-plus-cleartext-disabled',
      legacyExternalStorageDisabled: true,
    },
    access: {
      camera: 'declared-runtime-permission',
      location: 'coarse-and-fine-runtime-permissions-no-background-location',
      notifications: 'post-notifications-runtime-permission',
      media: 'system-photo-picker-plus-legacy-read-max32-write-max28',
    },
    firebase: {
      messagingSdkPresent: true,
      authenticationSdkPresent: true,
      crashlyticsSdkPresent: true,
      messagingAutoInitDisabled: true,
      analyticsSdkPresent: false,
      analyticsCollectionDisabled: true,
      crashlyticsCollectionDisabled: true,
    },
    stageA: {
      backendEnabledInDebugByDefault: false,
      productionBackendOriginCompiledButInactive: true,
      productionEndpointEnabled: false,
      externalAiEnabled: false,
      realPaymentEnabled: false,
      publicG3Enabled: false,
      publicG4Enabled: false,
      publicG5Enabled: false,
      supportEvidenceIntakeEnabledByDefault: false,
      supportEvidenceScannerTransport: 'none',
      supportEvidenceScannerUploadEnabled: false,
    },
    boundaries: {
      productionChanged: false,
      vpsChanged: false,
      cloudChanged: false,
      firebaseProjectChanged: false,
      storeChanged: false,
      paymentChanged: false,
      credentialsReadOrExtracted: false,
      artifactInstalled: false,
      artifactPublished: false,
      pullRequestMerged: false,
    },
    ciAndCodeql: {
      exactGithubVerification: 'pending',
      localCodeqlClaimed: false,
    },
    nextPackage: 'R12',
  });
}

function command(file, args, encoding = 'utf8') {
  return execFileSync(file, args, {
    encoding,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) fail(`r11_invalid_argument:${name ?? 'end'}`);
    result[name.slice(2)] = value;
  }
  for (const required of ['apk', 'aapt', 'source-head', 'source-branch', 'output']) {
    if (!result[required]) fail(`r11_missing_argument:${required}`);
  }
  return result;
}

function readRuntimePayload(apk) {
  const entries = command('unzip', ['-Z1', apk])
    .split(/\r?\n/u)
    .filter((entry) => entry === 'assets/flutter_assets/kernel_blob.bin'
      || /(^|\/)libapp\.so$/u.test(entry));
  if (entries.length === 0) fail('r11_runtime_payload_missing');
  return Buffer.concat(entries.map((entry) => command('unzip', ['-p', apk, entry], null)));
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const apk = path.resolve(args.apk);
  const aapt = path.resolve(args.aapt);
  const output = path.resolve(args.output);
  const apkBytes = readFileSync(apk);
  const pubspec = readFileSync(path.join(repositoryRoot, 'pubspec.yaml'), 'utf8');
  const repositoryVersion = /^version:\s+([^+\s]+)\+(\d+)$/mu.exec(pubspec);
  if (repositoryVersion === null) fail('r11_repository_version_invalid');
  const resourceNamesToRead = [
    'backup_rules',
    'data_extraction_rules',
    'flutter_image_picker_file_paths',
    'flutter_printing_file_paths',
    'flutter_share_file_paths',
  ];
  const source = {
    backend: readFileSync(path.join(repositoryRoot, 'lib/services/backend_config.dart'), 'utf8'),
    'external-ai': readFileSync(path.join(repositoryRoot, 'lib/openai/openai_config.dart'), 'utf8'),
    'real-payment': readFileSync(path.join(repositoryRoot, 'lib/config/private_pilot_config.dart'), 'utf8'),
    g3: readFileSync(path.join(repositoryRoot, 'lib/config/booking_group_technical_config.dart'), 'utf8'),
    g4: readFileSync(path.join(repositoryRoot, 'lib/config/planner_technical_config.dart'), 'utf8'),
    g5a: readFileSync(path.join(repositoryRoot, 'lib/config/supply_enrichment_technical_config.dart'), 'utf8'),
    g5b: readFileSync(path.join(repositoryRoot, 'lib/config/listing_sets_technical_config.dart'), 'utf8'),
    support: readFileSync(path.join(repositoryRoot, 'backend/src/config.js'), 'utf8'),
  };
  const result = auditR11AndroidSecuritySurface({
    manifestDump: command(aapt, ['dump', 'xmltree', apk, 'AndroidManifest.xml']),
    badgingDump: command(aapt, ['dump', 'badging', apk]),
    permissionDump: command(aapt, ['dump', 'permissions', apk]),
    resourcesDump: command(aapt, ['dump', 'resources', apk]),
    resourceXml: Object.fromEntries(resourceNamesToRead.map((name) => [
      name,
      command(aapt, ['dump', 'xmltree', apk, `res/xml/${name}.xml`]),
    ])),
    compiledPayload: readRuntimePayload(apk),
    source,
    expectedVersion: {
      versionName: repositoryVersion[1],
      versionCode: repositoryVersion[2],
    },
    artifact: {
      source: {
        branch: args['source-branch'],
        implementationHead: args['source-head'],
      },
      bytes: apkBytes.length,
      sha256: createHash('sha256').update(apkBytes).digest('hex'),
    },
  });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(
    `R11 Android surface valid: permissions=${result.permissions.length}, `
      + `exported=${result.components.exported.length}, next=${result.nextPackage}\n`,
  );
}

if (process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
