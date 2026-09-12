import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { isAbsolute } from 'node:path';

function fail(message) {
  throw new Error(message);
}

function normalizedEnvironmentValue(env, name) {
  return typeof env[name] === 'string' ? env[name].trim() : '';
}

function readCredential(env, directName, fileName) {
  const direct = normalizedEnvironmentValue(env, directName);
  const filePath = normalizedEnvironmentValue(env, fileName);
  if (direct && filePath) {
    fail(`${directName} and ${fileName} cannot both be configured`);
  }
  if (direct) return { value: direct, source: 'environment' };
  if (!filePath) return { value: '', source: 'none' };
  if (!isAbsolute(filePath)) fail(`${fileName} must be an absolute file path`);

  let bytes;
  let descriptor;
  try {
    descriptor = openSync(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC,
    );
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size < 16 || metadata.size > 512) {
      fail(`${fileName} must point to a bounded regular file`);
    }
    bytes = readFileSync(descriptor);
    return { value: bytes.toString('utf8').trim(), source: 'file' };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(fileName)) throw error;
    fail(`${fileName} must point to a readable regular file`);
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function readStripeSecretConfiguration(env, {
  deploymentEnvironment,
  paymentTransport,
}) {
  if (paymentTransport !== 'stripe') {
    return Object.freeze({
      secretKey: '',
      webhookSecret: '',
      connectWebhookSecret: '',
      credentialSource: 'none',
    });
  }

  const secretKey = readCredential(env, 'STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY_FILE');
  const webhookSecret = readCredential(
    env,
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_WEBHOOK_SECRET_FILE',
  );
  const connectWebhookSecret = readCredential(
    env,
    'STRIPE_CONNECT_WEBHOOK_SECRET',
    'STRIPE_CONNECT_WEBHOOK_SECRET_FILE',
  );
  const credentials = [secretKey, webhookSecret, connectWebhookSecret];
  const sources = new Set(credentials.map((credential) => credential.source));

  if (deploymentEnvironment === 'staging'
      && (sources.size !== 1 || !sources.has('file'))) {
    fail('Stripe Staging transport requires file credentials');
  }

  return Object.freeze({
    secretKey: secretKey.value,
    webhookSecret: webhookSecret.value,
    connectWebhookSecret: connectWebhookSecret.value,
    credentialSource: sources.size === 1 ? [...sources][0] : 'mixed',
  });
}
