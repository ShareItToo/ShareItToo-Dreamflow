import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertMissionNeedTechnicalAccess,
  missionNeedDigest,
  MissionNeedError,
  normalizeMissionNeedPayload,
} from '../src/mission_need_workflow.js';

const valid = () => ({
  title: 'Wohnungsrenovierung planen',
  status: 'draft',
  needs: [
    { needKey: 'paint_roller', necessity: 'required', quantity: 2 },
    { needKey: 'laser_level', necessity: 'optional', quantity: 1 },
  ],
});

test('mission need payload is exact, deterministic and non-binding', () => {
  assert.deepEqual(normalizeMissionNeedPayload(valid()), valid());
  assert.equal(missionNeedDigest({ b: 2, a: 1 }), missionNeedDigest({ a: 1, b: 2 }));
  assert.throws(
    () => normalizeMissionNeedPayload({ ...valid(), bookingId: 'forbidden' }),
    (error) => error instanceof MissionNeedError && error.code === 'invalid_mission_need_fields',
  );
  assert.throws(
    () => normalizeMissionNeedPayload({
      ...valid(), needs: [{ needKey: 'paint_roller', necessity: 'required', quantity: 0 }],
    }),
    (error) => error instanceof MissionNeedError && error.code === 'invalid_mission_need_quantity',
  );
  assert.throws(
    () => normalizeMissionNeedPayload({
      ...valid(), needs: [{ needKey: 'paint_roller', necessity: 'recommended', quantity: 1 }],
    }),
    (error) => error instanceof MissionNeedError && error.code === 'invalid_mission_need_necessity',
  );
});

test('mission need access remains technical, closed and AI-free', () => {
  assert.equal(assertMissionNeedTechnicalAccess({
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
      () => assertMissionNeedTechnicalAccess({ planner }),
      (error) => error instanceof MissionNeedError && error.code === 'mission_need_not_enabled',
    );
  }
});
