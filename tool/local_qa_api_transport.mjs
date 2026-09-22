#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const localQaApiBaseUrl = 'http://127.0.0.1:18080/api/v1';

function emit(output, message) {
  output.write(`${JSON.stringify(message)}\n`);
}

async function login({ email, password, output, fetchImpl }) {
  if (typeof email !== 'string' || typeof password !== 'string' ||
      email.length === 0 || password.length === 0) {
    emit(output, { type: 'login', ok: false });
    return null;
  }
  try {
    const response = await fetchImpl(`${localQaApiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.accessToken !== 'string' || body.accessToken.length < 20 ||
        typeof body.refreshToken !== 'string' || body.refreshToken.length < 20) {
      emit(output, { type: 'login', ok: false });
      return null;
    }
    emit(output, { type: 'login', ok: true });
    return body.refreshToken;
  } catch {
    emit(output, { type: 'login', ok: false });
    return null;
  }
}

async function logout({ refreshToken, output, fetchImpl }) {
  if (typeof refreshToken !== 'string' || refreshToken.length < 20) {
    emit(output, { type: 'logout', ok: false });
    return;
  }
  try {
    const response = await fetchImpl(`${localQaApiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    emit(output, { type: 'logout', ok: response.status === 204, status: response.status });
  } catch {
    emit(output, { type: 'logout', ok: false });
  }
}

export async function runLocalQaApiTransport({
  input = process.stdin,
  output = process.stdout,
  fetchImpl = fetch,
} = {}) {
  const inputLines = createInterface({ input, crlfDelay: Infinity });
  let refreshToken = null;
  for await (const line of inputLines) {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      break;
    }
    if (request?.op === 'login' && refreshToken === null) {
      refreshToken = await login({
        email: request.email,
        password: request.password,
        output,
        fetchImpl,
      });
    } else if (request?.op === 'logout') {
      await logout({ refreshToken, output, fetchImpl });
      refreshToken = null;
      break;
    } else if (request?.op === 'shutdown') {
      break;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLocalQaApiTransport().catch(() => {
    process.exitCode = 1;
  });
}
