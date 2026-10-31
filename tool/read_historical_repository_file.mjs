import { execFileSync } from 'node:child_process';

export function readHistoricalRepositoryFile(repositoryRoot, revision, path, {
  sourceTexts = {},
  label = 'historical source',
} = {}) {
  if (Object.hasOwn(sourceTexts, path)) return sourceTexts[path];
  try {
    return execFileSync('git', ['show', `${revision}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error(`${label} is unavailable: ${path}`);
  }
}
