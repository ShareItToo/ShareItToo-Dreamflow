# WP257-B Green internal deployment — 2026-09-18

## Ergebnis

Der exakt geprüfte Kandidat ist jetzt im kanonischen internen Green-Netz aktiv:

- Source-Commit: `7887c7c754b6e43434caf44ea3fbeed6e8a902ce`
- Image: `shareittoo-api-wp257:7887c7c754b6e43434caf44ea3fbeed6e8a902ce`
- Digest: `sha256:9d90eb91166770e0803bad40058233cfc086d8d2b50f9d4622c4fc4f39a7fcf6`
- Health live/ready: `200/200`
- Netzwerk: intern, ohne Host-Port; Green-PostgreSQL bleibt unverändert

Die Bindung benutzt die vorhandenen privaten `SIT_STAGING_*`-Runtimewerte.
Der synthetische Owner ist zugelassen; fremde Principals bleiben gesperrt.
Listing- und Upload-Gastzugriff sind ausschließlich an die bereits vorhandene
synthetische Anzeige und ihr vorhandenes Bild gebunden. IDs und Token stehen
nicht in diesem Bericht.

## Abnahme

Die interne Matrix ist vollständig grün: anonyme private Authentifizierung
`401`, exakter Katalog `200` mit genau einem konfigurierten Listing,
freigegebenes Bild `GET/HEAD 200`, nicht freigegebenes Bild `404`, Owner
`/auth/me` und `/listings/mine` `200`, fremder Renter `403`, Proxy-Spoof ohne
Identität `401`, anonymer Upload `401` und unbekannte Registrierung `403`.
Ein ungültiger Social-Onboarding-Versuch liefert erwartungsgemäß
`503 verification_delivery_unavailable`; Mail-/Provider-Ausführung ist in
diesem internen Lauf bewusst gehalten und es wird kein Account erzeugt.

Der Owner-Action-Token-Pfad wurde live im internen Container geprüft:
allowlisted GET/POST `200`, foreign `403`, expired/consumed/invalid `400`.
Alle synthetischen Tokenzeilen wurden exakt bereinigt. Ein Container-Neustart
lieferte erneut Owner-Auth `200`. Die Datenbankzählung blieb unverändert bei
`2|1|1|2|0`; der alte Rollback-Container ist entfernt.

## Grenzen und unveränderte Bereiche

Payment bleibt `memory`, Mail ist `disabled`, Push `memory`, Identity
`disabled`, Listing-AI ist `mock` mit externem Aufruf verboten und Budget `0`.
Die öffentliche Caddy-Route liefert weiterhin `502`; es gibt keine öffentliche
Aktivierung. Store/Play, Geräte, Firebase, Provider, Payment, DNS, Cloud,
Produktion und PR-Merge wurden nicht verändert. Der technische Nachweis ist
kein Live-/Provider-/Pilot-Gate.

Der vollständige maschinenlesbare Nachweis steht in
`docs/evidence/release-readiness/wp257-green-internal-deploy-20260918.json`.
