import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIosToolingReadiness } from '../../tool/diagnose_ios_tooling_readiness.mjs';

const candidate = { versionName: '1.0.0', buildNumber: '2026081403' };

test('reports the current command-line-tools-only Mac without attempting a build', () => {
  const result = buildIosToolingReadiness({
    platform: 'darwin',
    candidate,
    xcodeApplicationPresent: false,
    developerDirectory: '/Library/Developer/CommandLineTools\n',
    xcodebuildVersion: null,
    cocoaPodsVersion: null,
  });
  assert.equal(result.status, 'pending-local-tooling');
  assert.deepEqual(result.blockers, [
    'full-xcode-application-missing',
    'full-xcode-not-selected',
    'xcodebuild-unavailable',
    'cocoapods-unavailable',
  ]);
  assert.equal(result.observed.activeDeveloperDirectory, 'command-line-tools-only');
  assert.equal(result.boundaries.archiveAttempted, false);
  assert.equal(result.boundaries.containsFilesystemPaths, false);
});

test('reports ready only with selected full Xcode and CocoaPods on macOS', () => {
  const result = buildIosToolingReadiness({
    platform: 'darwin',
    candidate,
    xcodeApplicationPresent: true,
    developerDirectory: '/Applications/Xcode.app/Contents/Developer\n',
    xcodebuildVersion: 'Xcode 18.0\nBuild version 20A123\n',
    cocoaPodsVersion: '1.16.2\n',
  });
  assert.equal(result.status, 'ready-for-ios-build-preparation');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.observed.xcodeVersion, 'Xcode 18.0');
  assert.equal(result.observed.cocoaPodsVersion, '1.16.2');
});

test('never treats Xcode-shaped paths on a non-macOS host as ready', () => {
  const result = buildIosToolingReadiness({
    platform: 'linux',
    candidate,
    xcodeApplicationPresent: true,
    developerDirectory: '/Applications/Xcode.app/Contents/Developer',
    xcodebuildVersion: 'Xcode 18.0',
    cocoaPodsVersion: '1.16.2',
  });
  assert.equal(result.status, 'pending-local-tooling');
  assert.deepEqual(result.blockers, ['macos-host-required']);
});

test('keeps candidate and output free of account or credential fields', () => {
  const result = buildIosToolingReadiness({
    platform: 'darwin',
    candidate,
    xcodeApplicationPresent: false,
    developerDirectory: null,
    xcodebuildVersion: null,
    cocoaPodsVersion: null,
  });
  const serialized = JSON.stringify(result);
  assert.match(serialized, /2026081403/u);
  assert.doesNotMatch(serialized, /password|token|credential|email|serial/iu);
});
