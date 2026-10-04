import { Resolver } from 'node:dns/promises';
import { createPublicKey } from 'node:crypto';

const domain = 'shareittoo.com';
const selector = 'google';
const resolvers = [
  { name: 'Cloudflare', address: '1.1.1.1' },
  { name: 'Google Public DNS', address: '8.8.8.8' },
  { name: 'Quad9', address: '9.9.9.9' },
];

function fail(message) {
  throw new Error(message);
}

function matching(records, prefix) {
  return records.filter((record) => record.toLowerCase().startsWith(prefix));
}

function parseTags(record) {
  return Object.fromEntries(
    record
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        if (separator < 1) fail(`Invalid tag in DNS record: ${part}`);
        return [
          part.slice(0, separator).trim().toLowerCase(),
          part.slice(separator + 1).trim(),
        ];
      }),
  );
}

async function resolveTxt(address, hostname) {
  const resolver = new Resolver();
  resolver.setServers([address]);
  const chunks = await resolver.resolveTxt(hostname);
  return chunks.map((parts) => parts.join(''));
}

function verifySpf(records, resolverName) {
  const spf = matching(records, 'v=spf1');
  if (spf.length !== 1) {
    fail(`${resolverName}: expected exactly one SPF record, found ${spf.length}.`);
  }
  const expected = 'v=spf1 include:_spf.google.com ~all';
  if (spf[0] !== expected) {
    fail(`${resolverName}: unexpected SPF policy: ${spf[0]}`);
  }
}

function verifyDkim(records, resolverName) {
  const dkim = matching(records, 'v=dkim1');
  if (dkim.length !== 1) {
    fail(`${resolverName}: expected exactly one DKIM record, found ${dkim.length}.`);
  }
  const tags = parseTags(dkim[0]);
  if (tags.v.toUpperCase() !== 'DKIM1' || tags.k.toLowerCase() !== 'rsa') {
    fail(`${resolverName}: DKIM must use DKIM1 with an RSA key.`);
  }
  if (!tags.p) fail(`${resolverName}: DKIM public key is missing.`);

  let publicKey;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(tags.p, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch (error) {
    fail(`${resolverName}: DKIM public key is invalid: ${error.message}`);
  }
  const bits = publicKey.asymmetricKeyDetails?.modulusLength;
  if (!bits || bits < 2048) {
    fail(`${resolverName}: DKIM key must be at least 2048 bit, found ${bits ?? 'unknown'}.`);
  }
  return bits;
}

function verifyDmarc(records, resolverName) {
  const dmarc = matching(records, 'v=dmarc1');
  if (dmarc.length !== 1) {
    fail(`${resolverName}: expected exactly one DMARC record, found ${dmarc.length}.`);
  }
  const tags = parseTags(dmarc[0]);
  if (tags.v.toUpperCase() !== 'DMARC1') {
    fail(`${resolverName}: invalid DMARC version.`);
  }
  if (tags.p.toLowerCase() !== 'none') {
    fail(`${resolverName}: expected monitored rollout policy p=none, found p=${tags.p}.`);
  }
  const reportAddresses = (tags.rua ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase());
  if (!reportAddresses.includes('mailto:dmarc@shareittoo.com')) {
    fail(`${resolverName}: DMARC aggregate reports do not reach dmarc@shareittoo.com.`);
  }
  if ((tags.pct ?? '100') !== '100') {
    fail(`${resolverName}: expected DMARC pct=100, found pct=${tags.pct}.`);
  }
}

const checks = [];
for (const resolver of resolvers) {
  const [root, dkim, dmarc] = await Promise.all([
    resolveTxt(resolver.address, domain),
    resolveTxt(resolver.address, `${selector}._domainkey.${domain}`),
    resolveTxt(resolver.address, `_dmarc.${domain}`),
  ]);
  verifySpf(root, resolver.name);
  const dkimBits = verifyDkim(dkim, resolver.name);
  verifyDmarc(dmarc, resolver.name);
  checks.push(`${resolver.name}=SPF/DKIM-${dkimBits}/DMARC`);
}

console.log(`Email DNS verified: ${checks.join(', ')}.`);
