# PF8 current-head Android authenticated cold-start

Status: **BOUNDED AUTHENTICATED COLD START PASSED — FULL A14 AND STAGE A HOLD / NO-GO**

Observed: 2026-08-23

PF8 verifies only that the already-preserved authenticated session on the
authorized Pixel survives two process cold starts of the exact PF6 candidate.
It enters no credentials, changes no account data and performs no booking,
payment, Support, Store or pilot action.

## Source-bound route

The existing authenticated-session diagnostic now has an explicit
`--current-head` route. That route cannot be combined with an arbitrary
candidate-directory override. Before ADB interaction it revalidates:

- PF6 candidate commit `76e6565cdb20d6a49fb417e87b044b237a1ae6c1`;
- internal-Staging build `1.0.0+2026082301`;
- memory payment mode and Stripe livemode false;
- the owner-only protected four-file archive; and
- the exact installed direct-APK SHA-256.

Historical Store/device manifests remain untouched. The new route therefore
cannot silently relabel the older Google Play candidate as current-head
evidence.

## Physical result

The phone was already unlocked. For each of two cycles, the diagnostic
force-stopped the app, launched it through the ordinary launcher, found the
sanitized main-navigation surface and verified only the presence of the
authenticated action labels `Meine Anzeigen`, `Mietanfragen` and `Abmelden`.
The corresponding guest actions were required to be absent. Both cycles
passed and the app was returned to the Explore surface.

The UI hierarchy existed only transiently in memory and in one fixed temporary
device file that the tool deletes after each read. Repository evidence stores
no hierarchy, screen text, email address, account identifier, credential,
token, review credential, device identifier or private path. A locked phone is
rejected using current Android keyguard fields, and failure paths now attempt
the same safe return to Explore without hiding the original failure.

## Remaining scope

PF8 closes the authenticated cold-start/session-preservation subset of PF5
scenario A14. It does not test a pending submission, delayed acknowledgement,
duplicate-action prevention or authoritative server reconciliation. It also
does not prove authenticated deep links, booking roles, real push, TalkBack or
Google Play delivery. Complete A14 remains `not-run` until those isolated
synthetic preconditions and observations exist.

Unit tests cover the current-head argument boundary, locked-phone refusal,
guest rejection, transient hydration, direct and Play package separation,
network restoration and sanitized output. A separate evidence validator keeps
candidate, binary, device, result and non-live boundaries exact in every full
regression.

No login, logout, account mutation, network change, uninstall, reset, Store,
participant, production, Payment, Cloud/VPS/DNS, provider, contract, cost,
real money, public activation or PR merge occurred. Stage A remains
`HOLD / NO-GO`.
