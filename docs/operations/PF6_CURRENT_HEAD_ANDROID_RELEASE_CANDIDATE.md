# PF6 current-head Android release candidate

Status: **SIGNED DIRECT-INSTALL EVIDENCE PASSED — STAGE A HOLD / NO-GO**

Observed: 2026-08-23

This package uses the non-public build and physical-device permission in
`SIT_MAXIMUM_LAUNCH_READINESS_AUTONOMY_V1_FREIGABE`. It does not activate a
pilot, select a Store route, upload a binary, accept platform terms, spend
money or change production.

## Exact candidate

| Field | Verified value |
| --- | --- |
| Source commit | `76e6565cdb20d6a49fb417e87b044b237a1ae6c1` |
| Branch | `codex/master-workflow-20260808` |
| App identity | `com.shareittoo.app` |
| Version | `1.0.0+2026082301` |
| Channel | `internal` |
| Backend | `https://staging.shareittoo.com/api/v1` |
| Login profile | Google on; Apple and Facebook off |
| Controlled diagnostic | `b11-android-2026082301` |
| Regression | GitHub run `32633048693`, success |
| CodeQL | GitHub run `32633048658`, success |

The release script created the signed AAB and APK, verified the canonical
upload certificate and package/version identity, ran the final-binary privacy
scan and copied exactly four files into a new owner-only private archive. The
archive is outside Git, cannot be overwritten by the archive tool and contains
no secret or private path in repository evidence.

## Physical Pixel result

The authorized Pixel 7 Pro was already running `1.0.0+2026081510`. Before any
mutation, the installed certificate was compared with the new APK and both
were verified as the canonical ShareItToo certificate. The candidate APK hash
was also checked against the private manifest.

`adb install --no-streaming -r` then performed one in-place update. Afterward:

- the installed version was `1.0.0+2026082301`;
- the pulled installed APK hash matched the candidate exactly;
- the first-install timestamp and credential-encrypted data inode were both
  preserved;
- the app process started from the launcher;
- no uninstall, `pm clear`, data reset or downgrade was used;
- no screenshot, account content or raw device identifier was retained.

This is direct internal-install evidence. It is not Google Play internal,
closed-test or Store-install evidence.

## Release-host Technical Debt closure

The first local bundle attempt failed at resource shrinking because the APFS
volume had insufficient free space. A temporary external scratch experiment
was rejected after its filesystem produced an incompatible Kotlin classpath
snapshot transform; no release evidence came from that attempt and the scratch
directory was removed.

The successful release was rebuilt on the internal APFS filesystem after only
regenerable browser cache was cleared. Two permanent deterministic protections
replace the ad-hoc recovery:

1. the fixed release-host effective-capacity floor is 5 GiB and cannot be
   reduced by an environment or timing override;
2. the release builder itself runs the same before/after capacity guard and
   discovers the configured SDK from `android/local.properties` when Android
   environment variables are absent.

Therefore neither cache deletion, external scratch storage nor a manually
exported SDK path is a release prerequisite. `TD-PF6-001` is closed only while
the permanent wiring tests and complete regression remain green.

## Remaining gate

PF6 closes the missing exact current-head signed direct-install candidate
evidence. The Stage A Store lane remains open for the approved private
distribution route, authentic Google Play closed-testing observations,
protected review access, final accessibility/device evidence and the later
explicit decision. Legal, operator, Firebase-owner, Privacy/Retention,
Operations and pilot-envelope external evidence also remains open.

No production, Cloud/VPS/DNS, provider, Payment, Store, real-money, contract,
participant, public activation or PR-merge state changed. The decision remains
`HOLD / NO-GO`.
