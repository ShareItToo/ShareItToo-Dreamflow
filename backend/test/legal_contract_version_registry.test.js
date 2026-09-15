import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeBindingContractVersion,
  assertActiveBindingContractVersion,
  legalContractVersionPolicy,
  LegalContractVersionError,
  preparedBindingContractVersion,
} from '../src/legal_contract_version_registry.js';

test('keeps the existing exact V5.2 internal runtime active without opening live gates', () => {
  assert.deepEqual(assertActiveBindingContractVersion(activeBindingContractVersion), {
    version: 'V5.2-2026-08-16',
    status: 'active-in-existing-internal-runtime',
    bindingContractAcceptanceAllowed: true,
    publicActivationAllowed: false,
    realMoneyAllowed: false,
  });
});

test('exposes V5.4 only as an inactive prepared policy', () => {
  assert.deepEqual(legalContractVersionPolicy(preparedBindingContractVersion), {
    version: 'V5.4-2026-09-15',
    status: 'draft-blocked-after-ai-corrections',
    bindingContractAcceptanceAllowed: false,
    publicActivationAllowed: false,
    realMoneyAllowed: false,
  });
  assert.throws(
    () => assertActiveBindingContractVersion(preparedBindingContractVersion),
    (error) => error instanceof LegalContractVersionError
      && error.code === 'legal_contract_version_inactive',
  );
});

test('rejects unknown, padded and malformed contract versions without fallback', () => {
  for (const version of [
    'V5.4',
    'V5.4-2026-09-15 ',
    'v5.2-2026-08-16',
    '',
    null,
  ]) {
    assert.throws(
      () => legalContractVersionPolicy(version),
      (error) => error instanceof LegalContractVersionError
        && error.code === 'legal_contract_version_unsupported',
    );
  }
});
