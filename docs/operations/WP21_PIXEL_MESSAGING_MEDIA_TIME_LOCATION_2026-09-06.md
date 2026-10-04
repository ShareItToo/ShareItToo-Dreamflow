# WP21 Pixel messaging, media, time and location

## Outcome

WP21 is physically complete on the Pixel 7 Pro for signed Staging candidate
`1.0.0+2026090603`, source commit
`68c97a437969dc98f17eb151da3e006259ffbafa`. The update preserved the existing
installation and app-data container, and the private candidate archive,
canonical upload signature, APK/AAB hashes and privacy scan validate.

The exact two-role journey selects a synthetic image through the physical
Pixel, confirms one server attachment and the same participant projection,
requests and counterparty-confirms both handover and return times, and proves
the complete message state again after a terminated-process restart. An exact
location attempt before the authoritative reveal window is blocked by the
server, creates no location message and shows persistent truthful feedback.
The isolated booking, listing and device file are removed, and the protected
owner session is restored.

The exact candidate backend is deployed to Staging from the GitHub-published
commit-labelled image. Readback proves commit and environment identity, a
healthy zero-restart container, database and mail readiness, empty notification
and failed-payment queues, memory-only payment, Stripe live mode off and
mock-only Listing AI with budget zero and external execution off. The health
endpoint remains degraded only because one noncritical support update is
overdue; critical and privacy overdue counts are zero.

## Corrections and diagnosis

Candidate commit `68c97a437969dc98f17eb151da3e006259ffbafa` replaces a
two-second location-gate toast with an awaited persistent information dialog.
Security and privacy denial is therefore not presented as a transient success-
style acknowledgement.

The first physical rerun exposed a diagnostic-only mismatch: Flutter may merge
the dialog title and surrounding semantics into one Android accessibility
node. Diagnostic commit `5b58c80c6b9dce0fac641d315d51b42516d342d0`
accepts the exact visible title within that merged semantics node and adds a
deterministic regression test. It still requires the exact server snapshot to
contain no location message. The polling remains state-based and bounded; no
fixed-delay success assumption, timeout waiver, reduced assertion or test-
parallelism workaround was added.

## Verification and boundaries

The complete local candidate regression passes 2,315 tool tests, Flutter,
analyzer, Web/Wasm, loopback smoke and Android minSdk 24 with 471 Gradle tasks.
Candidate GitHub Regression `34014883783`, CodeQL `34014883747` and the
publish-image Regression `34014899735` pass, including independent clean-
checkout reproducibility.

Sanitized machine-readable evidence is
`docs/evidence/release-readiness/wp21-pixel-messaging-media-time-location-20260906.json`.
It contains no account identity, credential, token, fixture identifier, raw
device identifier, private location or private filesystem path.

OnePlus, Google Play, Production, public registration, Stripe/live money,
external providers, Firebase Console, DNS and PR merge were not changed. PR #7
remains Draft and unmerged.
