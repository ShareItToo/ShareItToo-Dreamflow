# RW12 security success UI principal epoch

Date: 2026-08-25
State: verified; full local technical regression and exact-head GitHub
Regression/CodeQL passed

## Decision

A password-change response may create success UI only after the server-authoritative
service has completed, the persisted local auth-session key is definitely absent,
and the security screen's account/session epoch is unchanged across that absence
check. A missing key is the only successful empty result. An active, successor,
malformed or unreadable stored session fails closed and cannot be interpreted as
signed out.

The epoch is captured after `AccountSecurityService.changePassword` returns. The
service's legitimate exact conditional clear emits its own synchronous security
state event before returning, so comparing against the pre-operation epoch would
incorrectly suppress every valid password-change success. The screen instead:

1. captures the post-service epoch;
2. awaits the fail-closed definite-absence check;
3. rechecks `mounted` and that exact epoch before opening success UI; and
4. rechecks the same epoch after the success popup before navigating to login.

No asynchronous gap exists between the final pre-popup epoch check and popup
creation. A successor account activated during the absence read changes the epoch
and/or makes the session key present, so Account A's result is discarded rather
than rendered under Account B.

## State model

The implementation keeps three distinct truths:

- `definitely absent`: the auth-session key is not present; this is the only state
  eligible for password-change success UI;
- `present`: valid, successor, malformed or opaque stored bytes exist; success is
  suppressed without decoding them into an empty session;
- `unreadable`: the storage check throws; the helper returns false and success is
  suppressed.

The existing security-session list independently retains its `loading`,
`server-confirmed empty`, `server data`, and persistent retryable `error` states.
RW12 does not collapse backend failure or not-yet-loaded state into an empty list.

## Password-result truth

The service exposes three typed failure outcomes instead of one misleading catch:

- an allowlisted, structured 4xx response is an explicit backend rejection and
  may render `Passwort nicht geändert`;
- a completed server response followed by a principal recheck, exact clear or
  definite-absence failure is `confirmedLocalFinalizationFailed` and renders
  `Passwort serverseitig geändert`;
- timeout, transport failure, invalid success response or 5xx is
  `outcomeUnknown` and renders `Ergebnis der Passwortänderung unklar`.

The unknown path attempts to clear only the exact invoking Account A marker. If
Account B has already replaced it, the conditional clear returns false and B is
preserved. If A still matches, its local session is removed because the backend
may already have committed and revoked it. The UI warns against blind
resubmission. The backend password transaction itself updates the password,
revokes all A sessions and writes its audit entry atomically before returning
204.

The supported complete Node inventory now discovers 326 files and passes 1,877
tests with zero skips under normal test-runner parallelism. RW12 contributes two
new files and ten permanent Node package tests; twelve focused Flutter tests
cover the behavioral matrix. There is no exclusion list.

The supported full technical regression passed on exact implementation head
`0a13df419f4abd5e30858503f4e93f23c9e9d9f1`: all 1,877 tool tests passed with
zero skips, 535 Flutter tests passed with three documented profile skips,
analyzer issues remained zero, Web/Wasm and loopback smoke passed, and the
Android debug build completed 448 tasks at minSdk 24. The Mac-mini `CI=true`
path validates metadata and debug reach only; it does not prove the unavailable
private release AAB, Store upload or physical-device gate. Exact-head GitHub
Regression `32857019933` and CodeQL `32857019848` passed with zero open GitHub
code-scanning alerts.

## Account-switch propagation

Native persistence notifications already participate in the security epoch. RW12
adds `account_security_state_v1` to the Web storage-key watch set so supported
same-origin Web persistence changes reach the same listener instead of being
filtered out. This changes no server, auth-provider or persistence contract.

## Deterministic proof

The red-first widget test pauses Account A's service result, completes it, emits
the expected exact-clear event, and schedules Account B activation before the UI
continuation. Before the fix it reproducibly rendered `Passwort geändert` under
Account B. After the fix it renders no success title or message and remains on the
security screen. A paired control proves that the same-session, definitely-absent
path still displays success. A storage test proves missing
and stored/malformed bytes remain distinguishable without sleeps, retries,
parallelism changes or live traffic.

## Separation and exclusions

RW11 stays frozen at closure commit
`521f565a77faecd8de006f355c8fced4b363a8d6`; its implementation head remains
`7768651bf63d266fb8d98f75f2883536e77adde0`. RW12 changes only the client-side
post-service success boundary, its Web notification binding, deterministic tests,
evidence and mechanical source hashes.

RW12 does not change backend routes, password-provider behavior, production, VPS,
DNS, Cloud, Firebase, Store/Play, payment, real auth/provider/support traffic,
external AI, pilot, real money, legal-owner decisions, PR merge, GitGuardian
finding contents or Git history.

## Residual boundary

The analogous logout-all post-service navigation path is outside this password-
specific package and remains a separately bounded candidate. RW12 also does not
claim live provider, process-termination, device, release artifact or Store proof.
