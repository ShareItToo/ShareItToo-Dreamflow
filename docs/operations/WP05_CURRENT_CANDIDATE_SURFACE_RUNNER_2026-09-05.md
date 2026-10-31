# WP05 current-candidate Pixel surface runner

## Outcome

The historical N28 Pixel surface tooling is now candidate-generic. One explicit
entry point validates a supplied private Android archive, proves its source
commit is an ancestor, inspects committed, staged, unstaged and untracked drift,
rejects any later mobile-source change, and runs the complete provider-independent
Pixel surface matrix. Sensitive screenshots require a caller-supplied private
directory and are never emitted into repository evidence.

Focused tooling coverage passes 15/15. The physical read-only run on the exact
signed `1.0.0+2026090407` candidate passes authenticated cold start, all five
main destinations, seven legal documents, large-text navigation, 48 dp touch
targets, five process restarts, both system theme modes, all four background
choices, nine account surfaces, help/support entry and the visible payment and
payout provider holds. No support, message, listing, booking, account, payment,
Store, production or OnePlus mutation occurred.

The complete local technical regression also passes through the maintained
version-2 Android build profile, including the analyzer at zero issues, Web/Wasm
dry run, loopback smoke, Android debug build with minSdk 24 and the Android
release-surface guard. Third-party Gradle deprecation warnings remain visible
and do not originate in SIT-owned Android build scripts.

## Confirmed visual P1

Private screenshots were reviewed locally and are retained outside Git. Dark
system mode with persisted `Dark 1` is readable. System light mode with that
same explicit dark background is not: home text, inactive navigation and parts
of the background-settings route use light-theme foreground colors over a dark
image. The Light 1/Light 2 preview labels are also hard-coded white over light
assets. Capture hashes are retained in the sanitized machine evidence, while
the private files and any incidental notifications remain undisclosed.

The source confirms the mismatch: the persisted background choice has an
explicit dark/light family, but `MaterialApp` still follows
`ThemeMode.system`; the background image changes independently. The background
selector also hard-codes preview label colors and lacks a UI action to return
to system-controlled mode.

## Next bounded correction

An explicit background choice must control the matching Material theme; a
cleared choice must return to `ThemeMode.system`. The selector must expose an
accessible system-default reset and family-aware preview labels and selection
semantics. This is a runtime correction and therefore requires a new versioned,
signed successor plus focused tests, the full local and clean reproducibility
gates, exact GitHub checks and a repeated private Pixel visual review. Candidate
0407 and its closure evidence remain immutable.

Binding V5.2, Stripe test mode, external listing AI, Store delivery, OnePlus,
production, public registration, live money and PR merge remain outside this
package.
