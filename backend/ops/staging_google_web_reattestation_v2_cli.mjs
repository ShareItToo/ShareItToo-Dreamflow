// Read-only collect from a canonical v2 binding; then review the candidate and
// journal independently before using v1 compose with that decision.
// node backend/ops/staging_google_web_reattestation_v2_cli.mjs collect \
//   --binding /protected/binding-v2.json --binding-sha256 <recorded-byte-hash> \
//   --service-credential-file /protected/service-account.json \
//   --user-credential-file /protected/firebase-user.json \
//   --output-dir /protected/owner-0700 --run-id <new-run>
// No provider settings are written; stdout includes only IDs, file paths/hashes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readPrivateInput, parseServiceCredential } from './staging_google_web_live_adapter.mjs';
import { readProtectedGoogleWebBytes } from './staging_google_web_reattestation.mjs';
import { reserveGoogleWebArtifacts } from './staging_google_web_reattestation_writer.mjs';
import { collectGoogleWebReattestationV2 } from './staging_google_web_reattestation_v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (v) => createHash('sha256').update(v).digest('hex');
const deny = () => { throw new Error('google_web_reattestation_v2_cli_denied'); };
function parse(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 1 || argv[0] !== 'collect') deny();
  const allowed = new Set(['--binding', '--binding-sha256', '--service-credential-file', '--user-credential-file', '--output-dir', '--run-id']);
  const args = {};
  for (let i = 1; i < argv.length; i += 2) {
    const flag = argv[i]; const value = argv[i + 1];
    if (!allowed.has(flag) || Object.hasOwn(args, flag.slice(2)) || typeof value !== 'string' || !value) deny();
    args[flag.slice(2)] = value;
  }
  if (Object.keys(args).sort().join('|') !== ['binding', 'binding-sha256', 'service-credential-file', 'user-credential-file', 'output-dir', 'run-id'].sort().join('|')
    || !/^[a-f0-9]{64}$/u.test(args['binding-sha256'])) deny();
  return args;
}
export async function runGoogleWebReattestationV2Cli(argv, dependencies = {}) {
  let output;
  try {
    if (Object.getPrototypeOf(dependencies) !== Object.prototype || Object.keys(dependencies).some((k) => !['fetchImpl', 'execute', 'now', 'repositoryRoot'].includes(k))) deny();
    const a = parse(argv); const repo = dependencies.repositoryRoot ?? root;
    output = reserveGoogleWebArtifacts({ directory: a['output-dir'], runId: a['run-id'], kinds: ['candidate', 'journal'], repositoryRoot: repo });
    const bytes = readProtectedGoogleWebBytes(a.binding, repo);
    let binding;
    try { if (hash(bytes) !== a['binding-sha256']) deny(); const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); binding = JSON.parse(text); if (`${JSON.stringify(binding)}\n` !== text) deny(); }
    finally { bytes.fill(0); }
    const serviceText = readPrivateInput({ file: a['service-credential-file'] });
    const userText = readPrivateInput({ file: a['user-credential-file'] });
    const serviceCredential = parseServiceCredential(serviceText, binding.projectId);
    const result = await collectGoogleWebReattestationV2({ binding, serviceCredential, userCredentialBytes: userText,
      repositoryRoot: repo, ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
      ...(dependencies.execute ? { execute: dependencies.execute } : {}), ...(dependencies.now ? { now: dependencies.now } : {}) });
    const files = output.write({ candidate: JSON.stringify(result.candidate), journal: result.journalBytes });
    return { status: 'pending-independent-review', v2BindingSha256: result.v2BindingSha256, files };
  } catch { throw new Error('google_web_reattestation_v2_cli_denied'); }
  finally { output?.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runGoogleWebReattestationV2Cli(process.argv.slice(2)))}\n`); }
  catch { process.stderr.write('google_web_reattestation_v2_cli_denied\n'); process.exitCode = 1; }
}
