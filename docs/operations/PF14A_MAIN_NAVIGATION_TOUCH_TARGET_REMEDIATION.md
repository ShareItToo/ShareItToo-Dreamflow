# PF14A main-navigation touch-target remediation

Status: **SOURCE AND SIGNED PHYSICAL REMEDIATION PASSED — MANUAL REVIEW, TALKBACK, STORE AND STAGE A HOLD / NO-GO**

Observed: 2026-08-23

PF14A remediates a physical accessibility finding from the exact PF6 Android
candidate. At 200% text on the Pixel, four clickable primary-navigation
semantics nodes exposed an effective height of about 43dp; only the central
32dp asset exposed about 55dp. Android recommends a focusable or touch target
of at least 48dp by 48dp for every interactive element.

## Durable implementation

Every inactive and active icon supplied to the five-item
`BottomNavigationBar` now uses one shared `kMinInteractiveDimension` wrapper.
The visual search, cart, booking, message and profile icons retain their
existing size and appearance; only the transparent interactive layout floor is
expanded. No delay, platform exception, lint suppression or device-specific
constant is used.

A 200%-text widget test requires every composed semantics node to remain at
least 48dp in both dimensions and separately proves that a 20dp visual child
stays 20dp. A source wiring ratchet requires both inactive and active icons for
all five real destinations to use the wrapper.

## PF14B physical closure

PF14B created signed internal Staging build `2026082302` at `1b3e86e`, updated
the Pixel from `2026082301` without changing its first-install time or CE data
inode and verified the exact installed APK. At 200% font scale all five enabled
clickable Android Buttons exceeded 48dp in both dimensions; the minimum was
96.81dp by 70.92dp. The prior font scale was restored exactly to 0.85.

Google Play delivery, manual TalkBack and manual visual review remain separate
external gates. No Store, provider, production, Payment, public or real-money
state changed, and Stage A remains `HOLD / NO-GO`.
