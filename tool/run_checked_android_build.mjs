#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// These are failures of build analysis, even when Gradle returns exit zero.
// Do not retain full logs, process arguments or matched diagnostic contents.
export function createAndroidBuildDiagnosticScan() {
  let tail = '';
  const findings = new Set();
  return {
    accept(chunk) {
      const text = tail + String(chunk);
      if (/compiled with an incompatible version of Kotlin|binary version of its metadata is|Unable to read Kotlin metadata|Kotlin metadata.*(?:unsupported|unknown) version/iu.test(text)) {
        findings.add('incompatible-kotlin-metadata');
      }
      if (/only understands SDK XML versions up to \d+ but an SDK XML file of version \d+ was encountered/iu.test(text)) {
        findings.add('incompatible-sdk-xml-reader');
      }
      tail = text.slice(-2048);
    },
    result() { return [...findings].sort(); },
  };
}

export async function runCheckedAndroidBuild({
  args,
  spawnProcess = spawn,
  stdout = process.stdout,
  stderr = process.stderr,
}) {
  if (!Array.isArray(args) || !['apk', 'appbundle'].includes(args[0])
      || !args.includes('--release') || args.some((value) => typeof value !== 'string')) {
    throw new Error('Checked Android build requires an explicit release APK or appbundle command.');
  }
  const scans = [createAndroidBuildDiagnosticScan(), createAndroidBuildDiagnosticScan()];
  return new Promise((resolvePromise) => {
    const child = spawnProcess('flutter', ['build', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    child.stdout.on('data', (chunk) => { scans[0].accept(chunk); stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { scans[1].accept(chunk); stderr.write(chunk); });
    child.once('error', () => resolvePromise({ exitCode: 1, findings: ['build-process-unavailable'] }));
    child.once('close', (code) => {
      const findings = [...new Set(scans.flatMap((scan) => scan.result()))].sort();
      resolvePromise({ exitCode: code === 0 ? (findings.length === 0 ? 0 : 1) : (code ?? 1), findings });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await runCheckedAndroidBuild({ args: process.argv.slice(2) });
    if (result.findings.length > 0) {
      process.stderr.write(`Android build analysis failed: ${result.findings.join(', ')}.\n`);
    }
    process.exitCode = result.exitCode;
  } catch {
    process.stderr.write('Checked Android build could not run.\n');
    process.exitCode = 1;
  }
}
