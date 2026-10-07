// Admission is separate from technical capability: rollback closes expansion,
// not existing authorized reads or reductions. It creates no domain relation.
export class MissionAdmissionError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function readMissionNewEntriesEnabled(env, { deploymentEnvironment, coreEnabled }) {
  const value = (env.PLANNER_NEW_ENTRIES_ENABLED ?? 'false').trim().toLowerCase();
  if (!['true', 'false'].includes(value)) {
    throw new MissionAdmissionError(500, 'mission_new_entries_configuration_invalid');
  }
  if (value === 'false') return false;
  if (!['development', 'test', 'staging'].includes(deploymentEnvironment) || coreEnabled !== true) {
    throw new MissionAdmissionError(500, 'mission_new_entries_configuration_unsafe');
  }
  return true;
}

export function assertMissionAdmission(configuration, action, raw) {
  if (configuration?.planner?.newEntriesEnabled === true) return;
  // Workflow normalizers still validate the complete payload before mutation.
  // No unknown action or discriminator is treated as a reduction.
  if (raw && typeof raw === 'object' && !Array.isArray(raw)
      && ((action === 'respond' && raw.decision === 'reject')
        || (action === 'participation' && raw.status === 'withdrawn')
        || (action === 'participationItem' && raw.availabilityStatus === 'withdrawn'))) return;
  throw new MissionAdmissionError(404, 'mission_new_entries_not_enabled');
}
