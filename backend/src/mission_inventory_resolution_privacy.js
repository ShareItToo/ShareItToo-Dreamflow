export function sanitizeMissionInventoryListingSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot;
  const { handoverLocationKey: _privateLocationDigest, ...safe } = snapshot;
  return Object.freeze(safe);
}

export function sanitizeMissionInventoryResolutionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot;
  return Object.freeze({
    ...snapshot,
    slots: Object.freeze((snapshot.slots ?? []).map((slot) => Object.freeze({
      ...slot,
      assignment: slot.assignment
        ? sanitizeMissionInventoryListingSnapshot(slot.assignment)
        : null,
    }))),
  });
}
