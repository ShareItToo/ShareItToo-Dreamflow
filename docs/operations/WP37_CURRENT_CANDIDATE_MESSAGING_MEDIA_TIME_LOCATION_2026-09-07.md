# WP37 current-candidate messaging, media, time and location

Status: **COMPLETE ON THE PHYSICAL PIXEL** for the exact current signed
candidate; local and GitHub technical proof is green.

## Provenance

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Signed candidate source:
  `2fd793bac970866aa94a2940f28d6bbc3e04e377`.
- Candidate: `com.shareittoo.app`, `1.0.0+2026090610`, Internal Staging.
- Candidate APK SHA-256:
  `07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`.
- Canonical upload-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Exact unchanged technical/docs baseline before the journey:
  `79dbffca5fb43756a6125856f80cfb6691ad57e0`.

The installed candidate, mobile runtime and backend were not changed. The
existing fail-closed physical runner was reused rather than renamed or copied;
its legacy internal WP21 output kind is wrapped here as current WP37 evidence.

## Physical Pixel result

One fresh isolated two-role journey passed on the physical Pixel 7 Pro:

- a repository-controlled synthetic image was selected through the physical
  Android picker;
- the server stored exactly one attachment message;
- owner and renter received the same participant projection;
- handover time was proposed by one role and confirmed by the counterparty;
- return time was proposed and counterparty-confirmed in the opposite role;
- the authoritative flow state confirmed both times with a sufficient
  monotonic revision;
- an exact location-share attempt before the authoritative reveal window was
  blocked by the server;
- the blocked attempt created no location message and showed persistent
  truthful feedback; and
- after force-stop and restart, attachment and both confirmed times were still
  visible from authoritative state.

Cleanup cancelled the isolated non-binding booking, ended the listing, removed
it from the public catalog, removed the synthetic device file and restored the
protected owner. An independent post-run inventory found zero active isolated
journeys. The protected source vault remained byte-, mode- and timestamp-
identical with SHA-256
`dc2bb6de55ac354624afe0260517796b67e6024d22d9179e5e0f7084cd336273`.

No account identity, credential, token, fixture identifier, raw device
identifier, real media or private location is retained in repository evidence.

## Technical proof

All 12 focused messaging/media/time/location checks and all 2,373 repository
tool tests pass. The secret scan reports the exact 23 reviewed historical
findings and no new high-confidence secret. No source changed after WP36's
complete local regression at diagnostic HEAD
`474d87339371d3f70b032dbc55fbd14c44413490`; that proof includes Flutter,
analyzer, Web/Wasm, loopback smoke, backend, PostgreSQL, Android minSdk 24 and
independent clean-checkout R10 with byte-identical double Android build.

GitHub Regression `34076566068` and CodeQL `34076566054` pass at exact baseline
HEAD `79dbffca5fb43756a6125856f80cfb6691ad57e0`; open code-scanning alerts are
zero. PR #7 remains Draft, open, mergeable and unmerged.

Repeating the unchanged local full build would add no coverage, so the focused
current physical lane plus the already exact unchanged full technical proof
were used. No cache, timeout, retry, timing or parallelism workaround was
introduced.

## Boundaries

WP37 did not contact OnePlus and did not change Google Play, Production,
tester lists, Firebase Console, provider configuration, backend deployment,
payment/KYC, public registration, Cloud/VPS/DNS or PR merge state. The journey
was explicitly non-binding: no contract, reservation, payment endpoint or
monetary effect occurred.

Machine-readable sanitized evidence:
`docs/evidence/release-readiness/wp37-current-candidate-messaging-media-time-location-20260907.json`.
