import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertMissionFitCheckTechnicalAccess,
  evaluatePlantContainerDimensionalFit,
  MissionFitCheckError,
  missionFitCheckDigest,
  normalizeMissionFitCheckCorrection,
  normalizeMissionFitCheckSnapshot,
  plantContainerFitDefinitionId,
} from '../src/mission_fit_check_workflow.js';

const shelfItemId = 'shelf_item_11111111-1111-4111-8111-111111111111';

function measurement(key, value, unit) {
  return { key, value, unit };
}

function itemFact(key, value, unit, overrides = {}) {
  return {
    key,
    value,
    unit,
    provenance: {
      sourceType: 'owner_confirmed_measurement',
      sourceReference: `measurement.${key}.0001`,
      sourceVersion: 'manual-measurement-v1',
      ownerConfirmed: true,
      ...overrides,
    },
  };
}

function raw(overrides = {}) {
  return {
    definitionId: plantContainerFitDefinitionId,
    missionRevision: 2,
    missionPayloadDigest: 'a'.repeat(64),
    shelfItemId,
    shelfUpdatedAt: '2026-10-01T08:00:00.000Z',
    requirement: {
      ownerConfirmed: true,
      facts: [
        measurement('minimumUsableVolumeMl', 15_000, 'ml'),
        measurement('maximumFootprintWidthMm', 400, 'mm'),
        measurement('maximumFootprintDepthMm', 300, 'mm'),
        measurement('maximumHeightMm', 500, 'mm'),
      ],
    },
    itemFacts: [
      itemFact('usableVolumeMl', 20_000, 'ml'),
      itemFact('footprintWidthMm', 350, 'mm'),
      itemFact('footprintDepthMm', 250, 'mm'),
      itemFact('heightMm', 450, 'mm'),
    ],
    ...overrides,
  };
}

test('P4-A snapshot is exact, versioned, integer-only and canonically digested', () => {
  const normalized = normalizeMissionFitCheckSnapshot(raw());
  assert.equal(normalized.definitionId, plantContainerFitDefinitionId);
  assert.equal(normalized.requirement.facts.length, 4);
  assert.equal(normalized.itemFacts.length, 4);
  assert.equal(
    missionFitCheckDigest({ b: 2, a: 1 }),
    missionFitCheckDigest({ a: 1, b: 2 }),
  );
  assert.throws(
    () => normalizeMissionFitCheckSnapshot({ ...raw(), invented: true }),
    (error) => error instanceof MissionFitCheckError
      && error.code === 'mission_fit_check_payload_fields_invalid',
  );
  assert.throws(
    () => normalizeMissionFitCheckSnapshot({
      ...raw(),
      itemFacts: [itemFact('heightMm', 12.5, 'mm')],
    }),
    (error) => error.code === 'mission_fit_check_item_fact_value_invalid',
  );
});

test('only canonical units and conservative integer bounds are accepted', () => {
  assert.throws(
    () => normalizeMissionFitCheckSnapshot({
      ...raw(),
      itemFacts: [itemFact('heightMm', 450, 'cm')],
    }),
    (error) => error.code === 'mission_fit_check_item_fact_unit_invalid',
  );
  assert.throws(
    () => normalizeMissionFitCheckSnapshot({
      ...raw(),
      requirement: {
        ownerConfirmed: true,
        facts: [measurement('maximumHeightMm', 10_001, 'mm')],
      },
    }),
    (error) => error.code === 'mission_fit_check_requirement_fact_value_invalid',
  );
  assert.throws(
    () => normalizeMissionFitCheckSnapshot({
      ...raw(),
      itemFacts: [itemFact('usableVolumeMl', 10_000_001, 'ml')],
    }),
    (error) => error.code === 'mission_fit_check_item_fact_value_invalid',
  );
});

test('duplicate or contradictory fact keys fail closed', () => {
  const duplicate = itemFact('heightMm', 440, 'mm');
  assert.throws(
    () => normalizeMissionFitCheckSnapshot({
      ...raw(),
      itemFacts: [...raw().itemFacts, duplicate],
    }),
    (error) => error.code === 'mission_fit_check_item_fact_list_invalid'
      || error.code === 'mission_fit_check_item_fact_duplicate',
  );
  const requirementFacts = raw().requirement.facts;
  assert.throws(
    () => normalizeMissionFitCheckSnapshot({
      ...raw(),
      requirement: {
        ownerConfirmed: true,
        facts: [
          ...requirementFacts.slice(0, 3),
          measurement('minimumUsableVolumeMl', 16_000, 'ml'),
        ],
      },
    }),
    (error) => error.code === 'mission_fit_check_requirement_fact_duplicate',
  );
});

test('complete current dimensional evidence yields fit without a safety guarantee', () => {
  const snapshot = normalizeMissionFitCheckSnapshot(raw());
  assert.deepEqual(evaluatePlantContainerDimensionalFit(snapshot), {
    status: 'fit',
    releaseBlocked: false,
    reasonCodes: [],
    orientation: 'direct',
    scope: 'dimensional_capacity_only',
    bindingStatus: 'non_binding',
    safetyGuarantee: false,
  });
});

test('width and depth may rotate, but no other axis is inferred', () => {
  const snapshot = normalizeMissionFitCheckSnapshot(raw({
    itemFacts: [
      itemFact('usableVolumeMl', 20_000, 'ml'),
      itemFact('footprintWidthMm', 290, 'mm'),
      itemFact('footprintDepthMm', 390, 'mm'),
      itemFact('heightMm', 450, 'mm'),
    ],
  }));
  const result = evaluatePlantContainerDimensionalFit(snapshot);
  assert.equal(result.status, 'fit');
  assert.equal(result.orientation, 'rotated');
  assert.equal(Object.hasOwn(result, 'material'), false);
  assert.equal(Object.hasOwn(result, 'drainage'), false);
});

