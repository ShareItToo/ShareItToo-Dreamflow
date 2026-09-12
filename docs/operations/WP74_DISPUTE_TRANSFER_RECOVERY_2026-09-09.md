# WP74 — dispute transfer recovery

Status: **COMPLETE LOCALLY AND ON GITHUB**.

WP74 adds durable, idempotent recovery of an owner transfer after a payment
dispute. A provider timeout or an unstructured response never becomes a local
success claim. Recovery remains degraded and needs human review until the
provider reversal is bound to the exact transfer and amount. Funds reinstated
during an uncertain reversal cancel an unattempted recovery or create a
compensating owner payable; they never automatically reopen a dispute,
booking, payout or release funds.

## Successor candidate

The prior private candidate `1.0.0+2026090904` is preserved as
`superseded-never-uploaded`. It cannot be uploaded because WP74 changed
backend runtime behavior after it was built.

The new private, signed Internal/Staging candidate is
`com.shareittoo.app` `1.0.0+2026090905`, source
`e1c182ea496f013989863155c13bfda649255a7e`.

- AAB SHA-256:
  `ed3d5e5af99a6577e09afc96a880ac4ca7c9c0bd86c54bcaa3f5a07fd6255295`
- APK SHA-256:
  `1864b9c17e7813df887fb1e9961a1746665b4b57b6dbd831526e1c3a2f58eaa6`
- upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`
- binary privacy report SHA-256:
  `de29db662f406e9040b67a8d3e2a49d956d1c0c372fb946b310f3359d63edca8`

The archive is owner-only, non-overwriting, structurally validated and has not
been uploaded or installed. The candidate uses the staging API and Internal
channel only; no Store, tester, Firebase, VPS, DNS, payment-provider or
production action occurred.

## Local toolchain correction

The first build was rejected by the checked-build gate because API 36 was
paired with Build-Tools 35 and the SDK reader emitted an incompatible XML
warning. The compatible official Build-Tools 36.1 package was installed
locally; the repeated AAB and APK build completed without that diagnostic.
This is a toolchain correction, not a warning suppression or a product
workaround.

All 2,542 repository tool tests and the complete deterministic local
regression pass, including PostgreSQL, Flutter, analyzer, Web/Wasm, loopback
and Android minSdk-24. The current isolated PostgreSQL-16 R9 recovery proof
also passes after the new migration: fresh bootstrap, backup/restore,
upgrade-from-migration-027, integrity checks and cleanup all succeed with 72
migrations ending in `072_dispute_transfer_recovery.up.sql`.

GitHub correctly stopped its prior PostgreSQL recovery job because that runner
still asserted the former 71-migration inventory after migration 072 was
added. The correction advances the *current* runner to 72 and keeps the
historical R9 evidence bound to its original implementation source; it is not
a retry, timing or warning-suppression workaround.

GitHub Regression `34385168799` passed at exact HEAD
`276b103ad937d234b692c14832530f8b3bb438f1`: Backend, PostgreSQL fresh and R9
recovery, Flutter and clean-checkout reproducibility all passed. CodeQL
`34385168800` passed with zero open Code Scanning alerts. PR #7 remains Draft,
open, clean and unmerged. No external release action is authorized or implied.
