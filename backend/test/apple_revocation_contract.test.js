import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const authServiceSource = fs.readFileSync(
  new URL('../../lib/services/auth_service.dart', import.meta.url),
  'utf8',
);

test('Apple client transport and backend input contract are source-bound', () => {
  assert.match(authServiceSource, /credential\.additionalUserInfo\?\.authorizationCode/u);
  assert.match(authServiceSource, /'appleAuthorizationCode': acquisition\.appleAuthorizationCode/u);
  assert.match(appSource, /authorizationCode: req\.body\?\.appleAuthorizationCode/u);
  assert.match(appSource, /typeof req\.body\?\.appleRefreshToken === 'string'/u);
  assert.match(appSource, /throw new HttpError\(400, 'invalid_social_provider_material'\)/u);
});
