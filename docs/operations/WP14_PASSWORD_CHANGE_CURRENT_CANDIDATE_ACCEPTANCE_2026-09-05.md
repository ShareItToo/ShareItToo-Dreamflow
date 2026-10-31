# WP14 — password change current-candidate acceptance

Status: **COMPLETE** for the direct password-change, cold-start and
Account-A-to-B isolation path on the exact frozen Pixel Staging candidate.
All credentials and private account values remain outside Git.

## Exact candidate and final physical result

The installed Pixel 7 Pro package is exactly `com.shareittoo.app`
`1.0.0+2026090503`, frozen at source
`96b97b55983111d9e0ae8d8fcc91e9e241a2cb6f`. The archive APK SHA-256 is
`ff9f0527c73cc7ba7abf31c1fa478c061f292e7b7cd485500959dfe12205ef57`
and its signing-certificate SHA-256 is
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The final owner-only journal proves this exact sequence:

- original credential accepted before mutation and its probe session revoked;
- empty current/new/confirmation form reached on the exact installed build;
- definite in-app `Passwort geändert` result shown;
- local invoking session definitely cleared;
- old credential exactly rejected and replacement credential exactly accepted;
- replacement login survives a terminated-process cold start;
- Account A to protected Account B isolation passes;
- original credential is independently restored;
- protected owner session is restored on the Pixel; and
- every diagnostic login session is revoked.

The final journal is mode `0600`, status `original-password-restored`, has no
remaining rollback requirement or replacement credential, and SHA-256
`d78ccd28294762055a4de9d26bd69f0bd402cebeb39e15493cf478b510122ef1`.

## Retained red-first findings and correction

The failed attempts are retained rather than relabelled as passes:

1. Android exposed password-field labels as input hints. The first diagnostic
   reached the real screen but failed safe because it required text nodes.
2. The success UI is an auto-closing two-second toast. The second attempt
   changed and then safely restored the password because the driver expected a
   nonexistent `OK` action.
3. The login E-mail field also uses an Android hint. After correcting it, a
   single transient credential probe was inconclusive. The journal stayed
   armed; an independent retry proved the original credential without another
   mutation.

Implementation commit `a690d70607c0fff9beacecd055f984dc0a806642`
therefore adds exact hint-aware form/login recognition, optional success
dismissal, bounded retries only for unknown transport outcomes, fewer
unnecessary invalid-credential probes, expected-new-credential-first ordering
while armed, and an invariant that protected-owner restoration is attempted
even if rollback truth remains unresolved. No runtime application code changed.

Twenty-one focused diagnostic/rollback tests and the complete local technical
regression pass. Exact clean R10 at the implementation commit took 644 seconds
for the complete gate plus 31 seconds for the second Android build. Both
231,344,391-byte APKs are byte-identical with SHA-256
`2f559b06c8356d989d80ecf046f4e7d6c65b5da7e1a944a2271df40dea6c690e`;
all 794 entries match. Private R10 report SHA-256:
`6056588d38bf2cfbbee7f7bce889ad6392d9e1fb610fd5b47835a602c204eb9e`.

GitHub Regression run `33967578790` passes all four required jobs, including
its independent clean R10; API image publication is correctly skipped. CodeQL
run `33967578777` passes with zero open alerts. PR #7 remains Draft, open,
mergeable and unmerged.

No Firebase/provider setting, deployment, Play track, Stripe/payment,
production, OnePlus or PR-merge state changed. This closes direct password
change only; historical password recovery evidence and other authentication
providers retain their own candidate bindings.

Sanitized structured evidence:
`docs/evidence/release-readiness/wp14-password-change-current-candidate-acceptance-20260905.json`.
