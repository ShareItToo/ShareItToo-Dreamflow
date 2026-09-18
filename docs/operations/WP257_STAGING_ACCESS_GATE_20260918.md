# WP257-A staging access gate — 2026-09-18

## Ergebnis

WP257-A bindet den nicht-produktiven Staging-Betrieb serverseitig an eine
private, exakt konfigurierte synthetische Kohorte. Die Konfiguration wird nur
aus dem geschützten Runtime-Environment gelesen; konkrete Nutzer-, Listing-
oder Upload-IDs stehen weder im Repository noch in Logs oder Evidence. Leer-
oder fehlerhaft konfigurierte Werte geben keinen Zugriff frei. Ein
Produktions-Environment darf die Sperre nicht umgehen.

Die Durchsetzung liegt vor Webhook-/Route-Logik und zusätzlich in der zentralen
Authentifizierung. Sie umfasst Login, MFA-/Refresh-/Action-Token-Flows,
geschützte Routen, Uploads und Ownership-Prüfungen. Registrierung und Social-
Onboarding erzeugen außerhalb der Kohorte keinen Account. Anonyme Requests
erreichen ausschließlich die explizite Health-/Version- und freigegebene
synthetische Read-only-Oberfläche.

## Isolierte Abnahme

Der exakte Green-Backup wurde in einem eigenen internen Netzwerk mit eigenen
DB-/Upload-Volumes restauriert. Der korrigierte Nachfolger ist an Source-Head
`7887c7c754b6e43434caf44ea3fbeed6e8a902ce` gebunden: Image
`shareittoo-api-wp257:7887c7c754b6e43434caf44ea3fbeed6e8a902ce`, Digest
`sha256:9d90eb91166770e0803bad40058233cfc086d8d2b50f9d4622c4fc4f39a7fcf6`.
Es gab keine Host-Ports und keinen Provider-Egress. Live-/Ready-Health war
200/200. Die Matrix bestätigte anonymes Health/Version, den konfigurierten
synthetischen Katalog und das freigegebene Testbild; ein fremder Principal
wurde mit `403 staging_account_not_allowlisted`, eine widerrufene Sitzung mit
`401 account_not_active`, ein Proxy-IP-Spoof ohne gültige Identität mit
`401 staging_access_required` und Registrierung mit
`403 staging_registration_disabled` abgewiesen. Die Kohorte blieb bei zwei
Datensätzen. Nach dem Lauf waren Container, Netzwerk und Volumes entfernt.

## Prüfung und Grenzen

Die fokussierten Staging-/Security-Tests liefen mit **13/13**, die elf
Deploy-Gate-Fixtures mit **11/11**, `pnpm run check`, `git diff --check` und
die PostgreSQL-Integration mit Bereinigung sind grün. Der vollständige
Backend-Lauf ist jetzt **1106/1115 bestanden**, **0 Fehler**, **9 Skips**.
Zur Ursachenprüfung wurden die sechs roten Tests auf Parent
`f3e5dbece11dfb2b99257715795b4dae55fa66da` reproduziert: alle stoppten an der
damals bereits eingeführten Loopback-Controlled-Acceptance-Prüfung. Die
Fixtures liefern diese Acceptance nun korrekt und erreichen danach weiterhin
die jeweils geprüfte FCM-, Listing-AI- oder Stripe-Sicherheitskontrolle.
Green und Alt wurden nicht verändert; die Public-Route blieb unverändert und
weiterhin nicht freigeschaltet.

Die HTML-Action-Token-Flows sind methodenrein abgedeckt: Passwort-Reset-Form
und Account-Löschbestätigung erlauben jeweils GET und POST nur auf den exakten
Pfaden. Live-allowlisted owner wird akzeptiert; foreign, expired, consumed und
invalid werden fail-closed abgewiesen.

Kein Store-/Play-, Geräte-, Payment-, Provider-, Firebase-, Cloud-, VPS-,
DNS- oder PR-Merge-Schritt wurde ausgeführt. Der technische Nachweis beweist
keine Produktionsfreigabe und keine externe Staging-Erreichbarkeit.

Die vollständige maschinenlesbare Evidence steht in
`docs/evidence/release-readiness/wp257-staging-access-gate-20260918.json`.
