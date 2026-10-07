function fail(message) {
  throw new Error(`Invalid reviewed secret-scan history baseline: ${message}`);
}

export function findingKey({ rule, source, file }) {
  return `${rule}\t${source}\t${file}`;
}

export function parseReviewedHistoryBaseline(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object');
  if (value.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (!Array.isArray(value.reviewedFindings)) fail('reviewedFindings must be an array');

  const keys = new Set();
  for (const [index, entry] of value.reviewedFindings.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(`entry ${index} must be an object`);
    }
    if (typeof entry.rule !== 'string' || entry.rule.length === 0) {
      fail(`entry ${index} requires a rule`);
    }
    if (typeof entry.source !== 'string' || !/^[0-9a-f]{40}$/u.test(entry.source)) {
      fail(`entry ${index} source must be an immutable 40-character commit SHA`);
    }
    if (typeof entry.file !== 'string' || entry.file.length === 0) {
      fail(`entry ${index} requires a file`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.length < 12) {
      fail(`entry ${index} requires a meaningful reason`);
    }
    const key = findingKey(entry);
    if (keys.has(key)) fail(`entry ${index} duplicates a reviewed finding`);
    keys.add(key);
  }
  return keys;
}

export function partitionReviewedFindings(findings, reviewedHistoryKeys) {
  const reviewed = [];
  const unexpected = [];
  for (const finding of findings) {
    if (!finding.includes('\tworking-tree\t') && reviewedHistoryKeys.has(finding)) {
      reviewed.push(finding);
    } else {
      unexpected.push(finding);
    }
  }
  return { reviewed, unexpected };
}
