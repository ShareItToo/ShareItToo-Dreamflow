# PF16 current-candidate read-only physical regression

## Scope and source binding

PF16 verifies only the already signed and directly installed internal Staging
candidate `1.0.0+2026082302` from commit
`1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b`. The diagnostic refuses candidate
drift and validates the owner-only private archive plus the installed APK hash
before accepting physical evidence. It does not build, sign, install, upload or
distribute another candidate.

The sanitized evidence is
`docs/evidence/external-gates/current-candidate-read-only-regression-2026082302.json`.
It records a Pixel 7 Pro physical pass for:

- data-preserving process restart;
- two authenticated cold-start cycles using the already present session;
- offline cold start followed by verified online restoration;
- all five primary navigation surfaces;
- technical reachability of all seven legal routes; and
- all five primary navigation surfaces at Android font scale `2.0`, followed by
  exact restoration of the previous `0.85` setting.

The read-only pass does not equal a human layout review, substantive legal
approval, manual TalkBack traversal, a complete device matrix or Google Play
distribution. Those release-gate fields remain false.

## Safe execution

With the exact PF14B archive available and one authorized physical Android
device connected:

```bash
node tool/diagnose_pf16_current_candidate_read_only.mjs
node tool/validate_pf16_current_candidate_read_only.mjs
```

The diagnostic has no login, logout, install, account, cart, booking, message,
support, withdrawal, payment, Store, production, provider or public mutation
path. It retains no screenshot, raw hierarchy, account identity, raw device
identifier, network identifier or private filesystem path. It restores network
and font settings in the underlying bounded diagnostics even after failure.

The permanent validator rejects candidate drift, missing flows, incomplete
offline or font restoration, any manual/Store/Stage-A overclaim and private
identifiers. CI may validate only the committed sanitized metadata with
`CI=true` and `--ci-metadata-only`; that mode never claims a new device or Store
pass.

## Release interpretation

PF16 expands the exact installed candidate's technical physical coverage while
leaving the release decision `hold-no-go`. Private Google Play distribution,
closed-testing observation, protected review access, human visual review,
manual TalkBack traversal, professional Legal/Privacy review and explicit Stage
A authorization remain separate external gates.
