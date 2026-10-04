import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { evaluateOperatorReadiness } from '../src/operator_readiness.js';

const completeFacts = Object.freeze({
  PUBLIC_SUPPORT_EMAIL: 'support@shareittoo.test',
  PUBLIC_PRIVACY_EMAIL: 'privacy@shareittoo.test',
  PUBLIC_LEGAL_PROVIDER_NAME: 'ShareItToo GmbH',
  PUBLIC_LEGAL_PROVIDER_ADDRESS: 'Teststraße 1, 10115 Berlin, Deutschland',
  PUBLIC_LEGAL_REPRESENTATIVE: 'Vertretungsberechtigte Testperson',
  PUBLIC_LEGAL_CONTENT_RESPONSIBLE: 'Verantwortliche Testperson, Anschrift wie oben',
  PUBLIC_LEGAL_REGISTER_COURT: 'Amtsgericht Berlin',
  PUBLIC_LEGAL_REGISTER_NUMBER: 'HRB 123456',
  PUBLIC_LEGAL_COMPETENT_AUTHORITY: 'Zuständige Behörde laut Freigabeakte',
  PUBLIC_LEGAL_WITHDRAWAL_URL: 'https://shareittoo.test/widerruf',
  PUBLIC_PRIVACY_EFFECTIVE_DATE: '2026-08-20',
  LEGAL_HOSTING_PROVIDER_NAME: 'Vertraglich geprüfter Hoster',
  LEGAL_HOSTING_PROCESSING_REGIONS: 'Deutschland, Europäische Union',
  LEGAL_HOSTING_DPA_ACCEPTED_DATE: '2026-08-20',
});

test('operator readiness is central, fact-based and fail-closed', () => {
  const open = evaluateOperatorReadiness({}, { approvalRequested: true });
  assert.equal(open.state, 'facts-open');
  assert.equal(open.activationAllowed, false);
  assert.ok(open.missingFields.includes('PUBLIC_LEGAL_PROVIDER_NAME'));
  assert.equal(open.containsValues, false);

  const complete = evaluateOperatorReadiness(completeFacts, { approvalRequested: true });
  assert.equal(complete.state, 'facts-complete');
  assert.equal(complete.factsComplete, true);
  assert.equal(complete.activationAllowed, true);
  assert.deepEqual(complete.missingFields, []);
  assert.deepEqual(complete.invalidFields, []);
});

test('placeholders and unapproved in-formation identities are rejected', () => {
  const placeholder = evaluateOperatorReadiness({
    ...completeFacts,
    PUBLIC_LEGAL_REGISTER_NUMBER: 'CHANGE-ME',
    PUBLIC_LEGAL_PROVIDER_NAME: 'ShareItToo UG i.G.',
  }, { approvalRequested: true });
  assert.equal(placeholder.activationAllowed, false);
  assert.ok(placeholder.invalidFields.includes('PUBLIC_LEGAL_REGISTER_NUMBER'));
  assert.ok(placeholder.invalidFields.includes('PUBLIC_LEGAL_PROVIDER_NAME'));
});

test('enabled external services add provider, region, DPA and transfer facts', () => {
  const result = evaluateOperatorReadiness(completeFacts, {
    approvalRequested: true,
    mailEnabled: true,
    paymentProviderEnabled: true,
    firebaseEnabled: true,
    mapsEnabled: true,
  });
  assert.equal(result.activationAllowed, false);
  for (const field of [
    'LEGAL_SMTP_PROVIDER_NAME',
    'LEGAL_PSP_TRANSFER_MECHANISM',
    'LEGAL_FIREBASE_CONTRACTING_ENTITY',
    'GOOGLE_MAPS_DPA_ACCEPTED_DATE',
  ]) assert.ok(result.missingFields.includes(field));
});

test('operator facts are wired through both compose profiles and documented without values', () => {
  const requiredFields = [
    ...Object.keys(completeFacts),
    'LEGAL_SMTP_PROVIDER_NAME',
    'LEGAL_SMTP_PROCESSING_REGIONS',
    'LEGAL_SMTP_DPA_ACCEPTED_DATE',
    'LEGAL_PSP_PROVIDER_NAME',
    'LEGAL_PSP_PROCESSING_REGIONS',
    'LEGAL_PSP_DPA_ACCEPTED_DATE',
    'LEGAL_PSP_TRANSFER_MECHANISM',
    'LEGAL_FIREBASE_CONTRACTING_ENTITY',
    'LEGAL_FIREBASE_PROCESSING_REGIONS',
    'LEGAL_FIREBASE_DPA_ACCEPTED_DATE',
    'LEGAL_FIREBASE_TRANSFER_MECHANISM',
    'GOOGLE_MAPS_PROVIDER_NAME',
    'GOOGLE_MAPS_PROCESSING_REGIONS',
    'GOOGLE_MAPS_DPA_ACCEPTED_DATE',
    'GOOGLE_MAPS_TRANSFER_MECHANISM',
  ];
  for (const relativePath of [
    '../.env.example',
    '../.env.staging.example',
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    for (const field of requiredFields) {
      assert.match(source, new RegExp(`^${field}=$`, 'mu'), `${relativePath}: ${field}`);
    }
  }
  for (const relativePath of [
    '../compose.prod.yml',
    '../compose.staging.yml',
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    for (const field of requiredFields) {
      const expected = `${field}: ` + '${' + `${field}:-}`;
      assert.ok(
        source.split('\n').some((line) => line.trim() === expected),
        `${relativePath}: ${field}`,
      );
    }
  }
});

test('central startup wiring asks for SMTP facts only for active SMTP transport', () => {
  const configSource = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  assert.match(configSource, /mailEnabled: mailTransport === 'smtp'/u);
  assert.doesNotMatch(configSource, /mailEnabled: mailTransport !== 'disabled'/u);
});
