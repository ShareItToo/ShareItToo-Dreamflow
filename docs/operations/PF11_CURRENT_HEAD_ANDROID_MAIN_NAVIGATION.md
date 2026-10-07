# PF11 current-head Android main navigation

Status: **BOUNDED AUTHENTICATED MAIN-NAVIGATION PASS — FUNCTIONAL MATRIX AND STAGE A HOLD / NO-GO**

Observed: 2026-08-23

PF11 verifies the five primary authenticated destinations on the authorized
Pixel and exact PF6 direct-installed candidate. It is a read-only navigation
diagnostic: it does not sign in or out, open a booking or message thread, send
a message, change the rental cart, edit the account or invoke a provider.

## Source-bound route

The command requires `--current-head`, accepts only an optional ADB binary
override and revalidates the PF6 repository record plus the exact installed APK
before UI interaction. Current Android keyguard fields are checked first; the
tool never enters or bypasses a passcode.

Android accessibility labels can append tab position or explanatory text. The
parser decodes XML entities and accepts a label only at a semantic line
boundary. Unit tests reproduce both the `Tab n of 5` form and the merged
`Gemerkt.` explanation. A missing destination, locked device, changed APK or
missing authenticated surface fails closed.

## Physical result

The exact candidate opened Entdecken, Mietkorb, Buchungen, Nachrichten and
Mein SIT. Each destination exposed only its required sanitized authenticated
surface markers; no guest gate appeared. The diagnostic returned to Entdecken
afterward.

UI hierarchies were transient and deleted after every read. Neither hierarchy
nor account, cart, booking or message content is stored. Evidence contains no
identity, credential, token, review account, private path, network identifier
or raw device identifier.

## Remaining scope

PF11 does not prove actions within the destinations, role-to-role booking
flows, message delivery, cart mutation, real push, manual TalkBack traversal,
Google Play delivery or the complete device/functional matrix. No live/public
boundary changed and Stage A remains `HOLD / NO-GO`.
