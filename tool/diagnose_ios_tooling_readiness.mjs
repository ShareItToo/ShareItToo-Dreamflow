#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function fail(message) {
  throw new Error(message);
}

function compactVersion(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value.trim().split(/\r?\n/u)[0].slice(0, 80);
}

export function buildIosToolingReadiness({
  platform,
  candidate,
  xcodeApplicationPresent,
  developerDirectory,
  xcodebuildVersion,
  cocoaPodsVersion,
}) {
  const activeDeveloperDirectory = typeof developerDirectory === 'string' &&
    /\/Xcode(?:-beta)?\.app\/Contents\/Developer$/u.test(developerDirectory.trim())
    ? 'full-xcode'
    : typeof developerDirectory === 'string' &&
      developerDirectory.includes('/Library/Developer/CommandLineTools')
      ? 'command-line-tools-only'
      : 'unavailable';
  const xcodebuildAvailable = compactVersion(xcodebuildVersion) !== null &&
    /^Xcode\s/u.test(xcodebuildVersion.trim());
  const cocoaPodsAvailable = compactVersion(cocoaPodsVersion) !== null;
  const ready = platform === 'darwin' && xcodeApplicationPresent === true &&
    activeDeveloperDirectory === 'full-xcode' && xcodebuildAvailable &&
    cocoaPodsAvailable;

  return {
    schemaVersion: 1,
    kind: 'ios-local-tooling-readiness',
    status: ready ? 'ready-for-ios-build-preparation' : 'pending-local-tooling',
    candidate: {
      bundleId: 'com.shareittoo.app',
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    },
    observed: {
      hostPlatform: platform === 'darwin' ? 'macos' : 'non-macos',
      fullXcodeApplicationPresent: xcodeApplicationPresent === true,
      activeDeveloperDirectory,
      xcodebuildAvailable,
      xcodeVersion: compactVersion(xcodebuildVersion),
      cocoaPodsAvailable,
      cocoaPodsVersion: compactVersion(cocoaPodsVersion),
    },
    blockers: ready ? [] : [
      ...(platform === 'darwin' ? [] : ['macos-host-required']),
      ...(xcodeApplicationPresent === true ? [] : ['full-xcode-application-missing']),
      ...(activeDeveloperDirectory === 'full-xcode' ? [] : ['full-xcode-not-selected']),
      ...(xcodebuildAvailable ? [] : ['xcodebuild-unavailable']),
      ...(cocoaPodsAvailable ? [] : ['cocoapods-unavailable']),
    ],
    boundaries: {
      accountChecked: false,
      membershipChecked: false,
      agreementAccepted: false,
      signingChanged: false,
      archiveAttempted: false,
      uploadAttempted: false,
      containsSecrets: false,
      containsAccountIdentifiers: false,
      containsFilesystemPaths: false,
    },
  };
}

function safeCommand(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function currentCandidate(root) {
  const pubspec = readFileSync(resolve(root, 'pubspec.yaml'), 'utf8');
  const match = /^version:\s+([^+\s]+)\+(\d{10})$/mu.exec(pubspec);
  if (match === null) fail('pubspec candidate version is invalid.');
  return { versionName: match[1], buildNumber: match[2] };
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--require-ready')) {
    fail(`Unknown argument: ${args.find((arg) => arg !== '--require-ready')}`);
  }
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const report = buildIosToolingReadiness({
    platform: process.platform,
    candidate: currentCandidate(root),
    xcodeApplicationPresent: existsSync('/Applications/Xcode.app') ||
      existsSync('/Applications/Xcode-beta.app'),
    developerDirectory: safeCommand('/usr/bin/xcode-select', ['-p']),
    xcodebuildVersion: safeCommand('/usr/bin/xcodebuild', ['-version']),
    cocoaPodsVersion: safeCommand('pod', ['--version']),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (args.includes('--require-ready') &&
      report.status !== 'ready-for-ios-build-preparation') {
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'iOS tooling diagnostic failed.'}\n`);
    process.exitCode = 1;
  }
}
