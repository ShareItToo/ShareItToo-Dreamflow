import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const packageConfigPath = resolve(root, '.dart_tool/package_config.json');
const packageConfig = JSON.parse(readFileSync(packageConfigPath, 'utf8'));
const scannerPackage = packageConfig.packages.find(({ name }) => name === 'mobile_scanner');
assert.ok(scannerPackage, 'mobile_scanner is missing from the resolved package config');

const packageRoot = fileURLToPath(
  new URL(scannerPackage.rootUri, pathToFileURL(packageConfigPath)),
);
const swiftPlugin = readFileSync(
  resolve(
    packageRoot,
    'darwin/mobile_scanner/Sources/mobile_scanner/MobileScannerPlugin.swift',
  ),
  'utf8',
);
const androidBuild = readFileSync(resolve(packageRoot, 'android/build.gradle'), 'utf8');
const publicApi = readFileSync(resolve(packageRoot, 'lib/mobile_scanner.dart'), 'utf8');
const regression = read('scripts/technical_regression_check.sh');

test('MobileScanner remains locked to the reviewed iPhone 17 patch', () => {
  assert.match(read('pubspec.yaml'), /^  mobile_scanner: 7\.1\.4$/mu);
  assert.match(
    read('pubspec.lock'),
    /mobile_scanner:\n[\s\S]*?dependency: "direct main"[\s\S]*?sha256: c6184bf2913dd66be244108c9c27ca04b01caf726321c44b0e7a7a1e32d41044[\s\S]*?version: "7\.1\.4"/u,
  );
  assert.equal(
    sha256(swiftPlugin),
    '542eb21765d425e7caf8a82405db18ef2913b2df0125aabd558edb00b86957b4',
  );
  assert.equal(
    sha256(androidBuild),
    'dce26016bb0d1503a32adc2efae14aa7c4bbab62a7cdcb6a11058ed8850fba11',
  );
  assert.equal(
    sha256(publicApi),
    '69dee478011b0b6fef040e8724b17d09126bf27cad9333764e7fc59efe224b16',
  );
});

test('Apple scanner selects an available pixel format before start', () => {
  assert.match(
    swiftPlugin,
    /let format = getPreferredVideoFormat\(videoOutput: videoOutput\)[\s\S]*?videoOutput\.videoSettings = \[kCVPixelBufferPixelFormatTypeKey as String: format\]/u,
  );
  assert.match(swiftPlugin, /videoOutput\.availableVideoPixelFormatTypes/u);
  assert.match(
    swiftPlugin,
    /kCVPixelFormatType_32BGRA,[\s\S]*?kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,[\s\S]*?kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange/u,
  );
  assert.match(
    swiftPlugin,
    /if availablePixelFormats\.contains\(format\)[\s\S]*?return format/u,
  );
  assert.match(swiftPlugin, /if let firstAvailable = availablePixelFormats\.first/u);
  assert.doesNotMatch(
    swiftPlugin,
    /videoOutput\.videoSettings = \[kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA\]/u,
  );
});

test('the same patch retains assignment-safe Android floors', () => {
  for (const line of [
    "group = 'dev.steenbakker.mobile_scanner'",
    "version = '1.0-SNAPSHOT'",
    'compileSdk = 36',
    'sourceCompatibility = JavaVersion.VERSION_17',
    'targetCompatibility = JavaVersion.VERSION_17',
    'jvmTarget = JavaVersion.VERSION_17.toString()',
    'minSdk = 23',
  ]) {
    assert.ok(androidBuild.includes(line), `missing reviewed Android line: ${line}`);
  }
  assert.doesNotMatch(
    androidBuild,
    /^\s*(?:group|version|compileSdk|minSdk|sourceCompatibility|targetCompatibility|jvmTarget)\s+(?![=])/mu,
  );
});

test('application scope and complete-runner registration remain bounded', () => {
  const application = `${read('lib/widgets/return_handover_stepper_sheet.dart')}\n${read('lib/screens/booking_detail_screen.dart')}`;
  assert.equal(
    [...application.matchAll(/package:mobile_scanner\/mobile_scanner\.dart/gu)].length,
    2,
  );
  assert.equal([...application.matchAll(/\bMobileScanner\(/gu)].length, 2);
  assert.equal([...application.matchAll(/\bMobileScannerController\(/gu)].length, 2);
  assert.match(
    regression,
    /^node --test test\/tool\/mobile_scanner_iphone17_floor\.test\.mjs$/mu,
  );
});
