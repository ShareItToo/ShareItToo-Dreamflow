# N29 — owner-ready SMS retry and cold-restart checkpoint

Status: **PARTIAL — BACKEND / COLD RESTART / CLEANUP PASS; DIRECT DIALOG OPEN**.

Verified checkout `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`,
branch `codex/master-workflow-20260808`, inspected HEAD
`56d9c027e1741a0f17752882e3691cedb804caef`. Only documentation was dirty.
Frozen physical-Pixel APK remains `1.0.0+2026090307`, source
`77d5103cb3c89af3ca5187a6c2642e28fa0703dd`, hash
`821a60f7d45fdabaec81434eda39b61c3700e640761cdc53d180467218299ad4`, certificate
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
Each diagnostic validates the archive, installed package/hash and unchanged
mobile-source relationship. No OnePlus access, installation or new build.

## Actual owner-assisted result

1. Owner explicitly declared immediate SMS availability. The first attempt
   ended on a bounded ADB command failure. Read-only UI showed the empty phone
   field and no SMS dialog; no send was confirmed from that attempt. The next
   invocation added sanitized command-kind/timing tracing without changing
   the diagnostic behavior or timeouts.
2. Request phase passed with `awaiting-owner-sms-code`: explicit SMS consent,
   one new challenge, invalid-code rejection, exact candidate and protected
   owner retention. A prior code was not reused and no resend loop was run.
3. Owner supplied the fresh code. The input was later compared in memory with
   the supplied code: exact equality, six characters, not the invalid probe.
   Confirmation diagnostic returned `not safely accepted` because the previous
   `SMS-Code prüfen` label was still visible. That is not proof of rejection.
4. Independent authenticated `/auth/me` readback proved the exact expected
   phone and `phoneVerified: true`, with email still verified. Its diagnostic
   session was revoked. Thus the owner code succeeded server-side.
5. Observe phase restored the protected owner, read verified phone state,
   force-stopped the app, relaunched and read verified phone state again:
   `passed-valid-code-and-cold-restart`. This proves persisted status, not the
   original confirmation sheet's completion or success-message navigation.
6. Cleanup required the exact verified phone before mutating it to null.
   Mutation response, independent readback and restored Pixel UI all confirmed
   phone cleared/unverified, with the protected owner retained. Diagnostic
   sessions were revoked. Private transient phone/code files were deleted.

Private phase state hashes (canonical diagnostic JSON, not raw file bytes):

| Phase | Capture start UTC | State SHA-256 |
| --- | --- | --- |
| request | 2026-09-03T20:43:22.379Z | `58650992aaa833f1b381315730af46023c6a4164a9ae82149710d48f73aa0c51` |
| observe | 2026-09-03T20:48:42.859Z | `9cce69099a7eb8834ccc871110c06131c21a7c3b445eace3a975535328c9b527` |
| cleanup | 2026-09-03T20:50:28.658Z | `c93e28d97b9cd8bd3f2afc8c03e3caf27a2d155486774e74779f24079b3bf5a0` |

Capture timestamps are phase start times, not inferred delivery/completion
timestamps. Private evidence stays in the build-specific N29 QA directory.
No phone, code, email, credentials, device identifier or token in this report.

## Proven local gap and bounded next step

`ContactDataScreen` sets `verifying = true` without clearing the preceding
inline rejection. A local network-free widget probe performs invalid-code
rejection, begins a second delayed confirmation, and observes the old error
while that second attempt is pending. Its assertion fails as expected; after
the mocked success completes the sheet does close correctly. This proves stale
retry display, NOT the entire cause of the physical sheet behavior.

The diagnostic's confirmation predicate also accepts an unchanged previous
`SMS-Code prüfen` label as a current-attempt result. That can terminate polling
before the current outcome; the observed Backend result above must take
precedence over that diagnostic's generic failure. Preserve typed confirmed,
unknown and rejected states; no retry of an already confirmed mutation.

Next: maintain deterministic invalid-to-pending-to-success/rejection tests,
clear only the current attempt's stale display, verify action/epoch/route
ownership, and make diagnostic observation attempt-specific. Keep the frozen
candidate and evidence unchanged; mobile changes require a new separately
verified candidate and affected Pixel checks. Direct dialog completion remains
OPEN until actually observed. Do not mark WP01 or the encompassing Goal complete.

The initial ADB command failure remains an unresolved local diagnostic debt;
a traced retry is not deterministic release readiness. Existing host-capacity
and Kotlin-metadata debt remain separate. No production, provider, Firebase,
Store, billing, payment, KYC, real-money or PR-merge action occurred.
