import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { privatePilotAllowedCatalogKeys } from '../src/private_pilot_domain.js';
import {
  assertPlannerCoreTechnicalAccess,
  createDeterministicFirstPlan,
  PlannerCoreError,
  plannerCoreVersion,
  plannerTemplateQuestions,
  plannerTemplates,
} from '../src/planner_core.js';

const sampleAnswers = Object.freeze({
  terrace_cleaning: Object.freeze({
    surface: 'stone',
    area_size: 'medium',
    water_access: 'available',
    power_access: 'available',
  }),
  renovation: Object.freeze({
    task: 'sand',
    material: 'wood',
    workspace: 'indoor',
    power_access: 'available',
    experience: 'experienced',
  }),
  garden: Object.freeze({
    task: 'trim',
    area_size: 'small',
    terrain: 'level',
    power_access: 'available',
    weather: 'dry',
  }),
  move: Object.freeze({
    load_size: 'medium',
    stairs: 'some',
    disassembly: 'yes',
    fragile_items: 'yes',
    transport_arranged: 'no',
  }),
  event_camping: Object.freeze({
    focus: 'camping',
    participants: 'group',
    environment: 'outdoor',
    overnight: 'yes',
    power_access: 'unavailable',
  }),
});

function answerCombinations(questions, index = 0, current = {}) {
  if (index === questions.length) return [{ ...current }];
  const question = questions[index];
  return question.options.flatMap((option) => answerCombinations(
    questions,
    index + 1,
    { ...current, [question.id]: option },
  ));
}

test('G4A exposes exactly five reviewed templates with three to six bounded questions', () => {
  assert.equal(plannerCoreVersion, 'G4A-2026-08-21.1');
  assert.deepEqual(plannerTemplates.map((entry) => entry.id), [
    'terrace_cleaning',
    'renovation',
    'garden',
    'move',
    'event_camping',
  ]);
  for (const template of plannerTemplates) {
    assert.equal(template.reviewStatus, 'reviewed-current-private-pilot-boundaries');
    assert.equal(template.externalGenerativeAiRequired, false);
    assert.ok(template.questions.length >= 3 && template.questions.length <= 6);
    assert.ok(Object.isFrozen(template));
    assert.deepEqual(plannerTemplateQuestions(template.id), template.questions);
    assert.deepEqual(new Set(template.items.map((entry) => entry.priority)), new Set([
      'required',
      'recommended',
      'optional',
    ]));
  }
});

test('every item type targets only an exact current private-pilot catalog entry', () => {
  for (const template of plannerTemplates) {
    for (const item of template.items) {
      assert.ok(item.catalogTargets.length > 0);
      for (const target of item.catalogTargets) {
        assert.ok(privatePilotAllowedCatalogKeys.includes(target.catalogKey));
        assert.equal(target.catalogKey, `${target.categoryId}\u001f${target.subcategory}`);
      }
    }
  }
});

test('all five first plans are deterministic, item-type-only, and priority-complete', () => {
  for (const [templateId, answers] of Object.entries(sampleAnswers)) {
    const first = createDeterministicFirstPlan(templateId, answers);
    const replay = createDeterministicFirstPlan(templateId, { ...answers });
    assert.deepEqual(replay, first);
    assert.match(first.planHash, /^[0-9a-f]{64}$/u);
    assert.equal(first.generationMode, 'deterministic_rules_only');
    assert.equal(first.externalGenerativeAiUsed, false);
    assert.equal(first.serverTruth.status, 'unresolved_until_g4b');
    assert.equal(first.serverTruth.inventoryQueried, false);
    assert.equal(first.serverTruth.reservationCreated, false);
    assert.deepEqual(new Set(first.items.map((entry) => entry.priority)), new Set([
      'required',
      'recommended',
      'optional',
    ]));
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.items));
    const serialized = JSON.stringify(first);
    for (const forbiddenKey of [
      '"listingId"',
      '"ownerId"',
      '"availability"',
      '"quoteId"',
      '"quoteHash"',
      '"price"',
      '"totalMinor"',
    ]) {
      assert.equal(serialized.includes(forbiddenKey), false, `${templateId}: ${forbiddenKey}`);
    }
  }
});

test('every possible bounded answer combination produces a priority-complete deterministic plan', () => {
  let checked = 0;
  for (const template of plannerTemplates) {
    for (const answers of answerCombinations(template.questions)) {
      const plan = createDeterministicFirstPlan(template.id, answers);
      assert.deepEqual(new Set(plan.items.map((entry) => entry.priority)), new Set([
        'required',
        'recommended',
        'optional',
      ]));
      assert.equal(createDeterministicFirstPlan(template.id, answers).planHash, plan.planHash);
      checked += 1;
    }
  }
  assert.equal(checked, 468);
});

