# ADR-079: Require a normal-shell pinned macOS regression toolchain

- Status: Accepted locally for non-live verification
- Date: 2026-08-22
- Backend bootstrap: `427232e3d42ad2e68982c96746373bd789653c04`
- Full bootstrap: `0e65de32cfb056808a2545590082448781c25ce0`
- Verified package head: `3a2543118782429de38c7f81c63cf09449d90a17`

## Context

Local checks were green only after prepending a copied Node runtime, while the
normal shell had no Node command and exposed a different Codex-internal pnpm.
Flutter and Java also required explicit paths. These accommodations could not
be allowed to become release prerequisites.

## Decision

Pin and bootstrap Node 22, exact pnpm 11.16.0, Flutter 3.41.7, Dart 3.11.5 and
Java 17 through normal macOS tool locations. Provide idempotent install and
read-only check commands. Accept local evidence only when a new login shell
passes frozen install, Backend/PostgreSQL checks and the complete technical
regression without PATH or `JAVA_HOME` overrides.

Exclude Firebase Admin's unused optional Storage and Firestore trees rather
than retaining their vulnerable transitive surface or forcing an incompatible
package major. Fail CI dependency audit at moderate severity.

## Consequences

- Temporary/copy-based runtimes and Codex fallback pnpm are no longer needed.
- Full local regression is one normal-shell command after bootstrap.
- The production dependency graph is smaller by 123 unused packages and has
  zero known audit findings at verification time.
- Adding Firebase Storage or Firestore requires an explicit reviewed dependency
  and runtime change.
- `TD-RR-001`, `TD-RR-003` and `TD-RR-004` remain formally open until their
  exact-commit CI exit evidence exists.
- No live or external SIT state changes.
