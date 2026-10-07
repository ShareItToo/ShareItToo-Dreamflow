export const activeBindingContractVersion = 'V5.2-2026-08-16';
export const preparedBindingContractVersion = 'V5.4-2026-09-15';
export const positionReviewDraftContractVersion = 'V5.5-2026-09-15';

const policies = Object.freeze(new Map([
  [activeBindingContractVersion, Object.freeze({
    version: activeBindingContractVersion,
    status: 'active-in-existing-internal-runtime',
    bindingContractAcceptanceAllowed: true,
    publicActivationAllowed: false,
    realMoneyAllowed: false,
  })],
  [preparedBindingContractVersion, Object.freeze({
    version: preparedBindingContractVersion,
    status: 'draft-blocked-after-ai-corrections',
    bindingContractAcceptanceAllowed: false,
    publicActivationAllowed: false,
    realMoneyAllowed: false,
  })],
  [positionReviewDraftContractVersion, Object.freeze({
    version: positionReviewDraftContractVersion,
    status: 'draft-blocked-after-position-review-correction',
    bindingContractAcceptanceAllowed: false,
    publicActivationAllowed: false,
    realMoneyAllowed: false,
  })],
]));

export class LegalContractVersionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function legalContractVersionPolicy(version) {
  if (typeof version !== 'string' || !policies.has(version)) {
    throw new LegalContractVersionError('legal_contract_version_unsupported');
  }
  return policies.get(version);
}

export function assertActiveBindingContractVersion(version) {
  const policy = legalContractVersionPolicy(version);
  if (policy.bindingContractAcceptanceAllowed !== true) {
    throw new LegalContractVersionError('legal_contract_version_inactive');
  }
  return policy;
}
