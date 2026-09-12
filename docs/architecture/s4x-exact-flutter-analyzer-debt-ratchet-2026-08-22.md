# S4X exact Flutter analyzer debt ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `5a1aba9`.
This is a non-live release-readiness package for `TD-RR-010`; it changes no
application behavior, production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Ceiling workaround removed

The technical gate previously accepted any Flutter analyzer result at or below
the integer ceiling `220`. A new finding could therefore replace a removed
finding while the same total stayed green. A genuine reduction could also pass
without lowering the ceiling, allowing the removed debt to return later. That
count-only accommodation could not remain a release prerequisite.

S4X replaces the ceiling with a committed exact debt snapshot. The validator
parses every analyzer diagnostic, checks the analyzer's reported total against
the parsed rows, and normalizes severity, relative path, diagnostic code and
message. Duplicate normalized diagnostics remain duplicated. Their sorted
SHA-256 plus exact total forms the acceptance identity; line and column numbers
are intentionally excluded so an unrelated line move does not pretend the debt
changed.

The snapshot also records global code counts and path/code buckets for a useful
failure message. The current exact identity is:

- Flutter `3.41.7`, Dart `3.11.5`;
- 220 diagnostics;
- 98 `use_build_context_synchronously`;
- 56 `unused_element`;
- 36 `deprecated_member_use`;
- 24 `unused_element_parameter`;
- 6 `unused_field`; and
- fingerprint
  `3a2fcf242ac029bcf4e3f2b70a92660700f88b68a05e3a3fca7d81b94b5010bd`.

## Ratchet behavior

The gate now fails on all of these states:

1. more findings;
2. fewer findings without a same-change snapshot update;
3. a different diagnostic replacing an old one at the same total;
4. a path/code bucket drift; or
5. analyzer summary text that disagrees with parsed diagnostics.

An improvement must fix source, strictly reduce the reviewed snapshot and
commit both together. Once ratcheted, the exact older state cannot return.
Separately cleared correctness codes remain forbidden regardless of the debt
snapshot.

## Evidence and remaining boundary

Seven focused tests passed, including removal and same-count replacement
negatives. The actual Flutter output matched all 220 diagnostics and the exact
fingerprint. The complete clean implementation-head local metadata gate passed
at `5a1aba962aa4047b938af4415882a7834681d894`: analyzer ratchet, 379 Flutter
tests plus one documented skip, Google-only, Web build/smoke and Android debug
all passed; SIT temp roots remained zero.

`TD-RR-010` is not closed by freezing the backlog. Formal release readiness
requires successive reviewed ratchets to zero plus green exact-commit CI. The
snapshot may never be raised or changed merely to make a gate green. P0B
remains `HOLD` / `NO-GO`.
