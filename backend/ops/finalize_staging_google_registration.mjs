#!/usr/bin/env node

import { readGoogleRegistrationRuntimeManifest, runStagingGoogleRegistrationFinalize, sanitizeGoogleRegistrationEnableError } from './enable_staging_google_registration.mjs';

// Separate manifest kind and confirmation namespace prevent an enable command
// or its stale pre-enrollment manifest from closing a lane inadvertently.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const prefix = 'STAGING_GOOGLE_REGISTRATION_FINALIZE';
    const manifest = readGoogleRegistrationRuntimeManifest(process.env[`${prefix}_RUNTIME_MANIFEST`] ?? '', { finalize: true });
    const result = await runStagingGoogleRegistrationFinalize({
      manifest,
      mappingFile: process.env[`${prefix}_MAPPING_FILE`] ?? '',
      evidenceFile: process.env[`${prefix}_EVIDENCE_FILE`] ?? '',
      execute: process.env[`${prefix}_EXECUTE`] === '1',
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(sanitizeGoogleRegistrationEnableError(error))}\n`);
    process.exitCode = 1;
  }
}
