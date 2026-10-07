# P0B Current-Source Signed Device Evidence

Date: 2026-08-21

Authorization: `P0B_NEXT_SIGNED_DEVICE_EVIDENCE_ONLY`

Result: **Android current-source signed candidate and physical cold-launch
evidence passed; iOS remains blocked; overall signed-device gate is partial.**

## Candidate identity

- Source commit: `e8cd4a99d95f74c279afa86a24a9a61df6ee98c8`
- Version: `1.0.0+2026081510`
- Channel/API: internal staging only
- Android Firebase: configured
- iOS Firebase: configured and same project context
- Firebase Analytics: disabled
- Android signing: canonical upload certificate verified
- Exact source-commit CI: run `32459509278`, fully green

The build produced a signed AAB, signed APK and passed binary privacy report.
All four artifacts were copied into a non-overwriting private archive whose
files are owner-only. The repository stores only hashes and sanitized state,
never the private path, credentials or protected Firebase values.

No artifact was uploaded or submitted to a Store.

## Physical Android result

The authorized physical Google Pixel 7 Pro runs Android 16/API 36. The signed
current-source APK was installed as a non-destructive update using the normal
replace path:

- update install succeeded;
- no uninstall, downgrade flag, data reset or package-data deletion was used;
- the installed package bytes match the candidate APK SHA-256;
- version name/code match `1.0.0` / `2026081510`; and
- a force-stop followed by launcher cold start resumed the SIT activity.

No screenshot, screen text, account data, raw device identifier or private
content was captured. The result proves direct internal Android installation,
not Google Play installation or Store readiness.

## iOS result

The protected iOS Firebase file is present, owner-only and validates in the
same Firebase project context. This Mac mini nevertheless has only Apple
command-line tools: full Xcode, working `xcodebuild` and CocoaPods are absent.
No iOS physical device was verifiably available through an appropriate tool.

Therefore no iOS archive, signed IPA or physical iOS test was attempted. Apple
account, membership and agreement status were not inferred. Installing full
Xcode or changing Apple signing/account state is not silently performed by
this gate.

## Machine validation

`docs/evidence/p0b-next/signed-device-evidence.json` is checked by
`tool/validate_p0b_signed_device_evidence.mjs`. The validator binds commit,
candidate hashes, sanitized Pixel facts, data-preserving actions, explicit iOS
blockers and all non-live boundaries. A local-only mode additionally rereads
and hashes the private archive without printing its path.

The deliberately shallow GitHub checkout validates the exact recorded CI run
metadata without claiming that the earlier candidate commit object is present
in that checkout. Normal Mac-mini validation still requires that commit object;
the optional private-archive mode additionally rehashes the candidate bytes.

GitHub Actions run `32459509278` completed successfully for the exact candidate
source commit. Backend and Flutter regression jobs passed; the CI candidate
build correctly remained skipped because CI does not hold signing material.

Negative tests reject hash drift, destructive Android actions, invented iOS
evidence, Store/public/real-money activation, unbound CI claims and private
paths/device identifiers in repository evidence.

## Remaining gate

The overall signed-device gate stays false until current-source signed iOS and
physical iOS evidence exist. The exact Android source commit CI requirement is
now satisfied.
Even a later complete device gate would not authorize Store submission,
production, public activation or real money.

Rollback for the physical Android action is a normal signed update to a later
authorized build. Existing app data was preserved; no destructive rollback is
required. Repository rollback removes only the evidence/validator package and
does not delete the private archive.
