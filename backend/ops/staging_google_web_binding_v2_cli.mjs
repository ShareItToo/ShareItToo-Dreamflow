// After exact source promotion/runtime pinning, with owner:0600 credential files
// and a pre-existing owner:0700 output directory outside this checkout:
// node backend/ops/staging_google_web_binding_v2_cli.mjs \
//   --output-dir /protected/owner-0700 --run-id <new-run> \
//   --source-commit <exact-ops-commit> --runtime-commit <promoted-api-commit> \
//   --runtime-container-id <64-hex-container-id> --runtime-image-id sha256:<64-hex> \
//   --runtime-repo-digest <repository@sha256:digest> \
//   --firebase-account-email-sha256 <approved-account-hash> \
//   --review-evidence-sha256 <independent-gate-evidence-hash> \
//   --service-credential-file /protected/service-account.json \
//   --user-credential-file /protected/firebase-user.json
// stdout contains only the protected file path and its byte hash.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGoogleWebBindingV2 } from './staging_google_web_binding_v2.mjs';
import { reserveGoogleWebBindingV2 } from './staging_google_web_binding_v2_writer.mjs';
import { readPrivateInput } from './staging_google_web_live_adapter.mjs';
import { createGoogleWebBindingV2Readers } from './staging_google_web_binding_v2_adapter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const deny = () => { throw new Error('google_web_binding_v2_cli_denied'); };
function parse(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) deny();
  const allowed = new Set(['--output-dir', '--run-id', '--source-commit', '--runtime-commit', '--runtime-image-id',
    '--runtime-repo-digest', '--review-evidence-sha256', '--runtime-container-id', '--firebase-account-email-sha256',
    '--service-credential-file', '--user-credential-file']); const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]; if (!allowed.has(key) || Object.hasOwn(args, key.slice(2)) || typeof argv[i + 1] !== 'string' || !argv[i + 1]) deny();
    args[key.slice(2)] = argv[i + 1];
  }
  if (Object.keys(args).sort().join('|') !== ['output-dir', 'run-id', 'source-commit', 'runtime-commit', 'runtime-image-id', 'runtime-repo-digest',
    'review-evidence-sha256', 'runtime-container-id', 'firebase-account-email-sha256', 'service-credential-file', 'user-credential-file'].sort().join('|')) deny();
  return args;
}
export async function runGoogleWebBindingV2Cli(argv, dependencies = {}) {
  let output;
  try {
    if (Object.getPrototypeOf(dependencies) !== Object.prototype || Object.keys(dependencies).some((k) => !['readers', 'repositoryRoot', 'fetchImpl', 'execute', 'now'].includes(k))) deny();
    const args = parse(argv);
    const repositoryRoot = dependencies.repositoryRoot ?? root;
    output = reserveGoogleWebBindingV2({ outputDir: args['output-dir'], runId: args['run-id'], repositoryRoot });
    let readers = dependencies.readers;
    if (!readers) readers = createGoogleWebBindingV2Readers({
      serviceCredentialBytes: readPrivateInput({ file: args['service-credential-file'] }),
      userCredentialBytes: readPrivateInput({ file: args['user-credential-file'] }),
      firebaseAccountEmailSha256: args['firebase-account-email-sha256'], runtimeContainerId: args['runtime-container-id'],
      expectedRuntimeCommit: args['runtime-commit'], expectedRuntimeImageId: args['runtime-image-id'],
      expectedRuntimeRepoDigest: args['runtime-repo-digest'],
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}), ...(dependencies.execute ? { execute: dependencies.execute } : {}),
      ...(dependencies.now ? { now: dependencies.now } : {}),
    });
    const collected = await collectGoogleWebBindingV2({ readers, repositoryRoot,
      sourceCommit: args['source-commit'], runtimeCommit: args['runtime-commit'], runtimeImageId: args['runtime-image-id'],
      runtimeRepoDigest: args['runtime-repo-digest'], reviewEvidenceSha256: args['review-evidence-sha256'] });
    const written = output.write(collected.bytes);
    return { status: 'binding-v2-created', ...written };
  } catch { throw new Error('google_web_binding_v2_cli_denied'); }
  finally { output?.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runGoogleWebBindingV2Cli(process.argv.slice(2)))}\n`); }
  catch { process.stderr.write('google_web_binding_v2_cli_denied\n'); process.exitCode = 1; }
}
