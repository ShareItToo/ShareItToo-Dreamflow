const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/u;
const ENVIRONMENTS = new Set(['development', 'test', 'staging', 'production']);

function normalized(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildReleaseMetadata(environment = process.env) {
  const rawVersion = normalized(environment.APP_VERSION);
  const rawCommit = normalized(environment.APP_COMMIT).toLowerCase();
  const rawBuildTime = normalized(environment.APP_BUILD_TIME);
  const rawEnvironment = normalized(
    environment.DEPLOYMENT_ENVIRONMENT ?? environment.NODE_ENV,
  ).toLowerCase();

  const version = VERSION_PATTERN.test(rawVersion) ? rawVersion : 'development';
  const commit = COMMIT_PATTERN.test(rawCommit) ? rawCommit : 'unknown';
  const buildTime = rawBuildTime && Number.isFinite(Date.parse(rawBuildTime))
    ? new Date(rawBuildTime).toISOString()
    : null;
  const deploymentEnvironment = ENVIRONMENTS.has(rawEnvironment)
    ? rawEnvironment
    : 'development';
  const shortCommit = commit === 'unknown' ? commit : commit.slice(0, 12);

  return Object.freeze({
    version,
    commit,
    shortCommit,
    buildTime,
    environment: deploymentEnvironment,
    releaseId: commit === 'unknown' ? version : `${version}-${shortCommit}`,
  });
}

export const releaseMetadata = buildReleaseMetadata();
