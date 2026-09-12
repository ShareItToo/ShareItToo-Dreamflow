# 48H R2 Pixel local QA update

Status: **COMPLETE — DATA-PRESERVING LOCAL-QA UPDATE VERIFIED**

R2 produced and installed an exact local-device QA candidate without creating
a Store or public-release authorization. Candidate source is commit
`13359f209857690d53feeaff1bab3eca40bdbb48`; the guarded update and verification
tooling is commit `c15e12e71a3caaf6918c5b9fa8ec8de3666bd7a8`.

## Candidate boundary

The installed identity is `com.shareittoo.app`, version
`1.0.0+2026082303`. The candidate is a canonically signed, debuggable,
Internal-only QA build configured for:

- loopback API `127.0.0.1:18080` through an explicit ADB reverse;
- Blue Ocean mock UI and the test-only G3/G4/G5 surfaces;
- mock provider only;
- no external provider, real money, production, public registration or public
  release;
- no AAB and no Store action.

The source build is fail-closed: canonical signing can be selected only for an
explicit debug task with both local-QA confirmation variables present. Normal
debug and all release behavior remain unchanged.

## Seven-condition install gate

Before any device write, the tool verified all seven required facts: exact
package identity, compatibility with both archive and installed signature,
strictly newer build, replace-only installation, no uninstall/reset, an
already unlocked and authorized Pixel, fail-closed post-install data checks,
and the real retained `2026082302` rollback archive.

The resulting `adb install --no-streaming -r` update moved the Pixel from
`1.0.0+2026082302` to `1.0.0+2026082303`. The installer verified unchanged
first-install identity and app-data inode before attempting the final app
launch. A later independent read-only pass confirmed that the installed APK is
byte-identical to the verified owner-only archive, the original install time
predates R2, a nonzero app-data inode remains, and the app becomes the
foreground activity. No second install was performed.

## Deterministic timing remediation

The first final foreground assertion exposed a timing race in the older
`monkey` launch helper: it could inspect Activity state before Android had
finished launching the app. That failed timing assertion was not accepted as
final evidence. `TD-48H-001` replaced it with Android's deterministic
`am start -W` command plus explicit completed-start and foreground checks.
Thirteen focused tests and the live independent verification passed. The
timing behavior is not retained as a workaround or release prerequisite.

## Rollback and boundaries

The previous canonical `1.0.0+2026082302` owner-only archive and its binary
privacy report were revalidated. If R2 recovery becomes necessary, use only
that retained archive in a controlled signed downgrade-replace, never an
uninstall or data reset, then repeat package, installed-bytes and app-data
identity checks. Private archive paths and signing digests are deliberately not
stored in repository evidence.

No production, cloud, payment, Store, public registration, external provider,
private-gallery or account mutation occurred. R3 may now connect only the
local mock backend over ADB and use synthetic fixture images.
