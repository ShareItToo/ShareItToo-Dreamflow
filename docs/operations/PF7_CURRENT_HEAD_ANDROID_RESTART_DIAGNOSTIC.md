# PF7 current-head Android restart diagnostic

Status: **BOUNDED PROCESS RESTART PASSED — FULL A14 AND STAGE A HOLD / NO-GO**

Observed: 2026-08-23

PF7 exercises the installed PF6 candidate only at a known safe process
checkpoint. It does not inspect the user's screen, account or content, does
not change connectivity, does not create a request or payment and does not
activate a pilot or Store lane.

## Exact binding

The diagnostic first revalidates the PF6 repository evidence and owner-only
private archive. It then proves that the Pixel has the exact direct-installed
candidate:

- source commit `76e6565cdb20d6a49fb417e87b044b237a1ae6c1`;
- version `1.0.0+2026082301`;
- internal channel and isolated Staging API;
- memory payment mode with Stripe livemode false; and
- installed APK SHA-256 equal to the protected archive and PF6 evidence.

The candidate loader rejects source, archive, permission or hash drift before
the device process is changed. The release archive path is used only in
memory and is never written to repository evidence.

## Physical result

On the authorized Pixel 7 Pro, the diagnostic:

1. verified that the phone was already unlocked without entering a passcode;
2. captured only the package version, APK hash and opaque preservation
   markers in memory;
3. force-stopped `com.shareittoo.app` and verified that no app process
   remained;
4. sent one ordinary launcher event and verified that the process restarted;
5. re-hashed the installed APK; and
6. proved that first-install time and credential-encrypted app-data inode were
   unchanged.

The checked-in result contains only pass/fail enums and the sanitized device
summary. It contains no screenshot, UI hierarchy, account content, raw device
identifier, process identifier, filesystem path or preservation-marker value.
The app was left relaunched.

## Scope and remaining A14 work

PF7 closes only the deterministic process-stop/restart and container-identity
part of PF5 scenario A14. It does **not** claim the authenticated-session,
pending-submission, delayed-acknowledgement or authoritative server-reconcile
parts of A14. Those require isolated synthetic pre-state and later bounded
functional evidence. Therefore PF5 A14 remains `not-run` as a complete pilot
scenario.

The diagnostic is implemented as a reusable source-bound command with unit
tests for a locked phone, APK drift, app-data identity drift, safe relaunch and
sensitive-output exclusion. Its repository evidence has a separate fail-closed
validator included in the complete technical regression.

No uninstall, data reset, network change, Store upload, participant action,
production, Payment, Cloud/VPS/DNS, provider, contract, cost, real money,
public activation or PR merge occurred. Stage A remains `HOLD / NO-GO`.
