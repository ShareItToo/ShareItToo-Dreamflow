# ADR-038: P0A current-source evidence policy

Status: accepted for the non-activating P0A technical-readiness package on
21.08.2026.

## Context

The Pixel 7 Pro is reachable and contains an earlier shell-installed SIT build.
The current source can build a debug APK, but its signature differs from the
installed package. Replacing it would require uninstalling the installed app or
otherwise overriding the signature boundary, risking retained device data.

P0A also requires web/device evidence while explicitly forbidding public
rollout, real money, live provider traffic, Store work and a signed candidate.
The readiness result therefore needs separate current, blocked, historical and
out-of-scope classifications.

## Decision

Use four statuses in one machine-validated matrix:

- `passed`: current-source technical evidence exists within P0A authorization;
- `blocked`: required current-source evidence cannot be obtained safely inside
  the current authorization;
- `historical`: valid prior evidence that does not bind the current source;
- `not_applicable`: evidence outside the package authorization.

Historical evidence never satisfies a current-source cell. Missing evidence
never counts as a pass, and blocked cells remain visible in aggregate counts.
Device evidence records only model/platform/version-level facts needed for the
gate and excludes serial numbers, Android IDs and other raw identifiers.

The current-source Pixel cell remains blocked. The installed data is preserved.
P0A will not create a signed candidate merely to make that cell pass. Current
web evidence is a debug build served over loopback only. Payment evidence uses
memory/disabled transports and explicitly excludes live provider traffic.

## Rejected alternatives

1. Uninstall or force-replace the installed app. This could destroy or detach
   retained test state and exceeds the destructive-device boundary.
2. Label the historical Pixel runs as current. Their installed build is not
   bound to the current source head.
3. Sign or upload a new candidate. Signing and Store actions are not authorized
   by P0A.
4. Exercise a live payment provider. Real money and live provider traffic are
   explicitly forbidden.
5. Hide the device blocker because web and builds pass. That would collapse
   distinct evidence classes and overstate readiness.

## Consequences

- P0A can close as an honest technical-readiness HOLD while passing its safe
  source, web, build and synthetic regression cells.
- P0B can evaluate launch readiness independently while carrying the current
  device, legal, payment/provider, staffing and activation gates forward.
- A future authorized signed candidate or explicitly approved destructive
  device action can supply new current-source physical evidence without
  rewriting historical records.

## Rollback

Revert the P0A matrix, validator, focused regression and loopback smoke files.
No migration, production configuration, payment/provider state, device data or
historical evidence changes are involved.
