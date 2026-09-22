#!/usr/bin/env node

import { createInterface } from 'node:readline';

const localQaApiBaseUrl = 'http://127.0.0.1:18080/api/v1';

function emit(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function login(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string' ||
      email.length === 0 || password.length === 0) {
    emit({ type: 'login', ok: false });
    return null;
  }
  try {
    const response = await fetch(`${localQaApiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.accessToken !== 'string' || body.accessToken.length < 20 ||
        typeof body.refreshToken !== 'string' || body.refreshToken.length < 20) {
      emit({ type: 'login', ok: false });
      return null;
    }
    emit({ type: 'login', ok: true });
    return body.refreshToken;
  } catch {
    emit({ type: 'login', ok: false });
    return null;
  }
}

async function logout(refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken.length < 20) {
    emit({ type: 'logout', ok: false });
    return;
  }
  try {
    const response = await fetch(`${localQaApiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    emit({ type: 'logout', ok: response.status === 204, status: response.status });
  } catch {
    emit({ type: 'logout', ok: false });
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let refreshToken = null;
for await (const line of input) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    break;
  }
  if (request?.op === 'login' && refreshToken === null) {
    refreshToken = await login(request.email, request.password);
  } else if (request?.op === 'logout') {
    await logout(refreshToken);
    refreshToken = null;
    break;
  } else if (request?.op === 'shutdown') {
    break;
  }
}
