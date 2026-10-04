# WP45 — current-candidate acceptance convergence

Status: **COMPLETE CHECKPOINT; PIXEL ACCEPTANCE REMAINS PARTIAL**.

## Frozen truth

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Checkpoint base: `0397f01df283f9191d26c741255af3dd0c68c143`.
- Installed Pixel candidate source:
  `2fd793bac970866aa94a2940f28d6bbc3e04e377`.
- Candidate: `com.shareittoo.app` `1.0.0+2026090610`, Internal Staging.
- APK SHA-256:
  `07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`.
- Canonical signing-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

No mobile runtime source changed after the candidate. Current repository source
does contain the WP40 Backend active-session bound added after that candidate;
it is tested but not deployed. The read-only Staging readiness response is
bound to deployed Backend commit
`68c97a437969dc98f17eb151da3e006259ffbafa`, not to the repository HEAD.

`DONE` below means physical proof on exact candidate `2026090610` or exact-head
technical proof that does not require a device. `PARTIAL` means the current
candidate has narrower proof but one named acceptance condition remains.
`OPEN` means no authentic current proof exists or an external gate is closed.
Older evidence is never promoted merely because the affected code appears
unchanged.

## Converged portfolio

| Acceptance area | State | Exact evidence or remaining condition |
| --- | --- | --- |
| Candidate identity, signature and Pixel installation | DONE | WP35 binds package, version, source, APK/AAB, certificate, Firebase Staging profile and data-preserving Pixel update. |
| Local/GitHub regression, clean reproducibility and security | DONE | WP44 closure HEAD `0397f01d…` has local full regression, GitHub Regression `34116781300`, CodeQL `34116781330`, independent clean checkout and zero open alerts. |
| Two-role publish, discover, non-binding request, FCM and chat | DONE | WP35 completes the exact former message-refresh failure lane and cleanup. |
| Listing draft/edit/publish/pause/reactivate/end | DONE | WP36 completes the exact physical lifecycle and cleanup. |
| Search, category, details, saved items and isolation | DONE | WP36 completes search, restart persistence, A-to-B isolation and cleanup. |
| Cart and projects | DONE | WP36 proves idempotent cart intent, project create/assign, restart/isolation and cleanup without reservation. |
| Attachment and appointment proposals | DONE | WP37 proves exact-once synthetic attachment plus two-sided handover/return proposal confirmation and restart persistence. |
| E-mail registration, verification, login and recovery | DONE | WP44 proves fresh registration, single-use verification, reset, old/new credential truth, cold starts and cleanup. |
| Google sign-in and authenticated online/offline persistence | DONE | WP38 proves first/repeat Google login, common profile truth and online/offline cold starts. |
| Password change, session controls and account deletion | DONE | WP40, WP41 and WP43 prove reversible password change, remote revoke/logout-all, server-confirmed session truth and deletion. |
| Account and Help/Support entry surfaces | DONE | WP39 reaches all nine account destinations, Help Center and support-contact entry without mutation. |
| Themes, large text, touch targets and restart resilience | DONE | WP42 proves five themes, 200-percent text, 48-dp primary targets, legal surfaces and restoration. |
| Notification delivery states and icon | DONE | WP35 proves controlled FCM foreground/background/terminated delivery and private icon review. |
| Listing AI safe mock contract | DONE | Readiness keeps mock provider, zero budget, no external execution and no automatic publication. |
| SMS verification on exact candidate | PARTIAL | Valid German SMS and cold restart exist on signed `2026090606`; exact `2026090610` UI completion and cleanup require a fresh owner-visible OTP. |
| Android runtime-permission lifecycle | PARTIAL | Individual picker, notification and location-related paths have evidence, but no consolidated exact-candidate deny/allow/settings/restart/restoration matrix exists. |
| Manual TalkBack traversal | OPEN | WP42 proves system-service activation cannot establish touch exploration on this Pixel runtime; no traversal or app-defect claim exists. |
| Positive exact-address reveal | OPEN | WP37 proves the server blocks premature reveal; the authorized positive reveal window has not been physically observed. |
| Current-candidate support intake and staff follow-up | PARTIAL | Entry/read surfaces and older intake evidence exist; exact-candidate submission plus authorized staff/DSA follow-up remain absent. |
| Support deadline operations | OPEN | Readiness is HTTP 503 solely because one noncritical active case has overdue `next_update_at`; P0 ownership, critical/privacy deadlines and watchdog freshness remain healthy. |
| Facebook and Apple login | OPEN | Both remain disabled pending their official provider/account gates. |
| Real external Listing AI | OPEN | `codex_local_dev` is developer-only; no production/runtime provider entitlement is enabled. |
| Binding V5.2, legal, payment, refund, payout, damage and invoice lifecycle | OPEN | Legal snapshots remain draft-blocked and payment provider remains disabled; simulation is not contract or money truth. |
| Repository/Backend deployment parity | PARTIAL | The tested active-session cap exists at current source but not at the observed Staging release. No deployment is inferred. |
| Same-candidate Play/OnePlus distribution | OPEN OUTSIDE CURRENT SCOPE | The Pixel candidate `2026090610` is not promoted to another device here; current owner direction remains Pixel-only. |

## Read-only Staging operations result

At the WP45 observation, readiness returned HTTP 503 with database and mail
healthy, notification pending/dead both zero, payment memory-only and disabled,
Listing AI mock-only with zero budget, and support watchdog current. The sole
degradation remains one overdue noncritical `next_update_at`; there are zero
P0 cases without owner and zero critical/privacy deadline violations. No case
identity is exposed or inferred.

## Next executable package

The highest-value fully autonomous next package is **WP46 exact-candidate
Android permission lifecycle**. It closes a current Pixel gap without requiring
an OTP, provider console, staff identity, deployment, legal approval, money or
another device. It must inventory only permissions the installed binary
actually declares, test relevant user-facing deny/allow/settings/restart
semantics, preserve principal truth and restore every original permission and
session state in `finally`.

SMS is next once a fresh owner-visible OTP can be returned. Manual TalkBack
requires physical owner/runtime cooperation. Address reveal, staff support,
social providers, live AI, V5.2/payment, Backend deployment and Play/OnePlus
remain separate gates and cannot be converted into a local pass.

WP45 changes no application or Backend runtime source and performs no device,
Store, provider, Firebase Console, deployment, Production, payment,
Cloud/VPS/DNS or PR-merge mutation.

Sanitized structured evidence:
`docs/evidence/release-readiness/wp45-current-candidate-acceptance-convergence-20260907.json`.
