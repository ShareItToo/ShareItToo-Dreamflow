# RW24 Pixel controlled-FCM closure

Status: **CLOSED / PIXEL VERIFIED / ONEPLUS UNTOUCHED** on 03.09.2026.

The physical Pixel 7 Pro runs the signed Internal/Staging candidate
`com.shareittoo.app` `1.0.0+2026090210` from artifact source
`79f39cb11c47ea96cb7c468e57d211605989d439`. Its installed APK bytes match the
private archive SHA-256
`a7f48b7fee0aeb68ff0e65e47db545833f3c03bee3ee05e78bd470bafb103496`.

Exact Staging API commit `576c1a22af75ec9d56b710158604452642996436`
is healthy with FCM enabled only for Staging. The controlled synthetic
two-role diagnostic proves all three Android delivery states: an in-app popup
while ShareItToo is foregrounded, an Android system notification while it is
backgrounded, and an Android system notification after its process was
stopped. The notification icon and the intentionally neutral V5.2 copy were
visually reviewed and passed. No payment endpoint was called.

The first automated run was a false negative, not a delivery failure. Its UI
probe still expected the superseded message-specific copy `Neue Nachricht` /
`Du hast eine neue Nachricht`. The privacy-preserving V5.2 contract correctly
delivers only `Neue ShareItToo-Aktualisierung` / `In der App ansehen.` and
loads details later through the authenticated notification API. Commit
`3ae7806f3f97f5e9d7ec0981b07d5faf3d23fbcc` aligns the probe with that contract
and adds a regression test that rejects the obsolete copy.

Machine-readable evidence is
`docs/evidence/release-readiness/pixel-controlled-fcm-2026090210.json`. The
private notification-shade screenshot remains outside Git and is represented
only by its SHA-256 in the evidence.

This closure does not claim Google Play installation of this candidate, email
delivery, real payment, OnePlus coverage, Production delivery, public release
or PR merge. Mail and Payment remain memory-only and listing AI remains mock
with a zero external-provider budget.
