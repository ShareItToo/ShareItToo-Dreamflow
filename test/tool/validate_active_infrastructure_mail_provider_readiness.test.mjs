import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateActiveInfrastructureMailProviderReadiness,
} from '../../tool/validate_active_infrastructure_mail_provider_readiness.mjs';

const manifest = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
    import.meta.url,
  ),
  'utf8',
));
const privacy = JSON.parse(readFileSync(
  new URL('../../store/privacy-disclosures.json', import.meta.url),
  'utf8',
));
const retention = JSON.parse(readFileSync(
  new URL('../../store/retention-deletion-readiness.json', import.meta.url),
  'utf8',
));
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('accepts the explicit active hosting and mail provider hold', () => {
  assert.deepEqual(validateActiveInfrastructureMailProviderReadiness(), {
    status: 'prepared-hold',
    classifiedActiveProcessorCount: 5,
    newlyExplicitActiveProcessorCount: 2,
    requiredDecisionCount: 10,
    completedDecisionCount: 0,
    externalReadiness: false,
  });
});

test('strict mode names every unresolved active-provider decision', () => {
  assert.throws(
    () => validateActiveInfrastructureMailProviderReadiness({ requireReady: true }),
    /active_provider_external_decisions_open:hosterAccountContractAndDpa/u,
  );
});

test('cannot hide the active hosting processor from privacy inventory', () => {
  const changed = structuredClone(privacy);
  delete changed.externalServices.hostingerVps;
  assert.throws(
    () => validateActiveInfrastructureMailProviderReadiness({
      sourceOverrides: { 'store/privacy-disclosures.json': JSON.stringify(changed) },
    }),
    /repository_source_drift:store\/privacy-disclosures\.json/u,
  );
});

test('cannot invent an SMTP retention review or owner approval', () => {
  const changed = structuredClone(retention);
  changed.externalProcessors.googleWorkspaceSmtpRelay.officialDocumentationReviewed = true;
  assert.throws(
    () => validateActiveInfrastructureMailProviderReadiness({
      sourceOverrides: {
        'store/retention-deletion-readiness.json': JSON.stringify(changed),
      },
    }),
    /repository_source_drift:store\/retention-deletion-readiness\.json/u,
  );
});

test('rejects source drift in the provider classification', () => {
  assert.throws(
    () => validateActiveInfrastructureMailProviderReadiness({
      sourceOverrides: {
        'docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json':
          '{}',
      },
    }),
    /repository_source_drift:docs\/evidence\/b11\/google-play-service-provider-sharing-classification/u,
  );
});

test('rejects sensitive fields and external mutation claims', () => {
  const sensitive = structuredClone(manifest);
  sensitive.password = 'not-allowed';
  assert.throws(
    () => validateActiveInfrastructureMailProviderReadiness({
      manifestOverride: sensitive,
    }),
    /credential_shaped_field:password/u,
  );

  const changed = structuredClone(manifest);
  changed.boundaries.providerConsoleChanged = true;
  assert.throws(
    () => validateActiveInfrastructureMailProviderReadiness({
      manifestOverride: changed,
    }),
    /boundary_invalid/u,
  );
});

test('complete regression permanently retains the active-provider gate', () => {
  for (const command of [
    'node --check tool/validate_active_infrastructure_mail_provider_readiness.mjs',
    'node --test test/tool/validate_active_infrastructure_mail_provider_readiness.test.mjs',
    'node tool/validate_active_infrastructure_mail_provider_readiness.mjs',
  ]) {
    assert.ok(regression.includes(command), `missing regression command: ${command}`);
  }
});
