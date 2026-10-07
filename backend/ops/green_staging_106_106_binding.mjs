import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertLedger, digest, equal, repositoryRoot } from './green_staging_98_106_contract.mjs';

export function requireBinding(ok, code) { if (!ok) throw new Error(`green_106_106_${code}`); }
const entrypoints = ['backend/ops/green_staging_106_106_collector.mjs', 'tool/validate_green_staging_106_106_runtime.mjs',
  'backend/ops/green_staging_106_106_promotion.mjs'];
export function successorSourcePaths(root = repositoryRoot) {
  const found = new Set(['backend/package.json', 'backend/pnpm-lock.yaml']);
  const visit = relative => {
    requireBinding(!relative.startsWith('../') && !path.isAbsolute(relative), 'source_path');
    if (found.has(relative)) return;
    found.add(relative);
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const match of text.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/gu)) {
      if (match[1].startsWith('.')) visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])));
    }
  };
  entrypoints.forEach(visit);
  for (const name of fs.readdirSync(path.join(root, 'backend/sql/migrations')).filter(n => n.endsWith('.up.sql'))) {
    found.add(`backend/sql/migrations/${name}`);
  }
  return [...found].sort();
}
const gitRead = (args, root) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
export function validateSuccessorSource(binding, { root = repositoryRoot, git = gitRead } = {}) {
  requireBinding(binding?.kind === 'sit-green-staging-106-106-binding' && binding.schemaVersion === 1
    && equal(Object.keys(binding).sort(), ['candidateImageId', 'kind', 'opsCommit', 'publicationSha256', 'reviewedCommit',
      'runtimeCommit', 'schemaVersion', 'scope', 'sourceInventory'].sort())
    && ['opsCommit', 'reviewedCommit', 'runtimeCommit'].every(k => typeof binding[k] === 'string'
      && /^[a-f0-9]{40}$/u.test(binding[k])), 'binding');
  requireBinding(String(git(['rev-parse', 'HEAD'], root)).trim() === binding.opsCommit
    && String(git(['merge-base', binding.reviewedCommit, binding.opsCommit], root)).trim() === binding.reviewedCommit,
  'source_commit');
  const paths = successorSourcePaths(root);
  requireBinding(binding.sourceInventory && equal(Object.keys(binding.sourceInventory).sort(), paths), 'source_inventory');
  for (const relative of paths) {
    const expected = binding.sourceInventory[relative];
    requireBinding(/^[a-f0-9]{64}$/u.test(expected)
      && digest(fs.readFileSync(path.join(root, relative))) === expected
      && digest(git(['show', `${binding.opsCommit}:${relative}`], root)) === expected
      && digest(git(['show', `${binding.reviewedCommit}:${relative}`], root)) === expected, 'source_bytes');
  }
  const migrations = paths.filter(p => p.startsWith('backend/sql/migrations/'));
  requireBinding(equal(String(git(['ls-tree', '--name-only', `${binding.runtimeCommit}:backend/sql/migrations`], root))
    .trim().split('\n').filter(n => n.endsWith('.up.sql')).sort(), migrations.map(p => path.basename(p))), 'runtime_migrations');
  assertLedger(migrations.map(relative => ({
    name: path.basename(relative), checksum: digest(git(['show', `${binding.runtimeCommit}:${relative}`], root)),
  })), 106);
  return binding.opsCommit;
}
