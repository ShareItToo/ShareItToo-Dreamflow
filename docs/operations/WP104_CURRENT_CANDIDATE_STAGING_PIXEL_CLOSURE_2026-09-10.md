# WP104 — Current-Candidate Staging and Pixel Closure

## Outcome

WP104 installs and proves the exact private Android candidate
`1.0.0+2026091002` on the Pixel 7 Pro, deploys the current committed Backend to
Staging through its immutable GitHub-published image, and completes the
payment-free email-verified two-role product journey. The package closes with
the owner session restored, the test booking cancelled, the test listing ended
and the public Staging catalog empty.

## Exact bindings

- Candidate source: `fdcfd1dc782c9f9dd3cb766d566abf7363a76cc5`
- Candidate APK SHA-256:
  `d0ac7a80232536a4c2f5e1d659b8b9ba4f973581f816142dc6419931742c3637`
- Evidence and deployed Backend base:
  `8916aa17fcb2f98d78a49314902a6fd0fcd0e75b`
- Deployed image digest:
  `sha256:c04799225c6af5e8de006b2ceefdb01b765ac9379e21c68fc3ff56ad6ae2900d`
- GitHub Regression and image publication: `34517352749`, success
- CodeQL: `34508316570`, success
- PR #7 remains Draft, open, mergeable and unmerged; current PR-head and
  PR-merge code-scanning alerts are zero.

The complete local candidate-rollover regression also passes, including the
entire repository tool-test inventory, zero analyzer findings, Flutter tests,
Web/Wasm, loopback smoke and Android build reach. The first standard-profile
invocation stopped at its intended Store-manifest rollover guard and was not
misclassified as a product failure or retained as a workaround.

The candidate guard proves that no mobile runtime path changed between the
candidate source and the evidence base. The direct APK install is therefore
exact candidate evidence, but it is not Google Play split-delivery evidence.

## Staging rollout and readback

GitHub built and published the exact commit-labelled API image only after
Flutter, Backend, PostgreSQL and clean-checkout reproducibility all passed.
Staging then moved from `926a00c5fa7f6595069aed12119d2dde90935bc3` to
`8916aa17fcb2f98d78a49314902a6fd0fcd0e75b` through the repository release
script with automatic rollback retained.

Independent readback confirms healthy API and database containers, zero
restarts, all 361 foreign-key constraints, exact image/runtime/release binding,
five persistent Compose files and protected environment/runtime-override
metadata. The archive extraction initially left the new Backend directory at
mode `0775`. Only group and other write bits inside the new checkout were
removed; the final mode is `0755`, no checkout entry remains group- or
other-writable, and the persistent-source inspector then passed. No tracked
content or credential content changed.

Staging intentionally retains FCM and SMTP. Payment remains memory-only with
Stripe live mode false. Listing AI remains the zero-budget mock with external
execution disabled. Two noncritical Support follow-up deadlines remain
overdue; they do not affect API or database health.

## Physical Pixel proof

The Pixel received the exact APK by a data-preserving replace update. Package,
version, APK bytes, signature relationship, first-install identity and app-data
identity passed. Three cold starts and all five main navigation destinations
passed. Nine account/privacy/support surfaces and seven legal routes passed
read-only. All five destinations passed at 200-percent text with the original
system value restored. System light/dark plus all five background choices
passed private capture and exact restoration, leaving the normal Explore
surface visible.

The complete two-role journey used two previously email-confirmed, distinct
test principals. The owner published a synthetic draft through the Pixel UI;
the server and public Staging catalog independently confirmed it. The renter
saw the listing, the non-binding request and acceptance passed, the renter saw
the chat, and switching roles proved that owner state was absent under the
renter principal. FCM passed in foreground, background and after process
termination. The private notification-shade capture is retained outside Git;
its icon still requires a visual review.

The journey then cancelled its test booking, ended its listing, restored the
protected owner session and independently confirmed an empty public catalog.
It created no contract, reservation or payment and had zero monetary effect.

## Legal and provider truth

An initial binding fixture correctly stopped at structured
`409 v52_contract_documents_unavailable`; its unbooked listing cleanup passed.
The package did not bypass that professional legal gate. Instead it used the
purpose-built non-binding Staging simulation, which cannot create a contract,
reservation or payment.

The remaining external gates are unchanged: professionally approved V5.2
document snapshots, external Listing-AI selection, Stripe/live-payment
activation, Google Play delivery of this exact candidate and an exact OnePlus
run. Production, Firebase Console, Google Play, tester lists, public
registration and PR merge were not changed.

Machine-readable evidence is in
`docs/evidence/release-readiness/wp104-current-candidate-staging-pixel-closure-20260910.json`.
