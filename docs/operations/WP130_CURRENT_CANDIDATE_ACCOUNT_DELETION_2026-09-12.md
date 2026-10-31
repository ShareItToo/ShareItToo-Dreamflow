# WP130 — Exact-current account deletion

## Result

WP130 is **complete** on the physical Pixel for the unchanged signed
Internal/Staging `com.shareittoo.app` `1.0.0+2026091201` candidate from source
`1546812f625b4e8f1e700bf976410097cd45ac2f`.

Only the private disposable account retained by WP129 was deleted. Before the
irreversible action, the tool bound the target vault, protected-owner vault,
candidate binary and owner-only recovery journal; independently proved both
credentials active; proved the target distinct from both protected accounts;
and required a clear Staging deletion preflight.

The Pixel then proved an intentionally wrong password received only the exact
structured rejection and left the target active. The correct product-UI action
confirmed deletion, independent Staging login rejected the deleted credential,
a terminated-process cold start showed Guest without either known principal,
and the original protected owner was restored. Only after this did the private
target vault lose its address and credential. The recovery journal is terminal
with `recoveryRequired=false` and target state `deleted`.

## Diagnostic ratchet

The protected vault had legitimately advanced to
`non-binding-simulation-retired` after a previously completed zero-money test.
The older deletion diagnostic did not recognize this status. WP130 adds only
that exact terminal status to the protected-owner source validation. It does
not trust the label alone: live credential/principal truth and successful probe
session revocation remain mandatory before deletion can be armed. A focused
test covers the new allowed state, while all drift, collision, ambiguous-error
and recovery checks remain fail closed. The older WP71 evidence validator now
checks its recorded diagnostic hash against the recorded historical commit
blob rather than a mutable current-worktree file; this preserves the original
evidence exactly while allowing reviewed later hardening.

## Portfolio and boundaries

The 32-area portfolio moves from **14 PASS / 10 PARTIAL / 8 OPEN** to
**15 PASS / 9 PARTIAL / 8 OPEN**. Only
`privacy-export-and-account-deletion` is promoted. WP129 supplies the retained
exact-candidate registration/recovery basis; WP130 supplies its deletion,
Guest cold-start and protected-owner restoration closure.

No app or Backend runtime changed. No listing, booking, message, payment,
money, Production, Google Play, tester list, Firebase project, deployment,
Cloud/VPS/DNS, OnePlus or PR-merge action occurred. No address, credential,
token, account identifier, private path or raw device identifier is committed.

Machine-readable evidence:
`docs/evidence/release-readiness/wp130-current-candidate-account-deletion-20260912.json`.
