# WP98 — Pixel Current-Candidate Update Preflight

## Scope

WP98 removes one historical diagnostic ambiguity before touching the Pixel.
The legacy generic Android preparation helper remains bound to the older
tracked device-validation record. The current-candidate update route instead
binds directly to `store/google-play/current-rollover-candidate.json`, then to
the owner-only four-file archive and its exact source commit.

The CLI now requires an explicit mode: `--preflight-only` performs the
read-only, data-preservation check; `--install` is required for the later
replace-install action. An omitted mode fails closed. This is a tooling safety
change, not an Android runtime or staging change.

## Read-only result

The connected Pixel passed the preflight for the exact Internal/Staging
candidate `1.0.0+2026091001` sourced from
`068c843a2660e2a4c44a1715f4f8e51a67b41d24`:

- its installed build is `1.0.0+2026090905`, so the candidate is strictly
  newer;
- package identity and signing relationship are verified;
- only a data-preserving replace install is eligible;
- no uninstall, reset, downgrade or unlock step is needed; and
- the later update must re-prove app-data identity, exact APK bytes, signature
  and foreground activity.

The preflight did not install, launch, stop, reset or inspect account content
on the Pixel. It contains no device identifier, account material, path or
signing digest. The machine-readable evidence is
`docs/evidence/release-readiness/wp98-pixel-current-candidate-update-preflight-20260910.json`.

## Verification and boundaries

- focused update-tool tests: 9/9 PASS;
- full standard tool inventory: 2,620/2,620 PASS;
- no timeout, parallelism or cache workaround was added;
- no Play, Staging, Firebase, provider, payment, Production, OnePlus or PR
  state changed.

The next WP98 action is the already-preflighted, explicitly invoked Pixel
replace-install, followed by a read-only installed-build/data-preservation
proof. It remains only an Android diagnostic update: it cannot make any claim
about the currently older Staging source until the separate authoritative
Staging proof and successor rollout path are closed.