test('each dimensional or capacity failure is unfit and blocks release', () => {
  const cases = [
    {
      key: 'usableVolumeMl', value: 14_999, unit: 'ml',
      reason: 'usable_volume_below_required_minimum',
    },
    { key: 'heightMm', value: 501, unit: 'mm', reason: 'height_exceeds_maximum' },
    { key: 'footprintWidthMm', value: 401, unit: 'mm', reason: 'footprint_exceeds_maximum' },
  ];
  for (const changed of cases) {
    const facts = raw().itemFacts.map((entry) => (
      entry.key === changed.key ? itemFact(changed.key, changed.value, changed.unit) : entry
    ));
    if (changed.key === 'footprintWidthMm') {
      const depthIndex = facts.findIndex((entry) => entry.key === 'footprintDepthMm');
      facts[depthIndex] = itemFact('footprintDepthMm', 401, 'mm');
    }
    const result = evaluatePlantContainerDimensionalFit(
      normalizeMissionFitCheckSnapshot(raw({ itemFacts: facts })),
    );
    assert.equal(result.status, 'unfit');
    assert.equal(result.releaseBlocked, true);
    assert.ok(result.reasonCodes.includes(changed.reason));
    assert.equal(result.safetyGuarantee, false);
  }
});

test('missing or unconfirmed truth remains unknown and blocked', () => {
  const missing = normalizeMissionFitCheckSnapshot({
    ...raw(),
    itemFacts: raw().itemFacts.filter((entry) => entry.key !== 'heightMm'),
  });
  assert.deepEqual(evaluatePlantContainerDimensionalFit(missing).reasonCodes, [
    'item_fact_missing:heightMm',
  ]);
  const unconfirmed = normalizeMissionFitCheckSnapshot({
    ...raw(),
    itemFacts: raw().itemFacts.map((entry) => entry.key === 'heightMm'
      ? itemFact('heightMm', 450, 'mm', { ownerConfirmed: false })
      : entry),
  });
  assert.equal(evaluatePlantContainerDimensionalFit(unconfirmed).status, 'unknown');
  assert.equal(evaluatePlantContainerDimensionalFit(unconfirmed).releaseBlocked, true);
  const requirementUnconfirmed = normalizeMissionFitCheckSnapshot({
    ...raw(),
    requirement: { ...raw().requirement, ownerConfirmed: false },
  });
  assert.equal(evaluatePlantContainerDimensionalFit(requirementUnconfirmed).status, 'unknown');
});

test('provenance is small, explicit, versioned and owner-confirmed truth is not inferred', () => {
  for (const sourceType of ['owner_confirmed_measurement', 'manufacturer_documentation']) {
    const snapshot = normalizeMissionFitCheckSnapshot({
      ...raw(),
      itemFacts: raw().itemFacts.map((entry) => ({
        ...entry,
        provenance: { ...entry.provenance, sourceType },
      })),
    });
    assert.ok(snapshot.itemFacts.every((entry) => entry.provenance.sourceType === sourceType));
  }
  assert.throws(
    () => normalizeMissionFitCheckSnapshot({
      ...raw(),
      itemFacts: [itemFact('heightMm', 450, 'mm', { sourceType: 'image_ai_guess' })],
    }),
    (error) => error.code === 'mission_fit_check_source_type_invalid',
  );
  assert.throws(
    () => normalizeMissionFitCheckSnapshot({
      ...raw(),
      itemFacts: [itemFact('heightMm', 450, 'mm', { sourceVersion: '' })],
    }),
    (error) => error.code === 'mission_fit_check_source_version_invalid',
  );
});

test('manual correction requires an exact expected FitCheck revision', () => {
  const correction = normalizeMissionFitCheckCorrection({
    ...raw(),
    expectedRevision: 3,
  });
  assert.equal(correction.expectedRevision, 3);
  assert.equal(correction.snapshot.definitionId, plantContainerFitDefinitionId);
  assert.throws(
    () => normalizeMissionFitCheckCorrection({ ...raw(), expectedRevision: 0 }),
    (error) => error.code === 'mission_fit_check_expected_revision_invalid',
  );
});

test('technical gate remains internal, non-public and AI/inventory-resolution free', () => {
  assert.equal(assertMissionFitCheckTechnicalAccess({
    planner: {
      enabled: true,
      publicReleaseAllowed: false,
      externalGenerativeAiAllowed: false,
      inventoryResolutionAllowed: false,
    },
  }), true);
  for (const planner of [
    { enabled: false, publicReleaseAllowed: false, externalGenerativeAiAllowed: false, inventoryResolutionAllowed: false },
    { enabled: true, publicReleaseAllowed: true, externalGenerativeAiAllowed: false, inventoryResolutionAllowed: false },
    { enabled: true, publicReleaseAllowed: false, externalGenerativeAiAllowed: true, inventoryResolutionAllowed: false },
    { enabled: true, publicReleaseAllowed: false, externalGenerativeAiAllowed: false, inventoryResolutionAllowed: true },
  ]) {
    assert.throws(
      () => assertMissionFitCheckTechnicalAccess({ planner }),
      (error) => error.code === 'mission_fit_check_not_enabled',
    );
  }
});
