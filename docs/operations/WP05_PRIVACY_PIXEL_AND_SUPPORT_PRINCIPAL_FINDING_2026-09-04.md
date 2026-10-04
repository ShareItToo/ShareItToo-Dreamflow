# WP05 — actual Pixel export and new support-principal finding

Status: **BOUNDED PIXEL EXPORT PASS / FULL PRIVACY ACCEPTANCE PARTIAL /
SUPPORT PRINCIPAL REGRESSION REPRODUCED / GITHUB DEFERRED**.

## Candidate and physical evidence

Canonical worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
Branch: `codex/master-workflow-20260808`. Inspected checkout
`9dd87440870ef915f29eff3de66c8539cd9d2601` is a clean documentation-only
descendant of frozen build source `f6a9a41471058c9f80ffd01283c42b9d74a8845c`.
The Pixel still runs signed `1.0.0+2026090403`, APK SHA-256
`3fa32413f2555047751b160bbe80bbf8f4a8cde127500abc5291872e79caba16`.
No rebuild, reinstall, backend deployment or source change occurred.

The exact installed hash and current Staging hold were rechecked. At
10:39:58 UTC, Staging reported `5d88295fa7fe313b83936783a0582a505b2ba486`,
memory payments and live mode false. The existing session was privately matched
to the known email-verified synthetic owner using its contact email and the
previously evidenced, unchanged fixture digest. Display name alone was rejected:
two known fixtures have the same owner display name. No personal owner account
was used, no login/logout occurred, and no identifier or credential was recorded.

Actual Pixel results:

- Password prompt visible; cancel returns to the export action without creating
  an export or displaying success/failure. Confirmed at 10:40:54 UTC.
- One subsequent password-confirmed export was prepared through the actual app
  and reached Android's system share chooser. No repeat request was made.
- The chooser's system package, current activity, SIT launch origin and CHOOSER
  action were read back without examining suggestions, contacts or the payload.
- Cancelling that still-open chooser returned the truthful `Teilen abgebrochen`
  outcome at 10:43:40 UTC. No external target was selected and no file was sent.

This does **not** independently inspect the exported JSON's ownership/content,
prove every local section on the physical device, or exercise an in-flight
physical Account-A-to-B transition. These remain separate acceptance items.

## Diagnostic corrections, not silent retries

Failed observations are retained outside Git. The private probe first rejected
ambiguous display names; it now checks the exact email privately. It also had to
distinguish a semantic parent from its single clickable child and identify the
password field by its exact Android hint. The initial chooser allowlist did not
include the observed Android 17 `com.android.intentresolver/.ChooserActivityLauncher`.
The system package and originating action were verified before allowing only
that exact additional component. The existing export was then cancelled without
repeating the export request or selecting a share target.

Twenty-four deterministic private-probe checks pass, covering ambiguous/missing
identity, shell-safe fixture input, duplicate semantics, hint matching and
current-versus-foreign/historical chooser activity. These are diagnostic
selectors, not new app requirements or a production compatibility waiver. No
sleep, reduced test parallelism, source assertion or release scanner was relaxed.
The separate effective-SDK-entrypoint debt remains PARTIAL.

## New support finding — P1, reproduced locally

`SupportFlowScreen._submitSupportCase` awaits its submitter and then opens the
canonical receipt using only `mounted`. There is no session-owner/epoch binding
around that result. A new deterministic widget probe establishes:

1. Stable account A: the same synthetic canonical response displays correctly
   (control PASS).
2. Pending A submission, persisted switch to B and B-owned dialog, then A's
   response: an A receipt is still displayed (regression FAIL, reproduced).

The existing complete regression was green before this additional coverage;
that historical result does not overrule the new red test. No real support case
was submitted and no actual user's data was exposed by the probe.

Relevant code: `lib/screens/support_flow_screen.dart` (`_submitSupportCase`),
`lib/screens/help_center_screen.dart` (`_sendSupportMessage`) and
`lib/services/backend_repository.dart` (`createSupportCase`,
`reportHandoverException`, generic authorized transport). Wrong-principal
dispatch/retry is a code-inspection concern still requiring its own red proof;
only the late receipt presentation is currently reproduced.

Next bounded correction: capture immutable principal/epoch before the first
await, retain owner-specific transport, suppress stale results and navigation,
and close only A-owned routes while preserving a B-owned dialog. Add stable,
switch-before-submit, pending-success/failure and foreign-dialog regressions.
Keep this correction separate from the frozen 0403 candidate and its evidence;
run normal focused/full checks and rebind affected inventories. Do not claim
the new correction exists on the Pixel until a distinct verified successor.

## Evidence and remaining boundaries

Machine summary:
`docs/evidence/release-readiness/wp05-privacy-pixel-support-finding-20260904.json`.
Private original reports and failed observations remain in
`/Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_WP05_0403_EVIDENCE.ikyE6L`.
The red probe and 24-check harness are outside Git and contain synthetic test
values only; no credential contents are part of the reports.

Support submission/follow-up, exported payload inspection, two-role acceptance
and the rest of the matrix remain OPEN/PARTIAL. No account deletion, new SMS,
OnePlus, Store, payment/provider/Firebase activation, production action, GitHub
authentication/push/CI request or PR merge occurred. GitHub is deferred, not
waived. The encompassing Goal remains active and is not fully accepted.
