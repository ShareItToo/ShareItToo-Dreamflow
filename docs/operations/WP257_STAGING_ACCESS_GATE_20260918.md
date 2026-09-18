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
DB-/Upload-Volumes restauriert. Der Nachfolger ist das Image
`shareittoo-api-wp257:beaf28c201cb926045b2a56bcecf7feea6b6d4c9`, Digest
`sha256:74f94a7ab6debf26b1f78df3118a04dfd61f14ca5c7e86f4312567f0203e088e`.
Es gab keine Host-Ports und keinen Provider-Egress. Live-/Ready-Health war
200/200. Die Matrix bestätigte anonymes Health/Version, den konfigurierten
synthetischen Katalog und das freigegebene Testbild; ein fremder Principal
wurde mit `403 staging_account_not_allowlisted`, eine widerrufene Sitzung mit
`401 account_not_active`, ein Proxy-IP-Spoof ohne gültige Identität mit
`401 staging_access_required` und Registrierung mit
`403 staging_registration_disabled` abgewiesen. Die Kohorte blieb bei zwei
Datensätzen. Nach dem Lauf waren Container, Netzwerk und Volumes entfernt.

## Prüfung und Grenzen

Die fokussierten Staging-/Security-Tests liefen mit **12/12**, `pnpm run
check`, `git diff --check` und die PostgreSQL-Integration mit Bereinigung sind
grün. Der vollständige Backend-Lauf enthält **1099 Pass**, **9 Skips** und
sechs bereits vorher bestehende Deploy-Gate-Fehler (FCM-, Listing-AI- und
Stripe-Deploy-Erwartungen); diese sind kein WP257-Fehler und bleiben als
separater Blocker dokumentiert. Green und Alt wurden nicht verändert; die
Public-Route blieb unverändert und weiterhin nicht freigeschaltet.

Kein Store-/Play-, Geräte-, Payment-, Provider-, Firebase-, Cloud-, VPS-,
DNS- oder PR-Merge-Schritt wurde ausgeführt. Der technische Nachweis beweist
keine Produktionsfreigabe und keine externe Staging-Erreichbarkeit.

Die vollständige maschinenlesbare Evidence steht in
`docs/evidence/release-readiness/wp257-staging-access-gate-20260918.json`.
