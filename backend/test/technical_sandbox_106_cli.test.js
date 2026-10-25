import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTechnicalSandboxActivationArgs } from '../ops/activate_technical_sandbox_106.mjs';

const sha = 'a'.repeat(64);
const base = ['--mode','preflight','--evidence','/private/evidence.json','--evidence-sha256',sha,
  '--promotion-receipt','/private/promotion.json','--promotion-receipt-sha256',sha,
  '--session-proof','/private/session.json','--session-proof-sha256',sha,'--evidence-directory','/private/receipts'];

test('CLI requires raw file hashes and protected inputs for all phases', () => {
  assert.equal(parseTechnicalSandboxActivationArgs(base).mode, 'preflight');
  assert.throws(() => parseTechnicalSandboxActivationArgs(base.slice(0, -2)), /sandbox106_arguments/u);
  assert.throws(() => parseTechnicalSandboxActivationArgs([...base, '--session-proof-sha256', sha]), /sandbox106_arguments/u);
});

test('rehearse and promote bind exact confirmation, run, and sealed rehearsal receipt', () => {
  const rehearse = [...base]; rehearse[1] = 'rehearse'; rehearse.push('--run-id','11111111-2222-4333-8444-555555555555', '--confirm','exact-confirmation');
  assert.equal(parseTechnicalSandboxActivationArgs(rehearse).mode, 'rehearse');
  const promote = [...base]; promote[1] = 'promote'; promote.push('--run-id','11111111-2222-4333-8444-555555555555', '--confirm','exact-confirmation',
    '--rehearsal','/private/receipts/11111111-2222-4333-8444-555555555555.technical-sandbox.rehearsal.json', '--rehearsal-sha256',sha);
  assert.equal(parseTechnicalSandboxActivationArgs(promote).mode, 'promote');
  for (const args of [rehearse.filter(v => v !== '--confirm' && v !== 'exact-confirmation'), promote.filter(v => v !== '--rehearsal-sha256' && v !== sha)]) {
    assert.throws(() => parseTechnicalSandboxActivationArgs(args), /sandbox106_arguments/u);
  }
});
