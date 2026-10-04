#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function fail(message) {
  throw new Error(message);
}

export function parsePubspecBuildIdentity(value) {
  const match = /^version:\s*([^+\s]+)\+(\d+)\s*$/mu.exec(value);
  if (match === null || !/^\d{10,12}$/u.test(match[2])) {
    fail('android_debug_pubspec_identity_invalid');
  }
  return Object.freeze({ versionName: match[1], versionCode: match[2] });
}

function parseProperties(value) {
  const properties = new Map();
  for (const line of value.split(/\r?\n/u)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    properties.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return properties;
}

function escapeProperty(value) {
  if (/[\r\n\0]/u.test(value)) fail('android_debug_tool_path_invalid');
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/:/gu, '\\:')
    .replace(/ /gu, '\\ ');
}

async function flutterRootFromTool(cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('flutter', ['--version', '--machine'], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`flutter_tool_identity_failed:${stderr.trim().slice(0, 500)}`));
        return;
      }
      const parsed = JSON.parse(stdout);
      if (parsed.frameworkVersion !== '3.41.7'
          || parsed.flutterRoot === undefined
          || parsed.flutterRoot.trim() === '') {
        reject(new Error('android_debug_flutter_toolchain_unexpected'));
        return;
      }
      resolve(parsed.flutterRoot.trim());
    });
  });
}

export async function prepareAndroidDebugBuildMetadata({
  root = repositoryRoot,
  androidSdkRoot,
  flutterRoot,
  env = process.env,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const propertiesPath = path.join(resolvedRoot, 'android/local.properties');
  const current = await readFile(propertiesPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const properties = parseProperties(current);
  const identity = parsePubspecBuildIdentity(
    await readFile(path.join(resolvedRoot, 'pubspec.yaml'), 'utf8'),
  );
  const resolvedAndroidSdk = (
    androidSdkRoot
      ?? env.ANDROID_HOME
      ?? env.ANDROID_SDK_ROOT
      ?? properties.get('sdk.dir')
      ?? path.join(os.homedir(), 'Library/Android/sdk')
  ).trim();
  const resolvedFlutter = (
    flutterRoot
      ?? env.FLUTTER_ROOT
      ?? await flutterRootFromTool(resolvedRoot, env)
  ).trim();
  if (resolvedAndroidSdk === '' || resolvedFlutter === '') {
    fail('android_debug_tool_paths_missing');
  }
  const output = [
    `sdk.dir=${escapeProperty(resolvedAndroidSdk)}`,
    `flutter.sdk=${escapeProperty(resolvedFlutter)}`,
    'flutter.buildMode=debug',
    `flutter.versionName=${identity.versionName}`,
    `flutter.versionCode=${identity.versionCode}`,
    '',
  ].join('\n');
  await mkdir(path.dirname(propertiesPath), { recursive: true });
  await writeFile(propertiesPath, output, { mode: 0o644 });
  return Object.freeze({
    ...identity,
    buildMode: 'debug',
    metadataPath: 'android/local.properties',
    toolPathsPrinted: false,
  });
}

if (process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareAndroidDebugBuildMetadata();
  process.stdout.write(
    `Android debug metadata prepared: ${result.versionName}+${result.versionCode}; tool paths withheld.\n`,
  );
}
