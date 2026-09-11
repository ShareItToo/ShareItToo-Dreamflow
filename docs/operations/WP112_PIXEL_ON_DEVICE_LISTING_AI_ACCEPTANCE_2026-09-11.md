# WP112 — Physical Pixel on-device Listing-AI acceptance

## Result

The exact signed Internal/Staging candidate `com.shareittoo.app`
`1.0.0+2026091109`, source
`5d8b89c82926a9f0a28627a7f36d26a88a9574fe`, passes a real image-analysis
journey on the physical Pixel 7 Pro. The exact committed runner source is
`d25b34d743c04ee5a060c1d31c3c5127416ccd03`.

The user explicitly selected one repository-controlled synthetic cordless-drill
image and accepted the shipped on-device disclosure. Android ML Kit completed
on the physical phone. The shipped UI returned a writable draft with non-empty
title, category, subcategory, description, project-tag and use-case suggestions.
All suggestions remained marked for owner review and no final confirmation was
inferred.

## Independent Staging proof

A read-only PostgreSQL observation immediately after the exact committed run
found exactly one new draft in the bounded run window. It proved:

- status `editing`, revision `1`, exact disclosure version and consumed image
  preflight;
- one stored version with non-empty title, category and description;
- every owner-confirmation flag still `false`;
- provider `on_device`, exact bundled ML Kit/rules model and successful outcome;
- zero input units, zero output units, zero estimated cost and zero billed cost;
- one exact generation audit entry with `autoPublishAllowed=false`;
- no publication receipt.

The fresh protected-runtime readback bound the run to Staging Backend
`cbe62931b79964465f2d3956afd3f698dd4c6dea`, immutable image digest
`sha256:ac550be1b11d50323e75bd7d0967e2003ed92d5e0f30a05491a7c2123d783fb9`
and zero restarts. It independently confirmed provider `on_device`, model
`mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1`, budget `0`,
external execution `0`, memory payment and Stripe livemode `false`.

## Privacy and cleanup

The runner hashes the controlled image before transfer and requires it to be
the unique newest Android media row before selecting the first photo-picker
tile. It never reads, records or prints another gallery item. After the result,
the selected thumbnail and local recovery state were cleared, the exact
temporary MediaStore row and file were removed, and the protected owner session
was restored. The server retains only the non-public, revisioned draft and
append-only audit/cost truth required by the existing evidence model.

No listing, booking, contract, reservation, payment, Google Play, Firebase,
Production, OnePlus or public-registration change occurred.

## Measurement corrections retained

Two pre-closure automation attempts failed safely and are not acceptance
evidence. The first expected every chip in one scroll viewport; the retained
runner now accumulates a bounded set of read-only UI sections. The second used
the forward scroll direction during cleanup; the retained runner uses the
explicit reverse direction and requires both local-recovery and exact-media
cleanup before PASS. Neither correction retries an app mutation, relaxes a
product timeout or creates a permanent timing prerequisite.

## Verification

- Six focused runner tests cover exact photo selection, no private media in
  output, meaningful draft semantics, full success, server fail-closed behavior
  and cleanup fail-closed behavior.
- Machine-readable physical and server evidence is retained at
  `docs/evidence/release-readiness/wp112-pixel-on-device-listing-ai-20260911.json`.
- The WP112 evidence validator binds the evidence to the exact runner, focused
  test and controlled image hashes.
- Full local regression and exact-head GitHub Regression/CodeQL are recorded in
  the final closure update after the evidence commit.

## Remaining scope

WP112 closes the real image-analysis gap for the existing candidate. It does
not make the draft a public listing and does not change the prior WP110
owner/renter result. Binding V5.2 workflows, Stripe sandbox payment/refund and
simulated payout, plus a separate current-candidate OnePlus/two-device replay,
remain independently gated and unclaimed.
