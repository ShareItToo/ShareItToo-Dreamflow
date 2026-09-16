import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  componentInventory,
  parseAaptXmlTree,
} from '../../tool/audit_r11_android_security_surface.mjs';

const manifestSource = readFileSync(
  new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8',
);
const pushSenderSource = readFileSync(
  new URL('../../backend/src/push_sender.js', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);
const auditor = readFileSync(
  new URL('../../tool/audit_r11_android_security_surface.mjs', import.meta.url),
  'utf8',
);

test('parses typed, raw and resource-valued aapt XML attributes', () => {
  const tree = parseAaptXmlTree([
    'E: manifest (line=2)',
    '  E: application (line=5)',
    '    A: android:debuggable(0x0101000f)=(type 0x12)0xffffffff',
    '    A: android:allowBackup(0x01010280)=(type 0x12)0x0',
    '    E: provider (line=8)',
    '      A: android:name(0x01010003)="Provider" (Raw: "Provider")',
    '      E: meta-data (line=9)',
    '        A: android:resource(0x01010025)=@0x7f120001',
  ].join('\n'));

  assert.equal(tree.name, 'manifest');
  const application = tree.children[0];
  assert.equal(application.attributes['android:debuggable'], true);
  assert.equal(application.attributes['android:allowBackup'], false);
  assert.equal(application.children[0].attributes['android:name'], 'Provider');
  assert.equal(
    application.children[0].children[0].attributes['android:resource'],
    '@0x7f120001',
  );
});

test('component inventory ignores merge order but not component changes', () => {
  const first = {
    type: 'service', name: 'b.Service', exported: false, enabled: true,
    permission: null, authority: null, grantUriPermissions: false,
  };
  const second = {
    type: 'provider', name: 'a.Provider', exported: false, enabled: true,
    permission: null, authority: 'com.shareittoo.app.provider',
    grantUriPermissions: false,
  };
  assert.deepEqual(
    componentInventory([first, second]),
    componentInventory([second, first]),
  );
  assert.notDeepEqual(
    componentInventory([first, second]),
    componentInventory([first, { ...second, exported: true }]),
  );
});

test('the notification click action is package-scoped end to end', () => {
  const action = 'com.shareittoo.app.SIT_NOTIFICATION_CLICK';
  assert.match(manifestSource, new RegExp(`android:name="${action.replaceAll('.', '\\.')}`));
  assert.match(pushSenderSource, new RegExp(`clickAction: '${action.replaceAll('.', '\\.')}'`));
  assert.doesNotMatch(manifestSource, /android:name="SIT_NOTIFICATION_CLICK"/u);
  assert.doesNotMatch(pushSenderSource, /clickAction: 'SIT_NOTIFICATION_CLICK'/u);
});

test('the full technical gate audits the actual merged debug artifact', () => {
  assert.match(regression, /node tool\/audit_r11_android_security_surface\.mjs/u);
  assert.match(regression, /--apk "\$android_debug_apk"/u);
  assert.match(regression, /--aapt "\$android_aapt"/u);
  assert.match(regression, /--source-head "\$\(git rev-parse HEAD\)"/u);
  assert.doesNotMatch(
    regression,
    /audit_r11_android_security_surface[\s\S]{0,500}(?:deploy|publish|upload|install)/u,
  );
});

test('the Android identity audit binds to the current repository version', () => {
  assert.match(auditor, /readFileSync\(path\.join\(repositoryRoot, 'pubspec\.yaml'\)/u);
  assert.match(auditor, /packageIdentity\?\.\[2\] !== expectedVersion\.versionCode/u);
  assert.match(auditor, /versionCode: expectedVersion\.versionCode/u);
  assert.doesNotMatch(auditor, /versionCode='2026082302'/u);
});
