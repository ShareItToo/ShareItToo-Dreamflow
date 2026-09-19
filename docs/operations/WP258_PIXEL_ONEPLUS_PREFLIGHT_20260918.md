# WP258-A Pixel/OnePlus Play-Internal preflight — 2026-09-18

## Ergebnis

Auf dem aktuellen Host ist kein OnePlus in `adb devices -l` oder Flutter
erreichbar. Es gibt daher keinen autorisierten OnePlus-Nachweis und keine
Installation, kein Sideload und keinen Downgrade.

Der separat erfasste Pixel 7 Pro ist autorisiert und trägt bereits die
neuere Play-Installation `com.shareittoo.app` `1.0.0+2026091704`:

- Installationsquelle: `com.android.vending`
- `minSdk 24`, `targetSdk 36`, APK Signature Scheme v2/v3
- Play-Gerätesignatur: `36488abf…0b956`
- Kandidaten-Upload-Zertifikat: `098f485e…0129a4`
- Start nach Force-Stop/Restart: erfolgreich
- WLAN: validiert; keine Netzidentität gespeichert

Der derzeit installierte Pixel-Kandidat ist **2026091704**, nicht der für
WP258 angeforderte Zielstand `2026091605`. Es wurde deshalb nichts ersetzt.
Das Candidate-Manifest bindet 1704 an
`https://staging.shareittoo.com/api/v1`; diese Bindung ist Quell-/Manifest-
Evidence, keine OnePlus- oder vollständige End-to-End-Funktionsabnahme.

## Grenzen

Ohne OnePlus bleiben Login/MFA, Gastkatalog, Bild, Kategorie `Sonstiges`,
Owner-Profilbild-Persistenz, Listing-Lifecycle, Logout/Login und Offline-
Recovery auf diesem Gerät unbewiesen. Pixel-Evidence darf nicht als
OnePlus-Evidence ausgegeben werden. Es wurden keine Store-, Backend-,
Provider-, Payment-, Mail-, Push-, Identity-, AI-, DNS- oder Produktions-
Änderungen vorgenommen. Temporär extrahierte APK-Daten und UI-Artefakte
wurden nicht behalten.

Der einzige echte Restblocker ist die physische Erreichbarkeit/Autorisierung
des OnePlus. Danach kann exakt der Play-Internal-Update-Smoke wiederholt
werden; kein Sideload als Play-Nachweis.

Maschinenlesbare Evidence:
`docs/evidence/release-readiness/wp258-pixel-oneplus-preflight-20260918.json`.
