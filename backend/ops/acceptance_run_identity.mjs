import crypto from 'node:crypto';

const runIdPattern = /^b(?:8|9)-[a-z0-9]{8,16}-[a-f0-9]{6}$/u;
const principalKeyPattern = /^[a-z][a-z0-9_]{0,31}$/u;
const enabledFlags = new Set(['1', 'true', 'yes']);
const disabledFlags = new Set(['0', 'false', 'no', '']);

function fail(code) {
  throw new Error(code);
}

export function resolveAcceptanceRunId(block, environment = process.env) {
  if (!['b8', 'b9'].includes(block)) fail('acceptance_block_invalid');
  const supplied = environment.ACCEPTANCE_RUN_ID;
  if (supplied !== undefined) {
    if (typeof supplied !== 'string' || supplied.trim() !== supplied
        || !runIdPattern.test(supplied) || !supplied.startsWith(`${block}-`)) {
      fail(`${block}_acceptance_run_id_invalid`);
    }
    return supplied;
  }
  return `${block}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

export function deriveAcceptancePrincipalIds(runId, principalKeys) {
  if (typeof runId !== 'string' || !runIdPattern.test(runId)
      || !Array.isArray(principalKeys) || principalKeys.length === 0
      || principalKeys.some((key) => typeof key !== 'string' || !principalKeyPattern.test(key))
      || new Set(principalKeys).size !== principalKeys.length) {
    fail('acceptance_principal_ids_invalid');
  }
  return Object.freeze(Object.fromEntries(
    principalKeys.map((key) => [key, `${runId}-${key}`]),
  ));
}

export function assertAcceptancePrincipalGateCompatibility(runId, principalIds, environment = process.env) {
  const flag = String(environment.SIT_STAGING_ACCESS_GATE_ENABLED ?? '').trim().toLowerCase();
  if (!enabledFlags.has(flag) && !disabledFlags.has(flag)) {
    fail('acceptance_access_gate_flag_invalid');
  }
  if (!enabledFlags.has(flag)) return Object.freeze({ enabled: false, missing: Object.freeze([]) });
  if (typeof runId !== 'string' || !runIdPattern.test(runId)
      || !Array.isArray(principalIds) || principalIds.length === 0
      || principalIds.some((id) => typeof id !== 'string'
        || !id.startsWith(`${runId}-`)
        || !principalKeyPattern.test(id.slice(runId.length + 1)))) {
    fail('acceptance_principal_gate_input_invalid');
  }
  const raw = String(environment.SIT_STAGING_ALLOWED_USER_IDS ?? '').trim();
  if (!raw) fail('acceptance_principal_allowlist_missing');
  const allowed = raw.split(',').map((value) => value.trim());
  if (allowed.some((value) => !value || value.includes('*') || value.includes('?'))
      || new Set(allowed).size !== allowed.length) {
    fail('acceptance_principal_allowlist_invalid');
  }
  const missing = principalIds.filter((id) => !allowed.includes(id));
  if (missing.length > 0) fail(`acceptance_principal_not_allowlisted:${missing.join(',')}`);
  return Object.freeze({ enabled: true, missing: Object.freeze([]) });
}
