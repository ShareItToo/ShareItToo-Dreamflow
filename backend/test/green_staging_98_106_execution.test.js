import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { digest, green98106 } from '../ops/green_staging_98_106_contract.mjs';
import { runPromotion, runRehearsal } from '../ops/green_staging_98_106_execution.mjs';
import { dockerFixture } from './fixtures/green_98106_docker.js';

function temporary() {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-green-98106-executor-test-'));
  fs.chmodSync(directory, 0o700); return directory;
}
function rehearseOptions(f, directory) {
  return { evidenceDirectory: directory, confirmation: `rehearse:${green98106.runtimeCommit}:${f.inputs.binding.opsCommit}:${f.inputs.binding.targetSha256}` };
}
async function preparePromotion(f, directory) {
  const result = await runRehearsal(f.inputs, rehearseOptions(f, directory), f.dependencies);
  const bytes = fs.readFileSync(path.join(directory, result.artifact.name));
  f.inputs.rehearsal = JSON.parse(bytes); f.inputs.rehearsalSha256 = digest(bytes);
  return { evidenceDirectory: directory, backupFile: path.join(directory, result.artifact.name.replace('.rehearsal.json', '.pgdump')),
    confirmation: `promote:${green98106.runtimeCommit}:${f.inputs.binding.opsCommit}:${f.inputs.rehearsalSha256}` };
}
test('complete stateful rehearsal stays quiesced; separate receipt-confirmed promotion migrates only exact target', async () => {
  const f = dockerFixture(); const directory = temporary();
  try {
    const promotion = await preparePromotion(f, directory);
    assert.equal(f.dbStates.get(f.database.Id).schema, 98);
    assert.equal(f.api.State.Running, false);
    assert.ok(!f.calls.some(c => c.phase === 'final_create'));
    const result = await runPromotion(f.inputs, promotion, f.dependencies);
    assert.equal(result.status, 'promoted'); assert.equal(f.dbStates.get(f.database.Id).schema, 106);
    assert.equal(f.api.State.Running, false);
    assert.ok(!f.calls.some(c => c.args[0] === 'start' && c.args[1] === f.api.Id));
    assert.ok(!f.calls.some(c => c.args[0] === 'volume' && ['create', 'rm'].includes(c.args[1])));
    assert.equal([...f.records.values()].filter(r => r.Name?.startsWith('/sit-g98106-') || r.Name?.startsWith('sit-g98106-')).length, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('rehearsal response-loss is reconciled by owned identities and exact postconditions', async t => {
  for (const phase of ['create_materials', 'start_materials', 'source_stop', 'source_rename', 'create_network',
    'create_postgres', 'start_postgres', 'create_migrateone', 'start_migrateone', 'create_candidate',
    'start_candidate', 'remove_candidate', 'remove_postgres', 'remove_network']) {
    await t.test(phase, async () => {
      const f = dockerFixture(); const directory = temporary(); f.losses.add(phase);
      try {
        const result = await runRehearsal(f.inputs, rehearseOptions(f, directory), f.dependencies);
        assert.equal(result.status, 'rehearsal_passed_services_quiesced'); assert.equal(f.losses.size, 0);
        assert.equal(f.api.State.Running, false);
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    });
  }
});
test('separate promotion handles create/start/connect response-loss without old-image restart', async t => {
  for (const phase of ['create_canonicalmigration', 'start_canonicalmigration', 'final_create', 'final_start', 'final_network_connect']) {
    await t.test(phase, async () => {
      const f = dockerFixture(); const directory = temporary();
      try {
        const options = await preparePromotion(f, directory); f.losses.add(phase);
        assert.equal((await runPromotion(f.inputs, options, f.dependencies)).status, 'promoted');
        assert.equal(f.losses.size, 0); assert.equal(f.api.State.Running, false);
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    });
  }
});
test('missing confirmation and changed source identity fail before stop/seal', async () => {
  for (const fault of ['confirmation', 'identity']) {
    const f = dockerFixture(); const directory = temporary();
    try {
      const options = rehearseOptions(f, directory);
      if (fault === 'confirmation') options.confirmation = 'rehearse';
      else f.api.Config.Labels.extra = 'changed';
      await assert.rejects(runRehearsal(f.inputs, options, f.dependencies));
      assert.ok(!f.calls.some(c => ['stop', 'rename', 'create'].includes(c.args[0])));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});
test('before-effect stop/create/start/remove failures never become success or restart source', async t => {
  for (const phase of ['source_stop', 'source_rename', 'create_network', 'create_postgres', 'start_postgres',
    'create_candidate', 'start_candidate', 'remove_candidate', 'remove_postgres', 'remove_network']) {
    await t.test(phase, async () => {
      const f = dockerFixture(); const directory = temporary(); f.beforeFailures.add(phase);
      try {
        await assert.rejects(runRehearsal(f.inputs, rehearseOptions(f, directory), f.dependencies));
        assert.ok(!f.calls.some(c => c.args[0] === 'start' && c.args[1] === f.api.Id));
        assert.ok(!fs.readdirSync(directory).some(n => n.endsWith('.rehearsal.json')));
        assert.equal(f.dbStates.get(f.database.Id).schema, 98);
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    });
  }
});
test('PG marker/select/major and ledger/business/readiness/function drift fail closed with owned cleanup', async t => {
  for (const fault of ['marker', 'select', 'major', 'ledger', 'business', 'readiness', 'new_namespace', 'functions']) {
    await t.test(fault, async () => {
      const f = dockerFixture(); const directory = temporary(); const original = f.dependencies.command;
      f.dependencies.command = async entry => {
        const raw = await original(entry);
        if (fault === 'marker' && entry.phase === 'postgres_init_marker') return 'database system is ready to accept connections';
        if (fault === 'select' && entry.phase === 'postgres_select_1') return '0';
        if (fault === 'major' && entry.phase === 'postgres_major') return '150001';
        if (fault === 'ledger' && entry.phase === 'ledger_rows' && JSON.parse(raw).length === 106) {
          const value = JSON.parse(raw); value[100].checksum = '0'.repeat(64); return JSON.stringify(value);
        }
        const id = entry.args[1] === '-i' ? entry.args[2] : entry.args[1];
        if (fault === 'business' && entry.phase === 'business_fingerprint' && f.dbStates.get(id)?.schema === 106) {
          const value = JSON.parse(raw); value.users.count += 1; return JSON.stringify(value);
        }
        if (fault === 'readiness' && entry.phase === 'readiness_fingerprint'
          && [...f.records.values()].some(r => r.Name?.startsWith('/sit-g98106-candidate-') && r.State.Running)) {
          return JSON.stringify({ paymentRecoveryNeedsReview: [{ source: 'contract_blocked', id_hash: '9'.repeat(64),
            cause: 'contract_blocked', status: 'captured', time_class: 'derived' }], supportNextUpdateOverdue: [] });
        }
        if (fault === 'new_namespace' && entry.phase === 'new_namespace_count') return '';
        if (fault === 'functions' && entry.phase === 'function_inventory') return '[]';
        return raw;
      };
      try {
        await assert.rejects(runRehearsal(f.inputs, rehearseOptions(f, directory), f.dependencies));
        assert.equal(f.dbStates.get(f.database.Id).schema, 98); assert.equal(f.api.State.Running, false);
        assert.ok(!fs.readdirSync(directory).some(n => n.endsWith('.rehearsal.json')));
        assert.equal([...f.records.values()].filter(r => r.Name?.startsWith('/sit-g98106-') || r.Name?.startsWith('sit-g98106-')).length, 0);
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    });
  }
});
test('foreign writer prevents backup and isolated DB creation', async () => {
  const f = dockerFixture(); const directory = temporary(); f.setForeignWriters(1);
  try {
    await assert.rejects(runRehearsal(f.inputs, rehearseOptions(f, directory), f.dependencies));
    assert.ok(!f.calls.some(c => c.phase === 'protected_backup' || c.phase === 'create_postgres'));
    assert.equal(f.api.State.Running, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('retained anonymous volume makes cleanup fail and overrides otherwise successful acceptance', async () => {
  const f = dockerFixture(); const directory = temporary(); const original = f.dependencies.command;
  f.dependencies.command = async entry => {
    const retained = entry.phase === 'remove_candidate' ? f.records.get(entry.args.at(-1))?.Mounts.filter(m => m.Type === 'volume').map(m => m.Name) : [];
    const result = await original(entry); for (const name of retained ?? []) f.volumes.add(name); return result;
  };
  try {
    await assert.rejects(runRehearsal(f.inputs, rehearseOptions(f, directory), f.dependencies));
    assert.ok(!fs.readdirSync(directory).some(n => n.endsWith('.rehearsal.json')));
    const failure = JSON.parse(fs.readFileSync(path.join(directory, fs.readdirSync(directory).find(n => n.endsWith('.failure.json')))));
    assert.equal(failure.cleanupVerified, false);
    assert.ok(!f.calls.some(c => c.args[0] === 'volume' && c.args[1] === 'rm'));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('canonical failures isolate successor and never restart old image, restore backup or run down migration', async t => {
  for (const phase of ['start_canonicalmigration', 'final_create', 'final_start', 'final_network_connect']) {
    await t.test(phase, async () => {
      const f = dockerFixture(); const directory = temporary();
      try {
        const options = await preparePromotion(f, directory); const prior = f.calls.length; f.beforeFailures.add(phase);
        await assert.rejects(runPromotion(f.inputs, options, f.dependencies));
        const later = f.calls.slice(prior);
        assert.ok(!later.some(c => (c.args[0] === 'start' && c.args[1] === f.api.Id) || c.args.includes('pg_restore')));
        const final = [...f.records.values()].find(r => r.Name === '/shareittoo-staging-api');
        if (final) assert.equal(final.State.Running, false);
        const receipt = JSON.parse(fs.readFileSync(path.join(directory, fs.readdirSync(directory).find(n => n.endsWith('.promotion-failure.json')))));
        assert.equal(receipt.canonicalMigrationStarted, true); assert.equal(receipt.forwardRecoveryRequired, true);
        assert.equal(receipt.oldImageRestarted, false);
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    });
  }
});
test('post-connect public mismatch reconciles isolation stop/disconnect response loss', async () => {
  const f = dockerFixture(); const directory = temporary();
  try {
    const options = await preparePromotion(f, directory);
    f.losses.add('failure_isolate_stop'); f.losses.add('failure_isolate_disconnect');
    f.dependencies.publicReadback = async () => ({ status: 200, body: { commit: '0'.repeat(40), environment: 'test' } });
    await assert.rejects(runPromotion(f.inputs, options, f.dependencies));
    assert.equal(f.losses.size, 0);
    const final = [...f.records.values()].find(r => r.Name === '/shareittoo-staging-api');
    assert.equal(final.State.Running, false); assert.equal(Object.keys(final.NetworkSettings.Networks).length, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('artifact-family collision fails before any Docker command or material binding', async () => {
  const f = dockerFixture(), directory = temporary(); const nonce = 'a'.repeat(32);
  try {
    fs.writeFileSync(path.join(directory, `${nonce}.failure.json`), 'prior-evidence', { mode: 0o600 });
    f.dependencies.nonce = nonce;
    f.dependencies.bindMaterials = () => { assert.fail('material access after collision'); };
    await assert.rejects(runRehearsal(f.inputs, rehearseOptions(f, directory), f.dependencies));
    assert.equal(f.calls.length, 0);
    assert.equal(fs.readFileSync(path.join(directory, `${nonce}.failure.json`), 'utf8'), 'prior-evidence');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('late promotion receipt collision cannot leave an unacknowledged successor serving', async () => {
  const f = dockerFixture(), directory = temporary();
  try {
    const options = await preparePromotion(f, directory); const nonce = 'b'.repeat(32); f.dependencies.nonce = nonce;
    const original = f.dependencies.publicReadback;
    f.dependencies.publicReadback = async () => {
      const result = await original();
      fs.writeFileSync(path.join(directory, `${nonce}.promotion.json`), 'foreign-racing-evidence', { mode: 0o600 });
      return result;
    };
    await assert.rejects(runPromotion(f.inputs, options, f.dependencies));
    const final = [...f.records.values()].find(r => r.Name === '/shareittoo-staging-api');
    assert.equal(final.State.Running, false); assert.equal(Object.keys(final.NetworkSettings.Networks).length, 1);
    assert.equal(fs.readFileSync(path.join(directory, `${nonce}.promotion.json`), 'utf8'), 'foreign-racing-evidence');
    const failure = JSON.parse(fs.readFileSync(path.join(directory, `${nonce}.promotion-failure.json`)));
    assert.equal(failure.forwardRecoveryRequired, true); assert.equal(failure.cleanupVerified, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('promotion requires fresh successful acceptance, unchanged backup/material/source and independent consent', async t => {
  for (const fault of ['confirmation', 'expired', 'cleanup', 'acceptance', 'backup', 'materials', 'source', 'foreign-network', 'missing-router', 'database-IP']) {
    await t.test(fault, async () => {
      const f = dockerFixture(), directory = temporary();
      try {
        const options = await preparePromotion(f, directory); const prior = f.calls.length;
        if (fault === 'confirmation') options.confirmation = rehearseOptions(f, directory).confirmation;
        if (fault === 'expired') f.inputs.rehearsal.createdAt = '2020-01-01T00:00:00Z';
        if (fault === 'cleanup') f.inputs.rehearsal.cleanupVerified = false;
        if (fault === 'acceptance') f.inputs.rehearsal.featureProbes.mfa = 'not-verified';
        if (fault === 'backup') fs.appendFileSync(options.backupFile, 'drift');
        if (fault === 'materials') f.materials.mfaSha256 = '9'.repeat(64);
        if (fault === 'source') f.dbStates.get(f.database.Id).business.users.count += 1;
        const original = f.dependencies.command;
        f.dependencies.command = async entry => {
          const raw = await original(entry);
          if (fault === 'foreign-network' && entry.phase === 'canonical_network_cas') {
            const values = JSON.parse(raw); values[0].Containers['9'.repeat(64)] = { Name: 'foreign' }; return JSON.stringify(values);
          }
          if (fault === 'missing-router' && entry.phase === 'canonical_network_cas') {
            const values = JSON.parse(raw);
            const router = f.inputs.target.networks.find(n => n.internal).members.find(m => ![f.api.Id, f.database.Id].includes(m.id));
            delete values[0].Containers[router.id]; return JSON.stringify(values);
          }
          if (fault === 'database-IP' && entry.phase === 'canonical_database_cas') {
            const values = JSON.parse(raw); Object.values(values[0].NetworkSettings.Networks)[0].IPAddress = '172.20.0.99'; return JSON.stringify(values);
          }
          return raw;
        };
        await assert.rejects(runPromotion(f.inputs, options, f.dependencies));
        assert.ok(!f.calls.slice(prior).some(c => c.phase === 'start_canonicalmigration'));
        assert.equal(f.dbStates.get(f.database.Id).schema, 98);
        assert.equal(f.api.State.Running, false);
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    });
  }
});
