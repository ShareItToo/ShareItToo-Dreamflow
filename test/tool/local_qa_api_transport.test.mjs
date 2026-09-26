import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  localQaApiBaseUrl,
  runLocalQaApiTransport,
} from '../../tool/local_qa_api_transport.mjs';

test('local QA API transport uses fixed loopback login/logout and status-only output', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const outputChunks = [];
  output.on('data', (chunk) => outputChunks.push(String(chunk)));
  const calls = [];
  const email = ['qa', 'transport'].join('@') + '.invalid';
  const password = ['Qa', 'direct', 'fixture'].join('-');
  const refreshToken = ['r', 'fixture', 'token'].join('-').repeat(8);
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ accessToken: ['x', 'fixture'].join('-').repeat(12), refreshToken }),
      };
    }
    return { ok: true, status: 204, json: async () => ({}) };
  };
  const running = runLocalQaApiTransport({ input, output, fetchImpl });
  input.end(`${JSON.stringify({ op: 'login', email, password })}\n` +
    `${JSON.stringify({ op: 'logout' })}\n`);
  await running;

  assert.deepEqual(calls.map(({ url, options }) => [url, options.method]), [
    [`${localQaApiBaseUrl}/auth/login`, 'POST'],
    [`${localQaApiBaseUrl}/auth/logout`, 'POST'],
  ]);
  assert.equal(calls[0].options.body.includes(email), true);
  assert.equal(calls[0].options.body.includes(password), true);
  assert.equal(calls[1].options.body.includes(refreshToken), true);
  const outputText = outputChunks.join('');
  assert.equal(outputText.includes(email), false);
  assert.equal(outputText.includes(password), false);
  assert.equal(outputText.includes(refreshToken), false);
  assert.deepEqual(outputText.trim().split('\n').map((line) => JSON.parse(line)), [
    { type: 'login', ok: true },
    { type: 'logout', ok: true, status: 204 },
  ]);
});
