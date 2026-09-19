# R17 owner gate — possible historical secret in PR #7

Status: **OWNER ACTION REQUIRED — NO CREDENTIAL VALUE INSPECTED**

GitGuardian reports one possible secret in the 250-commit history it scanned
for Draft PR #7. The tracked-tree secret scan, CodeQL and current PR
code-scanning alert list are green, but they cannot prove that a historical
credential is false, revoked or harmless. The repository is public. This P0
gate therefore remains open even though all independent R17 work continues.

## Exact private owner action

1. Sign in to the existing GitGuardian workspace through its normal supported
   account flow and open the failing PR #7 check.
2. Review the detector, commit and affected credential only inside the private
   GitGuardian/provider interfaces. Do not paste the value into Codex, chat,
   Git, screenshots, reports or Drive.
3. Classify it as exactly one of:
   `real-revoked-or-rotated` or `false-positive-closed`.
4. If real or uncertain, revoke/rotate it at the issuing provider first and
   verify that the old credential is unusable. Do not create a paid service or
   broaden permissions merely to close this gate.
5. Resolve the GitGuardian incident with a short sanitized reason. Record only
   the check/incident reference, classification and UTC completion time.
6. Re-run the GitGuardian PR check. It must succeed before any build, upload,
   human pilot or PR merge gate may be granted.

The exact completion token is:

`R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE`

That token is valid only together with a successful current GitGuardian check
and the sanitized classification record. It does not authorize a history
rewrite, build, upload, pilot, merge, Production or provider change. If the
credential cannot be safely invalidated without rewriting public history,
stop and create a separate owner-reviewed remediation goal; this R0-R17 goal
forbids rebase, force-push and history rewriting.

No history rewrite is authorized by this gate.
