# WP94 — Pixel permission/startup source boundary

Status: **COMPLETE AS A SOURCE-LEVEL BOUNDARY AUDIT; THE PHYSICAL
PERMISSION-LIFECYCLE RESULT REMAINS UNPROVEN.**

WP94 inspected the clean source worktree for the exact installed Pixel
candidate, rather than the later successor source. It finds no startup
runtime-permission request and no Android `MainActivity` resume or pause
override. Camera, location and notification permissions are feature-initiated;
the two app-wide resume observers only purge retained privacy-export copies or
refresh a pending safe app-link.

The audit does identify startup boundaries that must not be mistaken for a
permission cause: Firebase initialization and initial app-link principal
settlement are awaited before `runApp`, and an authenticated realtime setup is
awaited before the main navigation is built. Those facts make a
startup-scheduling or runner-observation boundary a bounded hypothesis, not a
root cause. The source audit cannot explain WP93's physical final restart, and
no source patch or timeout-based workaround is made.

No physical replay follows from this evidence. A future, separately scoped
diagnostic must establish deterministic application readiness independently of
the runner observation before it may evaluate this hypothesis. No device,
account, business, provider, Store, Production, OnePlus or merge state changed.

Machine-readable evidence:
`docs/evidence/release-readiness/wp94-pixel-permission-startup-source-boundary-20260910.json`.
