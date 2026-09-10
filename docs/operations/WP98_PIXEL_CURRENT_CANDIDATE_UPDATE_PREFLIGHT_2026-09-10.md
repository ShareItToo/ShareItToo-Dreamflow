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

## Update and session result

The explicitly invoked replace update then installed the exact candidate and
re-proved all fail-closed preservation facts: installed package/version, APK
bytes and signing relationship match the verified archive; first-install time
and app-data inode are unchanged; the app became the foreground activity.

The existing authenticated session then passed two force-stop/cold-start
cycles while online and the same two cycles after a verified no-connectivity
condition. Wi-Fi and mobile-data state were restored and verified online
afterward. Neither diagnostic records account identity or content, and neither
logged in, logged out or mutated an account.

## Verification and boundaries

- focused update-tool tests: 9/9 PASS;
- full standard tool inventory: 2,620/2,620 PASS;
- no timeout, parallelism or cache workaround was added;
- no Play, Staging, Firebase, provider, payment, Production, OnePlus or PR
  state changed.

The WP98 device-update scope is complete. It remains Android diagnostic
evidence only: it cannot make any claim about the currently older Staging
source until the separate authoritative Staging proof and successor rollout
path are closed. The installed direct APK is not Google Play delivery evidence.
