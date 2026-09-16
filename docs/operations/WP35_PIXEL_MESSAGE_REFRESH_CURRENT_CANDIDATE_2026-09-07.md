# WP35 Pixel message-refresh current candidate

Status: **COMPLETE ON THE PHYSICAL PIXEL, LOCALLY AND ON GITHUB**.

## Provenance and candidate

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Candidate and implementation source HEAD:
  `2fd793bac970866aa94a2940f28d6bbc3e04e377`.
- Version/package: `1.0.0+2026090610`, `com.shareittoo.app`.
- Internal Staging API: `https://staging.shareittoo.com/api/v1`.
- AAB SHA-256:
  `738249977ae4bda9200cc84aaea09a1e7f739237509a43d0e6dead034b982973`.
- APK SHA-256:
  `07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`.
- Canonical upload-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The immutable owner-only archive contains exactly its manifest, privacy report,
AAB and APK. All files are owner-only. Recomputed hashes, signatures,
package/version, Firebase Staging binding, Internal channel, closed non-binding
`heilbronn_wave0` envelope and binary privacy scan pass. Google authentication
is enabled; Apple and Facebook remain disabled. External Listing AI, live
payments and public registration remain off.

The connected Pixel 7 Pro received a strictly newer replace update from
`2026090609` to `2026090610`. Installed APK bytes and certificate match the
archive. First-install time and the Android application-data identity were
preserved; no uninstall, reset or downgrade occurred. OnePlus was not
contacted.

## Reproduced defect and correction

The exact `2026090609` two-role journey was run twice. Owner publication,
public discovery, the non-binding request/acceptance simulation and controlled
FCM delivery passed, but the renter's final booking chat failed closed with
`Nachrichten konnten nicht sicher geladen werden.` It never appeared as a
server-confirmed empty list, stale data or success.

The primary remote message-thread read decoded authoritative server data and
then wrote it through the generic preference writer. That writer announced a
communication change. `MessagesScreen`, which legitimately listens for such
changes, immediately scheduled another remote refresh, creating a read ->
cache write -> notification -> read loop. The already existing rule for silent
read-only cache refreshes was present but was not wired into this primary path.

HEAD `2fd793bac970866aa94a2940f28d6bbc3e04e377` routes the primary remote read
through `_persistMessageThreads` with the established
`readOnlyRemoteRefresh: true` policy. Actual communication mutations still
announce changes; passive server reads do not announce their own cache write.
The UI continues to distinguish loading, safe load failure and
server-confirmed empty. A new structural ratchet proves the exact production
wiring and prevents a return to the generic announcing writer. Diagnostic
failure classification reports only label counts and never a private listing
title.

All dependent integrity hashes were advanced mechanically after the source and
test changes. A parsed comparison proves that existing JSON changes were hash
updates only; validator changes were corresponding expected digest constants.
No policy, gate or semantic evidence value was weakened.

## Physical closure

The exact signed `2026090610` candidate passes one complete fresh two-role
journey on the physical Pixel:

- two distinct previously verified e-mail principals;
- owner draft creation and Pixel publication, server-confirmed active;
- durable public-catalog visibility and renter discovery;
- request and acceptance through the explicitly non-binding pilot simulation;
- controlled FCM delivery in foreground, background and terminated-process
  states;
- correct owner and renter `Pilot-Simulation` presentation;
- renter booking chat visible at the exact former failure point;
- Account A absent after switching to Account B; and
- booking cancelled, listing ended and removed from the public catalog.

The protected owner was restored. Its source vault remained byte-identical,
owner-only and timestamp-identical. An independent inventory found zero active
isolated product journeys after cleanup and exactly one newly retired journey.
No contract, reservation, payment endpoint or monetary effect occurred.

The ShareItToo notification icon is clear and recognizable in the private
physical capture. Because that capture also contained unrelated personal
notifications, it was removed from working evidence immediately after visual
review. Only sanitized pass truth and SHA-256
`3d404e563a37f492a2cba39af4107e10c73cf3b113010ab2472523dd5f1e30f4`
remain in repository evidence.

## Regression and reproducibility

Sixteen focused Flutter message-state checks, all 2,372 repository tool tests,
the repository secret scan and the complete local candidate regression pass.
The full gate includes Flutter, analyzer, Web/Wasm, loopback smoke, backend,
PostgreSQL and Android minSdk 24.

The first unscoped signed build correctly stopped on an SDK XML-v4 reader
warning. The maintained version-2 build entrypoint then selected the isolated
official CLI-19 Android SDK and configuration and completed without warning
suppression, global SDK mutation, reduced assertions or a timing workaround.

Independent clean-checkout R10 at the exact source HEAD passes the complete
technical regression plus a second Android build. Both 231,444,283-byte APKs
are byte-identical with 794 identical entries and SHA-256
`2385dd1b98904f000167ba8f98ce6f61a0d0fd35154733487bb703a763e922b8`.
The private R10 report SHA-256 is
`1c46f3f1710e0cf8e0f691f24c9c8784874912624cd618ee8d51281609dc4ab7`.

Exact-source GitHub Regression `34070194520` passes backend, PostgreSQL,
Flutter and independent clean reproducibility. CodeQL `34070194527` passes,
open code-scanning alerts are zero and PR #7 remains Draft, open, mergeable and
unmerged.

WP35 changes no Google Play track or tester list, Production, backend
deployment, payment/provider, Firebase Console, public registration,
Cloud/VPS/DNS, OnePlus or PR merge state. No money was spent and Git history
was not rewritten.

Machine-readable sanitized evidence:
`docs/evidence/release-readiness/wp35-pixel-message-refresh-current-candidate-20260907.json`.
