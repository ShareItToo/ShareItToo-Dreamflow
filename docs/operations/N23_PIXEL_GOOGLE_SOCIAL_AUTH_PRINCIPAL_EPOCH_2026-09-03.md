# N23 Pixel Google social-auth and principal/epoch closure

Status: **PIXEL GOOGLE LOGIN, COLD START, REPEAT LOGIN, PRINCIPAL/EPOCH
CONTAINMENT AND PROTECTED-OWNER RESTORE PASSED / LIVE GATES CLOSED** on
03.09.2026.

The exact signed Internal/Staging direct-APK candidate `com.shareittoo.app`
`1.0.0+2026090306` was built from
`9d7e2601dc477cf3ae3d469b65448ce2065375e0` and installed in place on the
physical Pixel without clearing app data. The APK SHA-256 is
`37d98f999562150e77fea335fcb0bde32aee20d2183509f5484a5e67cd1e3194`;
the AAB SHA-256 is
`0724435cf212fcad167942c828a8869359d312fa00e82a1d35afc8b74551f4f6`.
Canonical signing, Firebase configuration and the binary privacy scan passed.
Google was enabled; Apple and Facebook remained disabled.

The exact private Google account was selected on the Pixel without recording
its address. First login, force-stop/cold-start persistence and a second login
all resolved to the same Staging profile fingerprint. No duplicate account was
observed. The test does not claim whether the backend created a new profile or
linked an existing one. The protected synthetic owner session was restored.
Private UI evidence remains outside Git and only its digest is recorded.

Commit `65bbbae1f1377ca39d9b6c4fd5d146ee3d312d6d` introduces a single remote
authentication transaction for email and social entry. Principal and action
epoch are captured before the first `await`; they are rechecked after provider
selection, immediately before and after the remote exchange, and against the
exact persisted session before UI feedback or navigation. A stale remote
session is revoked best effort, a failed persistence revokes the issued remote
session, and stale local cleanup can remove only the exact session it owns.
`principalChanged` remains a typed result and is not collapsed by the screen's
generic catch. Ten focused Flutter tests hold this invariant.

The first candidate regression runs failed only because the build-number
ratchet updated two privacy source bindings sequentially while retaining the
intermediate privacy-manifest digest. The symptom was
`repository_source_drift:store/privacy-disclosures.json`. Commit
`cac20555ba580f56813bfc74e15350113241eeda` binds the final manifest digest
and refreshes every dependent inventory through RW20. It changes no privacy
semantics, provider decision or gate, and retains no workaround.

On the exact repair HEAD, complete local regression passes 2,093 repository
tool tests with no skips, 652 Flutter tests plus one existing documented
profile skip, analyzer zero, Web/Wasm, loopback smoke and the Android debug
build. GitHub Regression `33737790776` and clean-checkout reproducibility pass; CodeQL
`33737790875` passes and open code-scanning alerts remain zero. PR #7 remains
Draft, open and unmerged.

The exact worktree is
`/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808` on branch
`codex/master-workflow-20260808`. No deployment, Play, Production, public
registration, tester-list, Firebase-console, payment, external AI, Cloud/VPS,
DNS, OnePlus or PR-merge change occurred. Payment remains memory-only with
`livemode=false`; listing AI remains mock with zero provider budget.

Open after N23 are phone/KYC, Stripe sandbox, external listing AI and V5.2
owner approval. Google sign-in is closed on the physical Pixel.
