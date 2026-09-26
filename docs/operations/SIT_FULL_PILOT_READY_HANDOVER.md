# SIT closed-pilot candidate handover

Status: **TECHNICAL_CANDIDATE_READY / PLAY_INTERNAL_ACTIVE /
ONEPLUS_READ_ONLY_AND_ACCOUNT_ISOLATION_PASSED / PILOT_BLOCKED_LEGAL_GATE** on
02.09.2026.

## Frozen technical candidate

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Artifact source HEAD: `30cc73cee8f10915ad4447da4a2fa7ae928f7410`.
- Android: `com.shareittoo.app`, `1.0.0+2026090204`, compileSdk 36,
  minSdk 24 and targetSdk 36, with AGP 8.9.1.
- Scope: Google Play Internal testing, Staging API and private pilot
  `heilbronn_wave0` only.
- AAB SHA-256:
  `5d77d2526e66fee814aa45ad776b37b07ab21d33e91f1d38588c98fde14e01d9`.
- APK SHA-256:
  `75cb30237389937a008e82aaffb06f0b601ffa6e39e4b1cb4df15116222bfc2f`.
- Upload-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The signed release AAB and APK are stored in the private owner-only archive
`2026090204-30cc73cee8f10915ad4447da4a2fa7ae928f7410`. Package, version,
SDK identity, signing certificate, ZIP structure, Bundletool 1.18.1 validation
and binary privacy scan passed. No secret or tester identity is present in
repository evidence.

The complete local candidate-rollover regression passed. It includes the
repository tool inventory, Backend/PostgreSQL, Flutter (634 tests with three
documented skips), analyzer with zero issues, Web/Wasm, a real loopback smoke
and Android debug (448 tasks). A separate isolated checkout repeated the full
gate and produced byte-identical debug APKs. Its first attempt truthfully failed
when a rebuildable Gradle transform cache left insufficient disk space; after
that cache alone was removed, the unchanged deterministic run passed. No
timing, retry, rate-limit, parallelism or build-path workaround is retained.

The preceding PR CodeQL quality check reported three high-severity missing-rate-
limit findings. Runtime protection already existed through the
`createCoreRateLimiters` factory, and `/v1/planner/resolve` also had a dedicated
inline limiter, but CodeQL did not model the factory flow for the global
baseline. The candidate preserves the planner-specific 30-per-15-minute limiter
and exposes the global baseline directly as `app.use(rateLimit({...}))`. Permanent
structural and behavior regressions prove both layers and their ordering; the
complete local CodeQL contract suite passes. The final GitHub CodeQL readback
below remains the independent confirmation.

Artifact-source GitHub Regression `33590941669` and CodeQL `33590941491`
passed on exact HEAD `30cc73cee8f10915ad4447da4a2fa7ae928f7410`;
open code-scanning alerts are zero. PR #7 remains Draft, open, mergeable and
unmerged.

## Physical-device result and boundary

The exact Play-delivered `1.0.0+2026090204` candidate is now verified on a
physical OnePlus CPH2581 running Android 16/API 36. Package identity, four Play
splits, Play installer and the expected Play App Signing certificate matched.
Guest discovery reached a truthful empty state without the former loading
failure, survived a force-stop/fresh restart and produced no observed crash or
ANR.

Using only the private synthetic Staging roles, owner and renter login,
principal binding, authenticated profile, owner listing access, force-stop
session persistence and owner-to-guest-to-renter isolation passed. No owner
listing, owner navigation or stale owner success appeared under the renter,
and the device was returned to a confirmed guest state. No business data,
listing, booking, chat, payment, contract, Play or repository state was changed
by the device run.

This is deliberately a partial read-only matrix, not a full pilot pass. The
existing owner fixture is absent from the public catalog even though its
owner-visible state is active and its region/category/photo host are suitable.
The ordinary owner/public APIs cannot prove catalog version, moderation status
or both owner pilot-review fields, so no cause is guessed and no moderation or
legal gate is bypassed. The historical booking fixture also no longer matches
the vault-bound workflow state for either role and remains explicitly open.
The exact capture time was not recorded, so the evidence records it as unknown
rather than inventing precision.

