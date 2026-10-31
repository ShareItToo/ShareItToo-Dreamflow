# 48H R3 Blue Ocean flow on the real Pixel

Status: **COMPLETE — DEVICE, REGRESSION AND CODEQL VERIFIED**

R3 verified the complete local Listing-AI review path on the authorized Pixel
7 Pro with canonical local-QA build `1.0.0+2026082404`, bound to implementation
commit `19fc3221bc3879788db9c48b70a89a33656116b6`. No listing was published.

## Exact non-live route

The device reached an ephemeral PostgreSQL 16 database and backend only through
ADB reverse to loopback `127.0.0.1:18080`. The harness generated one transient
synthetic account, used the deterministic mock Listing-AI provider with a
zero-cent budget, kept payment in memory and removed the session, database,
uploads, ADB reverse and device fixture during bounded cleanup.

The only selected image was the repository-owned synthetic
`store/assets/synthetic-listings/cordless-drill.png`, selected by its exact file
name through Android DocumentsUI. No private gallery image was selected or
analyzed. The local screening exception accepts only the known processed WebP
digest while the complete test boundary remains true; every other image fails
closed.

## Verified flow

The physical-device analysis produced a bearbeitable draft for
`Akku-Bohrschrauber`, Cat8 `Werkzeuge & Kleingeräte` / `Bohrmaschinen`, with two
clarification questions and no automatic publication. The first review safely
invalidated the price confirmation after filling the deterministic daily price.
After a fresh owner confirmation, the exact preview reached
`READY_TO_PUBLISH`:

- one day: owner rent 10.00 EUR, SIT contribution 1.00 EUR, renter total 11.00
  EUR;
- seven days: owner rent 49.00 EUR, SIT contribution 4.90 EUR, renter total
  53.90 EUR.

The explicit publication action was deliberately not executed.

The complete local technical regression passed in candidate-rollover CI
metadata mode: the permanent evidence validators, Backend and PostgreSQL
checks, 387 Flutter tests with one documented skip, the Google-only profile
test, Web/Wasm build and loopback smoke, and the 448-task Android debug build
all completed successfully. This mode did not build or publish a signed
candidate or API image.

## Device-found integrity correction

The real-device pass found that editing a field after READY initially left the
previous green readiness presentation visible. R3 did not accept that visual
state as final evidence. Commit `897ff5582b381d6bf6ee1b34a14cda78d4427da6`
now invalidates dependent confirmations, clarification answers and the final
publication confirmation. It also binds publication to a SHA-256 fingerprint
of the exact reviewed editable snapshot. Commit
`19fc3221bc3879788db9c48b70a89a33656116b6` makes the visible readiness derive
from that same current fingerprint.

On build `2026082404`, a deliberate model edit after READY reset both
clarifications, `item_identity` and `final_publication`, and visibly changed the
card to `NEEDS_REVIEW`. Re-answering and re-confirming restored READY only after
a new server review. The final update preserved the original install time and
app-data inode and used neither uninstall nor data reset.

## Boundary and continuation

R3 performed no production, cloud, Firebase, payment, Store, VPS, DNS, public
registration, pilot activation, external-provider, API-billing, real-money,
PR-merge or public-release action. Exact verification head
`40eb46c39b95ad54fa67b40fa54977bc0d034523` passed regression
`32730758489`, CodeQL workflow `32730758551` and CodeQL check `97442882988`
with zero open code-scanning alerts. The signable-candidate and publication
steps stayed skipped. The next package in the active 48H goal is
`R4_ANDROID_LIFECYCLE_FAILURE_MATRIX`; the older PF0–PF5 Pilot Freeze packages
already exist in verified repository history and are not repeated.
