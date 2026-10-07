// Operator-supplied inputs are protected files, never credential JSON in argv.
// Collect (all flags required; file/fd are mutually exclusive alternatives):
// node backend/ops/staging_google_web_reattestation_cli.mjs collect
//   --binding /protected/binding.json --binding-sha256 <independent-byte-sha256>
//   --service-credential-file /protected/service.json [or --service-credential-fd 3]
//   --user-credential-file /protected/firebase-user.json [or --user-credential-fd 4]
//   --output-dir /existing/external-0700-dir --run-id <unique-lowercase-id>
// Compose after independent review, including after process restart:
// node backend/ops/staging_google_web_reattestation_cli.mjs compose
//   --candidate /protected/run.candidate.json --candidate-sha256 <recorded-byte-sha256>
//   --journal /protected/run.journal.json --journal-sha256 <recorded-byte-sha256>
//   --decision /protected/decision.json --decision-sha256 <independent-byte-sha256>
//   --output-dir /existing/external-0700-dir --run-id <new-unique-id>
// Never writes provider configuration, refreshes user credentials, enables a
// flag, deploys, or proves browser login. Missing scoped/current operator tokens
// fail closed. Collect requires exact clean committed source inventory; absence
// of approved bindings/baseline/decision is a HOLD, not an invitation to invent it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readPrivateInput, parseServiceCredential } from './staging_google_web_live_adapter.mjs';
import { createGoogleWebReattestationReaders } from './staging_google_web_reattestation_adapter.mjs';
import { reserveGoogleWebArtifacts } from './staging_google_web_reattestation_writer.mjs';
import { preflightGoogleWebReattestation, readProtectedGoogleWebBytes, collectGoogleWebReattestation,
  loadGoogleWebReattestation, bindGoogleWebReattestationDecision } from './staging_google_web_reattestation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const check = (value) => { if (!value) throw new Error('google_web_reattestation_cli_denied'); };
const hash = (value) => createHash('sha256').update(value).digest('hex');
function argumentsFor(argv) {
  check(Array.isArray(argv) && ['collect', 'compose'].includes(argv[0]) && argv.length % 2 === 1);
  const args = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index]; const value = argv[index + 1];
    check(/^--[a-z][a-z0-9-]*$/u.test(flag) && typeof value === 'string' && value.length > 0 && !Object.hasOwn(args, flag.slice(2)));
    args[flag.slice(2)] = value;
  }
  const required = argv[0] === 'collect' ? ['binding', 'binding-sha256', 'output-dir', 'run-id']
    : ['candidate', 'candidate-sha256', 'journal', 'journal-sha256', 'decision', 'decision-sha256', 'output-dir', 'run-id'];
  if (argv[0] === 'collect') for (const prefix of ['service-credential', 'user-credential']) {
    check(Object.hasOwn(args, `${prefix}-file`) !== Object.hasOwn(args, `${prefix}-fd`));
    required.push(Object.hasOwn(args, `${prefix}-file`) ? `${prefix}-file` : `${prefix}-fd`);
  }
  check(Object.keys(args).sort().join('|') === required.sort().join('|'));
  for (const key of required.filter((key) => key.endsWith('-sha256'))) check(/^[a-f0-9]{64}$/u.test(args[key]));
  return { mode: argv[0], args };
}
function verifiedFile(file, expectedHash, repositoryRoot) {
  const bytes = readProtectedGoogleWebBytes(file, repositoryRoot);
  try { check(hash(bytes) === expectedHash); return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  finally { bytes.fill(0); }
}
export async function runGoogleWebReattestationCli(argv, dependencies = {}) {
  let output;
  try {
    check(dependencies !== null && Object.getPrototypeOf(dependencies) === Object.prototype
      && Object.keys(dependencies).every((key) => ['repositoryRoot', 'fetchImpl', 'execute', 'now'].includes(key)));
    const repositoryRoot = dependencies.repositoryRoot ?? root; const now = dependencies.now ?? Date.now;
    const { mode, args } = argumentsFor(argv);
    // Reserve namespace first. A collision/unsafe destination cannot trigger a
    // credential read, network request, Docker execution or provider operation.
    output = reserveGoogleWebArtifacts({ directory: args['output-dir'], runId: args['run-id'],
      kinds: mode === 'collect' ? ['candidate', 'journal'] : ['readiness'], repositoryRoot });
    let files;
    if (mode === 'collect') {
      const bindingText = verifiedFile(args.binding, args['binding-sha256'], repositoryRoot);
      const binding = JSON.parse(bindingText); check(JSON.stringify(binding) === bindingText);
      preflightGoogleWebReattestation(binding, repositoryRoot);
      const privateInput = (prefix) => {
        const fd = args[`${prefix}-fd`];
        if (fd !== undefined) check(/^[1-9][0-9]{0,3}$/u.test(fd) && Number(fd) >= 3 && Number(fd) <= 1024);
        return readPrivateInput(fd === undefined ? { file: args[`${prefix}-file`] } : { fd: Number(fd) });
      };
      const serviceCredential = parseServiceCredential(privateInput('service-credential'), binding.projectId);
      const readers = createGoogleWebReattestationReaders({ binding, serviceCredential,
        userCredentialBytes: privateInput('user-credential'), fetchImpl: dependencies.fetchImpl, execute: dependencies.execute, now });
      const result = await collectGoogleWebReattestation({ binding, readers, repositoryRoot, now });
      files = output.write({ candidate: JSON.stringify(result.candidate), journal: result.journalBytes });
    } else {
      const candidate = loadGoogleWebReattestation({ candidateFile: args.candidate, expectedCandidateSha256: args['candidate-sha256'],
        journalFile: args.journal, expectedJournalSha256: args['journal-sha256'], repositoryRoot, now: new Date(now()) });
      const decisionBytes = verifiedFile(args.decision, args['decision-sha256'], repositoryRoot);
      const { envelope } = bindGoogleWebReattestationDecision({ candidate, decisionBytes,
        expectedDecisionSha256: args['decision-sha256'], now: new Date(now()) });
      files = output.write({ readiness: JSON.stringify(envelope) });
    }
    return { status: mode === 'collect' ? 'pending-independent-review' : 'readiness-composed-not-activated', files };
  } catch { throw new Error('google_web_reattestation_cli_denied'); }
  finally { output?.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runGoogleWebReattestationCli(process.argv.slice(2)))}\n`); }
  catch { process.stderr.write('google_web_reattestation_cli_denied\n'); process.exitCode = 1; }
}
