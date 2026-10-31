import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { retryPrivateShelfMediaCleanup } from '../src/private_shelf_media_files.js';

if (process.argv.length !== 3 || process.argv[2] !== '--once') {
  throw new Error('private_shelf_media_cleanup_usage_invalid');
}

try {
  const result = await retryPrivateShelfMediaCleanup({
    client: pool,
    uploadDir: config.uploadDir,
  });
  process.stdout.write(`${JSON.stringify({
    status: result.failures.length ? 'retry-remains' : 'cleanup-complete',
    attempted: result.attempted,
    failed: result.failures.length,
  })}\n`);
  if (result.failures.length) process.exitCode = 1;
} finally {
  await pool.end();
}
