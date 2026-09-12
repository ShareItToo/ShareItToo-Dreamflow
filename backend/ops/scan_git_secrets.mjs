#!/usr/bin/env node
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';

import {
  detectHighConfidenceSecretRules,
  detectSensitivePathRules,
} from './secret_scan_rules.mjs';
import {
  parseReviewedHistoryBaseline,
  partitionReviewedFindings,
} from './secret_scan_baseline.mjs';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const findings = new Set();
const workingTreeOnly = process.argv.includes('--working-tree-only');

function inspect(text, source, file) {
  for (const rule of detectHighConfidenceSecretRules(text, file)) {
    findings.add(`${rule}\t${source}\t${file}`);
  }
}

function inspectPath(source, file) {
  for (const rule of detectSensitivePathRules(file)) {
    findings.add(`${rule}\t${source}\t${file}`);
  }
}

async function scanHistory() {
  const child = spawn('git', [
    'log', '--all', '--full-history', '--no-color', '--no-ext-diff',
    '--format=@@SIT_COMMIT %H', '-p', '--', '.',
  ], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'inherit'] });

  let commit = 'unknown';
  let file = 'unknown';
  let pending = '';
  child.stdout.setEncoding('utf8');
  for await (const chunk of child.stdout) {
    const lines = `${pending}${chunk}`.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('@@SIT_COMMIT ')) {
        commit = line.slice('@@SIT_COMMIT '.length).trim();
      } else if (line.startsWith('+++ b/')) {
        file = line.slice(6);
        inspectPath(commit, file);
      } else if (line.startsWith('rename to ')) {
        file = line.slice('rename to '.length);
        inspectPath(commit, file);
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        inspect(line.slice(1), commit, file);
      }
    }
  }
  if (pending.startsWith('+') && !pending.startsWith('+++')) {
    inspect(pending.slice(1), commit, file);
  }
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (exitCode !== 0) throw new Error(`git log failed with exit code ${exitCode}`);
}

async function scanWorkingTree() {
  const tracked = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repoRoot },
  ).toString('utf8').split('\0').filter(Boolean);

  for (const relativePath of tracked) {
    inspectPath('working-tree', relativePath);
    const absolutePath = path.join(repoRoot, relativePath);
    let handle;
    try {
      handle = await fs.open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch {
      continue;
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 5 * 1024 * 1024) continue;
      const contents = await handle.readFile();
      if (contents.includes(0)) continue;
      inspect(contents.toString('utf8'), 'working-tree', relativePath);
    } finally {
      await handle.close();
    }
  }
}

if (!workingTreeOnly) await scanHistory();
await scanWorkingTree();

const baselinePath = path.join(repoRoot, 'backend/ops/secret_scan_history_baseline.json');
const baselineValue = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
const reviewedHistoryKeys = parseReviewedHistoryBaseline(baselineValue);
const { reviewed, unexpected } = partitionReviewedFindings(findings, reviewedHistoryKeys);

if (reviewed.length > 0) {
  console.log(`[secret-scan] ${reviewed.length} exact historical finding(s) matched the reviewed commit baseline`);
}

if (unexpected.length > 0) {
  console.error(`[secret-scan] ${unexpected.length} unexpected high-confidence finding(s)`);
  for (const finding of unexpected.sort()) {
    const [rule, source, file] = finding.split('\t');
    console.error(`[secret-scan] rule=${rule} source=${source} file=${file}`);
  }
  process.exitCode = 1;
} else {
  console.log(workingTreeOnly
    ? '[secret-scan] no high-confidence secrets found in the working tree'
    : '[secret-scan] no high-confidence secrets found in Git history or working tree');
}
