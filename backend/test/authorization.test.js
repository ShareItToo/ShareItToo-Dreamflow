import assert from 'node:assert/strict';
import test from 'node:test';

import { canAccessResource, isActiveActor } from '../src/authorization.js';

const user = { id: 'user', role: 'user', accountStatus: 'active', deactivatedAt: null };
const owner = { id: 'owner', role: 'user', accountStatus: 'active', deactivatedAt: null };
const support = { id: 'support', role: 'support', accountStatus: 'active', deactivatedAt: null };
const admin = { id: 'admin', role: 'admin', accountStatus: 'active', deactivatedAt: null };

test('suspended and closed actors cannot access protected resources', () => {
  assert.equal(isActiveActor(user), true);
  assert.equal(isActiveActor({ ...user, accountStatus: 'suspended' }), false);
  assert.equal(isActiveActor({ ...user, accountStatus: 'closed', deactivatedAt: new Date() }), false);
});

test('participants cannot see another booking, thread, or private upload', () => {
  const foreign = { ownerId: 'owner', renterId: 'renter', user1Id: 'owner', user2Id: 'renter' };
  assert.equal(canAccessResource({ actor: user, action: 'read', resourceType: 'booking', resource: foreign }), false);
  assert.equal(canAccessResource({ actor: owner, action: 'read', resourceType: 'booking', resource: foreign }), true);
  assert.equal(canAccessResource({ actor: user, action: 'read', resourceType: 'message_thread', resource: foreign }), false);
  assert.equal(canAccessResource({ actor: user, action: 'read', resourceType: 'upload', resource: { ...foreign, visibility: 'private' } }), false);
  assert.equal(canAccessResource({ actor: user, action: 'read', resourceType: 'upload', resource: { visibility: 'public' } }), true);
});

test('support is deliberately limited and admin access stays explicit', () => {
  assert.equal(canAccessResource({ actor: support, action: 'read', resourceType: 'report' }), true);
  assert.equal(canAccessResource({ actor: support, action: 'comment', resourceType: 'dispute' }), true);
  assert.equal(canAccessResource({ actor: support, action: 'resolve', resourceType: 'dispute' }), false);
  assert.equal(canAccessResource({ actor: support, action: 'read', resourceType: 'payment' }), false);
  assert.equal(canAccessResource({ actor: support, action: 'read', resourceType: 'audit_log' }), false);
  assert.equal(canAccessResource({ actor: admin, action: 'read', resourceType: 'audit_log' }), true);
});