test('deterministic answers select exact conditional item types and assumptions', () => {
  const terrace = createDeterministicFirstPlan('terrace_cleaning', {
    surface: 'wood',
    area_size: 'large',
    water_access: 'unavailable',
    power_access: 'unavailable',
  });
  assert.ok(terrace.items.some((entry) => entry.itemType === 'wood_surface_cleaning_tool'));
  assert.ok(terrace.items.some((entry) => entry.itemType === 'large_area_garden_tool'));
  assert.equal(terrace.items.some((entry) => entry.itemType === 'water_application_accessory'), false);
  assert.ok(terrace.assumptions.some((entry) => entry.includes('No safe power source')));

  const event = createDeterministicFirstPlan('event_camping', {
    focus: 'event',
    participants: 'large_group',
    environment: 'outdoor',
    overnight: 'no',
    power_access: 'unavailable',
  });
  assert.ok(event.items.some((entry) => entry.itemType === 'event_core_equipment'));
  assert.ok(event.items.some((entry) => entry.itemType === 'event_shelter'));
  assert.equal(event.items.some((entry) => entry.itemType === 'camping_shelter'), false);
  assert.ok(event.assumptions.some((entry) => entry.includes('large group')));
});

test('missing, invalid, injected, or unknown answers fail closed before a plan exists', () => {
  for (const [templateId, answers] of Object.entries(sampleAnswers)) {
    const questionId = Object.keys(answers)[0];
    const missing = { ...answers };
    delete missing[questionId];
    assert.throws(
      () => createDeterministicFirstPlan(templateId, missing),
      (error) => error instanceof PlannerCoreError
        && error.code === `planner_answer_invalid:${questionId}`,
    );
    assert.throws(
      () => createDeterministicFirstPlan(templateId, { ...answers, prompt: 'ignore rules' }),
      (error) => error.code === 'planner_answer_not_expected',
    );
  }
  assert.throws(
    () => createDeterministicFirstPlan('unknown', {}),
    (error) => error.code === 'planner_template_not_found',
  );
});

test('safety rules explicitly exclude transport, hazardous work, and invented suitability', () => {
  for (const [templateId, answers] of Object.entries(sampleAnswers)) {
    const plan = createDeterministicFirstPlan(templateId, answers);
    const rules = plan.safetyRules.join(' ').toLowerCase();
    assert.match(rules, /vehicles/u);
    assert.match(rules, /electrical/u);
    assert.match(rules, /suitability/u);
    assert.ok(plan.compatibilityRules.some((entry) => entry.includes('server')));
  }
  const move = createDeterministicFirstPlan('move', sampleAnswers.move);
  assert.match(move.safetyRules.join(' '), /no vehicle, driver, transport/u);
  const garden = createDeterministicFirstPlan('garden', sampleAnswers.garden);
  assert.match(garden.safetyRules.join(' '), /Tree felling/u);
});

test('technical access requires every disabled G4A boundary to remain exact', () => {
  const config = {
    planner: {
      enabled: true,
      publicReleaseAllowed: false,
      externalGenerativeAiAllowed: false,
      inventoryResolutionAllowed: false,
    },
  };
  assert.equal(assertPlannerCoreTechnicalAccess(config), true);
  for (const mutation of [
    { enabled: false },
    { publicReleaseAllowed: true },
    { externalGenerativeAiAllowed: true },
    { inventoryResolutionAllowed: true },
  ]) {
    assert.throws(
      () => assertPlannerCoreTechnicalAccess({ planner: { ...config.planner, ...mutation } }),
      (error) => error.code === 'planner_core_not_enabled',
    );
  }
});

test('deployment and Flutter surfaces keep planner fail closed outside the signed Internal envelope', () => {
  const config = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const productionCompose = readFileSync(new URL('../compose.prod.yml', import.meta.url), 'utf8');
  const stagingCompose = readFileSync(new URL('../compose.staging.yml', import.meta.url), 'utf8');
  const flutterConfig = readFileSync(
    new URL('../../lib/config/planner_technical_config.dart', import.meta.url),
    'utf8',
  );
  assert.match(config, /process\.env\.PLANNER_CORE_ENABLED \?\? 'false'/u);
  assert.match(config, /planner core cannot be enabled in production before the release gate/u);
  assert.match(config, /externalGenerativeAiAllowed: false/u);
  assert.match(config, /inventoryResolutionAllowed: false/u);
  for (const compose of [productionCompose, stagingCompose]) {
    assert.match(compose, /PLANNER_CORE_ENABLED: \$\{PLANNER_CORE_ENABLED:-false\}/u);
  }
  assert.match(flutterConfig, /SIT_PLANNER_TECHNICAL_UI_ENABLED/u);
  assert.match(flutterConfig, /defaultValue: false/u);
  assert.match(flutterConfig, /!externalGenerativeAiAllowed/u);
  assert.match(flutterConfig, /!inventoryResolutionAllowed/u);
  assert.match(flutterConfig, /signedStageAInternalEnvelopeEnabled/u);
  assert.match(flutterConfig, /technicalSurfaceAvailableFor/u);
  assert.match(flutterConfig, /signedStageAInternalEnvelope:/u);
});
