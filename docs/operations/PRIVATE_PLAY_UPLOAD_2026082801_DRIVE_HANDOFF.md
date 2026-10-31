# Private Play Internal transfer 2026082801 — Drive handoff

Status: **PRIVATE TRANSFER READY — STORE UPLOAD PENDING** on 30.08.2026.

## Purpose and exact candidate

The signed guest-discovery correction remains bound to package
`com.shareittoo.app`, version `1.0.0+2026082801`, artifact-source commit
`135fa726aaa7192bd57b729a5e3becbdeeeb9bee` and Google Play `Internal
testing` only. The original AAB is `108626931` bytes with SHA-256
`56f17ee5a788db69c6099cab4a9d648b28e2eeca7dd9c6e162d7247bce0067da`.
Its upload-certificate SHA-256 is
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The candidate remains Staging-bound to
`https://staging.shareittoo.com/api/v1`. This handoff creates no new build and
does not alter signing, Firebase, provider or runtime configuration.

## Private transport

The connected owner Drive contains the private, non-shared folder
`PRIVATE_PLAY_UPLOAD_2026082801` beneath the private SIT folder. Readback on
30.08.2026 confirmed seven expected, downloadable files and no sharing.
Account, tester, permission-grantee, Drive file ID and private URL data are
intentionally excluded from repository evidence.

The direct whole-AAB connector transfer was rejected before Drive action
because `108626931` bytes exceed the connector's `100 MiB` limit. The exact
local AAB was therefore split without rebuilding it:

- `part-00`: `60000000` bytes; SHA-256
  `78f8d3cb8882ee915decfc591ce54ac4eb7ea7c1086f2b58beaed1e65427e9c7`.
- `part-01`: `48626931` bytes; SHA-256
  `b6c74dbff15f64f23774c491d7d72edee5c252b38a3cd78ad9a1af4d98e97137`.

The folder additionally contains the exact reassembly instructions, candidate
manifest, machine evidence, human handover and German Internal release notes.
Drive readback confirms the expected names and sizes. End-to-end transport
integrity remains deliberately open until the MacBook downloads both parts,
reassembles the AAB and confirms the full size and SHA-256 before any Store
upload.

## Repository verification

Artifact-source Regression `33208564193` and CodeQL `33208564198` are green.
The later repository evidence head
`dedc98f8537433751d3eaa0390b4f0f68e71f269` passed exact-SHA Regression
`33211188454`, including the clean-checkout proof, and CodeQL `33211188457`.
Open code-scanning alerts remain zero. PR #7 is still Draft, open, clean and
unmerged.

## Store truth and next action

The last direct Console observation on 28.08.2026 still showed Internal
versionCode `2026082601` active. Upload of `2026082801` did not occur from the
Mac mini because Chrome rejected the local file handoff. An empty Internal
draft may remain from that attempt; it is not evidence of an uploaded bundle.
No current Console state is inferred from the later Drive transfer.

The next consumer must:

1. download and reassemble both parts on the MacBook;
2. verify full size `108626931` and SHA-256
   `56f17ee5a788db69c6099cab4a9d648b28e2eeca7dd9c6e162d7247bce0067da`;
3. perform the authenticated read-only Play gate;
4. upload and activate only this exact hash in `Internal testing` under the
   existing owner authorization; and
5. read back the final Internal state before the OnePlus update/test.

No tester-list, Production, Open testing, Closed testing, Store metadata, Data
Safety, review submission, public release, Firebase, payment, provider,
Cloud/VPS/DNS, PR merge or device action is part of this documentation package.

Machine evidence:
`docs/evidence/release-readiness/private-play-upload-2026082801-drive-handoff.json`.
