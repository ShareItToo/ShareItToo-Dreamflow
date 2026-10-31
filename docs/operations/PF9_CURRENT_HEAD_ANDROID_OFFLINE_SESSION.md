# PF9 current-head Android offline cold-start and recovery

Status: **BOUNDED OFFLINE COLD START AND RECOVERY PASSED — FULL A15 AND STAGE A HOLD / NO-GO**

Observed: 2026-08-23

PF9 verifies a narrow network-recovery subset of PF5 scenario A15 on the
authorized Pixel and the exact PF6 candidate. It uses the already-preserved
authenticated session, enters no credentials and performs no listing, booking,
payment, Support, Store or pilot mutation.

## Source and binary binding

The diagnostic uses the non-overridable `--current-head` route introduced in
PF8. Before device interaction it revalidates:

- PF6 candidate commit `76e6565cdb20d6a49fb417e87b044b237a1ae6c1`;
- internal-Staging build `1.0.0+2026082301`;
- memory payment mode and Stripe livemode false;
- the owner-only protected candidate archive; and
- the exact installed direct-APK SHA-256.

The result therefore remains direct internal-install evidence and makes no
Google Play or Store-delivery claim.

## Physical result

The phone was already unlocked and Internet reachability was proven before the
test. The diagnostic recorded only the original Wi-Fi and mobile-data toggle
states, disabled both transports, proved the absence of Internet connectivity
and ran the same two authenticated force-stop/launcher cycles as PF8. Both
cycles retained the authenticated profile actions and excluded the guest
actions.

In a `finally` boundary the diagnostic restored both original toggle states
and then waited for actual Internet reachability instead of treating a toggle
change as sufficient recovery. The app was returned to Explore. No SSID,
BSSID, IP address, WLAN name, network identifier, account identifier,
credential, token, UI hierarchy, screen content, raw device identifier or
private path was retained.

## Remaining scope

PF9 closes only the one-network offline cold-start and reconnect subset of PF5
scenario A15. It does not test a second WLAN, a queued or pending mutation,
duplicate prevention, authoritative server reconciliation or a completed
booking flow. Full A15 therefore remains `not-run`.

Permanent tests require a real online precondition, verified disconnection,
restored Internet reachability, exact candidate and device binding, sanitized
evidence and every non-live boundary. CI metadata mode cannot be used locally
to bypass the exact Git commit check.

No login, logout, account mutation, uninstall, reset, Store, participant,
production, Payment, Cloud/VPS/DNS, provider, contract, cost, real money,
public activation or PR merge occurred. Stage A remains `HOLD / NO-GO`.
