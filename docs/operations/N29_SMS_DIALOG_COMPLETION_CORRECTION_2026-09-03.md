# N29 manual SMS dialog completion correction

Status: **FULL LOCAL REGRESSION PASS / EXACT CI AND NEW DEVICE CANDIDATE PENDING**.

## Scope and provenance

Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
Branch: `codex/master-workflow-20260808`.
Starting HEAD: `8c0a20e76b99e6347c89f8d2b837f96589feebd0`; clean and 0/0
at the start of the follow-up. That diagnostic commit's GitHub Regression
`33792614070` and CodeQL `33792613769` both passed.

This is a local manual-SMS UI correction, not an artifact or device closure.
Frozen Pixel APK `1.0.0+2026090306` remains bound to source
`9d7e2601dc477cf3ae3d469b65448ce2065375e0` and SHA-256
`37d98f999562150e77fea335fcb0bde32aee20d2183509f5484a5e67cd1e3194`.
It does not contain this correction. No new SMS, installation, provider,
Production, Play, payment, KYC, OnePlus or PR-merge action occurred.

## Reproduced defects and changes

1. The successful manual confirmation path disposed its external text
   controller immediately after the modal's result. Its TextField was still
   mounted during the exit animation. The focused happy-path test failed with
   `A TextEditingController was used after being disposed.` Let the TextField
   own its controller instead; retain only the in-memory code string, capture
   the submitted value before the first await, and clear it when the sheet
   result completes. No timer or test-only timing workaround is used.
2. A successful confirmation followed by an unexpected profile-read failure
   fell into a generic catch and displayed unknown outcome. A separate test
   failed on exactly that sequence. Retain the known confirmation phase;
   typed and unexpected subsequent read failures now say the number was
   confirmed but its displayed profile state could not be refreshed. They
   cannot become rejection or unknown confirmation.
3. Confirmed provider-cleanup failure retains its distinct cleanup warning.
   Once confirmation is known, the code input is read-only and the confirm
   button is disabled, preventing a duplicate submission of that code.
4. A sheet-open guard suppresses late work after dismissal, including during
   its exit animation. Existing principal/epoch checks remain before remote
   invocation, result presentation and navigation. Account A's completion
   cannot update B or close B's newer dialog.

The two reproduced defects are facts about the code. Whether either fully
explains the uncaptured physical-Pixel result remains unproven until a new
candidate is built and tested. Backend acceptance/cleanup evidence from the
previous run remains valid and separate.

## Deterministic verification

`test/n29_phone_confirmation_completion_test.dart` adds ten widget cases:
normal success, rejected code, confirmed cleanup failure, unexpected and typed
post-confirmation read failure, typed and unexpected unconfirmed uncertainty,
late A result under B, preservation of B's newer dialog, and dismissal during
an in-flight confirmation. All use synthetic fixtures; no real SMS, identity,
provider or Backend traffic is sent.

- New cases plus existing RW18/contact and phone-contract cases: **29/29 PASS**.
- Targeted analyzer: **zero issues**.
- Existing phone readiness/wiring and RW18 inventory checks: PASS.
- Full local technical regression: first attempt stopped at the repository
  tool suite (2,144 tests: 2,108 pass, 36 fail). The reported failures include
  downstream `repository_source_drift:store/privacy-disclosures.json`
  bindings, which are outside the `sourceInventory` arrays already refreshed.
  Exact provider-source and ratchet bindings were subsequently refreshed:
  all 2,144 repository tool tests now pass. The second complete gate passed;
  the first attempt is not a full pass.
- Full local gate: 2,144 repository tool tests; 662 Flutter tests passed with
  five expected skips at standard parallelism; analyzer zero; profile-specific
  suites; Web build with successful Wasm dry run; loopback smoke; Android
  debug build and minSdk 24 check. The host-capacity gate passed with 35,220 KiB
  generated growth and 2,643,132 KiB free. No custom timing/concurrency override.
  Local `CI=true` was used only for metadata-only handoff validation; this is
  not Store or device evidence.
- Backend suite: 797 tests, 795 passed and two expected no-database skips;
  Backend JavaScript/shell syntax checks passed.
- Exact correction-HEAD GitHub Regression/clean checkout `33795801527` and
  CodeQL `33795801476`: PASS on
  `a2e31b4ae5d087174775ad40be5b573dc3c73e28`.

Source inventories are rebound only for the changed contact-screen hash and
its transitive inventory dependents. No approval, legal/privacy assertion,
historical test result, baseline or ratchet allowance is loosened by rebinding.
The hash-only audit covers 24 JSON/validator files: normalizing only 64-character
SHA-256 values makes their before/after content identical. The five affected
validators retain their exact drift checks and all provider decisions stay
unapproved; no validator is disabled. Historical APK hashes remain untouched.

## Remaining work and rollback

Local and exact correction-source CI regression are complete. The correction
was committed/pushed and is now in separately archived and installed candidate
`2026090307`; see `N29_PIXEL_CANDIDATE_2026090307_UPDATE_HANDOVER.md` for that
candidate's own source, CI and device scope. Physical SMS closure is still
pending: invalid-code rejection, successful UI completion, verified-state cold
restart and cleanup remain OPEN. The automatic-verification path is not
claimed by these manual-code widget tests. No automatic SMS resend is allowed.

At initial correction time the installed APK was unchanged; the later candidate
handover owns update and rollback evidence. Source rollback, if required,
is a normal reviewed revert of this bounded correction;
no history rewrite or reset. N29 and the encompassing goal remain incomplete.
