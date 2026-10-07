export const actorRoles = Object.freeze(['user', 'support', 'admin']);
export const accountStatuses = Object.freeze(['active', 'suspended', 'closed']);

const roleSet = new Set(actorRoles);

export function normalizeActorRole(value) {
  return roleSet.has(value) ? value : 'user';
}

export function isActiveActor(actor) {
  return Boolean(actor?.id) && actor.accountStatus === 'active' && !actor.deactivatedAt;
}

export function isParticipant(actorId, resource) {
  if (!actorId || !resource) return false;
  return [
    resource.ownerId,
    resource.renterId,
    resource.user1Id,
    resource.user2Id,
  ].includes(actorId);
}

export function canAccessResource({ actor, action, resourceType, resource = {} }) {
  if (!isActiveActor(actor)) return false;
  if (actor.role === 'admin') return true;

  if (resourceType === 'listing') {
    if (action === 'read_public') return resource.isActive !== false;
    return resource.ownerId === actor.id;
  }
  if (resourceType === 'booking' || resourceType === 'message_thread') {
    return isParticipant(actor.id, resource);
  }
  if (resourceType === 'upload') {
    if (resource.visibility === 'public') return true;
    return resource.ownerId === actor.id || isParticipant(actor.id, resource);
  }
  if (resourceType === 'report' || resourceType === 'dispute') {
    if (actor.role === 'support') return action === 'read' || action === 'comment';
    return resource.createdBy === actor.id || isParticipant(actor.id, resource);
  }
  if (resourceType === 'audit_log' || resourceType === 'payment') {
    return false;
  }
  return false;
}
