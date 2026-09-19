function credentialError() {
  const error = new Error('push_fcm_credentials_invalid');
  error.code = 'push_fcm_credentials_invalid';
  return error;
}

const privateKeyBegin = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
const privateKeyEnd = ['-----END', 'PRIVATE', 'KEY-----'].join(' ');

export function validateFirebaseServiceAccount(raw, expectedProjectId) {
  let account;
  try {
    account = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw credentialError();
  }
  if (account === null || typeof account !== 'object' || Array.isArray(account)) {
    throw credentialError();
  }
  const valid = account.type === 'service_account' &&
    account.project_id === expectedProjectId &&
    typeof account.private_key_id === 'string' &&
    /^[0-9a-f]{16,128}$/i.test(account.private_key_id) &&
    typeof account.private_key === 'string' &&
    account.private_key.startsWith(`${privateKeyBegin}\n`) &&
    account.private_key.trimEnd().endsWith(privateKeyEnd) &&
    typeof account.client_email === 'string' &&
    account.client_email.endsWith(`@${expectedProjectId}.iam.gserviceaccount.com`) &&
    typeof account.client_id === 'string' &&
    /^\d{6,30}$/.test(account.client_id) &&
    account.token_uri === 'https://oauth2.googleapis.com/token';
  if (!valid) throw credentialError();
  return account;
}
