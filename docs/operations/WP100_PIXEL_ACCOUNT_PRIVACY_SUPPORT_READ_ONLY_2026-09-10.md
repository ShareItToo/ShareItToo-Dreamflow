# WP100 — Pixel Account, Privacy and Support Read-Only Closure

## Result

The installed exact `1.0.0+2026091001` Internal/Staging candidate completed
the account, privacy and support portion of WP100 on the physical Pixel. The
candidate archive, installed package, signing relationship and post-candidate
mobile-source boundary were checked before each diagnostic. The authenticated
session was intentionally treated as unknown and was used only to read visible
surfaces.

All nine account surfaces are now evidenced through independent diagnostics.
Profile, contact, password, invoices, notification and blocked-user surfaces
were visible. Payment and payout surfaces visibly retained their Staging
provider hold. The runner never opened a payment endpoint or payout onboarding
flow.

The privacy route required an evidence correction: `Datenschutz-Infos` is both
the settings-row text and the document title, so that label alone could not
prove route entry. The diagnostic now requires the unique first privacy section
`Öffentliche Informationen`. A separate current-page probe then showed the
lower `Datenexport` section after three bounded scrolls. It did not touch the
export action, enter a password, create a file or share data.

Help-Center entry and the visible `Support kontaktieren` surface were likewise
proved as two independent current-state steps. No support form was submitted
and no case was opened.

## Diagnostic design

The original combined account run was larger than the host's one-command
execution window. It is replaced by state-anchored phases, not by shortened
waits or a timing allowance:

1. an explicit preparation reaches the authenticated account-settings or
   Help-Center root;
2. each scoped entry re-verifies that exact root before it taps anything;
3. an optional retained settings root is restored only after a verified entry,
   while every failure returns the app to Entdecken;
4. the privacy-export and support sections independently verify their current
   parent surface before bounded, read-only scrolling.

Thus an interrupted phase cannot become evidence for another screen, and a
one-entry result cannot claim the complete set. The phases make the device
interaction deterministic and repeatable without turning a host execution
limit into an application requirement.

## Verification and boundaries

The focused runner suite passed nine tests. The entire Node tool suite passed
2,634 tests. GitHub Regression and CodeQL passed for the immediately preceding
source head `54223fc2d42f976259b5e407933ecfcc95051617`; the diagnostic source
is separately committed at `7ec624bd6b89178e3d5fad19f483fe84b7370d53` and its
new CI remains a separate current-head check.

No account, contact, password, notification, device-service, payment, payout,
invoice, support, listing, booking, message, Store, Staging, OnePlus or
Production state changed. No identity, credential, raw device identifier,
private filesystem path or private capture is committed.

## Remaining WP100 scope

WP100 remains in progress. Physical legal routes, 200-percent text navigation
with exact restoration, and the light/dark/background visual evidence remain
separate tasks. They are not promoted by this account/privacy/support result.
