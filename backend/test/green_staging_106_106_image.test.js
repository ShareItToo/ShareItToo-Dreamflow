import assert from 'node:assert/strict';
import test from 'node:test';
import { readCandidateArchive } from '../ops/green_staging_106_106_image.mjs';
import { candidateArchive, containerdArchive } from './fixtures/green_106106_archive.js';

const editJson = (entries, name, change) => {
  const entry = entries.find(e => e.name === name), value = JSON.parse(entry.data);
  change(value); entry.data = JSON.stringify(value);
};
const check = c => readCandidateArchive(c.archive, c.image);
test('legacy config-ID and exact single-manifest containerd-ID archives preserve the same ledger and identity', () => {
  const legacy = check(candidateArchive([])), c = containerdArchive(), modern = check(c);
  assert.equal(modern.imageId, c.image.Descriptor.digest);
  assert.deepEqual(modern.migrations, legacy.migrations); assert.equal(modern.uid, legacy.uid);
  assert.equal(modern.namespaceReadabilityVerified, false);
  assert.equal(check(containerdArchive({ changeOuter: entries => {
    editJson(entries, 'index.json', v => { v.annotations = { source: 'untrusted metadata only' };
      v.manifests[0].annotations = { 'io.containerd.image.name': 'ignored' }; });
    entries.push({ name: 'blobs', type: '5' }, { name: 'blobs/sha256', type: '5' });
  } })).migrations.length, 106);
});
test('containerd inspect descriptor requires exact digest, size, media type and repository suffix', async t => {
  const cases = {
    missing: image => { delete image.Descriptor; },
    digest: image => { image.Descriptor.digest = `sha256:${'0'.repeat(64)}`; },
    size: image => { image.Descriptor.size++; },
    numericSize: image => { image.Descriptor.size = String(image.Descriptor.size); },
    media: image => { image.Descriptor.mediaType = 'application/vnd.oci.image.index.v1+json'; },
    descriptorExtra: image => { image.Descriptor.urls = ['https://invalid']; },
    repository: image => { image.RepoDigests = [`repo@sha256:${'0'.repeat(64)}`]; },
    config: image => { image.Config.User = 'root'; },
    rootfs: image => { image.RootFS.Layers.reverse(); },
  };
  for (const [name, changeImage] of Object.entries(cases)) await t.test(name, () => assert.throws(() => check(containerdArchive({ changeImage }))));
});
test('hash-valid manifest still binds config and ordered compressed layer descriptor bytes/paths', async t => {
  const cases = {
    version: m => { m.schemaVersion = 1; },
    extraDescriptor: m => { m.subject = m.config; },
    configDigest: m => { m.config.digest = `sha256:${'0'.repeat(64)}`; },
    configSize: m => { m.config.size++; },
    configMedia: m => { m.config.mediaType = m.layers[0].mediaType; },
    configExtra: m => { m.config.urls = []; },
    layerDigest: m => { m.layers[0].digest = `sha256:${'0'.repeat(64)}`; },
    layerSize: m => { m.layers[0].size++; },
    layerMedia: m => { m.layers[0].mediaType = 'application/vnd.docker.image.rootfs.diff.tar'; },
    layerExtra: m => { m.layers[0].platform = {}; },
    layerOrder: m => { m.layers.reverse(); },
    extraLayer: m => { m.layers.push(m.layers[0]); },
    missingLayer: m => { m.layers.pop(); },
  };
  for (const [name, changeManifest] of Object.entries(cases)) await t.test(name, () => assert.throws(() => check(containerdArchive({ changeManifest }))));
});
test('index/layout/archive reject ambiguous descriptors, mutated bytes and legacy-path substitutions', async t => {
  const jsonCase = (file, fn) => entries => editJson(entries, file, fn);
  const cases = {
    indexDigest: jsonCase('index.json', v => { v.manifests[0].digest = `sha256:${'0'.repeat(64)}`; }),
    indexSize: jsonCase('index.json', v => { v.manifests[0].size++; }),
    indexMedia: jsonCase('index.json', v => { v.manifests[0].mediaType = 'wrong'; }),
    indexVersion: jsonCase('index.json', v => { v.schemaVersion = 1; }),
    indexType: jsonCase('index.json', v => { v.mediaType = 'wrong'; }),
    multiple: jsonCase('index.json', v => { v.manifests.push(v.manifests[0]); }),
    empty: jsonCase('index.json', v => { v.manifests = []; }),
    extra: jsonCase('index.json', v => { v.subject = {}; }),
    descriptorExtra: jsonCase('index.json', v => { v.manifests[0].platform = {}; }),
    annotations: jsonCase('index.json', v => { v.annotations = { data: {} }; }),
    descriptorAnnotations: jsonCase('index.json', v => { v.manifests[0].annotations = []; }),
    layoutVersion: jsonCase('oci-layout', v => { v.imageLayoutVersion = '2.0.0'; }),
    layoutExtra: jsonCase('oci-layout', v => { v.extra = true; }),
    missingIndex: entries => { entries.splice(entries.findIndex(e => e.name === 'index.json'), 1); },
    configPath: jsonCase('manifest.json', v => { v[0].Config = v[0].Layers[0]; }),
    layerPaths: jsonCase('manifest.json', v => { v[0].Layers.reverse(); }),
    rawConfig: entries => { entries[0].data = Buffer.concat([entries[0].data, Buffer.from(' ')]); },
    rawLayer: entries => { entries[1].data = Buffer.from(entries[1].data); entries[1].data[20] ^= 1; },
    rawManifest: entries => { entries[3].data = Buffer.concat([entries[3].data, Buffer.from(' ')]); },
    extraBlob: entries => { entries.push({ name: `blobs/sha256/${'0'.repeat(64)}`, data: '{}' }); },
    duplicateIndex: entries => { entries.push(entries.find(e => e.name === 'index.json')); },
    blobLink: entries => { entries[1].type = '2'; },
  };
  for (const [name, changeOuter] of Object.entries(cases)) await t.test(name, () => assert.throws(() => check(containerdArchive({ changeOuter }))));
});
