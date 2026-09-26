#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const androidToolchain = Object.freeze({
  agp: '8.13.2',
  kotlin: '2.3.10',
  gradle: '8.13',
  distributionSha256: '20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78',
});

export function validateAndroidToolchainSources({ rootBuild, appBuild, settings, wrapper, properties }) {
  const exact = (actual, expected, label) => {
    if (actual !== expected) throw new Error(`Android toolchain ${label} differs from the reviewed pin.`);
  };
  const single = (text, pattern, label) => {
    const matches = [...text.matchAll(pattern)];
    if (matches.length !== 1) throw new Error(`Android toolchain ${label} must have one literal declaration.`);
    return matches[0][1];
  };
  exact(single(rootBuild, /classpath ['"]com\.android\.tools\.build:gradle:([^'"]+)['"]/gu, 'root AGP'), androidToolchain.agp, 'root AGP');
  exact(single(rootBuild, /classpath ['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin:([^'"]+)['"]/gu, 'root Kotlin'), androidToolchain.kotlin, 'root Kotlin');
  exact(single(settings, /id ['"]com\.android\.application['"] version ['"]([^'"]+)['"] apply false/gu, 'settings AGP'), androidToolchain.agp, 'settings AGP');
  exact(single(settings, /id ['"]org\.jetbrains\.kotlin\.android['"] version ['"]([^'"]+)['"] apply false/gu, 'settings Kotlin'), androidToolchain.kotlin, 'settings Kotlin');
  exact(single(wrapper, /^distributionUrl=(.+)$/gmu, 'distribution URL'), `https\\://downloads.gradle.org/distributions/gradle-${androidToolchain.gradle}-bin.zip`, 'distribution URL');
  exact(single(wrapper, /^distributionSha256Sum=(.+)$/gmu, 'distribution digest'), androidToolchain.distributionSha256, 'distribution digest');
  exact(single(wrapper, /^validateDistributionUrl=(.+)$/gmu, 'distribution validation'), 'true', 'distribution validation');
  const all = [rootBuild, appBuild, settings, wrapper, properties].join('\n');
  if (/skip-metadata-version-check|suppressKotlinVersionCompatibilityCheck|android\.suppressUnsupportedCompileSdk|kotlin\.jvm\.target\.validation\.mode\s*=\s*(?:ignore|warning)|abortOnError\s*(?:=\s*)?false/u.test(all)) {
    throw new Error('Android toolchain compatibility checks must not be suppressed.');
  }
  return androidToolchain;
}

export function readAndValidateAndroidToolchain(root = fileURLToPath(new URL('../', import.meta.url))) {
  const read = (relative) => readFileSync(resolve(root, relative), 'utf8');
  return validateAndroidToolchainSources({
    rootBuild: read('android/build.gradle'),
    appBuild: read('android/app/build.gradle'),
    settings: read('android/settings.gradle'),
    wrapper: read('android/gradle/wrapper/gradle-wrapper.properties'),
    properties: read('android/gradle.properties'),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const value = readAndValidateAndroidToolchain();
    process.stdout.write(`Android toolchain pins valid: AGP ${value.agp}, Kotlin ${value.kotlin}, Gradle ${value.gradle}.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
