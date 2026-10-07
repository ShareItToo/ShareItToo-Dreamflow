#!/usr/bin/env node

import { readGoogleRegistrationRuntimeManifest, runStagingWebCorsTransition, sanitizeGoogleRegistrationEnableError } from './enable_staging_google_registration.mjs';

// Separate CLI avoids a cyclic top-level-await import through the shared runner.
try {
  const manifest = readGoogleRegistrationRuntimeManifest(process.env.STAGING_WEB_CORS_RUNTIME_MANIFEST ?? '', { cors: true });
  const result = await runStagingWebCorsTransition({
    manifest, evidenceFile: process.env.STAGING_WEB_CORS_EVIDENCE_FILE,
    execute: process.env.STAGING_WEB_CORS_EXECUTE === '1',
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify(sanitizeGoogleRegistrationEnableError(error))}\n`);
  process.exitCode = 1;
}
