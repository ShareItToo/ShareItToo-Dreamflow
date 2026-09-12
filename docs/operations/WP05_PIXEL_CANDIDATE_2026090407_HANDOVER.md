# WP05 — retry-safe Pixel candidate 2026090407 closure

Status: exact local, physical Pixel and GitHub candidate closure PASS. Broader
provider, binding-legal, Store and public-release gates remain closed. The full
product Goal remains ACTIVE.

## Exact candidate

Candidate `1.0.0+2026090407` is frozen at
`8f66c9a823abbd01119c729d747a43ad4018a542` on
`codex/master-workflow-20260808`. The candidate working tree was clean and its
remote branch matched exactly before the remote gates ran. The signed archive
contains package `com.shareittoo.app`, minSdk 24, target/compileSdk 36, Staging
API, configured Firebase, memory payment with `stripeLivemode=false`, Google
social enabled, and Apple/Facebook disabled.

The independently verified APK SHA-256 is
`d0c746482ab4be88134b6334fb7f2355748acc66c900225ba17bb1da8e9cdebb`; the
AAB SHA-256 is
`f153011a4966709763b9f5ddde814709ece45676abb83f38b710fdc6b5ab553a`; the
upload certificate SHA-256 is
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
Both artifacts, bundle structure, compiled privacy surface and the private
archive pass independent verification.

## Local and Pixel proof

The exact candidate passes the complete local technical regression, analyzer
with zero issues, Web/Wasm, loopback, Android build, signed APK/AAB lifecycle
and clean-checkout R10. R10 rebuilt from the detached exact HEAD and produced
byte-identical Android APKs with a clean final checkout.

The Pixel was updated in place from 2026090406 to 2026090407 without uninstall,
downgrade or data reset. Installed version, APK bytes and signing certificate
match the archive. Authenticated cold start, five main destinations and process
restart pass. The cart shows a real offline error rather than a false empty
state, exposes a separate accessible retry action, remains error while still
offline, recovers the server-confirmed renter cart after connectivity returns,
persists across process restart and stays isolated across owner→renter→owner.
The protected owner session is restored.

## Push and two-role product journey

FCM passes on the exact installed candidate for foreground, background and an
absent app process. Two controlled synthetic messages were sent in each phase.
No production push, contract, reservation or payment endpoint was used. A
private notification-shade capture confirms the ShareItToo brand icon. Because
that capture also contains unrelated private device notifications, it remains
owner-only outside Git, is not distributable, and only its SHA-256 is recorded
in sanitized evidence.

A fresh two-role product journey also passes on the Pixel with two distinct,
previously email-link-verified Staging principals: owner draft publication via
the app, server-confirmed active listing, public renter discovery, non-binding
request/acceptance presentation, chat visibility and same-process principal
isolation. The booking was then cancelled, the listing ended, and the original
owner role restored. Monetary effect is zero; no contract, reservation or
payment was created.

## GitHub proof

Regression run
`https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/33926131167`
passes at the exact candidate HEAD, including Flutter, backend, PostgreSQL and
clean-checkout reproducibility. The API-image publication job was skipped as
expected for the Draft PR and no deployment occurred. CodeQL run
`https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/33926131194`
passes at the same HEAD; open code-scanning alerts are zero. PR #7 remains
Draft, open, mergeable and unmerged.

## Retained legal hold and next work

The binding V5.2 fixture preflight still returns
`409 v52_contract_documents_unavailable`, matching the recorded draft-blocked
legal state. The failed preflight created no booking, contract, reservation or
payment; its unbooked synthetic listing was paused and verified non-public.
This is not a backend outage and must not be bypassed by inventing legal
approval. The separately authorized non-binding pilot path is what passed.

Next, close the highest-value remaining provider-independent Pixel surface
matrix through a candidate-generic maintained diagnostic entrypoint. The old
N28 runner is hard-bound to a historical candidate, so private successor
scripts must not become a permanent release prerequisite. After that, address
Stripe test mode, external listing AI and Store-installed/OnePlus verification
only under their exact provider and release gates. V5.2 binding flows remain
blocked until owner/legal approval exists.

Sanitized machine evidence:
`docs/evidence/release-readiness/wp05-pixel-0407-closure-20260905.json`.
