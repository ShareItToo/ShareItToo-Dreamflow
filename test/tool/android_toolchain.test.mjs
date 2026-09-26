import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { androidToolchain, readAndValidateAndroidToolchain, validateAndroidToolchainSources } from '../../tool/validate_android_toolchain.mjs';

function sources() {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  return { rootBuild: read('android/build.gradle'), appBuild: read('android/app/build.gradle'), settings: read('android/settings.gradle'), wrapper: read('android/gradle/wrapper/gradle-wrapper.properties'), properties: read('android/gradle.properties') };
}

test('current Android build pins match the reviewed Kotlin 2.3-compatible toolchain', () => {
  assert.deepEqual(readAndValidateAndroidToolchain(), androidToolchain);
});

test('rejects individual compiler, AGP or wrapper drift and duplicate declarations', () => {
  for (const [key, from, to] of [
    ['rootBuild', `gradle:${androidToolchain.agp}`, 'gradle:8.9.1'],
    ['rootBuild', `plugin:${androidToolchain.kotlin}`, 'plugin:2.1.0'],
    ['settings', `version "${androidToolchain.agp}"`, 'version "8.9.1"'],
    ['settings', `version "${androidToolchain.kotlin}"`, 'version "2.1.0"'],
    ['wrapper', `gradle-${androidToolchain.gradle}-bin.zip`, 'gradle-8.12-bin.zip'],
    ['wrapper', androidToolchain.distributionSha256, '0'.repeat(64)],
    ['wrapper', 'validateDistributionUrl=true', 'validateDistributionUrl=false'],
  ]) {
    const input = sources();
    assert.ok(input[key].includes(from));
    input[key] = input[key].replace(from, to);
    assert.throws(() => validateAndroidToolchainSources(input), /reviewed pin/u);
  }
  const duplicate = sources();
  duplicate.wrapper += `\ndistributionSha256Sum=${androidToolchain.distributionSha256}\n`;
  assert.throws(() => validateAndroidToolchainSources(duplicate), /one literal/u);
});

test('rejects turning off compiler, SDK, lint or JVM compatibility checks', () => {
  for (const line of [
    '-Xskip-metadata-version-check', 'suppressKotlinVersionCompatibilityCheck=true',
    'android.suppressUnsupportedCompileSdk=36', 'kotlin.jvm.target.validation.mode=ignore',
    'kotlin.jvm.target.validation.mode=warning', 'abortOnError false',
  ]) {
    for (const location of ['rootBuild', 'appBuild', 'settings', 'properties']) {
      const input = sources(); input[location] += `\n${line}\n`;
      assert.throws(() => validateAndroidToolchainSources(input), /must not be suppressed/u);
    }
  }
});
