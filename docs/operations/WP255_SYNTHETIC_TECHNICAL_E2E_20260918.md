# WP255 synthetic technical E2E — 2026-09-18

## Ergebnis

Der WP254-Green-Backup wurde in einen separat attestierten Clone restauriert.
Der Clone hatte ein eigenes internes Netzwerk, eigene Datenbank-/Upload-Volumes,
eigene Rolle/Credentials, keine Host-Ports und blockierten Provider-Egress.
Vor dem ersten Seed wurden Target, Runtime-Commit `338c7bc...` und
`schema.sql`-SHA-256 `fe2442a6...` positiv gebunden. Die drei geforderten
Negativklassen (falsches Ziel, geschützte Cleanup-Ressource, Runtime-/Schema-
Drift) sowie fehlender Snapshot, falscher Hash und future `effective_at` wurden
fail-closed nachgewiesen; die Testsuite lief mit 9/9.

## Synthetische Rechts-Fixtures

Genau neun A–I-Reihen wurden über den dokumentierten, test-only Seeder aus den
unveränderten V5.2-Assets erzeugt. Jede Reihe trägt
`SYNTHETIC_TEST_ONLY / NOT_FOR_CONTRACT_OR_RELEASE`, eine eigene Dataset-/Run-
Bindung, Volltext und Hash. `effective_at` ist absichtlich 2099-01-01; dadurch
bleibt die echte V5.2-Rechtsmappe für Vertrag/Release unberührt und die App
weist die Snapshot-Baseline für aktuelle Verträge zurück. Manifest, Assets und
Registry wurden nicht verändert.

## App-E2E und bewusster Stopp

Der echte Clone-App-Weg Booking → Checkout(memory) → Replay → Requires-Action →
Capture bestand. Nach API-/DB-Neustart blieb der Payment-Status `captured` mit
2.500 Minor bestehen; ein Ledger-Eintrag war vorhanden und Duplikat-Events
wurden unterdrückt. Der nächste Schritt Payout/Refund wurde serverseitig mit
`payout_contract_binding_invalid` gestoppt, weil die synthetischen V5.2-Reihen
nicht wirksam sind. Es wurde kein Vertrags- oder Provider-Gate umgangen und
kein Refund/Payout künstlich als erfolgreich dargestellt.

## Cleanup und Grenzen

Die attestierten Clone-Container, Volumes, das Netzwerk, der Credentials-Key,
temporäre Seeder-Datei und Clone-Backups wurden entfernt; die Abwesenheit wurde
positiv geprüft. Green blieb mit 2 Nutzern, 1 Listing, 1 Upload, 0 Payments und
0 Legal-Snapshots unverändert. Alt-Dump und WP253-Evidence blieben hashgleich.

Der Status ist daher ausschließlich `SYNTHETIC_TECHNICAL_PARTIAL_LEGAL_BLOCKED`.
Er beweist keine rechtliche Vertragsfreigabe, keinen Pilot-Launch und keine
Produktions-/Provider-Berechtigung. Siehe JSON-Evidence für alle Hashes und
Inventare.
