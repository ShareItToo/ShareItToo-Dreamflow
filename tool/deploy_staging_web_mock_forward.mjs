#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { deploy, sha256, TARGET, DEPLOY_ROOT } from './staging_web_contract.mjs';
import { validateMockForwardCandidate } from './staging_web_mock_forward.mjs';

// Explicit private Staging forward path for the zero-cost synthetic mock only.
const [target, sourceRoot, source, artifact, manifestHash, currentHash, execute, ...extra] = process.argv.slice(2);
try {
  if (!currentHash || extra.length || (execute && execute !== '--execute')) {
    throw Error('usage: deploy_staging_web_mock_forward.mjs https://staging.shareittoo.com ABS_CLEAN_SOURCE EXACT_HEAD ABS_ARTIFACT MOCK_MANIFEST_SHA CURRENT_MANIFEST_SHA [--execute]');
  }
  validateMockForwardCandidate(artifact, manifestHash, source);
  const result = deploy({ root: DEPLOY_ROOT, target, sourceRoot, source, artifact,
    manifestHash, currentHash, execute: execute === '--execute',
    verify: ({ directory }) => {
      // Static bytes only; no API, identity, or AI provider request is made.
      for (const name of ['index.html', 'staging_bootstrap.js',
        'flutter_service_worker.js', 'staging-release.json']) {
        const response = execFileSync('curl', ['--fail', '--silent', '--show-error',
          '--proto', '=https', '--max-time', '10',
          `${TARGET}/${name}?artifact=${manifestHash}`], { maxBuffer: 4 * 1024 * 1024 });
        if (sha256(response) !== sha256(fs.readFileSync(path.join(directory, 'web', name)))) {
          throw Error('staging_static_readback_mismatch');
        }
      }
    },
  });
  console.log(JSON.stringify({ ...result, path: 'staging-mock-forward' }));
} catch (error) {
  console.error(`Staging mock forward deployment refused: ${error.message}`);
  process.exitCode = 1;
}
