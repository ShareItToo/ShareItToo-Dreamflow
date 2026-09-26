#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { evaluateStageAOperatorConfig } from '../backend/src/stage_a_operator_config.js';

export function stageAOperatorConfigStatus(environment = {}) {
  return evaluateStageAOperatorConfig(environment);
}

function main() {
  const result = stageAOperatorConfigStatus(process.env);
  process.stdout.write(`${JSON.stringify({
    state: result.state,
    factsComplete: result.factsComplete,
    activationAllowed: result.activationAllowed,
    missingFields: result.missingFields,
    invalidFields: result.invalidFields,
    containsValues: result.containsValues,
  })}\n`);
  if (!result.factsComplete) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
