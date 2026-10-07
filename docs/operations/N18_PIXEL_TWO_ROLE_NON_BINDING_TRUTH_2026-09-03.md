# N18 Pixel two-role non-binding truth closure

Status: **CLOSED / PIXEL CURRENT CANDIDATE PASSED / LIVE GATES CLOSED** on
03.09.2026.

## Result

The exact signed Internal/Staging candidate is `com.shareittoo.app`
`1.0.0+2026090305`, built from
`4bcc018eef7759d9f8fe64f75daba060abf0eb13`. Its AAB SHA-256 is
`435cfcc9f3a493e86b2e2b9ed532bcd0f8fba0c68761c768e80eb9806fb5cd0f`
and its APK SHA-256 is
`113c8067a7fcd8769952126e33c2496e1d38a06d6bcbff02658ab5336c38be41`.
Canonical signing, package/version/SDK identity, Firebase configuration and
the binary privacy scan passed. The Pixel was updated in place; application
data and the original first-install identity were preserved.

The real-device review found that the Backend's authoritative
`simulationOnly=true` marker was dropped while the renter request was mapped
to a booking card. The accepted Stage-A simulation consequently looked like
a binding upcoming booking. The correction preserves that marker through the
renter map and gives it precedence in both renter and owner status chips.
Focused unit, widget and wiring tests prevent a later binding-looking status.

On candidate 2026090305 both roles now show `Pilot-Simulation` on their card.
The renter detail title is `Pilot-Simulation · Kommende Buchung`, and the
owner detail title is `Pilot-Simulation · Kommende Vermietung`. Both details
state that no contract, reservation or payment exists. Binding payment,
handover and return actions remain unavailable for the simulation.

## Exact Pixel checks

- current-candidate APK hash and installed version match the private archive;
- renter and owner card/detail truth passed against the same existing
  protected non-binding simulation;
- foreground, background and terminated-process FCM delivery passed, and the
  current ShareItToo notification icon was reviewed in a private screenshot;
- the controlled message stayed absent for 15 seconds while Android had no
  active default network, then appeared after restoration in the same app
  process without a fatal entry;
- logout cleared the local session, survived a cold start as guest, hid the
  protected chat and suppressed post-logout push; and
- the protected owner test session was restored after all probes.

No account address, credential, verification link, raw booking/thread ID,
device serial, network identifier or private screenshot is stored in Git.

## Determinism and technical-debt closure

The first local release builds exposed a corrupt generated Gradle transform
cache. Gradle removed and regenerated the bad transform; explicit release
plugin compilation and the unchanged clean candidate builder then passed.
No cache warm-up, retry or manual cleanup was added to the product or release
procedure as a permanent prerequisite.

The first exact-head GitHub Regression attempt reached Maven Central HTTP 429
during Android dependency resolution. The unchanged exact HEAD passed attempt
2. No source workaround or weakened test was introduced.

The first offline probe also identified a harness race: Android reported Wi-Fi
disabled one sample before releasing the prior active default network. Commit
`9a85579c83b03a9fbf607f784b5d8b2e26c5a67f` now requires Wi-Fi disabled,
telephony disconnected and no active default network for three consecutive
samples before sending. The real-device rerun then passed. This replaces the
timing assumption with a tested state invariant.

## Remaining holds

The two roles in this closure are isolated synthetic Staging fixtures. Owner
email-link completion and real-account login remain open. Google sign-in is
configured but not owner-executed; Facebook and Apple are disabled. Payment
remains memory-only with `livemode=false`. Listing AI remains mock-backed with
zero provider budget. V5.2 remains draft-blocked.

OnePlus, Google Play, tester lists, Production, public registration, real
money, external AI execution, legal activation, Firebase configuration,
Cloud/VPS/DNS and PR merge were not changed. PR #7 remains Draft and unmerged.

Machine-readable evidence:
`docs/evidence/release-readiness/n18-pixel-two-role-non-binding-truth-2026090305.json`.
