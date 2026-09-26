# WP259-A profile cache and Staging URL truth — SOURCE FIX; SUCCESSOR BUILD REQUIRED

## Finding

The installed 1704 candidate had the correct profile/avatar widget wiring, but
the Staging runtime generated profile-upload URLs with an internal Docker
hostname. `BackendConfig.isManagedImageUrl` correctly rejected that host, so a
real uploaded photo could be present in the server profile while the Pixel UI
remained blank. WP258-D corrected only the non-production runtime base URL;
candidate 1704 remains immutable.

## Source correction

`DataService` now hydrates the backend profile once per exact backend session
owner during startup/restart. It uses the read-only owner-bound profile path,
persists the returned profile as the local cache, does not fall back to a
generic email-owned update on the backend path, and retries after a transient
backend failure. This prevents a stale cached avatar (or other remote profile
edit) from surviving a process restart indefinitely while preserving offline
rendering when the backend is unavailable.

## Verification

- Static source contract: 2/2.
- Focused Flutter profile/session suites: 25/25.
- `flutter analyze lib/services/data_service.dart`: PASS.
- `git diff --check`: PASS.

The source patch is uncommitted in this package's working tree and must be
included in a fresh, higher-version successor candidate before any release or
Play handoff. No binary, Play, provider, production or device mutation is
claimed for this source fix.

Evidence: `docs/evidence/release-readiness/wp259-a-profile-cache-and-staging-url-truth-20260919.json`.
