# 48H R1 Pixel 7 Pro safe device audit

Status: **READ-ONLY AUDIT COMPLETE — EXISTING DEBUG INSTALL BLOCKED**

R1 was executed against branch `codex/master-workflow-20260808` at exact audit
HEAD `c451a3d6f8f5dbe501439ed678b66689b23cfecd`. The repository tool
`tool/audit_android_device_r1.mjs` emits only bounded fields and has dedicated
tests for parser correctness, credential-free certificate comparison and raw
device-identifier exclusion.

## Verified device state

- Exactly one authorized physical Pixel 7 Pro is reachable.
- Android 17 / API 37 and security patch 2026-07-05 are installed.
- Boot completed, battery and temperature were in a normal observable state,
  and approximately 24 GB of `/data` storage was available.
- `com.shareittoo.app` is present and running as one process.
- Installed identity is `1.0.0+2026082302`, minSdk 24, targetSdk 35.
- The installed APK has the canonical SIT signing relationship. No certificate
  digest is stored in the evidence.

## Install decision

The current-worktree debug APK has the correct package and version identity,
but it is not newer than the installed package and its debug certificate does
not match the canonically signed installed app. Therefore no install command
was attempted. Replacing it would require an uninstall/reset path that is
forbidden because existing app data must be preserved.

```text
PHYSICAL_ACTION_REQUIRED
```

This marker applies only to the existing same-version debug artifact. R2 may
remove the practical need for owner interaction by producing a newer,
canonically signed, Internal-only Staging candidate and proving all seven safe
update conditions before any install. R1 itself neither requests nor performs
a physical action.

## Boundaries and rollback

No app install, uninstall, data reset, unlock/bypass, PIN entry, account change,
system-setting change, private-media read or live-system change occurred. No
rollback is required. R2 is next.
