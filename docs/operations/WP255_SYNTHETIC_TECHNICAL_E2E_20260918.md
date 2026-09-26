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
Die positive Wiederholung ist von allen Negativ-Fixtures getrennt; der
fokussierte Lauf lief mit 10/10.

## Synthetische Rechts-Fixtures

Genau neun A–I-Reihen wurden über den dokumentierten, test-only Seeder aus den
unveränderten V5.2-Assets erzeugt. Jede Reihe trägt
`SYNTHETIC_TEST_ONLY / NOT_FOR_CONTRACT_OR_RELEASE`, eine eigene Dataset-/Run-
Bindung, Volltext und Hash. Für den positiven Lauf lag `effective_at` bei
2026-09-18T01:58:00Z und damit eine Minute vor der dokumentierten Runtime
2026-09-18T01:59:00Z. Missing-, Hash- und Future-Datum sind ausschließlich
separate Negativ-Fixtures. Manifest, Assets und Registry wurden nicht verändert.

## App-E2E und bewusster Stopp

Der echte Clone-App-Weg Booking → Checkout(memory) → Replay → Requires-Action →
Capture bestand. Ein persistierter V5.2-Plattformvertrag mit genau zwei
Declarations wurde gebunden. Nach API-/DB-Neustart blieb der Payment-Status
zuerst `captured/2640`, danach wurde ein echter Memory-Refund `succeeded/2640`
mit Idempotenz-Replay und zwei Ledger-Transaktionen rückgelesen; Duplicate-
Events wurden unterdrückt. Der reguläre Payout wurde nicht fingiert, sondern
korrekt bis `2026-10-02T21:59:59.999Z` mit `payout_hold_active` gehalten.

## Cleanup und Grenzen

Die attestierten Clone-Container, Volumes, das Netzwerk, der Credentials-Key,
temporäre Seeder-Datei und Clone-Backups wurden entfernt; die Abwesenheit wurde
positiv geprüft. Green blieb mit 2 Nutzern, 1 Listing, 1 Upload, 0 Payments und
0 Legal-Snapshots unverändert. Alt-Dump und WP253-Evidence blieben hashgleich.

Der Status ist `SYNTHETIC_TECHNICAL_PASS_WITH_PAYOUT_HOLD`. Er beweist keine
rechtliche Vertragsfreigabe, keinen Pilot-Launch und keine Produktions- oder
Provider-Berechtigung. Siehe JSON-Evidence für alle Hashes und Inventare.
