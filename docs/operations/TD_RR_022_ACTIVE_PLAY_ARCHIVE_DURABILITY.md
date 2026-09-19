# TD-RR-022 active Play archive durability

Status: **OPEN** on 03.09.2026.

The active Google Play Internal candidate `1.0.0+2026090204` remains bound to
source commit `30cc73cee8f10915ad4447da4a2fa7ae928f7410` and to the hashes in the
existing repository evidence. Its original four-file owner-only Mac-mini
archive is no longer present.

A read-only search of the local owner directories and connected Google Drive
found the sanitized handover, but no original binary package. An isolated
clean rebuild from the exact source commit compiled and signed successfully.
Its AAB and APK hashes did not match the recorded candidate hashes, so the
rebuild was moved to an owner-only quarantine and is not release evidence.

This debt blocks a strict local re-hash of the currently active Play candidate.
It does not authorize metadata-only local acceptance, a changed hash, a rebuilt
substitute, a validator bypass, or a rewrite of the historical Play state.

Closure requires either:

1. restoration of the original four files with the exact recorded hashes; or
2. activation of a strictly newer independently verified Internal candidate,
   with its exact archive retained and privately backed up before it becomes
   the rollover truth.

The next candidate must use a never-reused version code. Its source, package,
Firebase configuration, Staging API, signing certificate, AAB, APK, privacy
scan and archive must be re-verified together. No timing, retry, reduced-suite,
alternate-path or rebuild-until-match workaround is accepted.