The Pixel's last directly verified build remains `1.0.0+2026090203`; its
historical evidence does not transfer. Exact evidence for the OnePlus run is
`docs/evidence/release-readiness/oneplus-play-internal-2026090204-read-only.json`.

## Exact Staging state

Staging runs source checkout and API image
`shareittoo-api:941c59d78ad8005a3d29b5eefac8925ec86a8c71` with client-build
requirement `1.0.0+2026090203`. Health and readiness are green, and all 354
foreign-key constraints pass the deploy guard. Payment transport remains
in-memory with `livemode=false`; listing AI remains the local mock with no
external provider or billing. The deployment evidence is
`/docker/shareittoo/releases/staging-20260902T033333Z-941c59d78ad8.json`.
The 0204 delta is limited to Android target/compile SDK, Android build tooling,
the monotonically newer version and their release ratchets; the API contract is
unchanged, so no new VPS deployment is required for this candidate.

## Closed-pilot acceptance truth

B7-B10 now share one fail-closed acceptance contract: synthetic users must be
confirmed private users, listings use the pilot category `cat3/Kameras` and
Heilbronn, offers and acceptance carry the exact V5.2 declarations, and the
client build must match this candidate. The legal-readiness preflight runs
before any acceptance fixture can be created.

The preflight currently returns
`closed_pilot_v52_legal_snapshots_not_ready`; its proof leaves zero active B7
fixtures. Staging foreign-key integrity remains green after cleanup. The
pre-cleanup and post-cleanup database backups and restore proof are retained
under the private VPS backup path recorded in operations evidence.

## Authentic legal stop

`assets/legal/de/legal_manifest_v52.json` is still `draft-blocked`, has no
effective date and explicitly sets `activationAllowed=false`. Its nine user
documents have no approved public or download URLs and the manifest lists 21
open operator/provider facts. The P0B review intake is
`prepared-awaiting-independent-professional-review`, with
`professionallyReviewed=false` and no permission to claim professional
approval.

Accordingly, the nine V5.2 contract snapshots must not be provisioned and no
booking acceptance, public registration or real-money path may be presented as
ready. Google Play Internal distribution may exercise only the already
fail-closed non-binding surfaces. This is an external professional
legal gate, not a technical failure and not a gate that Codex may fabricate or
self-approve.

## Play and repository boundaries

Build `2026090203` was uploaded and processed, but Play rejected its target API
35 after the 31.08.2026 deadline. Its unpublishable draft was discarded and it
must not be activated. Build `2026090204` is the exact API-36 replacement. It
was uploaded only to Google Play Internal testing, processed without validation
errors and activated as `1.0.0-internal-2026090204`. Direct post-release
readback reports `Available to internal testers`; the tester list remains at
two entries. Production and Open testing remain unavailable, Closed Alpha
remains on `2026081506`, and Store metadata and all tester settings remain
unchanged. Completion evidence is
`store/google-play/google-play-internal-release-2026090204-completion.json`.

PR #7 remains Draft and unmerged. No Production, Firebase, public Cloud,
payment, DNS, public Store, external listing-AI provider or account mutation is
part of this closure.

## Required gate to continue the real pilot

1. Diagnose the existing synthetic listing's hidden catalog eligibility through
   an authorized read-only operator view; do not alter moderation or legal state.
2. Reconcile or replace the stale isolated booking fixture only through a
   dedicated synthetic Staging lifecycle with deterministic cleanup.
3. Obtain independent professional V5.2 review and approval evidence.
4. Resolve the open operator, provider, PSP, privacy and retention facts.
5. Produce an effective approved manifest with final document hashes and
   explicit authorization to provision its snapshots on Staging.
6. Provision only those approved snapshots, then rerun B7-B10 and the complete
   authenticated physical-device pilot matrix.

Machine evidence:
`docs/evidence/release-readiness/full-pilot-candidate-2026090204.json`.

## Final assessment

The code, Staging API and signed API-36 Android artifact are prepared as far as
technically and safely possible. The current classification remains
**PILOT_READY=PARTIAL**: technical candidate readiness, Internal distribution
and the bounded exact-build OnePlus read-only/account-isolation matrix are
proven. Public-catalog fixture eligibility, the stale synthetic booking context,
the full binding device matrix and the independent professional V5.2 gate remain
open.
