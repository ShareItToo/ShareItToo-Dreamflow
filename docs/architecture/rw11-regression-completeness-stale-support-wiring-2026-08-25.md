# RW11 regression completeness and stale support wiring

Date: 2026-08-25
State: verified; complete local technical regression and exact-head GitHub
Regression/CodeQL passed

## Decision

Every repository-owned `test/tool/*.test.mjs` file is part of the supported
technical regression. A shell-glob invocation is the permanent completeness
boundary, so a new conforming tool test is executed automatically without a
manual registration edit or an exclusion list. Existing package-specific
invocations remain because they provide useful local failure context; they are
not the completeness mechanism.

RW11 changes no product behavior. It corrects two static assertions only after
the current implementation, the accepted package records and Git history all
showed that their protected behavior remained present and had become stronger.

## SUP-094 audit

S4J originally used a dedicated transactional backend route but implemented
its local QA fallback as sequential `addReport` and
`BlockedUsersService.blockUser` calls. RW5 later moved local safety/privacy
state behind `LocalSafetyPrivacyService.addHarassmentReportAndBlock`, which is
the principal-isolated local atomic boundary. The backend still calls
`createReport`, `blockUser` and the neutral immutable audit receipt inside the
same database transaction.

The dormant assertion still demanded the removed direct
`BlockedUsersService.blockUser` spelling. RW11 now requires both supported
boundaries—the backend repository harassment endpoint and the local atomic
safety/privacy method—and explicitly rejects a reintroduced split service
call. This is stale-assertion drift, not a product regression.

## SUP-151 and SUP-152 audit

The current messages screen still passes
`showBlocked: _blockedUserIds.isNotEmpty`, renders the `Blockiert` pill only
inside the `if (showBlocked) ...[]` collection branch and normalizes a selected
blocked filter back to `active` when the blocked-user set is empty. Later
principal-isolation work also clears old account data before a reload and
rechecks the current user.

The dormant assertion required `_FilterPill(label: 'Blockiert'` on one line.
Normal Dart formatting moved `label:` to the next line without changing the
collection condition. RW11 binds the actual conditional collection structure
and the non-empty source condition. This is formatting-sensitive assertion
drift, not a visibility regression.

## Completeness invariant

Before RW11, 322 repository-owned Node tool-test files existed. The supported
script named 273 directly and therefore left 49 dependent on ad-hoc or package
specific execution. A broad normal-parallelism run reproduced exactly the two
stale failures above; all remaining cases passed.

The permanent command `node --test test/tool/*.test.mjs` is now guarded by its
own red-first wiring test. It has no ignore list, timing retry, serial flag,
parallelism reduction or conditional bypass. The complete inventory is run
before the longer platform gate, so dormant deterministic failures stop the
supported regression early.

## Separation and exclusions

RW10 remains frozen at closure commit
`5ad324704db716e39f8b79347167d24813f1596a`; its product implementation head
remains `d72e18eb607bb3f9ed7baf09ab7212f3ef695ee5`. Shared predecessor evidence
changes only where the supported regression script hash must be rebound.

The separately identified post-service RW10 success-popup epoch window is not
silently changed or claimed closed by RW11. It requires its own bounded product
correction and deterministic UI test.

RW11 changes no production, VPS, DNS, Cloud, Firebase, Store/Play, payment,
support traffic, provider, AI runtime, pilot, real-money, legal-owner,
GitGuardian-finding-content, PR-merge or Git-history state.

## Verification closure

The exact implementation head is
`7768651bf63d266fb8d98f75f2883536e77adde0`. Its local full regression used
normal test parallelism and no timing accommodation: 1,867 tool tests passed
with zero skips, analyzer reported zero issues, 523 Flutter tests passed with
three documented profile skips, and Web/Wasm, loopback smoke and Android debug
448 tasks/minSdk 24 passed. The Mac-mini metadata-only path does not claim the
unavailable private AAB, Store upload or a device result.

GitHub Regression `32849768221` and CodeQL `32849768459` both succeeded on the
same implementation head, with zero open GitHub code-scanning alerts. PR #7
remains open, Draft, clean and unmerged. Every live and owner gate remains
closed.
