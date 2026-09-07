# WP42 — current-candidate accessibility and theme resilience

Status: **COMPLETE FOR THE BOUNDED CURRENT-CANDIDATE MATRIX; MANUAL TALKBACK
TRAVERSAL REMAINS OPEN**.

## Exact candidate and scope

The unchanged installed Pixel 7 Pro candidate is exactly
`com.shareittoo.app` `1.0.0+2026090610`, source
`2fd793bac970866aa94a2940f28d6bbc3e04e377`, APK SHA-256
`07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`
and canonical signing-certificate SHA-256
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
No mobile source changed after that candidate.

This package exercises only reversible display and Android accessibility
settings against the already installed candidate. It neither rebuilds nor
replaces the candidate and makes no Store-installed claim.

## Physical Pixel result

The read-only surface matrix passes:

- authenticated cold start and all five primary navigation destinations;
- all seven in-app legal documents;
- every primary destination at 200-percent text scaling;
- exact restoration of the previous `0.85` font scale;
- all primary navigation touch targets at least 48 dp, within bounds and
  non-overlapping; and
- five terminated-process restart checks.

All five authoritative appearance choices — system, Dark 1, Dark 2, Light 1
and Light 2 — were selected through the real UI and produced distinct private
captures. Each selection exposed exactly one selected semantic state. Private
visual review confirmed the selected-state border/check, readable labels,
correct light/dark family and no visible contrast defect on the reviewed
surface. The original Dark 1 choice and original system night mode were
restored exactly.

The earlier system-dark/system-light diagnostic also passed its setting and
restoration checks. Its equal main-surface hashes are expected: the explicitly
selected Dark 1 app preference correctly overrides the system theme. It is not
used as proof that the two system modes render differently.

All private captures and journals remain outside Git with mode `0600`. The
sanitized evidence retains only non-secret hashes and aggregate outcomes.

## TalkBack result

The Settings-driven TalkBack preflight remains truthfully blocked by the
external Pixel/Android runtime:

- the TalkBack settings surface and toggle were present;
- the system confirmation was accepted;
- the service was enabled, running and bound;
- Android never established runtime touch exploration or its secure grant;
- therefore no automated or manual traversal was attempted and no TalkBack
  pass is claimed; and
- the exact previous accessibility state was restored: accessibility off,
  zero enabled services, touch exploration off, no grant and no shortcut
  target.

This reproduces the already documented PF21 platform behavior on the current
candidate. The package does not bypass Android with direct secure-setting
mutation and does not classify the failed platform activation as an app
defect. Manual TalkBack traversal remains an explicit release-acceptance gap.

## Implementation and verification

Technical HEAD `1c2cea7ce3c7a2e4cdeea02d3da79514b5e783cb` generalizes the
existing fail-closed TalkBack diagnostic to an explicit, validated private
candidate archive and adds the exact five-choice appearance diagnostic. The
historical default remains intact. Invalid candidate identity is rejected
before device mutation; every path restores settings in `finally`; ambiguous
selection or restoration failure is fatal.

Fifteen focused checks and all 2,389 tool tests pass. The exact pinned Backend
toolchain (`pnpm@11.16.0`) retains 850 tests: 848 passed, two declared skips
and zero failures. The complete local regression passes, including 900 active
Flutter tests with 33 declared skips, zero analyzer diagnostics, Web/Wasm,
loopback smoke, PostgreSQL, Android debug with minSdk 24 and release capacity.
The current tree and reviewed Git history contain zero unexpected secret-scan
findings.

GitHub CodeQL `34097689617` passes at the exact technical HEAD. GitHub
Regression `34097689673` passes all four required jobs at that exact technical
HEAD, including independent clean-checkout reproducibility. The separate PR
CodeQL check passes and open code-scanning alerts are zero. PR #7 remains
Draft, open, mergeable and unmerged.

## Boundaries

No application runtime, Backend, candidate binary or installation changed.
No account, listing, booking, message, support case or payment was created or
mutated. No OnePlus access, Google Play/tester change, provider/Firebase
Console configuration, Backend deployment, Production, Cloud/VPS/DNS, real
money or PR merge occurred. The Pixel's font, appearance, night-mode and
accessibility state were restored.

Sanitized structured evidence:
`docs/evidence/release-readiness/wp42-current-candidate-accessibility-theme-20260907.json`.
