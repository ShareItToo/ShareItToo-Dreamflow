import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { objectDigest } from '../ops/green_staging_98_106_contract.mjs';
import { assertCredentialCleanupEligible, credentialCleanupEligibilitySql, runSuccessorRehearsal,
  rehearsalConfirmation, rehearsalProbeIdentity, readinessScript, evaluateCandidateReadinessProbe } from '../ops/green_staging_106_106_rehearsal.mjs';
import { executionPreflight } from '../ops/green_staging_106_106_preflight.mjs';
import { runMfaProbe } from '../ops/staging_controlled_acceptance.mjs';
import { rehearsalFixture } from './fixtures/green_106106_rehearsal.js';

async function scoped(run) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-successor-rehearsal-')); fs.chmodSync(directory, 0o700);
  try { await run(await rehearsalFixture(directory), directory); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
const owned = f => Object.values(f.records).filter(r => r.Name?.includes('sit-106-106-'));
const groupAdds = call => call.args.flatMap((value, index) => value === '--group-add' ? [call.args[index + 1]] : []);
test('mock rehearsal readiness requires exact synthetic-only capability readback', () => {
  const runtimeCommit = 'a'.repeat(40), version = { commit: runtimeCommit, environment: 'test' };
  const ready = { status: 'ok', checks: { technicalSandbox: { available: false, reason: 'disabled', provider: 'stripe', mode: 'disabled',
    amountMinor: 100, currency: 'EUR', maxRunsPerUser24h: 3, professionalReview: false, syntheticOnly: true },
  identityVerification: { provider: 'memory' }, listingAi: { provider: 'mock', model: 'listing-ai-mock-v1', budgetCents: 0,
    stagingSmokeBudgetCents: 0, stagingSmokeActivationId: null, externalProviderExecutionAllowed: false,
    automaticPublicationAllowed: false, productionEligible: false, syntheticOnly: true } } };
  const probe = { live: { status: 200, payload: { status: 'ok' } }, ready: { status: 200, payload: ready }, version: { status: 200, payload: version } };
  assert.equal(evaluateCandidateReadinessProbe(probe, { expectedVersion: version, runtimeCommit, listingAiProvider: 'mock' }).ok, true);
  for (const [key, value] of [['provider', 'on_device'], ['model', 'openai'], ['budgetCents', 1],
    ['stagingSmokeBudgetCents', 1], ['externalProviderExecutionAllowed', true], ['automaticPublicationAllowed', true],
    ['productionEligible', true], ['syntheticOnly', false]]) {
    const changed = structuredClone(probe); changed.ready.payload.checks.listingAi[key] = value;
    assert.equal(evaluateCandidateReadinessProbe(changed, { expectedVersion: version, runtimeCommit, listingAiProvider: 'mock' }).ok, false, key);
  }
});
test('isolated lifecycle seals by exact ID, verifies backup/restore106/startup/probes and cleanup before PASS', async () => scoped(async (f, directory) => {
  const baseline = structuredClone(f.states.get(f.dbSource.Id));
  let result;
  try { result = await runSuccessorRehearsal(f.data, f.options, f.dependencies); }
  catch (error) { throw new Error(`synthetic phases: ${f.calls.slice(-15).map(c => c.phase ?? c.args[0]).join(', ')}`, { cause: error }); }
  assert.equal(result.status, 'rehearsal_passed_services_sealed'); assert.equal(f.probeRan(), true);
  assert.equal(f.source.State.Running, false); assert.equal(f.source.Name, `/${f.config.sealedSourceName}`);
  assert.equal(owned(f).length, 0); assert.deepEqual([...f.volumes], ['green-uploads']);
  assert.deepEqual(f.states.get(f.dbSource.Id), baseline); assert.equal(f.open.size, 0);
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.rehearsal.json')));
  assert.equal(receipt.restoreVerified, true);
  for (const field of ['cleanupVerified', 'fixtureCleanupVerified', 'namespaceReadabilityVerified', 'servicesRemainSealed']) assert.equal(receipt[field], true);
  assert.equal(receipt.canonicalPromotionImplemented, false);
  const starts = f.calls.filter(c => c.args[0] === 'start'); assert.ok(starts.length > 0);
  assert.ok(starts.every(c => c.args[1] !== f.source.Id));
  assert.ok(f.calls.filter(c => c.args[0] === 'rm').every(c => c.args[1] === '--force' && c.args[2] === '--volumes' && /^[a-f0-9]{64}$/u.test(c.args[3])));
  assert.ok(!f.calls.some(c => c.args.includes('--publish') || (c.args[0] === 'volume' && ['rm', 'create'].includes(c.args[1]))));
  assert.deepEqual(groupAdds(f.calls.find(c => c.phase === 'create_materials')), ['65532']);
  assert.deepEqual(groupAdds(f.calls.find(c => c.phase === 'create_database')), []);
  const candidate = f.calls.find(c => c.phase === 'create_candidate');
  assert.deepEqual(groupAdds(candidate), []);
  assert.equal(candidate.env.SIT_LISTING_AI_PROVIDER, 'on_device');
  assert.equal(Object.hasOwn(candidate.env, 'SIT_STAGING_ALLOWED_USER_IDS'), false);
  assert.equal(Object.hasOwn(candidate.env, 'SIT_GREEN_REHEARSAL_PROBE_USER_ID'), false);
  for (const call of f.calls.filter(c => c.args[0] === 'create')) assert.equal(call.args[call.args.indexOf('--restart') + 1], 'no');
}));
test('explicit mock transition reaches the isolated candidate and receipt only after synthetic-only readiness readback', async () => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-successor-mock-rehearsal-'));
  fs.chmodSync(directory, 0o700);
  try {
    const f = await rehearsalFixture(directory, { listingAiMock: true });
    const result = await runSuccessorRehearsal(f.data, f.options, f.dependencies);
    assert.equal(result.status, 'rehearsal_passed_services_sealed');
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.rehearsal.json'), 'utf8'));
    assert.equal(receipt.listingAiTransitionSha256, objectDigest(f.config.listingAiTransition));
    assert.equal(receipt.sourceEnvironmentSha256, f.config.envFile.sha256);
    assert.equal(receipt.providerTraffic, false);
    assert.equal(f.calls.some(call => call.phase === 'candidate_readiness'), true);
    const candidate = f.calls.find(call => call.phase === 'create_candidate');
    const probe = f.calls.find(call => call.phase === 'synthetic_mfa_identity');
    const identity = rehearsalProbeIdentity(f.config.runId, 'synthetic-only');
    assert.equal(candidate.env.SIT_STAGING_ALLOWED_USER_IDS, identity.allowedUserIds);
    assert.equal(candidate.env.SIT_GREEN_REHEARSAL_PROBE_USER_ID, identity.userId);
    assert.equal(Object.hasOwn(candidate.env, 'SIT_GREEN_REHEARSAL'), false);
    assert.deepEqual(f.source.Config.Env.filter(value => value.startsWith('SIT_STAGING_ALLOWED_USER_IDS=')),
      ['SIT_STAGING_ALLOWED_USER_IDS=synthetic-only']);
    assert.match(probe.input, /SIT_GREEN_REHEARSAL_PROBE_USER_ID/u);
    assert.match(probe.input, /rehearsalProbeUserId \+ '@example\.invalid'/u);
    assert.match(probe.input, /if \(createdUser\) await pool\.query\('DELETE FROM users/u);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('rehearsal probe identity is deterministic and rejects malformed, duplicate, or colliding allowlists', () => {
  const identity = rehearsalProbeIdentity('synthetic-run', 'synthetic-only,other.user');
  assert.deepEqual(identity, rehearsalProbeIdentity('synthetic-run', 'synthetic-only,other.user'));
  assert.match(identity.userId, /^sit_rehearsal_[a-f0-9]{32}$/u);
  assert.equal(identity.email, `${identity.userId}@example.invalid`);
  assert.equal(identity.allowedUserIds, `synthetic-only,other.user,${identity.userId}`);
  assert.throws(() => rehearsalProbeIdentity('bad run id', 'synthetic-only'));
  assert.throws(() => rehearsalProbeIdentity('synthetic-run', 'synthetic-only,synthetic-only'));
  assert.throws(() => rehearsalProbeIdentity('synthetic-run', identity.userId));
});
test('MFA stdin probe consumes rehearsal ID in the create/delete path without selecting synthetic-password mode', async () => {
  const identity = rehearsalProbeIdentity('synthetic-run', 'synthetic-only'); let script = '';
  await runMfaProbe({ container: 'a'.repeat(64), commandRunner: async (_program, _args, input) => {
    script = input; return JSON.stringify({ mfa: 'enroll-pending-cancel-passed', identity: 'start-status-resume-revoke-passed' });
  } });
  assert.match(script, /const greenRehearsal = process\.env\.SIT_GREEN_REHEARSAL === '1'/u);
  assert.match(script, /const rehearsalProbeUserId = process\.env\.SIT_GREEN_REHEARSAL_PROBE_USER_ID/u);
  assert.match(script, /const userId = greenRehearsal \? syntheticUser\.id : rehearsalProbeUserId \|\| runId \+ '-user'/u);
  assert.match(script, new RegExp(`const email = greenRehearsal \\? syntheticUser\\.email : rehearsalProbeUserId\\n  \\? rehearsalProbeUserId \\+ '@example\\.invalid'`));
  assert.match(script, /if \(createdUser\) await pool\.query\('DELETE FROM users/u);
  assert.equal(identity.email, `${identity.userId}@example.invalid`);
});
test('candidate receives exactly the supplemental gid required by its mounted material', async () => scoped(async f => {
  const [mfa, firebase] = f.config.materials;
  f.io.lstatSync(mfa.source); f.io.lstatSync(firebase.source);
  mfa.gid = 65532; firebase.gid = f.config.gid;
  f.stats.get(mfa.source).gid = 65532n; f.stats.get(firebase.source).gid = BigInt(f.config.gid);
  f.manifest.configSha256 = objectDigest(f.config);
  f.options.preflight = await executionPreflight(f.data, f.dependencies);
  f.options.preflightSha256 = objectDigest(f.options.preflight);
  f.options.confirmation = rehearsalConfirmation(f.data, f.options.preflightSha256); f.calls.length = 0;
  await runSuccessorRehearsal(f.data, f.options, f.dependencies);
  assert.deepEqual(groupAdds(f.calls.find(c => c.phase === 'create_materials')), ['65532']);
  assert.deepEqual(groupAdds(f.calls.find(c => c.phase === 'create_database')), []);
  assert.deepEqual(groupAdds(f.calls.find(c => c.phase === 'create_candidate')), ['65532']);
}));
test('backup baseline allows healthy watchdog increments but rejects all other recovery drift before pg_dump', async t => {
  await t.test('multiple healthy watchdog increments', async () => scoped(async (f, directory) => {
    const prior = f.dependencies.command, watchdog = f.states.get(f.dbSource.Id)[2][0]; let injected = false;
    f.dependencies.command = async entry => {
      if (!injected && entry.phase === 'source_writers') {
        injected = true;
        watchdog.attempt_count += 3; watchdog.success_count += 3;
        watchdog.last_started_at = watchdog.last_succeeded_at = watchdog.updated_at = '2020-01-01T00:00:00.500Z';
      }
      return prior(entry);
    };
    const result = await runSuccessorRehearsal(f.data, f.options, f.dependencies);
    assert.equal(result.status, 'rehearsal_passed_services_sealed');
    assert.ok(f.calls.some(call => call.phase === 'protected_backup'));
    assert.equal(f.probeRan(), true); assert.equal(owned(f).length, 0);
  }));
  const cases = {
    business: state => { state[1].mission_needs.count++; },
    readiness: state => { state[3].supportNextUpdateOverdue.push({ id_hash: 'a'.repeat(64),
      cause: 'next_update_overdue', status: 'open', priority: 'p1', time_class: '<1h' }); },
    error: state => { state[2][0].last_error_code = 'worker_failed'; state[2][0].last_failed_at = state[2][0].last_started_at; },
    alert: state => { state[2][0].last_alert_count++; },
  };
  for (const [label, change] of Object.entries(cases)) await t.test(label, async () => scoped(async (f, directory) => {
    const prior = f.dependencies.command; let injected = false;
    f.dependencies.command = async entry => {
      if (!injected && entry.phase === 'source_writers') {
        injected = true; change(f.states.get(f.dbSource.Id));
      }
      return prior(entry);
    };
    await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
    assert.equal(injected, true);
    assert.ok(!f.calls.some(call => call.phase === 'protected_backup'));
    assert.equal(fs.existsSync(path.join(directory, 'synthetic-run.pgdump')), false);
    assert.equal(f.probeRan(), false); assert.equal(owned(f).length, 0);
    const failure = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.failure.json')));
    assert.equal(failure.cleanupVerified, true);
    assert.doesNotMatch(JSON.stringify(failure), /private-value|password|token_digest|refresh/u);
  }));
});
test('consent, stale/schema1 receipt and evidence collisions fail before any command or write', async t => {
  for (const [label, change] of Object.entries({ consent: f => { f.options.confirmation = 'no'; },
    stale: f => { f.options.preflight.createdAt = '2020-01-01T00:00:00.000Z'; },
    old: f => { f.options.preflight.schemaVersion = 1; },
    binding: f => { f.options.preflight.targetSha256 = '0'.repeat(64); },
    collision: (f, d) => fs.writeFileSync(path.join(d, 'synthetic-run.pgdump'), 'retained', { mode: 0o600 }) })) {
    await t.test(label, async () => scoped(async (f, directory) => {
      change(f, directory);
      if (label !== 'consent') { f.options.preflightSha256 = objectDigest(f.options.preflight); f.options.confirmation = rehearsalConfirmation(f.data, f.options.preflightSha256); }
      const before = fs.readdirSync(directory); await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
      assert.equal(f.calls.length, 0); assert.deepEqual(fs.readdirSync(directory), before); assert.equal(f.source.State.Running, true);
    }));
  }
});
test('lost responses are reconciled from exact state without replaying mutations', async () => scoped(async f => {
  for (const phase of ['create_materials', 'start_materials', 'remove_materials', 'source_stop', 'source_seal', 'create_network',
    'create_database', 'start_database', 'create_candidate', 'start_candidate', 'remove_candidate', 'remove_database', 'remove_network']) f.losses.add(phase);
  await runSuccessorRehearsal(f.data, f.options, f.dependencies);
  for (const phase of ['source_stop', 'source_seal', 'create_database', 'start_candidate', 'remove_database']) assert.equal(f.calls.filter(c => c.phase === phase).length, 1);
  assert.equal(owned(f).length, 0); assert.equal(f.losses.size, 0);
}));
test('prerequisite/start/probe failures never restart the source and leave no owned fixtures', async t => {
  for (const phase of ['create_materials', 'protected_backup', 'restore106', 'synthetic_mfa_identity']) await t.test(phase, async () => scoped(async (f, directory) => {
    f.beforeFailures.add(phase); await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
    assert.equal(f.beforeFailures.size, 0); assert.ok(f.calls.some(c => c.phase === phase));
    assert.equal(owned(f).length, 0); assert.deepEqual([...f.volumes], ['green-uploads']);
    assert.ok(!f.calls.some(c => c.args[0] === 'start' && c.args[1] === f.source.Id));
    assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.rehearsal.json')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.failure.json'))).cleanupVerified, true);
    if (phase === 'restore106') assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.failure.json'))).restoreVerified, false);
  }));
});
test('foreign network member prevents progress and cleanup failure overrides all successful checks', async () => scoped(async (f, directory) => {
  const prior = f.dependencies.command; let inserted = false;
  f.dependencies.command = async e => {
    const result = await prior(e);
    if (e.phase === 'start_candidate' && !inserted) {
      const net = Object.values(f.records).find(r => r.Name === `sit-106-106-${f.config.runId}`);
      net.Containers['f'.repeat(64)] = { Name: 'foreign-router' }; inserted = true;
    }
    return result;
  };
  await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies), /cleanup_failed/u);
  const failure = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.failure.json')));
  assert.equal(failure.cleanupVerified, false); assert.equal(f.probeRan(), false);
  assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.rehearsal.json')));
  assert.ok(!f.calls.some(c => c.args.at(-1) === 'f'.repeat(64)));
}));
test('wrong exact version is read-only-polled, never restarts candidate or reaches probes', async () => scoped(async (f, directory) => {
  const prior = f.dependencies.command;
  f.dependencies.command = async e => {
    const result = await prior(e);
    if (e.phase !== 'candidate_readiness') return result;
    const value = JSON.parse(result); value.version.payload.buildTime = null; return JSON.stringify(value);
  };
  await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
  assert.equal(f.calls.filter(c => c.phase === 'candidate_readiness').length, 30);
  assert.equal(f.calls.filter(c => c.phase === 'start_candidate').length, 1); assert.equal(f.probeRan(), false);
  assert.equal(owned(f).length, 0); assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.rehearsal.json')));
}));
test('credential cleanup eligibility is read-only, passes only six zero counts, and blocks each mutation class before candidate start', async t => {
  const keys = ['authActionTokens', 'refreshTokens', 'staffElevations', 'bookingChallenges',
    'googleRegistrationReplays', 'passwordEnrollmentRedemptions'];
  const zero = Object.fromEntries(keys.map(key => [key, 0]));
  assert.match(credentialCleanupEligibilitySql, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/u);
  assert.match(credentialCleanupEligibilitySql, /COMMIT;/u);
  assert.equal(assertCredentialCleanupEligible(JSON.stringify(zero)), true);
  assert.throws(() => assertCredentialCleanupEligible('not-json'));
  for (const key of keys) await t.test(key, async () => scoped(async (f, directory) => {
    const prior = f.dependencies.command;
    f.dependencies.command = async entry => {
      if (entry.input === credentialCleanupEligibilitySql) {
        f.calls.push(entry);
        return JSON.stringify({ ...zero, [key]: 1 });
      }
      return prior(entry);
    };
    await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
    assert.ok(f.calls.some(call => call.input === credentialCleanupEligibilitySql));
    assert.ok(!f.calls.some(call => call.phase === 'create_candidate'));
    assert.ok(!f.calls.some(call => call.phase === 'start_candidate'));
    assert.equal(owned(f).length, 0); assert.equal(f.probeRan(), false);
    const failure = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.failure.json')));
    assert.equal(failure.cleanupVerified, true); assert.equal(failure.candidateSubstage, null);
    assert.doesNotMatch(JSON.stringify(failure), /private-value|password|token_digest|refresh/u);
  }));
});
test('candidate start exit is classified without log or error content', async () => scoped(async (f, directory) => {
  const prior = f.dependencies.command;
  f.dependencies.command = async e => {
    const result = await prior(e);
    if (e.phase === 'start_candidate') {
      const candidate = f.records[e.args[1]];
      candidate.State = { ...candidate.State, Running: false, Status: 'exited', ExitCode: 1,
        OOMKilled: false, Dead: false, Error: '' };
    }
    return result;
  };
  await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
  const failure = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.failure.json')));
  assert.equal(failure.stage, 'candidate_start'); assert.equal(failure.code, 'candidate_start_failed');
  assert.equal(failure.candidateSubstage, 'start');
  assert.deepEqual(failure.candidateDiagnostic, {
    stateReadable: true, running: false, status: 'exited', exitCode: 1, oomKilled: false, dead: false,
    runtimeErrorClass: 'none', readiness: { code: 'not_attempted', statuses: { live: null, ready: null, version: null }, attempts: 0 },
  });
  assert.equal(Object.hasOwn(failure.candidateDiagnostic, 'logs'), false);
  assert.equal(Object.hasOwn(failure.candidateDiagnostic, 'errorText'), false);
  assert.equal(owned(f).length, 0);
}));
test('readiness probe does not call access-gated /health and retains unauthenticated contract endpoints', async () => {
  const called = [], output = { value: '' };
  const run = new Function('fetch', 'AbortSignal', 'process', `return (async()=>{${readinessScript}})()`);
  await run(async input => {
    const route = new URL(input).pathname; called.push(route);
    if (route === '/health') return { status: 401, json: async () => ({ status: 'unauthorized' }) };
    return { status: 200, json: async () => route === '/version' ? { commit: 'synthetic', environment: 'test' } : { status: 'ok' } };
  }, AbortSignal, { stdout: { write: value => { output.value += value; } } });
  assert.deepEqual(called, ['/health/live', '/health/ready', '/version']);
  assert.deepEqual(Object.keys(JSON.parse(output.value)).sort(), ['live', 'ready', 'version']);
});
test('candidate readiness HTTP failure is separately classified with statuses only', async () => scoped(async (f, directory) => {
  const prior = f.dependencies.command;
  f.dependencies.command = async e => {
    const result = await prior(e);
    if (e.phase !== 'candidate_readiness') return result;
    const value = JSON.parse(result); value.ready.status = 503; value.ready.payload.status = 'degraded'; return JSON.stringify(value);
  };
  await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
  const failure = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.failure.json')));
  assert.equal(failure.stage, 'candidate_readiness'); assert.equal(failure.code, 'candidate_readiness_failed');
  assert.equal(failure.candidateSubstage, 'readiness');
  assert.deepEqual(failure.candidateDiagnostic.readiness, {
    code: 'ready_http', statuses: { live: 200, ready: 503, version: 200 }, attempts: 30,
  });
  assert.equal(failure.candidateDiagnostic.running, true);
  assert.deepEqual(Object.keys(failure.candidateDiagnostic).sort(),
    ['dead', 'exitCode', 'oomKilled', 'readiness', 'running', 'runtimeErrorClass', 'stateReadable', 'status'].sort());
  assert.equal(owned(f).length, 0);
}));
test('missing readiness endpoint fails closed', async () => scoped(async (f, directory) => {
  const prior = f.dependencies.command;
  f.dependencies.command = async entry => {
    const result = await prior(entry);
    if (entry.phase !== 'candidate_readiness') return result;
    const value = JSON.parse(result); delete value.ready; return JSON.stringify(value);
  };
  await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
  const failure = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.failure.json')));
  assert.equal(failure.stage, 'candidate_readiness');
  assert.equal(failure.candidateDiagnostic.readiness.code, 'probe_shape');
  assert.deepEqual(Object.keys(failure.candidateDiagnostic.readiness.statuses).sort(), ['live', 'ready', 'version']);
}));
test('post-start snapshot, auxiliary, and schema failures use fixed candidate substages', async t => {
  for (const substage of ['snapshot', 'aux', 'schema']) await t.test(substage, async () => scoped(async (f, directory) => {
    const prior = f.dependencies.command; let readinessSeen = false, changed = false;
    f.dependencies.command = async entry => {
      if (entry.phase === 'candidate_readiness') {
        const result = await prior(entry); readinessSeen = true; return result;
      }
      if (readinessSeen && !changed && substage === 'snapshot' && entry.phase === 'snapshot106') {
        changed = true;
        const rows = String(await prior(entry)).split('\n').map(line => JSON.parse(line));
        rows[1].mission_needs.count++;
        return rows.map(row => JSON.stringify(row)).join('\n');
      }
      if (readinessSeen && !changed && substage === 'aux' && entry.phase === 'auxiliary106') {
        changed = true; return '{"changed":true}\n{}';
      }
      if (readinessSeen && !changed && substage === 'schema' && entry.phase === 'isolated_schema') {
        changed = true; return 'f'.repeat(64);
      }
      return prior(entry);
    };
    await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
    const failure = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.failure.json')));
    assert.equal(failure.candidateSubstage, substage);
    assert.ok(changed); assert.equal(failure.cleanupVerified, true);
    assert.equal(owned(f).length, 0); assert.equal(f.probeRan(), false);
    assert.doesNotMatch(JSON.stringify(failure), /private-value|secret|password|token/u);
  }));
});
test('canonical router drift after isolated cleanup prevents final PASS', async () => scoped(async (f, directory) => {
  const prior = f.dependencies.command;
  f.dependencies.command = async e => {
    const result = await prior(e);
    if (e.phase === 'remove_network') f.records[f.binding?.scope?.networks?.[0]?.id ?? f.f.binding.scope.networks[0].id].Containers['e'.repeat(64)] = { Name: 'foreign' };
    return result;
  };
  await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
  assert.equal(f.probeRan(), true); assert.equal(owned(f).length, 0);
  assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.rehearsal.json')));
}));
test('retained owned volume is a cleanup failure, never a PASS', async () => scoped(async (f, directory) => {
  const prior = f.dependencies.command; let retained;
  f.dependencies.command = async e => {
    if (e.phase === 'remove_database') retained = f.records[e.args.at(-1)].Mounts[0].Name;
    const result = await prior(e); if (retained) f.volumes.add(retained); return result;
  };
  await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies), /cleanup_failed/u);
  assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.rehearsal.json')));
}));
