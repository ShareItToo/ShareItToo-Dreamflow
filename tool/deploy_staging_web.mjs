#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { deploy, sha256, TARGET, DEPLOY_ROOT } from './staging_web_contract.mjs';

// Local filesystem deployment only. No SSH, container recreate, Caddy reload or bootstrap.
const [target, sourceRoot, source, artifact, manifestHash, currentHash, execute, ...extra] = process.argv.slice(2);
try {
  if (!currentHash || extra.length || (execute && !['--execute', '--rollback', '--preflight-rollback'].includes(execute))) throw Error('usage: deploy_staging_web.mjs STAGING_ORIGIN ABS_CLEAN_SOURCE EXACT_HEAD ABS_ARTIFACT MANIFEST_SHA CURRENT_MANIFEST_SHA [--execute|--rollback|--preflight-rollback]');
  const result = deploy({ root: DEPLOY_ROOT, target, sourceRoot, source, artifact, manifestHash, currentHash, execute: execute === '--execute' || execute === '--rollback', rollback: execute === '--rollback' || execute === '--preflight-rollback',
    verify: ({ directory }) => {
      // Probe static bytes only. Never authenticate or call API/provider endpoints.
      for (const name of ['index.html', 'staging_bootstrap.js', 'flutter_service_worker.js', 'staging-release.json']) {
        const response = execFileSync('curl', ['--fail', '--silent', '--show-error', '--proto', '=https', '--max-time', '10', `${TARGET}/${name}?artifact=${manifestHash}`], { maxBuffer: 4 * 1024 * 1024 });
        if (sha256(response) !== sha256(fs.readFileSync(path.join(directory, 'web', name)))) throw Error('staging_static_readback_mismatch');
      }
    },
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(`Staging Web deployment refused: ${error.message}`);
  process.exitCode = 1;
}
