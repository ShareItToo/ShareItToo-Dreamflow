import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  assert, assertLedger, digest, equal, green98106, objectDigest,
  repositoryRoot, requiredSourcePaths, runtimeManifestPath, validateBinding, validateConfiguration, validateTarget,
} from './green_staging_98_106_contract.mjs';

// Read-only remains the default. Mutations live in a separate adapter and
// require complete publication/source/target bindings plus mode-specific consent.
export const mutationAdapterImplemented = true;
export const boundary = 'before_stop_seal_or_write';
export const sealedApiName = 'shareittoo-staging-api-alt-sealed-green-6c0ef70d';
export const requiredEnvironment = Object.freeze({
  NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'true',
  FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
  SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
  MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory',
  SIT_LISTING_AI_PROVIDER: 'on_device', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
  SIT_LISTING_AI_BUDGET_CENTS: '0', ENABLE_STAGING_STRIPE: '0',
  TECHNICAL_SANDBOX_ENABLED: '0', TECHNICAL_SANDBOX_KILL_SWITCH: '1',
});
export function assertEnvironment(entries, config) {
  assert(Array.isArray(entries), 'green_98_106_environment_shape');
  const env = {};
  for (const entry of entries) {
    assert(typeof entry === 'string' && /^[A-Z_][A-Z0-9_]*=/u.test(entry), 'green_98_106_environment_shape');
    const split = entry.indexOf('='); const key = entry.slice(0, split);
    assert(!Object.hasOwn(env, key), 'green_98_106_environment_duplicate'); env[key] = entry.slice(split + 1);
  }
  assert(Object.entries(requiredEnvironment).every(([key, value]) => env[key] === value), 'green_98_106_environment_boundary');
  for (const key of ['APPLE_REVOCATION_ENABLED', 'APPLE_OWNERSHIP_ACQUISITION_ENABLED']) {
    assert(!env[key] || env[key] === 'false', 'green_98_106_apple_activation_forbidden');
  }
  for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST',
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET', 'OPENAI_API_KEY']) {
    assert(!env[key]?.trim(), 'green_98_106_provider_boundary');
  }
  assert(typeof env.SIT_STAGING_ALLOWED_USER_IDS === 'string'
    && env.SIT_STAGING_ALLOWED_USER_IDS.trim().length > 0
    && digest(env.SIT_STAGING_ALLOWED_USER_IDS) === config.allowedUsersSha256,
  'green_98_106_allowlist_drift');
}
export function validateGitBinding(binding, { root = repositoryRoot, git = gitRead } = {}) {
  assert(/^[a-f0-9]{40}$/u.test(binding?.opsCommit ?? '')
    && /^[a-f0-9]{40}$/u.test(binding?.reviewedImplementationCommit ?? ''), 'green_98_106_git_binding');
  const head = git(['rev-parse', 'HEAD'], root).trim();
  assert(head === binding.opsCommit, 'green_98_106_ops_head');
  const ancestor = git(['merge-base', binding.reviewedImplementationCommit, head], root).trim();
  assert(ancestor === binding.reviewedImplementationCommit, 'green_98_106_review_ancestor');
  assert(git(['merge-base', green98106.runtimeCommit, binding.reviewedImplementationCommit], root).trim()
    === green98106.runtimeCommit, 'green_98_106_runtime_ancestor');
  for (const relative of requiredSourcePaths) {
    assert(digest(git(['show', `${binding.reviewedImplementationCommit}:${relative}`], root))
      === binding.sourceInventory[relative], 'green_98_106_reviewed_source');
    assert(digest(git(['show', `${head}:${relative}`], root))
      === binding.sourceInventory[relative], 'green_98_106_ops_source');
  }
  // The manifest is compared with the externally supplied Ops commit, never
  // included in its own sourceInventory (no self-hash or self-commit cycle).
  assert(digest(git(['show', `${head}:${runtimeManifestPath}`], root))
    === digest(fs.readFileSync(path.join(root, runtimeManifestPath))), 'green_98_106_manifest_ops_blob');
  return head;
}
export function validateCollectorCommit(opsCommit, { root = repositoryRoot, git = gitRead } = {}) {
  assert(/^[a-f0-9]{40}$/u.test(opsCommit ?? '') && git(['rev-parse', 'HEAD'], root).trim() === opsCommit,
    'green_98_106_collector_ops_commit');
  for (const relative of [...requiredSourcePaths, runtimeManifestPath]) {
    assert(digest(git(['show', `${opsCommit}:${relative}`], root)) === digest(fs.readFileSync(path.join(root, relative))),
      'green_98_106_collector_source_drift');
  }
}
function gitRead(args, root) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
}
export function buildPlan({ binding, publication, publicationSha256, target, config, actualOpsCommit, root }) {
  const accepted = validateBinding(binding, { publication, publicationSha256, actualOpsCommit, root });
  validateTarget(target); validateConfiguration(config);
  assert(objectDigest(target) === binding.targetSha256 && objectDigest(config) === binding.configSha256,
    'green_98_106_external_binding');
  return {
    kind: green98106.kind, schemaVersion: 1, status: 'plan_only', mutationAdapterImplemented,
    runtimeCommit: accepted.runtimeCommit, opsCommit: accepted.opsCommit,
    image: `${publication.tag}@${publication.digest}`, boundary,
    migrationRange: [99, 106], sourceLedger: green98106.sourceLedger, targetLedger: green98106.targetLedger,
    requiredMutationGates: [
      'capture_and_recheck_exact_ids_before_stop_and_seal',
      'quiesce_all_writers_then_recheck_before_and_after_backup',
      'exclusive_0600_custom_dump_stable_descriptor_hash',
      'pinned_pg16_isolated_network_create_inspect_id_start_init_marker_two_select_1',
      'restore_same_verified_bytes_then_verify_98_ledger_and_business_fingerprint',
      'immutable_runtime_690_forward_99_through_106',
      'verify_exact_106_ledger_constraints_functions_empty_new_namespaces',
      'idempotent_second_migration_business_and_readiness_finding_identity_unchanged',
      'isolated_candidate_acceptance_no_provider_egress_no_public_route',
      'cleanup_only_owned_ids_and_volumes_failure_overrides_pass',
      'fresh_explicit_canonical_confirmation_and_all_rehearsal_evidence',
      'canonical_migration_boundary_no_old_image_restart_or_automatic_restore',
      'forward_recovery_only_after_canonical_migration_starts',
    ],
  };
}
export const ledgerSql = "SELECT coalesce(json_agg(json_build_object('name',name,'checksum',checksum) ORDER BY name),'[]'::json) FROM schema_migrations";
export function assertReadOnlyCommand(entry) {
  const args = entry?.args;
  const identity = value => /^[a-f0-9]{64}$/u.test(value ?? '');
  const allowed = Array.isArray(args) && (
    (args.length === 2 && args[0] === 'inspect' && identity(args[1]))
    || (args.length === 3 && args[0] === 'network' && args[1] === 'inspect' && identity(args[2]))
    || (equal(args, ['volume', 'inspect', 'sit-green-uploads-20260918011528-wp254']))
    || (args.length === 3 && args[0] === 'image' && args[1] === 'inspect'
      && new RegExp(`^ghcr.io/shareittoo/shareittoo-api:${green98106.runtimeCommit}@sha256:[a-f0-9]{64}$`, 'u').test(args[2]))
    || (args.length === 13 && identity(args[1])
      && equal(args.slice(0, 1), ['exec'])
      && equal(args.slice(2, 12), ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'shareittoo_green', '-d', 'shareittoo_green', '-At', '-c'])
      && ((entry.phase === 'ledger_readback' && args[12] === ledgerSql)
        || (entry.phase === 'postgres_version' && args[12] === 'SHOW server_version_num'))));
  assert(entry?.command === 'docker' && allowed, 'green_98_106_read_only_command');
}
export function readOnlyCommand(entry) {
  assertReadOnlyCommand(entry);
  return execFileSync(entry.command, entry.args, { encoding: 'utf8', timeout: 15000,
    maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
function singleton(raw) {
  const records = JSON.parse(raw);
  assert(Array.isArray(records) && records.length === 1, 'green_98_106_inspect_shape');
  return records[0];
}
export function containerFingerprint(record) {
  return objectDigest({ Config: record.Config, HostConfig: record.HostConfig,
    Mounts: record.Mounts, Networks: Object.fromEntries(Object.entries(record.NetworkSettings?.Networks ?? {})
      .map(([name, network]) => [name, { NetworkID: network.NetworkID }])) });
}
export function checkContainer(record, expected, running) {
  assert(record.Id === expected.id && record.Name === `/${expected.name}`
    && record.State?.Running === running && record.State?.Paused === false
    && record.Image === expected.imageId
    && containerFingerprint(record) === expected.configSha256, 'green_98_106_container_drift');
}
export async function runReadOnlyPreflight(inputs, { command = readOnlyCommand, git = gitRead, sourceSealed = false } = {}) {
  // Bind the actual checkout BEFORE invoking any command executor.
  const actualOpsCommit = validateGitBinding(inputs.binding, { root: inputs.root, git });
  const plan = buildPlan({ ...inputs, actualOpsCommit });
  const { target, config } = inputs;
  const expectedApi = sourceSealed ? { ...target.api, name: sealedApiName } : target.api;
  const completed = [];
  const run = async (phase, args) => {
    const entry = { phase, command: 'docker', args: Object.freeze(args) };
    assertReadOnlyCommand(entry);
    const raw = await command(entry);
    assert(typeof raw === 'string', 'green_98_106_command_output'); completed.push(phase); return raw;
  };
  const api = singleton(await run('api_inspect', ['inspect', target.api.id]));
  checkContainer(api, expectedApi, !sourceSealed);
  assert(objectDigest(api.Config.Env) === config.runtimeEnvironmentSha256
    && objectDigest(api.Mounts) === config.mountsSha256, 'green_98_106_private_config_drift');
  assertEnvironment(api.Config.Env, config);
  const database = singleton(await run('database_inspect', ['inspect', target.database.id]));
  checkContainer(database, target.database, true);
  for (const witness of target.witnesses) {
    checkContainer(singleton(await run('witness_inspect', ['inspect', witness.id])), witness, false);
  }
  for (const network of target.networks) {
    const record = singleton(await run('network_inspect', ['network', 'inspect', network.id]));
    assert(record.Id === network.id && record.Name === network.name && record.Internal === network.internal,
      'green_98_106_network_drift');
    assert(api.NetworkSettings?.Networks?.[network.name]?.NetworkID === network.id,
      'green_98_106_api_network_drift');
    const allowed = new Set([target.api.id, target.database.id]);
    assert(record.Containers && Object.keys(record.Containers).every((value) => allowed.has(value)),
      'green_98_106_foreign_network_member');
  }
  assert(equal(Object.keys(api.NetworkSettings.Networks).sort(), target.networks.map((n) => n.name).sort()),
    'green_98_106_extra_network');
  const volume = singleton(await run('uploads_inspect', ['volume', 'inspect', target.uploads.name]));
  assert(volume.Name === target.uploads.name && objectDigest(volume) === target.uploads.configSha256,
    'green_98_106_uploads_drift');
  const image = singleton(await run('runtime_image_inspect', ['image', 'inspect', plan.image]));
  assert(image.RepoDigests?.includes(`ghcr.io/shareittoo/shareittoo-api@${inputs.publication.digest}`)
    && image.Config?.Labels?.['org.opencontainers.image.revision'] === green98106.runtimeCommit,
    'green_98_106_image_drift');
  const psql = (query) => ['exec', target.database.id, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U',
    target.databaseUser, '-d', target.databaseName, '-At', '-c', query];
  assertLedger(JSON.parse(await run('ledger_readback', psql(ledgerSql))), 98);
  assert(/^16[0-9]{4}$/u.test((await run('postgres_version', psql('SHOW server_version_num'))).trim()),
    'green_98_106_postgres_version');
  // Re-read the active identities last. A successful prefix is never rehearsal or promotion evidence.
  checkContainer(singleton(await run('api_recheck', ['inspect', target.api.id])), expectedApi, !sourceSealed);
  checkContainer(singleton(await run('database_recheck', ['inspect', target.database.id])), target.database, true);
  return { kind: green98106.kind, status: 'read_only_prefix_passed', mutationAdapterImplemented,
    boundary, completed, rehearsalPassed: false, promotionAuthorized: false, publicReleaseComplete: false };
}
