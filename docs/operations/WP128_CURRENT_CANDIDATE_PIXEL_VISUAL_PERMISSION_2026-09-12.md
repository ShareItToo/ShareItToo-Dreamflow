# WP128 — Current-candidate Pixel visual and permission closure

## Result

WP128 is **complete for exact-candidate themes, backgrounds, 200-percent text
and bounded cold starts; the consolidated Android permission lifecycle remains
PARTIAL**. The physical Pixel stayed on the signed Internal/Staging
`com.shareittoo.app` `1.0.0+2026091201` candidate from source
`1546812f625b4e8f1e700bf976410097cd45ac2f` throughout.

The portfolio moves from WP127's **12 PASS / 12 PARTIAL / 8 OPEN** to
**13 PASS / 11 PARTIAL / 8 OPEN**. Only
`themes-backgrounds-large-text-and-restart` is promoted. The permission area is
not promoted.

## Physical visual and text proof

Android font scale was changed from `0.85` to `2.0`. Entdecken, Mietkorb,
Buchungen, Nachrichten and Mein SIT each remained semantically reachable, then
the exact `0.85` value was restored. Three subsequent ordinary cold starts
each reached authenticated main navigation.

Dark and light Android system modes each reached authenticated main navigation
and restored the exact original night mode. System, Dark 1, Dark 2, Light 1
and Light 2 were then selected individually through authoritative accessibility
selection state. Every phase privately captured the visible result and restored
the original `Dark 1` choice before the next phase. The seven private captures
were inspected for the bounded surfaces, remain outside Git and are not an
owner or professional accessibility sign-off. Normal Entdecken was restored.

The first background preparation command correctly stopped because it expects
an already-open account-settings root. It made no preference change. The
existing authenticated, read-only navigation helper then opened the background
surface, after which every isolated phase passed. No wait or assertion was
relaxed.

## Permission finding and fail-closed correction

The exact artifact still declares 14 permissions, of which camera, coarse/fine
location and notifications form four active runtime permissions in three user
decisions. Every group completed denied and allowed states with authenticated
restarts. Android's app-permission settings were opened read-only, and every
runtime grant, mutable flag and effective AppOps mode was restored exactly.

The final immediate restart cannot yet be accepted. Sanitized Android process
evidence proves that the synchronous permission-restore commands returned
before three permission-revocation callbacks finished terminating the affected
process. A newly launched ShareItToo process could therefore be killed by a
delayed Android callback. This explains the repeated final-restart boundary; it
does not establish an application crash or product-runtime defect.

The diagnostic now uses an explicit ShareItToo activity instead of accepting
generic launcher-event injection, reads the current Android foreground-window
inventory, and requires both PackageManager handlers plus a bounded Android
broadcast barrier before a final restart. The PackageManager-only barrier was
insufficient. The final run stopped when Android did not confirm the broadcast
barrier; it did not convert time passage or an automatic retry into success.
No further physical permission replay was performed.

Every failed run left the owner-only journal at mode `0600`, with exact original
and restored permission states equal and `recoveryRequired=false`. The app
version, font scale, night mode and original background remained unchanged.

## Boundaries and next action

WP128 changes Android diagnostic tooling and evidence only. It changes no app
runtime, Backend, account, listing, booking, message, payment, Production,
Google Play, Firebase project, tester list or PR merge. The disconnected
OnePlus was not contacted.

Thirty-two focused diagnostic/validator tests and the complete local technical
regression pass. The full gate includes the complete tool inventory, Flutter,
Analyzer, Web/Wasm, loopback and Android build. Capacity passed from
`5,514,620 KiB` free before work to `1,885,416 KiB` afterward with
`3,623,860 KiB` generated growth, inside every fixed bound. Exact-head GitHub
Regression and CodeQL remain required after the WP128 commit.

The remaining permission action is not another blind replay. A future package
must first identify a deterministic Android permission-controller settlement
signal that succeeds on this OS, then permit at most one exact-candidate final
restart proof. Human TalkBack remains a separate OPEN gate.

Machine-readable evidence:
`docs/evidence/release-readiness/wp128-current-candidate-pixel-visual-permission-20260912.json`.
